"""Download an Agent Skill directory from a GitHub URL.

Supports URLs of the form:
    https://github.com/{owner}/{repo}/tree/{ref}/{path}
    https://github.com/{owner}/{repo}/blob/{ref}/{path}

The downloader uses **raw.githubusercontent.com** for file downloads and
the GitHub web JSON endpoint (``?json=1``) for directory listing – neither
requires an API token, avoiding the restrictive 60-req/hr anonymous rate
limit of the official GitHub REST API.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Optional

import httpx
import yaml

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants / limits
# ---------------------------------------------------------------------------

_MAX_FILES = 100
_MAX_FILE_SIZE = 1 * 1024 * 1024  # 1 MB per file
_RAW_BASE = "https://raw.githubusercontent.com"
_REQUEST_TIMEOUT = 30.0  # seconds

# Regex to parse GitHub tree/blob URLs
# Matches: https://github.com/{owner}/{repo}/(tree|blob)/{ref}/{path...}
_GITHUB_URL_RE = re.compile(
    r"^https?://github\.com/"
    r"(?P<owner>[^/]+)/"
    r"(?P<repo>[^/]+)/"
    r"(?:tree|blob)/"
    r"(?P<ref>[^/]+)/"
    r"(?P<path>.+?)/?$"
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GitHubURLParseError(Exception):
    """Raised when a GitHub URL cannot be parsed."""


class GitHubDownloadError(Exception):
    """Raised when downloading from GitHub fails."""


class SkillValidationError(Exception):
    """Raised when the downloaded skill fails validation."""


# ---------------------------------------------------------------------------
# Downloader
# ---------------------------------------------------------------------------


class GitHubSkillDownloader:
    """Download an Agent Skill directory from GitHub to local disk.

    Uses raw.githubusercontent.com for file downloads and the GitHub web
    JSON endpoint for directory listings, so **no API token is required**.
    """

    # ------------------------------------------------------------------
    # URL parsing
    # ------------------------------------------------------------------

    @staticmethod
    def parse_github_url(url: str) -> tuple[str, str, str, str]:
        """Parse a GitHub tree/blob URL into (owner, repo, ref, dir_path).

        Handles:
        - ``/tree/{ref}/{path}``  – standard directory URL
        - ``/blob/{ref}/{path}``  – file URL (user copied from a blob page)
        - Trailing ``SKILL.md`` or other filenames – automatically stripped
          to derive the parent directory.

        Raises:
            GitHubURLParseError: if the URL does not match the expected format.
        """
        url = url.strip()
        match = _GITHUB_URL_RE.match(url)
        if not match:
            raise GitHubURLParseError(
                f"Invalid GitHub URL: '{url}'. "
                "Expected format: https://github.com/owner/repo/tree/branch/path"
            )

        owner = match.group("owner")
        repo = match.group("repo")
        ref = match.group("ref")
        path = match.group("path").rstrip("/")

        # If path points to a file (e.g. ends with SKILL.md), use its parent dir
        if "." in path.rsplit("/", 1)[-1]:
            parent = path.rsplit("/", 1)[0] if "/" in path else ""
            if not parent:
                raise GitHubURLParseError(
                    f"Cannot determine skill directory from URL: '{url}'. "
                    "The path appears to point to a file at the repository root."
                )
            path = parent

        return owner, repo, ref, path

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def download_skill(
        self,
        github_url: str,
        target_dir: Path,
        github_token: Optional[str] = None,
    ) -> str:
        """Download a skill directory from GitHub into *target_dir*.

        The method first downloads into a temp directory, validates the
        result, and then moves it to *target_dir* to keep writes atomic.

        Args:
            github_url: GitHub URL pointing to the skill directory.
            target_dir: Local directory to save the skill into.
            github_token: Optional token (currently unused – kept for
                backwards compatibility and possible future use).

        Returns:
            The validated skill name (from SKILL.md frontmatter).

        Raises:
            GitHubURLParseError: bad URL format.
            GitHubDownloadError: network / download errors.
            SkillValidationError: missing or invalid SKILL.md.
        """
        owner, repo, ref, path = self.parse_github_url(github_url)

        logger.info(
            "Downloading skill from GitHub: %s/%s ref=%s path=%s",
            owner, repo, ref, path,
        )

        # Work in a temp directory first
        tmp_root = Path(tempfile.mkdtemp(prefix="skill_import_"))
        try:
            await self._fetch_directory(
                owner=owner,
                repo=repo,
                ref=ref,
                remote_path=path,
                local_dir=tmp_root,
                file_count=0,
            )

            # Validate SKILL.md
            skill_name = self._validate_skill_md(tmp_root)

            # Atomic move to target
            if target_dir.exists():
                shutil.rmtree(target_dir)
            target_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_root), str(target_dir))

            logger.info("Skill '%s' imported successfully to %s", skill_name, target_dir)
            return skill_name

        except Exception:
            # Clean up temp dir on failure
            shutil.rmtree(tmp_root, ignore_errors=True)
            raise

    # ------------------------------------------------------------------
    # Internal helpers – directory listing via web JSON endpoint
    # ------------------------------------------------------------------

    async def _fetch_directory(
        self,
        owner: str,
        repo: str,
        ref: str,
        remote_path: str,
        local_dir: Path,
        file_count: int,
    ) -> int:
        """Recursively fetch a GitHub directory.

        Uses the GitHub web JSON endpoint (``?json=1``) for directory
        listings and raw.githubusercontent.com for file downloads.
        Neither requires an API token.

        Returns the cumulative file count (for enforcing the limit).
        """
        items = await self._web_list_directory(owner, repo, ref, remote_path)

        for item in items:
            content_type = item.get("contentType", "")
            item_name = item.get("name", "")

            if not item_name:
                continue

            if file_count >= _MAX_FILES:
                raise GitHubDownloadError(
                    f"Skill exceeds the maximum of {_MAX_FILES} files"
                )

            if content_type == "file":
                file_path = f"{remote_path}/{item_name}"
                raw_url = f"{_RAW_BASE}/{owner}/{repo}/{ref}/{file_path}"

                target_path = local_dir / item_name
                await self._download_file(raw_url, target_path)
                file_count += 1

            elif content_type == "directory":
                sub_dir = local_dir / item_name
                sub_dir.mkdir(parents=True, exist_ok=True)
                sub_remote_path = f"{remote_path}/{item_name}"
                file_count = await self._fetch_directory(
                    owner=owner,
                    repo=repo,
                    ref=ref,
                    remote_path=sub_remote_path,
                    local_dir=sub_dir,
                    file_count=file_count,
                )

        return file_count

    async def _web_list_directory(
        self,
        owner: str,
        repo: str,
        ref: str,
        path: str,
    ) -> list[dict]:
        """List directory contents via the GitHub web JSON endpoint.

        Fetches ``https://github.com/{owner}/{repo}/tree/{ref}/{path}?json=1``
        which returns a JSON payload with an ``items`` array describing the
        directory entries.  This endpoint does NOT count against the REST
        API rate limit and requires no authentication.
        """
        url = f"https://github.com/{owner}/{repo}/tree/{ref}/{path}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; TGO-Skill-Importer/1.0)",
            "X-Requested-With": "XMLHttpRequest",
        }

        async with httpx.AsyncClient(
            timeout=_REQUEST_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(url, headers=headers, params={"json": "1"})

        if resp.status_code == 404:
            raise GitHubDownloadError(
                f"GitHub path not found: {owner}/{repo}/{path} (ref={ref}). "
                "Please check the URL and ensure the repository/path exists."
            )
        if resp.status_code != 200:
            raise GitHubDownloadError(
                f"GitHub returned HTTP {resp.status_code} when listing "
                f"directory {owner}/{repo}/{path}. Response: {resp.text[:300]}"
            )

        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise GitHubDownloadError(
                f"Failed to parse GitHub directory listing as JSON for "
                f"{owner}/{repo}/{path}: {exc}"
            ) from exc

        # The JSON payload has a "payload" -> "tree" -> "items" structure
        payload = data.get("payload", {})
        tree = payload.get("tree", {})
        items: list[dict] = tree.get("items", [])

        if not items:
            raise GitHubDownloadError(
                f"Directory appears empty or is not a valid directory: "
                f"{owner}/{repo}/{path} (ref={ref})"
            )

        return items

    # ------------------------------------------------------------------
    # Internal helpers – file download via raw.githubusercontent.com
    # ------------------------------------------------------------------

    async def _download_file(
        self,
        raw_url: str,
        target_path: Path,
    ) -> None:
        """Download a single file from raw.githubusercontent.com.

        No authentication is required for public repositories.
        """
        async with httpx.AsyncClient(
            timeout=_REQUEST_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(raw_url)

        if resp.status_code == 404:
            raise GitHubDownloadError(
                f"File not found: {raw_url}"
            )
        if resp.status_code != 200:
            raise GitHubDownloadError(
                f"Failed to download {raw_url}: HTTP {resp.status_code}"
            )

        # Enforce file size limit
        if len(resp.content) > _MAX_FILE_SIZE:
            logger.warning(
                "Skipping oversized file %s (%d bytes > %d limit)",
                target_path.name, len(resp.content), _MAX_FILE_SIZE,
            )
            return

        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(resp.content)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_skill_md(skill_dir: Path) -> str:
        """Validate that SKILL.md exists and has valid frontmatter.

        Returns the skill ``name`` from the frontmatter.

        Raises:
            SkillValidationError: on any validation failure.
        """
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            raise SkillValidationError(
                "Downloaded directory does not contain a SKILL.md file. "
                "A valid skill must have a SKILL.md with YAML frontmatter."
            )

        text = skill_md.read_text(encoding="utf-8")

        # Parse frontmatter
        if not text.startswith("---"):
            raise SkillValidationError(
                "SKILL.md is missing YAML frontmatter (must start with '---')."
            )

        parts = text.split("---", 2)
        if len(parts) < 3:
            raise SkillValidationError(
                "SKILL.md has malformed YAML frontmatter."
            )

        try:
            fm: dict = yaml.safe_load(parts[1]) or {}
        except yaml.YAMLError as exc:
            raise SkillValidationError(
                f"SKILL.md frontmatter YAML parse error: {exc}"
            ) from exc

        name = fm.get("name")
        if not name or not isinstance(name, str):
            raise SkillValidationError(
                "SKILL.md frontmatter is missing a required 'name' field."
            )

        description = fm.get("description")
        if not description or not isinstance(description, str):
            raise SkillValidationError(
                "SKILL.md frontmatter is missing a required 'description' field."
            )

        # Validate name format: lowercase letters, digits, hyphens; no
        # leading/trailing hyphens, no consecutive hyphens.  Digits at the
        # start are allowed (e.g. "1password").
        name_re = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
        if len(name) < 2 or len(name) > 64:
            raise SkillValidationError(
                f"Skill name must be 2-64 characters, got '{name}' ({len(name)} chars)."
            )
        if not name_re.match(name):
            raise SkillValidationError(
                f"Invalid skill name '{name}': must be lowercase letters, "
                "digits, and hyphens (no leading/trailing hyphens)."
            )
        if "--" in name:
            raise SkillValidationError(
                f"Skill name '{name}' contains consecutive hyphens, which is not allowed."
            )

        # Move non-standard frontmatter fields into metadata so Agno's
        # strict validator won't reject them at runtime.
        _STANDARD_FIELDS = {
            "name", "description", "license",
            "allowed-tools", "compatibility", "metadata",
        }
        extra_keys = [k for k in fm if k not in _STANDARD_FIELDS]
        if extra_keys:
            meta = fm.get("metadata") or {}
            for k in extra_keys:
                meta[k] = fm.pop(k)
            fm["metadata"] = meta

            # Re-write the sanitised SKILL.md back to disk
            body = parts[2]
            fm_str = yaml.dump(
                fm, default_flow_style=False,
                allow_unicode=True, sort_keys=False,
            ).rstrip("\n")
            skill_md.write_text(
                f"---\n{fm_str}\n---\n{body}",
                encoding="utf-8",
            )
            logger.info(
                "Moved non-standard frontmatter fields %s into metadata for skill '%s'",
                extra_keys, name,
            )

        return name
