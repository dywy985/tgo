# tgo-widget-cli — AGENTS.md

> Stack: TypeScript + Commander.js + MCP Server · Role: Visitor-side CLI + MCP server

## Rules

- All API calls go through `src/client.ts` — uses `X-Platform-API-Key` auth
- Dual send paths: `chat send` uses HTTP completion API (triggers AI); `chat send-ws` uses raw WebSocket (no AI)
- MCP `tgo_widget_chat_send` defaults to `stream=false` since MCP tools return complete responses
- Config persistence in `~/.tgo-widget/config.json` after init

## Key Paths

| Area | Files |
|------|-------|
| CLI entry | `src/index.ts` |
| API client | `src/client.ts` |
| Config | `src/config.ts` |
| Output | `src/output.ts` |
| WuKongIM | `src/wukongim.ts` |
| Commands | `src/commands/*.ts` (init, chat, platform, channel, activity) |
| MCP server | `src/mcp/server.ts` |

## Key Differences from tgo-cli

| Aspect | tgo-cli (staff) | tgo-widget-cli (visitor) |
|--------|----------------|-------------------------|
| Auth | JWT (staff login) | Platform API Key + visitor register |
| Send | WuKongIM WebSocket | POST /v1/chat/completion (SSE) |
| IM uid | `{user_id}-staff` | `platform_open_id` |
| Channel type | 1 (person), 2 (group) | 251 (customer service) |

## Verify

```bash
npm run build
```
