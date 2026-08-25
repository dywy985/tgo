"""
Health check endpoints.
"""

import time
from datetime import datetime

from fastapi import APIRouter

from ..config import get_settings
from ..database import database_health_check
from ..schemas.common import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Comprehensive health check endpoint.
    
    Returns the overall health status of the service and its dependencies.
    """
    settings = get_settings()
    start_time = time.time()
    
    # Check database health
    db_health = await database_health_check()
    
    # TODO: Add checks for other services (Redis, Vector DB, etc.)
    redis_health = {"status": "healthy", "response_time_ms": 5}  # Placeholder
    vector_db_health = {"status": "healthy", "response_time_ms": 25}  # Placeholder
    
    # Determine overall status
    all_checks = [db_health, redis_health, vector_db_health]
    overall_status = "healthy" if all(check["status"] == "healthy" for check in all_checks) else "unhealthy"
    
    total_time = round((time.time() - start_time) * 1000, 2)
    
    return HealthResponse(
        status=overall_status,
        version=settings.app_version,
        timestamp=datetime.utcnow().isoformat(),
        checks={
            "database": db_health,
            "redis": redis_health,
            "vector_db": vector_db_health,
            "total_check_time_ms": total_time,
        }
    )


@router.get("/ready")
async def readiness_check():
    """
    Kubernetes readiness probe endpoint.
    
    Returns 200 if the service is ready to accept traffic, 503 otherwise.
    """
    # Simple readiness check - just verify database connection
    db_health = await database_health_check()
    
    if db_health["status"] == "healthy":
        return {"status": "ready"}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Service not ready")


@router.get("/live")
async def liveness_check():
    """
    Kubernetes liveness probe endpoint.
    
    Returns 200 if the service is alive, 503 if it should be restarted.
    """
    # Simple liveness check - just return OK
    # In a real implementation, you might check for deadlocks, memory leaks, etc.
    return {"status": "alive"}
