/**
 * Custom Edge Component
 * Styled edge with optional labels for conditional branches
 */

import React from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';

const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const getLabelColor = () => {
    if (data?.label === 'true' || data?.label === '是') {
      return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700';
    }
    if (data?.label === 'false' || data?.label === '否') {
      return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700';
    }
    return 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';
  };

  const isActive = data?.isActive;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected || isActive ? 3 : 2,
          stroke: selected ? '#3b82f6' : (isActive ? '#22c55e' : '#94a3b8'),
          transition: 'stroke 0.3s, stroke-width 0.3s',
          filter: isActive ? 'drop-shadow(0 0 3px rgba(34, 197, 94, 0.4))' : 'none',
        }}
      />
      {/* Animated glow overlay when active */}
      {isActive && (
        <BaseEdge
          path={edgePath}
          style={{
            strokeWidth: 5,
            stroke: '#22c55e',
            strokeOpacity: 0.2,
            filter: 'blur(4px)',
          }}
        />
      )}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`
              px-2 py-0.5 text-xs font-medium rounded border
              ${getLabelColor()}
            `}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default CustomEdge;

