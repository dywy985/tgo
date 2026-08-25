# tgo-rag — AGENTS.md

> Port: 18082 (dev) / 8082 (container) · Entry: `src/rag_service/main.py` · Prefix: `/v1`

## Rules

- Determine change target: HTTP router, search service, or Celery task
- Change schema/model first, then service and router
- Task chain changes must verify state flow and retry strategy
- Heavy CPU/IO processing must go through Celery — never block HTTP threads
- Embedding/search parameter changes need regression verification

## Key Paths

| Area | Files |
|------|-------|
| Search | `src/rag_service/services/search.py` |
| Vector store | `src/rag_service/services/vector_store.py` |
| Embedding | `src/rag_service/services/embedding.py` |
| Doc processing | `src/rag_service/tasks/document_processing*.py` |
| Website crawl | `src/rag_service/tasks/website_crawling.py` |
| Routers | `src/rag_service/routers/` |
| Models | `src/rag_service/models/` |

## Constraints

- File/chunk/collection states must stay consistent
- Delete/rebuild flows must clean up both vector index and document metadata
- No bare `dict` for complex business objects in service core interfaces
- ORM changes must include Alembic migration
- Provider/rate-limit/upload-size config goes through `config.py` / `.env`

## Verify

```bash
# Static
poetry run mypy src && poetry run flake8 src && poetry run pytest

# Functional (requires running server)
TGO_CLI="node ../tgo-cli/dist/index.js"
$TGO_CLI knowledge list --limit 1       # collection CRUD
# $TGO_CLI knowledge search <id> --query "test"  # search verification
```
