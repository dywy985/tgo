"""File-system-based skill CRUD service.

Each skill is a directory containing a SKILL.md file (with YAML frontmatter)
plus optional ``scripts/`` and ``references/`` sub-directories.

Directory layout::

    {base_dir}/
    ├── _official/          # Global read-only skills shared across all projects
    │   └── code-review/
    │       └── SKILL.md
    ├── {project_id}/       # Project-private skills
    │   └── my-skill/
    │       ├── SKILL.md
    │       ├── scripts/
    │       └── references/
    └── ...
"""

from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set

import yaml

from app.schemas.skill import (
    SkillCreateRequest,
    SkillDetail,
    SkillSummary,
    SkillUpdateRequest,
)

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class SkillNotFoundError(Exception):
    """Raised when a requested skill directory does not exist."""


class SkillConflictError(Exception):
    """Raised when a skill directory already exists (duplicate creation)."""


class SkillReadOnlyError(Exception):
    """Raised when attempting to mutate an official (read-only) skill."""


class SkillPathTraversalError(Exception):
    """Raised when path validation detects a traversal attempt."""


# ---------------------------------------------------------------------------
# Skill name validation
# ---------------------------------------------------------------------------

_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
_MAX_SKILL_NAME_LEN = 64


def _validate_skill_name(name: str) -> str:
    """Validate that *name* matches the naming convention.

    Rules: lowercase + digits + single hyphens, 2-64 chars, no consecutive
    hyphens, no leading/trailing hyphens.
    """
    if len(name) < 2 or len(name) > _MAX_SKILL_NAME_LEN:
        raise ValueError(
            f"Skill name must be 2-{_MAX_SKILL_NAME_LEN} characters, got {len(name)}"
        )
    if not _SKILL_NAME_RE.match(name):
        raise ValueError(
            f"Invalid skill name '{name}': must be lowercase letters, digits, "
            "and single hyphens (no leading/trailing hyphens)"
        )
    if "--" in name:
        raise ValueError("Consecutive hyphens are not allowed in skill names")
    return name


# ---------------------------------------------------------------------------
# SKILL.md parsing / serialization helpers
# ---------------------------------------------------------------------------

def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split a SKILL.md file into (frontmatter_dict, markdown_body).

    The frontmatter is delimited by ``---`` lines at the very start of the
    file.  If there is no frontmatter the entire text is returned as the
    body.
    """
    if not text.startswith("---"):
        return {}, text

    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text

    try:
        fm: dict = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        fm = {}

    body = parts[2].lstrip("\n")
    return fm, body


def _serialize_skill_md(
    fm: dict,
    body: str,
) -> str:
    """Serialize frontmatter dict + body back into SKILL.md format."""
    fm_str = yaml.dump(fm, default_flow_style=False, allow_unicode=True, sort_keys=False).rstrip("\n")
    return f"---\n{fm_str}\n---\n\n{body}\n"


# ---------------------------------------------------------------------------
# SkillFileService
# ---------------------------------------------------------------------------


class SkillFileService:
    """File-system-based skill CRUD service."""

    def __init__(self, base_dir: str) -> None:
        self.base_dir = Path(base_dir)
        self.official_dir = self.base_dir / "_official"

    # ------------------------------------------------------------------
    # Path helpers
    # ------------------------------------------------------------------

    def _project_dir(self, project_id: str) -> Path:
        return self.base_dir / project_id

    def _skill_dir(self, project_id: str, skill_name: str) -> Path:
        """Return the path for a *project-private* skill, with traversal check."""
        safe_name = _validate_skill_name(skill_name)
        path = self._project_dir(project_id) / safe_name
        # Prevent directory-traversal attacks
        try:
            resolved = path.resolve()
            base_resolved = self.base_dir.resolve()
            if not str(resolved).startswith(str(base_resolved)):
                raise SkillPathTraversalError(f"Path traversal detected: {skill_name}")
        except (OSError, ValueError) as exc:
            raise SkillPathTraversalError(f"Invalid path: {exc}") from exc
        return path

    def _resolve_skill_dir(self, project_id: str, skill_name: str) -> Path:
        """Look up a skill directory: project-private first, then _official."""
        safe_name = _validate_skill_name(skill_name)
        project_path = self._project_dir(project_id) / safe_name
        if project_path.exists() and project_path.is_dir():
            return project_path
        official_path = self.official_dir / safe_name
        if official_path.exists() and official_path.is_dir():
            return official_path
        raise SkillNotFoundError(f"Skill '{skill_name}' not found")

    def _is_official(self, skill_dir: Path) -> bool:
        """Return True if *skill_dir* lives under the _official tree."""
        try:
            return str(skill_dir.resolve()).startswith(str(self.official_dir.resolve()))
        except (OSError, ValueError):
            return False

    # ------------------------------------------------------------------
    # Disabled-skills state management
    # ------------------------------------------------------------------

    _DISABLED_FILE = ".disabled_skills.json"

    def _disabled_file_path(self, project_id: str) -> Path:
        """Return the path to the disabled-skills JSON file for a project."""
        return self._project_dir(project_id) / self._DISABLED_FILE

    def _load_disabled_skills(self, project_id: str) -> Set[str]:
        """Load the set of disabled skill names for a project."""
        path = self._disabled_file_path(project_id)
        if not path.exists():
            return set()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return set(data)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Cannot read disabled skills file %s: %s", path, exc)
        return set()

    def _save_disabled_skills(self, project_id: str, disabled: Set[str]) -> None:
        """Persist the set of disabled skill names for a project."""
        path = self._disabled_file_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(sorted(disabled), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    async def toggle_skill(
        self, project_id: str, skill_name: str, enabled: bool
    ) -> bool:
        """Set the enabled/disabled state of a skill. Returns the new state."""
        # Validate skill exists
        _validate_skill_name(skill_name)
        self._resolve_skill_dir(project_id, skill_name)

        disabled = self._load_disabled_skills(project_id)
        if enabled:
            disabled.discard(skill_name)
        else:
            disabled.add(skill_name)
        self._save_disabled_skills(project_id, disabled)
        return enabled

    def get_disabled_skills(self, project_id: str) -> Set[str]:
        """Public accessor for the set of disabled skill names."""
        return self._load_disabled_skills(project_id)

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    async def list_skills(self, project_id: str) -> List[SkillSummary]:
        """List all skills visible to a project (private + official)."""
        skills: List[SkillSummary] = []
        disabled = self._load_disabled_skills(project_id)

        # 1. Project-private skills
        project_dir = self._project_dir(project_id)
        if project_dir.exists():
            for child in sorted(project_dir.iterdir()):
                if child.is_dir() and (child / "SKILL.md").exists():
                    summary = self._parse_skill_summary(child, is_official=False)
                    if summary is not None:
                        summary.enabled = child.name not in disabled
                        skills.append(summary)

        # 2. Official (global) skills
        if self.official_dir.exists():
            for child in sorted(self.official_dir.iterdir()):
                if child.is_dir() and (child / "SKILL.md").exists():
                    summary = self._parse_skill_summary(child, is_official=True)
                    if summary is not None:
                        summary.enabled = child.name not in disabled
                        skills.append(summary)

        return skills

    async def get_skill(self, project_id: str, skill_name: str) -> SkillDetail:
        """Read a skill's full detail (frontmatter + body + file list)."""
        skill_dir = self._resolve_skill_dir(project_id, skill_name)
        return self._parse_skill_detail(skill_dir)

    async def create_skill(
        self, project_id: str, data: SkillCreateRequest
    ) -> SkillDetail:
        """Create a new project-private skill directory with SKILL.md."""
        skill_dir = self._skill_dir(project_id, data.name)
        if skill_dir.exists():
            raise SkillConflictError(f"Skill '{data.name}' already exists")

        # Create directory structure
        skill_dir.mkdir(parents=True, exist_ok=False)

        # Write SKILL.md
        self._write_skill_md(skill_dir, data)

        # Write optional sub-files
        if data.scripts:
            self._write_files(skill_dir / "scripts", data.scripts)
        if data.references:
            self._write_files(skill_dir / "references", data.references)

        return self._parse_skill_detail(skill_dir)

    async def update_skill(
        self, project_id: str, skill_name: str, data: SkillUpdateRequest
    ) -> SkillDetail:
        """Update SKILL.md content for a project-private skill."""
        skill_dir = self._resolve_skill_dir(project_id, skill_name)

        if self._is_official(skill_dir):
            raise SkillReadOnlyError(
                f"Cannot modify official skill '{skill_name}'"
            )

        # Merge update into existing frontmatter
        self._write_skill_md(skill_dir, data, merge=True)
        return self._parse_skill_detail(skill_dir)

    async def delete_skill(self, project_id: str, skill_name: str) -> None:
        """Delete a project-private skill directory entirely."""
        skill_dir = self._skill_dir(project_id, skill_name)
        if not skill_dir.exists():
            raise SkillNotFoundError(f"Skill '{skill_name}' not found")

        if self._is_official(skill_dir):
            raise SkillReadOnlyError(
                f"Cannot delete official skill '{skill_name}'"
            )

        shutil.rmtree(skill_dir)

    # ------------------------------------------------------------------
    # Sub-file CRUD
    # ------------------------------------------------------------------

    async def get_file(
        self, project_id: str, skill_name: str, file_path: str
    ) -> str:
        """Read a sub-file (script / reference) content as text."""
        skill_dir = self._resolve_skill_dir(project_id, skill_name)
        target = (skill_dir / file_path).resolve()
        # Path traversal check
        if not str(target).startswith(str(skill_dir.resolve())):
            raise SkillPathTraversalError(f"Invalid file path: {file_path}")
        if not target.is_file():
            raise SkillNotFoundError(
                f"File '{file_path}' not found in skill '{skill_name}'"
            )
        return target.read_text(encoding="utf-8")

    async def put_file(
        self,
        project_id: str,
        skill_name: str,
        file_path: str,
        content: str,
    ) -> None:
        """Create or update a sub-file inside a project-private skill."""
        skill_dir = self._resolve_skill_dir(project_id, skill_name)

        if self._is_official(skill_dir):
            raise SkillReadOnlyError(
                f"Cannot modify files in official skill '{skill_name}'"
            )

        target = (skill_dir / file_path).resolve()
        if not str(target).startswith(str(skill_dir.resolve())):
            raise SkillPathTraversalError(f"Invalid file path: {file_path}")

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    async def delete_file(
        self, project_id: str, skill_name: str, file_path: str
    ) -> None:
        """Delete a sub-file from a project-private skill."""
        skill_dir = self._resolve_skill_dir(project_id, skill_name)

        if self._is_official(skill_dir):
            raise SkillReadOnlyError(
                f"Cannot delete files in official skill '{skill_name}'"
            )

        target = (skill_dir / file_path).resolve()
        if not str(target).startswith(str(skill_dir.resolve())):
            raise SkillPathTraversalError(f"Invalid file path: {file_path}")
        if not target.is_file():
            raise SkillNotFoundError(
                f"File '{file_path}' not found in skill '{skill_name}'"
            )
        target.unlink()

    # ------------------------------------------------------------------
    # Internal parsing helpers
    # ------------------------------------------------------------------

    def _parse_skill_summary(
        self, skill_dir: Path, *, is_official: bool
    ) -> Optional[SkillSummary]:
        """Parse SKILL.md frontmatter into a SkillSummary, or None on error."""
        skill_md = skill_dir / "SKILL.md"
        try:
            text = skill_md.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Cannot read %s: %s", skill_md, exc)
            return None

        fm, _ = _parse_frontmatter(text)
        meta = fm.get("metadata") or {}

        # Determine updated_at from file modification time
        try:
            stat = skill_md.stat()
            updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        except OSError:
            updated_at = None

        return SkillSummary(
            name=fm.get("name", skill_dir.name),
            description=fm.get("description", ""),
            author=meta.get("author"),
            is_official=is_official,
            is_featured=meta.get("is_featured", False),
            tags=meta.get("tags", []),
            updated_at=updated_at,
        )

    def _parse_skill_detail(self, skill_dir: Path) -> SkillDetail:
        """Parse full SKILL.md + enumerate sub-files → SkillDetail."""
        skill_md = skill_dir / "SKILL.md"
        try:
            text = skill_md.read_text(encoding="utf-8")
        except OSError as exc:
            raise SkillNotFoundError(
                f"Cannot read SKILL.md in '{skill_dir.name}': {exc}"
            ) from exc

        fm, body = _parse_frontmatter(text)
        meta = fm.get("metadata") or {}

        try:
            stat = skill_md.stat()
            updated_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        except OSError:
            updated_at = None

        is_official = self._is_official(skill_dir)

        # Collect sub-file listings
        scripts = self._list_relative_files(skill_dir / "scripts")
        references = self._list_relative_files(skill_dir / "references")

        return SkillDetail(
            name=fm.get("name", skill_dir.name),
            description=fm.get("description", ""),
            author=meta.get("author"),
            is_official=is_official,
            is_featured=meta.get("is_featured", False),
            tags=meta.get("tags", []),
            updated_at=updated_at,
            instructions=body,
            license=fm.get("license"),
            version=meta.get("version"),
            metadata={k: str(v) for k, v in meta.items() if k not in ("author", "version", "tags", "is_featured")},
            scripts=scripts,
            references=references,
        )

    # ------------------------------------------------------------------
    # Internal write helpers
    # ------------------------------------------------------------------

    def _write_skill_md(
        self,
        skill_dir: Path,
        data: SkillCreateRequest | SkillUpdateRequest,
        *,
        merge: bool = False,
    ) -> None:
        """Write (or merge-update) SKILL.md from schema data."""
        skill_md = skill_dir / "SKILL.md"

        if merge and skill_md.exists():
            existing_text = skill_md.read_text(encoding="utf-8")
            fm, body = _parse_frontmatter(existing_text)
        else:
            fm = {}
            body = ""

        # Update frontmatter fields
        if hasattr(data, "name") and getattr(data, "name", None) is not None:
            fm["name"] = data.name
        if data.description is not None:
            fm["description"] = data.description
        if hasattr(data, "license") and getattr(data, "license", None) is not None:
            fm["license"] = data.license

        # Update metadata sub-dict
        meta = fm.get("metadata") or {}
        if hasattr(data, "author") and getattr(data, "author", None) is not None:
            meta["author"] = data.author
        if data.tags is not None:
            meta["tags"] = data.tags
        if hasattr(data, "is_featured") and getattr(data, "is_featured", None) is not None:
            meta["is_featured"] = data.is_featured
        if hasattr(data, "metadata") and getattr(data, "metadata", None) is not None:
            for k, v in data.metadata.items():
                meta[k] = v
        if meta:
            fm["metadata"] = meta

        # Update body
        if data.instructions is not None:
            body = data.instructions

        skill_md.write_text(
            _serialize_skill_md(fm, body),
            encoding="utf-8",
        )

    @staticmethod
    def _write_files(parent_dir: Path, files: Dict[str, str]) -> None:
        """Write multiple files under *parent_dir*."""
        parent_dir.mkdir(parents=True, exist_ok=True)
        for filename, content in files.items():
            # Basic filename safety
            safe = Path(filename).name
            (parent_dir / safe).write_text(content, encoding="utf-8")

    @staticmethod
    def _list_relative_files(directory: Path) -> List[str]:
        """List files recursively under *directory* as relative paths."""
        if not directory.exists() or not directory.is_dir():
            return []
        result: List[str] = []
        prefix = str(directory.name)
        for root, _dirs, files in os.walk(directory):
            for f in sorted(files):
                full = Path(root) / f
                rel = full.relative_to(directory.parent)
                result.append(str(rel))
        return sorted(result)
