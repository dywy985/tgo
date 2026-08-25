"""WuKongIM public endpoints."""

from fastapi import APIRouter, HTTPException, status

from app.core.logging import get_logger
from app.schemas.wukongim import WuKongIMRouteResponse
from app.services.wukongim_client import wukongim_client

logger = get_logger("endpoints.wukongim")
router = APIRouter()


@router.get(
    "/route",
    response_model=WuKongIMRouteResponse,
    summary="Get WuKongIM WebSocket Connection Address",
    description="Get the WebSocket long connection address for a user from WuKongIM service. "
                "This endpoint does not require authentication and can be used by both staff and visitors."
)
async def get_wukongim_route(
    uid: str,
) -> WuKongIMRouteResponse:
    """
    Get WuKongIM WebSocket connection address for a user.
    
    This is a public endpoint that proxies the request to WuKongIM service
    to retrieve the WebSocket connection address (tcp_addr and ws_addr) for
    the specified user ID.
    
    Args:
        uid: User ID (can be staff UID or visitor UID)
        
    Returns:
        WuKongIM route response with connection addresses
        
    Raises:
        400: If uid parameter is missing or invalid
        502: If WuKongIM service is unreachable or returns an error
        503: If WuKongIM integration is disabled
    """
    if not uid or not uid.strip():
        logger.warning("Route request with empty uid parameter")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="uid parameter is required and cannot be empty"
        )
    
    logger.info(f"Getting WuKongIM route for uid: {uid}")
    
    try:
        result = await wukongim_client.get_route(uid=uid)
        
        logger.info(f"Successfully retrieved route for uid: {uid}")
        
        return result
        
    except HTTPException:
        # Re-raise HTTPExceptions from the client
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting route for uid {uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve route from WuKongIM service"
        )

