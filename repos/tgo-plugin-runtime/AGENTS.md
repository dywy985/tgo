# tgo-plugin-runtime — AGENTS.md

> Port: 8090 · Entry: `app/main.py` · Communication: Unix Socket (default) / TCP

## Rules

- Identify change layer: API, process management, installer, or communication
- Plugin state machine changes must ensure rollback-safe transitions
- `project_id` changes must verify permission boundary first
- Verify basic lifecycle: install → start → request → stop

## Key Paths

| Area | Files |
|------|-------|
| Plugin API | `app/api/routes.py` |
| Process mgmt | `app/services/process_manager.py` |
| Request dispatch | `app/services/plugin_manager.py` |
| Installer | `app/services/installer.py` |
| Tool sync | `app/services/tool_sync.py` |
| Socket server | `app/services/socket_server.py` |
| Models | `app/models/` |

## Constraints

- Plugin lifecycle must go through `process_manager` — no direct subprocess ops
- Plugin requests use unified socket/request flow — no raw socket in API layer
- `project_id` filtering must be preserved — no global exposure of project-private plugins
- Model changes must include Alembic migration
- Socket path, TCP port, AI service address from config

## Verify

```bash
poetry run pytest
```
