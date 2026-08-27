"""Internal services router.

This router includes all internal endpoints that do not require authentication.
These endpoints are designed for inter-service communication within the internal network.
"""

from fastapi import APIRouter

from app.api.internal.endpoints import ai_events, users, store, tickets_command

internal_router = APIRouter()

# Include internal endpoints (no authentication required)
internal_router.include_router(
    ai_events.router,
    prefix="/ai/events",
    tags=["Internal AI Events"]
)

# Ticket command (客服指令回执: #完成 TK-xxx)
internal_router.include_router(
    tickets_command.router,
    prefix="/tickets/command",
    tags=["Internal Tickets"],
)

# New users endpoint
internal_router.include_router(
    users.router,
    prefix="/users",
    tags=["Internal Users"]
)

# Store endpoint
internal_router.include_router(
    store.router,
    prefix="/store",
    tags=["Internal Store"]
)
