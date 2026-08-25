# TGO Skills

Deterministic scripts for AI agents to call during development. Each skill lives in its own directory with a `SKILL.md` (description + trigger conditions) and `scripts/` (executable scripts).

## Usage

Skills are referenced from `AGENTS.md` using `$skill-name` syntax. AI agents should call the corresponding script when the trigger condition is met.

## Available Skills

| Skill | Trigger | Script |
|-------|---------|--------|
| `code-change-verification` | After any code change | `scripts/verify.sh` |
| `implementation-strategy` | Before modifying runtime/API/cross-service code | `scripts/analyze.sh` |
| `pr-draft-summary` | When work is ready to commit | `scripts/summary.sh` |
| `db-migration-check` | After modifying `models/` files | `scripts/check.sh` |
| `cross-service-sync` | After modifying schemas/types/API interfaces | `scripts/check.sh` |
| `streaming-protocol-check` | After modifying streaming/SSE/WuKongIM code | `scripts/check.sh` |
| `functional-verification` | After backend API/service changes (needs running server) | `scripts/verify.sh` |
| `local-services` | Start/stop/check local dev services | `scripts/start.sh`, `scripts/status.sh`, `scripts/stop.sh` |

## Running

```bash
# From repo root
bash .skills/<skill-name>/scripts/<script>.sh
```
