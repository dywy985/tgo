"""Workflow Service client for external workflow data retrieval."""

import uuid
from typing import Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.exceptions import NotFoundError, ValidationError


class WorkflowData(BaseModel):
    """Workflow data from Workflow service."""

    id: str = Field(description="Workflow ID")
    name: str = Field(description="Workflow name")
    description: Optional[str] = Field(default=None, description="Workflow description")
    tags: List[str] = Field(default_factory=list, description="Workflow tags")
    status: str = Field(description="Current status")
    version: int = Field(description="Version number")
    updated_at: str = Field(description="Last update time")


class WorkflowBatchResponse(BaseModel):
    """Response model for batch workflow retrieval."""

    workflows: List[WorkflowData] = Field(description="Found workflows")
    not_found: List[str] = Field(description="Workflow IDs that were not found")


class WorkflowServiceClient:
    """Client for interacting with the external Workflow service."""

    def __init__(self):
        """Initialize the Workflow service client."""
        self.base_url = settings.workflow_service_url
        self.timeout = 30.0

    async def get_workflows_batch(
        self,
        workflow_ids: List[str],
        project_id: str
    ) -> List[WorkflowData]:
        """
        Retrieve multiple workflows by their IDs from the Workflow service.

        Args:
            workflow_ids: List of workflow ID strings
            project_id: Project ID

        Returns:
            List of WorkflowData
        """
        if not workflow_ids:
            return []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            print(f"Getting workflows from {self.base_url}/v1/workflows/batch")
            print(f"Project ID: {project_id}")
            print(f"Workflow IDs: {workflow_ids}")
            try:
                response = await client.get(
                    f"{self.base_url}/v1/workflows/batch",
                    params={
                        "project_id": project_id,
                        "workflow_ids": workflow_ids
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    # The API returns a list of workflows directly according to OpenAPI docs
                    return [WorkflowData(**item) for item in data]
                elif response.status_code == 422:
                    error_data = response.json()
                    raise ValidationError(
                        f"Invalid workflow IDs: {error_data.get('detail', 'Unknown validation error')}",
                        "workflows",
                        {"status_code": response.status_code, "detail": error_data}
                    )
                else:
                    response.raise_for_status()
                    return [] # Should not reach here due to raise_for_status

            except httpx.RequestError as e:
                raise NotFoundError(
                    "Workflow Service",
                    f"Unable to connect to Workflow service: {str(e)}"
                )
            except httpx.HTTPStatusError as e:
                raise ValidationError(
                    f"Workflow service error: {e.response.status_code}",
                    "workflows",
                    {"status_code": e.response.status_code}
                )

    async def validate_workflows_exist(
        self,
        workflow_ids: List[str],
        project_id: str
    ) -> None:
        """
        Validate that workflows exist in the Workflow service.

        Args:
            workflow_ids: List of workflow ID strings to validate
            project_id: Project ID

        Raises:
            NotFoundError: If any workflow is not found
            ValidationError: If validation fails
        """
        if not workflow_ids:
            return

        workflows = await self.get_workflows_batch(workflow_ids, project_id)
        found_ids = {w.id for w in workflows}
        missing_ids = set(workflow_ids) - found_ids

        if missing_ids:
            raise NotFoundError(
                "Workflow",
                f"Workflows not found: {', '.join(missing_ids)}"
            )


# Global Workflow service client instance
workflow_service_client = WorkflowServiceClient()
