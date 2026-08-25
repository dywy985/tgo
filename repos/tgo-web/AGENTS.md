# tgo-web — AGENTS.md

> Stack: React 19 + TypeScript 5.9 + Vite 7 + Zustand + React Router 7 + Tailwind 4 · Port: 5173

## Rules

- Change order: `types → services → stores → components`
- Backend field changes: update types first, then rendering — avoid implicit `undefined`
- New API calls must be wrapped in `src/services/*` — no direct fetch in components
- Chat link changes must check streaming messages, history messages, and WebSocket consistency
- User-visible text must use `i18n` entries

## Key Paths

| Area | Files |
|------|-------|
| Chat rendering | `src/components/chat/*` |
| WebSocket/IM | `src/components/WebSocketManager.tsx`, `src/services/wukongimWebSocket.ts` |
| Chat API | `src/services/chatMessagesApi.ts` |
| Types | `src/types/index.ts` |
| Chat state | `src/stores/chatStore.ts`, `src/stores/messageStore.ts` |
| Workflow | `src/components/workflow/*`, `src/services/workflowApi.ts` |
| API client | `src/services/api.ts` (`apiClient`) |

## Constraints

- No `any` (including props, store state, API responses)
- No direct `fetch/axios` in components — use `src/services/*`
- Shared state in `src/stores/*` — no duplicate local state
- No mock data imports (ESLint blocks `**/data/mock*`)
- No `console.log` — only `console.warn`/`console.error`
- No hardcoded backend addresses — use env config

## Verify

```bash
# Static
yarn type-check && yarn lint && yarn build

# Functional — tgo-web calls tgo-api; use CLI to verify the APIs it depends on
TGO_CLI="node ../tgo-cli/dist/index.js"
$TGO_CLI auth whoami                    # auth flow
$TGO_CLI conversation list --limit 1    # conversation API
$TGO_CLI agent list --limit 1           # agent API
```
