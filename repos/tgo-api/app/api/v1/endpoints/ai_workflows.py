"""Workflow service proxy endpoints."""

from typing import List, Optional, Union

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.common_responses import CREATE_RESPONSES, CRUD_RESPONSES, LIST_RESPONSES
from app.core.security import get_current_active_user
from app.models import Staff
from app.schemas.ai_workflows import (
    PaginatedWorkflowSummaryResponse,
    WorkflowCreate,
    WorkflowDuplicateRequest,
    WorkflowExecuteRequest,
    WorkflowExecution,
    WorkflowExecutionCancelResponse,
    WorkflowInDB,
    WorkflowSyncResponse,
    WorkflowUpdate,
    WorkflowValidationResponse,
    WorkflowValidateRequest,
    WorkflowVariablesResponse,
)
from app.services.workflow_client import workflow_client

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedWorkflowSummaryResponse,
    responses=LIST_RESPONSES,
    summary="List Workflows",
)
async def list_workflows(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[List[str]] = Query(None),
    sort_by: str = Query("updated_at"),
    sort_order: str = Query("desc"),
    current_user: Staff = Depends(get_current_active_user),
) -> PaginatedWorkflowSummaryResponse:
    """List workflows from Workflow service."""
    data = await workflow_client.list_workflows(
        project_id=str(current_user.project_id),
        skip=skip,
        limit=limit,
        status=status,
        search=search,
        tags=tags,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return PaginatedWorkflowSummaryResponse.model_validate(data)


@router.post(
    "",
    response_model=WorkflowInDB,
    responses=CREATE_RESPONSES,
    status_code=201,
    summary="Create Workflow",
)
async def create_workflow(
    workflow_data: WorkflowCreate,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowInDB:
    """Create workflow in Workflow service."""
    data = await workflow_client.create_workflow(
        str(current_user.project_id), workflow_data.model_dump(by_alias=True)
    )
    return WorkflowInDB.model_validate(data)


@router.get(
    "/{workflow_id}",
    response_model=WorkflowInDB,
    responses=CRUD_RESPONSES,
    summary="Get Workflow",
)
async def get_workflow(
    workflow_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowInDB:
    """Get workflow from Workflow service."""
    data = await workflow_client.get_workflow(workflow_id, str(current_user.project_id))
    return WorkflowInDB.model_validate(data)


@router.put(
    "/{workflow_id}",
    response_model=WorkflowInDB,
    responses=CRUD_RESPONSES,
    summary="Update Workflow",
)
async def update_workflow(
    workflow_id: str,
    workflow_data: WorkflowUpdate,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowInDB:
    """Update workflow in Workflow service."""
    data = await workflow_client.update_workflow(
        workflow_id,
        str(current_user.project_id),
        workflow_data.model_dump(by_alias=True, exclude_none=True),
    )
    return WorkflowInDB.model_validate(data)


@router.delete(
    "/{workflow_id}",
    responses=CRUD_RESPONSES,
    status_code=204,
    summary="Delete Workflow",
)
async def delete_workflow(
    workflow_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> None:
    """Delete workflow from Workflow service."""
    await workflow_client.delete_workflow(workflow_id, str(current_user.project_id))


@router.post(
    "/{workflow_id}/duplicate",
    response_model=WorkflowInDB,
    responses=CRUD_RESPONSES,
    summary="Duplicate Workflow",
)
async def duplicate_workflow(
    workflow_id: str,
    request: Optional[WorkflowDuplicateRequest] = None,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowInDB:
    """Duplicate workflow in Workflow service."""
    payload = request.model_dump(by_alias=True, exclude_none=True) if request else None
    data = await workflow_client.duplicate_workflow(
        workflow_id, str(current_user.project_id), payload
    )
    return WorkflowInDB.model_validate(data)


@router.post(
    "/validate",
    response_model=WorkflowValidationResponse,
    responses=CRUD_RESPONSES,
    summary="Validate Workflow Generic",
)
async def validate_workflow_generic(
    request: WorkflowValidateRequest,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowValidationResponse:
    """Validate an arbitrary workflow graph (nodes/edges) in Workflow service."""
    data = await workflow_client.validate_workflow_generic(
        str(current_user.project_id), request.model_dump(by_alias=True)
    )
    return WorkflowValidationResponse.model_validate(data)


@router.post(
    "/{workflow_id}/validate",
    response_model=WorkflowValidationResponse,
    responses=CRUD_RESPONSES,
    summary="Validate Workflow",
)
async def validate_workflow(
    workflow_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowValidationResponse:
    """Validate an existing workflow by id in Workflow service."""
    data = await workflow_client.validate_workflow(workflow_id, str(current_user.project_id))
    return WorkflowValidationResponse.model_validate(data)


@router.post(
    "/{workflow_id}/publish",
    response_model=WorkflowInDB,
    responses=CRUD_RESPONSES,
    summary="Publish Workflow",
)
async def publish_workflow(
    workflow_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowInDB:
    """Publish a workflow in Workflow service."""
    data = await workflow_client.publish_workflow(workflow_id, str(current_user.project_id))
    return WorkflowInDB.model_validate(data)


@router.get(
    "/{workflow_id}/variables",
    response_model=WorkflowVariablesResponse,
    responses=CRUD_RESPONSES,
    summary="Get Workflow Variables",
)
async def get_workflow_variables(
    workflow_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowVariablesResponse:
    """Get available variables for a workflow in Workflow service."""
    data = await workflow_client.get_workflow_variables(
        workflow_id, str(current_user.project_id)
    )
    return WorkflowVariablesResponse.model_validate(data)


@router.post(
    "/{workflow_id}/execute",
    summary="Execute Workflow",
    response_model=None,
    description="""
Execute a workflow using one of three supported modes:

1. **Synchronous Mode (Default, `stream=False`, `async=False`)**:
   Executes the workflow immediately and returns the final output. Ideal for short-lived tasks.

2. **Asynchronous Mode (`async=True`)**:
   Creates an execution record and triggers a background Celery task. Returns the execution record immediately.

3. **Streaming Mode (`stream=True`)**:
   Returns a Server-Sent Events (SSE) stream, pushing real-time events as the workflow progresses.

### Streaming Mode Events (SSE):
When `stream=True`, the response header includes `Content-Type: text/event-stream`.
Each message starts with `data: ` followed by a JSON string and ends with `\\n\\n`.

- **workflow_started**: Workflow execution initialized.
- **node_started**: A specific node has started executing.
- **node_finished**: A specific node has finished (success or failure).
- **workflow_finished**: Entire workflow has finished.
""",
    responses={
        200: {
            "description": "Successful Response",
            "content": {
                "application/json": {
                    "schema": {
                        "oneOf": [
                            {"$ref": "#/components/schemas/WorkflowSyncResponse"},
                            {"$ref": "#/components/schemas/WorkflowExecution"},
                        ]
                    },
                    "examples": {
                        "sync_mode": {
                            "summary": "Synchronous Mode (Default)",
                            "description": "Returns final output and metadata.",
                            "value": {
                                "success": True,
                                "output": {"answer": "Paris is the capital of France."},
                                "metadata": {
                                    "duration": 1.234,
                                    "startTime": "2026-01-03T06:16:44.478Z",
                                    "endTime": "2026-01-03T06:16:45.712Z",
                                },
                            },
                        },
                        "async_mode": {
                            "summary": "Asynchronous Mode (async=true)",
                            "description": "Returns the execution record with 'pending' status.",
                            "value": {
                                 "id": "d73d5f18-3cc0-400f-ab18-c0a5f05625f5",
                                "project_id": "proj-123",
                                "workflow_id": "wf-456",
                                "status": "pending",
                                "input": {"query": "What is the capital of France?"},
                                "output": None,
                                "error": None,
                                "started_at": "2026-01-03T06:16:44.478Z",
                                "completed_at": None,
                                "duration": None,
                                "node_executions": []
                            },
                        },
                    },
                },
                "text/event-stream": {
                    "description": "Streaming Mode (stream=true)",
                    "example": (
                        "data: {\"event\": \"workflow_started\", \"workflow_run_id\": \"uuid-1\", \"task_id\": \"stream-uuid-1\", \"data\": {\"id\": \"uuid-1\", \"workflow_id\": \"wf-1\", \"inputs\": {}, \"created_at\": 1735790000}}\n\n"
                        "data: {\"event\": \"node_started\", \"workflow_run_id\": \"uuid-1\", \"task_id\": \"stream-uuid-1\", \"data\": {\"id\": \"node-exec-1\", \"node_id\": \"node-1\", \"node_type\": \"llm\", \"title\": \"AI Chat\", \"index\": 1, \"created_at\": 1735790001}}\n\n"
                        "data: {\"event\": \"node_finished\", \"workflow_run_id\": \"uuid-1\", \"task_id\": \"stream-uuid-1\", \"data\": {\"id\": \"node-exec-1\", \"node_id\": \"node-1\", \"node_type\": \"llm\", \"inputs\": {}, \"outputs\": {\"text\": \"Hello\"}, \"status\": \"succeeded\", \"error\": null, \"elapsed_time\": 0.5, \"finished_at\": 1735790002}}\n\n"
                        "data: {\"event\": \"workflow_finished\", \"workflow_run_id\": \"uuid-1\", \"task_id\": \"stream-uuid-1\", \"data\": {\"id\": \"uuid-1\", \"workflow_id\": \"wf-1\", \"status\": \"succeeded\", \"outputs\": {\"result\": \"Hello\"}, \"error\": null, \"elapsed_time\": 0.6, \"total_steps\": 1, \"finished_at\": 1735790002}}\n\n"
                    ),
                },
            },
        },
        404: {"description": "Workflow not found"},
    },
)
async def execute_workflow(
    workflow_id: str,
    request: WorkflowExecuteRequest,
    current_user: Staff = Depends(get_current_active_user),
) -> Union[WorkflowSyncResponse, WorkflowExecution, StreamingResponse]:
    """Execute workflow in Workflow service."""
    res = await workflow_client.execute_workflow(
        workflow_id, str(current_user.project_id), request.model_dump(by_alias=True)
    )

    if request.stream:
        return StreamingResponse(res, media_type="text/event-stream")

    # Determine if it's sync or async response
    if request.async_mode:
        return WorkflowExecution.model_validate(res)
    else:
        return WorkflowSyncResponse.model_validate(res)


@router.get(
    "/executions/{execution_id}",
    response_model=WorkflowExecution,
    summary="Get Execution Status",
)
async def get_execution(
    execution_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowExecution:
    """Get execution status from Workflow service."""
    data = await workflow_client.get_execution(execution_id, str(current_user.project_id))
    return WorkflowExecution.model_validate(data)


@router.get(
    "/{workflow_id}/executions",
    response_model=List[WorkflowExecution],
    summary="List Workflow Executions",
)
async def list_workflow_executions(
    workflow_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: Staff = Depends(get_current_active_user),
) -> List[WorkflowExecution]:
    """List workflow executions from Workflow service."""
    data = await workflow_client.list_workflow_executions(
        workflow_id, str(current_user.project_id), skip=skip, limit=limit
    )
    return [WorkflowExecution.model_validate(item) for item in data]


@router.post(
    "/executions/{execution_id}/cancel",
    response_model=WorkflowExecutionCancelResponse,
    responses=CRUD_RESPONSES,
    summary="Cancel Execution",
)
async def cancel_execution(
    execution_id: str,
    current_user: Staff = Depends(get_current_active_user),
) -> WorkflowExecutionCancelResponse:
    """Cancel a workflow execution in Workflow service."""
    data = await workflow_client.cancel_execution(execution_id, str(current_user.project_id))
    return WorkflowExecutionCancelResponse.model_validate(data)

