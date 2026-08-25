import React from 'react';
import AgentCard from './AgentCard';
import type { Agent, AgentToolResponse } from '@/types';

interface AgentGridProps {
  agents: Agent[];
  onAgentAction?: (actionType: string, agent: Agent) => void;
  onToolClick?: (tool: AgentToolResponse) => void;
  className?: string;
}

/**
 * Agent grid component for displaying multiple agent cards
 * Note: This component assumes agents array is not empty.
 * Empty states, loading states, and error states should be handled by parent components.
 */
const AgentGrid: React.FC<AgentGridProps> = ({
  agents,
  onAgentAction,
  onToolClick,
  className = ''
}) => {
  const handleAgentAction = (actionType: string, agent: Agent): void => {
    console.log(`Action ${actionType} on agent:`, agent);
    onAgentAction?.(actionType, agent);
  };

  const handleToolClick = (tool: AgentToolResponse): void => {
    onToolClick?.(tool);
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onAction={handleAgentAction}
          onToolClick={handleToolClick}
        />
      ))}
    </div>
  );
};

export default AgentGrid;
