/**
 * Workflow Edges Index
 * Export all custom edge components
 */

export { default as CustomEdge } from './CustomEdge';

import CustomEdge from './CustomEdge';

/**
 * Edge types map for React Flow
 */
export const edgeTypes = {
  custom: CustomEdge,
};

