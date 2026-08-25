# tgo-device-control — AGENTS.md

> Port: 8085 (HTTP), 9876 (TCP RPC) · Entry: `app/main.py` · MCP: `POST /mcp/{device_id}`

## Rules

- Identify change layer: HTTP API, TCP protocol, or MCP proxy
- Protocol field changes must check device-side (`tgo-device-agent`) compatibility first
- Connection state/timeout changes must verify disconnect-reconnect path
- Verify: device auth → tools/list → tools/call → MCP passthrough

## Key Paths

| Area | Files |
|------|-------|
| TCP RPC | `app/services/tcp_rpc_server.py` |
| Connection mgmt | `app/services/tcp_connection_manager.py` |
| MCP proxy | `app/services/mcp_server.py` |
| Bind codes | `app/services/bind_code_service.py` |
| Device service | `app/services/device_service.py` |
| REST API | `app/api/v1/` |
| Schemas | `app/schemas/` |

## Constraints

- TCP JSON-RPC messages must be backward-compatible with `tgo-device-agent`
- MCP passthrough must not alter upstream tool-call semantics
- Device connections managed exclusively through `tcp_connection_manager`
- Auth tokens, bind codes, device tokens must not leak in logs
- No bypassing `device_id` binding for cross-device channel access
- Model changes must include Alembic migration

## Verify

```bash
poetry run pytest
```
