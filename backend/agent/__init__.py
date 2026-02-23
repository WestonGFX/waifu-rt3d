"""Phase 10: Agentic Characters -- tool-use middleware.

This package provides the agentic loop that sits between the chat endpoint
and LLM adapters, enabling characters to use tools during conversation.

Exports:
    ToolRegistry: Registry of available tools with JSON schemas.
    ToolDef: Definition for a single tool.
    ToolResult: Result from executing a tool.
    ToolContext: Execution context passed to tool executors.
    AgentRunner: Core agentic loop for multi-round tool-calling conversations.
"""

from backend.agent.registry import ToolRegistry, ToolDef, ToolResult, ToolContext
from backend.agent.runner import AgentRunner

__all__ = ["ToolRegistry", "ToolDef", "ToolResult", "ToolContext", "AgentRunner"]
