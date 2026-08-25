/**
 * Workflow Variables Utility
 * Logic for calculating available variables from upstream nodes
 */

import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

export interface AvailableVariable {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  variableName: string;
  variableType?: 'string' | 'number' | 'boolean' | 'object';
  fullPath: string; // e.g., "Start.user_input"
}

/**
 * Find all upstream nodes of a given node
 */
export function getUpstreamNodes(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  const upstreamNodes: WorkflowNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    // Find all edges where target is currentId
    const incomingEdges = edges.filter(edge => edge.target === currentId);
    
    for (const edge of incomingEdges) {
      if (!visited.has(edge.source)) {
        visited.add(edge.source);
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          upstreamNodes.push(sourceNode);
          queue.push(edge.source);
        }
      }
    }
  }

  return upstreamNodes;
}

/**
 * Get all available variables from upstream nodes
 */
export function getAvailableVariables(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Record<string, AvailableVariable[]> {
  const upstreamNodes = getUpstreamNodes(nodeId, nodes, edges);
  const result: Record<string, AvailableVariable[]> = {};

  upstreamNodes.forEach(node => {
    const variables: AvailableVariable[] = [];
    const data = node.data;

    if (node.type === 'input') {
      const inputData = data as any;
      const refKey = inputData.reference_key || 'input_1';
      if (inputData.input_variables && Array.isArray(inputData.input_variables)) {
        inputData.input_variables.forEach((v: any) => {
          variables.push({
            nodeId: node.id,
            nodeLabel: data.label || '用户输入',
            nodeType: 'input',
            variableName: v.name,
            variableType: v.type,
            fullPath: `${refKey}.${v.name}`
          });
        });
      }
    } else if (node.type === 'webhook') {
      const webhookData = data as any;
      const refKey = webhookData.reference_key || 'webhook_1';
      
      const subFields = [
        { name: 'body', type: 'object' as const, desc: '请求体' },
        { name: 'params', type: 'object' as const, desc: '查询参数' },
        { name: 'headers', type: 'object' as const, desc: '请求头' }
      ];

      subFields.forEach(field => {
        variables.push({
          nodeId: node.id,
          nodeLabel: data.label || 'Webhook',
          nodeType: 'webhook',
          variableName: field.name,
          variableType: field.type,
          fullPath: `${refKey}.${field.name}`
        });
      });
    } else if (node.type === 'timer') {
      const refKey = (data as any).reference_key || 'timer_1';
      variables.push({
        nodeId: node.id,
        nodeLabel: data.label || '定时触发',
        nodeType: 'timer',
        variableName: 'timestamp',
        variableType: 'number',
        fullPath: `${refKey}.timestamp`
      });
    } else if (node.type === 'api') {
      const nodeData = data as any;
      const refKey = nodeData.reference_key || `api_1`;
      
      const subFields = [
        { name: 'body', type: 'string' as const, desc: '响应正文' },
        { name: 'status_code', type: 'number' as const, desc: '状态码' },
        { name: 'headers', type: 'object' as const, desc: '响应头' }
      ];

      subFields.forEach(field => {
        variables.push({
          nodeId: node.id,
          nodeLabel: data.label || 'API调用',
          nodeType: 'api',
          variableName: field.name,
          variableType: field.type,
          fullPath: `${refKey}.${field.name}`
        });
      });
    } else if (node.type === 'agent') {
      const refKey = (data as any).reference_key || 'agent_1';
      variables.push({
        nodeId: node.id,
        nodeLabel: data.label || 'AI Agent',
        nodeType: 'agent',
        variableName: 'text',
        fullPath: `${refKey}.text`
      });
    } else if (node.type === 'llm') {
      const refKey = (data as any).reference_key || 'llm_1';
      variables.push({
        nodeId: node.id,
        nodeLabel: data.label || 'LLM调用',
        nodeType: 'llm',
        variableName: 'text',
        fullPath: `${refKey}.text`
      });
    } else if (node.type === 'tool') {
      const refKey = (data as any).reference_key || 'tool_1';
      variables.push({
        nodeId: node.id,
        nodeLabel: data.label || 'Tool工具',
        nodeType: 'tool',
        variableName: 'result',
        fullPath: `${refKey}.result`
      });
    } else if (node.type === 'classifier') {
      const refKey = (data as any).reference_key || 'classifier_1';
      variables.push(
        {
          nodeId: node.id,
          nodeLabel: data.label || '问题分类器',
          nodeType: 'classifier',
          variableName: 'category_id',
          fullPath: `${refKey}.category_id`
        },
        {
          nodeId: node.id,
          nodeLabel: data.label || '问题分类器',
          nodeType: 'classifier',
          variableName: 'category_name',
          fullPath: `${refKey}.category_name`
        }
      );
    }

    if (variables.length > 0) {
      result[node.id] = variables;
    }
  });

  return result;
}
