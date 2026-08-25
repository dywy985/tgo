/**
 * Node Execution Overlay Component
 * A shared overlay for all nodes to display execution status and data
 */

import React, { useState } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import NodeExecutionBadge from './NodeExecutionBadge';
import ExecutionDataPopover from './ExecutionDataPopover';

interface NodeExecutionOverlayProps {
  nodeId: string;
  label: string;
}

const NodeExecutionOverlay: React.FC<NodeExecutionOverlayProps> = ({ nodeId, label }) => {
  const [showPopover, setShowPopover] = useState(false);
  const execution = useWorkflowStore(state => state.nodeExecutionMap[nodeId]);

  if (!execution) return null;

  return (
    <>
      <NodeExecutionBadge 
        execution={execution} 
        onClick={() => setShowPopover(!showPopover)} 
      />
      
      {showPopover && (
        <ExecutionDataPopover 
          execution={execution}
          nodeLabel={label}
          onClose={() => setShowPopover(false)}
        />
      )}
    </>
  );
};

export default NodeExecutionOverlay;

