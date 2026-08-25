/**
 * Workflow Data Transformations
 */

import type { WorkflowNode, WorkflowNodeData } from '@/types/workflow';

/**
 * Migrates and cleans up node data to ensure correct field names
 */
export const migrateNodeData = (data: any): WorkflowNodeData => {
  if (!data) return data;

  const newData = { ...data };

  // Migrate LLM node fields
  if (data.type === 'llm') {
    // tools -> tool_ids
    if (data.tools && !data.tool_ids) {
      newData.tool_ids = data.tools;
    }
    delete newData.tools;

    // knowledge_bases -> collection_ids
    if (data.knowledge_bases && !data.collection_ids) {
      newData.collection_ids = data.knowledge_bases;
    }
    delete newData.knowledge_bases;
  }

  return newData as WorkflowNodeData;
};

/**
 * Migrates a list of nodes
 */
export const migrateNodes = (nodes: WorkflowNode[]): WorkflowNode[] => {
  return nodes.map(node => ({
    ...node,
    data: migrateNodeData(node.data)
  }));
};

