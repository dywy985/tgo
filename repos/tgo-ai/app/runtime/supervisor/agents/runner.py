"""Run direct single-agent supervisor executions."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from agno.agent import (
    RunCancelledEvent,
    RunCompletedEvent,
    RunContentEvent,
    RunErrorEvent,
    ToolCallCompletedEvent,
    ToolCallStartedEvent,
)

from app.core.logging import get_logger
from app.models.internal import AgentExecutionContext
from app.runtime.supervisor.streaming.workflow_events import WorkflowEventEmitter
from app.schemas.agent_run import AgentExecutionResult, AgentRunMetadata, SupervisorRunResponse

from .builder import BuiltAgent


@dataclass
class AgentRunResult:
    """Container for final single-agent execution artifacts."""

    content: str
    total_time: float
    success: bool
    error: Optional[str] = None


class AgnoAgentRunner:
    """Execute a direct Agno agent with single-agent response semantics."""

    def __init__(self) -> None:
        self._logger = get_logger("runtime.supervisor.agents.runner")

    async def run(self, built_agent: BuiltAgent, context: AgentExecutionContext) -> SupervisorRunResponse:
        """Run a single agent and translate the result into the public response schema."""
        start_time = time.time()
        output = await built_agent.agent.arun(
            context.message,
            stream=False,
            session_id=context.session_id,
            user_id=context.user_id,
        )
        total_time = time.time() - start_time
        final_content = self._ensure_text(getattr(output, "content", None))
        tools_used = self._extract_tool_names(getattr(output, "tools", None))

        # 提取 LLM token usage (agno RunResponse.response_usage -> Usage)
        usage = self._extract_usage(output)

        result = AgentExecutionResult(
            agent_id=context.agent.id,
            agent_name=context.agent.name,
            question=context.message,
            content=final_content,
            tools_used=tools_used or None,
            execution_time=total_time,
            success=True,
            error=None,
        )
        metadata = AgentRunMetadata(
            agent_id=context.agent.id,
            agent_name=context.agent.name,
            total_execution_time=total_time,
            session_id=context.session_id,
            usage=usage,
        )
        return SupervisorRunResponse(
            success=True,
            message="Agent run completed",
            result=result,
            content=final_content,
            metadata=metadata,
            error=None,
        )

    async def stream(
        self,
        built_agent: BuiltAgent,
        context: AgentExecutionContext,
        workflow_events: WorkflowEventEmitter,
        execution_id: str,
    ) -> AgentRunResult:
        """Run a single agent with streaming workflow events."""
        start_time = time.time()
        content_chunks: list[str] = []
        success = True
        error: Optional[str] = None
        chunk_index = 0
        tool_calls = 0

        async for event in built_agent.agent.arun(
            context.message,
            stream=True,
            stream_intermediate_steps=True,
            session_id=context.session_id,
            user_id=context.user_id,
        ):
            timestamp = datetime.now(timezone.utc).isoformat()
            if isinstance(event, RunContentEvent):
                content = event.content or ""
                if content:
                    content_chunks.append(content)
                    workflow_events.emit_agent_content_chunk(
                        agent_id=str(context.agent.id),
                        agent_name=context.agent.name,
                        execution_id=execution_id,
                        content_chunk=content,
                        chunk_index=chunk_index,
                        is_final=False,
                    )
                    chunk_index += 1
                continue

            if isinstance(event, ToolCallStartedEvent) and event.tool:
                tool_calls += 1
                workflow_events.emit_agent_tool_call_started(
                    agent_id=str(context.agent.id),
                    agent_name=context.agent.name,
                    execution_id=execution_id,
                    tool_name=getattr(event.tool, "tool_name", "unknown_tool"),
                    tool_call_id=getattr(event.tool, "tool_call_id", None),
                    tool_input=getattr(event.tool, "tool_args", None),
                )
                continue

            if isinstance(event, ToolCallCompletedEvent) and event.tool:
                workflow_events.emit_agent_tool_call_completed(
                    agent_id=str(context.agent.id),
                    agent_name=context.agent.name,
                    execution_id=execution_id,
                    tool_name=getattr(event.tool, "tool_name", "unknown_tool"),
                    tool_call_id=getattr(event.tool, "tool_call_id", None),
                    tool_input=getattr(event.tool, "tool_args", None),
                    tool_output=getattr(event.tool, "result", None),
                )
                continue

            if isinstance(event, RunCompletedEvent):
                final_content = self._ensure_text(getattr(event, "content", None))
                if final_content:
                    content_chunks.append(final_content)
                continue

            if isinstance(event, RunErrorEvent):
                success = False
                error = event.content or event.error_type or "Agent run failed"
                self._logger.error(
                    "Agent streaming run failed",
                    agent_id=str(context.agent.id),
                    request_id=context.request_id,
                    timestamp=timestamp,
                    error=error,
                )
                continue

            if isinstance(event, RunCancelledEvent):
                success = False
                error = event.reason or "Agent run cancelled"
                self._logger.info(
                    "Agent streaming run cancelled",
                    agent_id=str(context.agent.id),
                    request_id=context.request_id,
                    timestamp=timestamp,
                    error=error,
                )

        final_content = "".join(content_chunks)
        workflow_events.emit_agent_response_complete(
            agent_id=str(context.agent.id),
            agent_name=context.agent.name,
            execution_id=execution_id,
            final_content=final_content,
            success=success,
            total_chunks=len(content_chunks),
            tool_calls_count=tool_calls,
        )
        return AgentRunResult(
            content=final_content,
            total_time=time.time() - start_time,
            success=success,
            error=error,
        )

    @staticmethod
    def _ensure_text(value: Optional[Any]) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return str(value)

    @staticmethod
    def _extract_tool_names(tools: Any) -> list[str]:
        if not tools:
            return []

        names: list[str] = []
        for tool in tools:
            name = getattr(tool, "tool_name", None)
            if isinstance(name, str) and name:
                names.append(name)
        return names

    @classmethod
    def _extract_usage(cls, output: Any) -> Optional[dict]:
        """从 agno RunResponse 提取 token usage, 容错缺字段。

        agno 2.x: output.metrics -> Metrics(input_tokens, output_tokens, total_tokens)
        (旧版用 output.response_usage -> Usage(prompt_tokens, completion_tokens, total_tokens),
         两个都兼容)
        部分 provider 可能不返回 usage, 此时返回 None。
        """
        try:
            # 优先新版 metrics, 兼容旧版 response_usage
            metrics_obj = getattr(output, "metrics", None)
            if metrics_obj is not None:
                input_tok = int(getattr(metrics_obj, "input_tokens", 0) or 0)
                output_tok = int(getattr(metrics_obj, "output_tokens", 0) or 0)
                total_tok = int(getattr(metrics_obj, "total_tokens", 0) or 0)
                if input_tok or output_tok or total_tok:
                    return {
                        "prompt_tokens": input_tok,
                        "completion_tokens": output_tok,
                        "total_tokens": total_tok,
                    }

            usage_obj = getattr(output, "response_usage", None)
            if usage_obj is not None:
                prompt = int(getattr(usage_obj, "prompt_tokens", 0) or 0)
                completion = int(getattr(usage_obj, "completion_tokens", 0) or 0)
                total = int(getattr(usage_obj, "total_tokens", 0) or 0)
                if not prompt and not completion and not total:
                    return None
                return {
                    "prompt_tokens": prompt,
                    "completion_tokens": completion,
                    "total_tokens": total,
                }
            return None
        except Exception as exc:  # 提取失败不阻塞主流程
            cls._logger = getattr(cls, "_logger", None) or logging.getLogger("runtime.supervisor.agents.runner")
            cls._logger.warning("usage extraction failed (non-fatal): %s", exc)
            return None
