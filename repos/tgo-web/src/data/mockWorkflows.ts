/**
 * Mock Workflow Data
 * Sample workflows for development and testing
 */

import type { Workflow, WorkflowSummary } from '@/types/workflow';

/**
 * Sample customer service workflow
 */
export const customerServiceWorkflow: Workflow = {
  id: 'wf-001',
  name: '客户咨询处理流程',
  description: '自动处理客户咨询，根据问题类型分配给相应的AI员工或人工客服',
  status: 'active',
  version: 1,
  tags: ['客服', '自动化'],
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-20T14:30:00Z',
  definition: {
    nodes: [
      {
        id: 'node-input',
        type: 'input',
        position: { x: 250, y: 50 },
        data: {
          type: 'input',
          label: '用户输入',
          description: '客户发起咨询',
          input_variables: [{ name: 'query', type: 'string', description: '客户输入的消息内容' }],
          reference_key: 'input_1',
        },
      },
      {
        id: 'node-classify',
        type: 'llm',
        position: { x: 250, y: 150 },
        data: {
          type: 'llm',
          label: '问题分类',
          description: '使用LLM对客户问题进行分类',
          user_prompt: '请分析以下客户问题并分类：{{input_1.query}}。分类包括：技术支持、销售咨询、投诉建议、其他。',
          reference_key: 'classify_1',
        },
      },
      {
        id: 'node-condition',
        type: 'condition',
        position: { x: 250, y: 280 },
        data: {
          type: 'condition',
          label: '判断问题类型',
          condition_type: 'variable',
          variable: 'classify_1.text',
          operator: 'equals',
          compare_value: '技术支持',
          reference_key: 'condition_1',
        },
      },
      {
        id: 'node-tech-agent',
        type: 'agent',
        position: { x: 100, y: 400 },
        data: {
          type: 'agent',
          label: '技术支持Agent',
          agent_id: 'agent-tech-001',
          agent_name: '技术支持专员',
          reference_key: 'tech_agent_1',
        },
      },
      {
        id: 'node-sales-agent',
        type: 'agent',
        position: { x: 400, y: 400 },
        data: {
          type: 'agent',
          label: '销售咨询Agent',
          agent_id: 'agent-sales-001',
          agent_name: '销售顾问',
          reference_key: 'sales_agent_1',
        },
      },
      {
        id: 'node-answer',
        type: 'answer',
        position: { x: 250, y: 520 },
        data: {
          type: 'answer',
          label: '回复',
          output_type: 'variable',
          output_variable: 'tech_agent_1.text',
          reference_key: 'answer_1',
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-input',
        target: 'node-classify',
        type: 'smoothstep',
      },
      {
        id: 'edge-2',
        source: 'node-classify',
        target: 'node-condition',
        type: 'smoothstep',
      },
      {
        id: 'edge-3',
        source: 'node-condition',
        target: 'node-tech-agent',
        type: 'smoothstep',
        data: { label: 'true' },
      },
      {
        id: 'edge-4',
        source: 'node-condition',
        target: 'node-sales-agent',
        type: 'smoothstep',
        data: { label: 'false' },
      },
      {
        id: 'edge-5',
        source: 'node-tech-agent',
        target: 'node-answer',
        type: 'smoothstep',
      },
      {
        id: 'edge-6',
        source: 'node-sales-agent',
        target: 'node-answer',
        type: 'smoothstep',
      },
    ],
  }
};

/**
 * Sample data processing workflow
 */
export const dataProcessingWorkflow: Workflow = {
  id: 'wf-002',
  name: '数据分析流程',
  description: '并行执行多个数据分析任务，汇总结果后生成报告',
  status: 'active',
  version: 2,
  tags: ['数据分析', '报告'],
  created_at: '2024-01-10T09:00:00Z',
  updated_at: '2024-01-25T16:00:00Z',
  definition: {
    nodes: [
      {
        id: 'node-input',
        type: 'input',
        position: { x: 250, y: 50 },
        data: {
          type: 'input',
          label: '用户输入',
          input_variables: [{ name: 'query', type: 'string', description: '分析指令' }],
          reference_key: 'input_1',
        },
      },
      {
        id: 'node-parallel',
        type: 'parallel',
        position: { x: 250, y: 150 },
        data: {
          type: 'parallel',
          label: '并行分析',
          branches: 3,
          wait_for_all: true,
          reference_key: 'parallel_1',
        },
      },
      {
        id: 'node-tool-1',
        type: 'tool',
        position: { x: 50, y: 280 },
        data: {
          type: 'tool',
          label: '数据查询',
          tool_id: 'tool-db-query',
          tool_name: 'Database Query',
          reference_key: 'db_query_1',
        },
      },
      {
        id: 'node-tool-2',
        type: 'tool',
        position: { x: 250, y: 280 },
        data: {
          type: 'tool',
          label: 'API调用',
          tool_id: 'tool-api-call',
          tool_name: 'External API',
          reference_key: 'api_call_1',
        },
      },
      {
        id: 'node-tool-3',
        type: 'tool',
        position: { x: 450, y: 280 },
        data: {
          type: 'tool',
          label: '文件处理',
          tool_id: 'tool-file-process',
          tool_name: 'File Processor',
          reference_key: 'file_process_1',
        },
      },
      {
        id: 'node-llm-summary',
        type: 'llm',
        position: { x: 250, y: 400 },
        data: {
          type: 'llm',
          label: '汇总分析',
          user_prompt: '请根据以下数据生成 analysis 报告：\n指令：{{input_1.query}}\n查询结果：{{db_query_1.result}}\nAPI结果：{{api_call_1.result}}\n文件结果：{{file_process_1.result}}',
          reference_key: 'summary_1',
        },
      },
      {
        id: 'node-answer',
        type: 'answer',
        position: { x: 250, y: 520 },
        data: {
          type: 'answer',
          label: '回复',
          output_type: 'variable',
          output_variable: 'summary_1.text',
          reference_key: 'answer_1',
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-input',
        target: 'node-parallel',
        type: 'smoothstep',
      },
      {
        id: 'edge-2',
        source: 'node-parallel',
        target: 'node-tool-1',
        type: 'smoothstep',
      },
      {
        id: 'edge-3',
        source: 'node-parallel',
        target: 'node-tool-2',
        type: 'smoothstep',
      },
      {
        id: 'edge-4',
        source: 'node-parallel',
        target: 'node-tool-3',
        type: 'smoothstep',
      },
      {
        id: 'edge-5',
        source: 'node-tool-1',
        target: 'node-llm-summary',
        type: 'smoothstep',
      },
      {
        id: 'edge-6',
        source: 'node-tool-2',
        target: 'node-llm-summary',
        type: 'smoothstep',
      },
      {
        id: 'edge-7',
        source: 'node-tool-3',
        target: 'node-llm-summary',
        type: 'smoothstep',
      },
      {
        id: 'edge-8',
        source: 'node-llm-summary',
        target: 'node-answer',
        type: 'smoothstep',
      },
    ],
  }
};

/**
 * Simple greeting workflow (draft)
 */
export const simpleGreetingWorkflow: Workflow = {
  id: 'wf-003',
  name: '简单问候流程',
  description: '简单的自动问候回复流程',
  status: 'draft',
  version: 1,
  tags: ['简单', '问候'],
  created_at: '2024-01-28T11:00:00Z',
  updated_at: '2024-01-28T11:00:00Z',
  definition: {
    nodes: [
      {
        id: 'node-input',
        type: 'input',
        position: { x: 250, y: 50 },
        data: {
          type: 'input',
          label: '用户输入',
          input_variables: [{ name: 'query', type: 'string', description: '用户输入的消息内容' }],
          reference_key: 'input_1',
        },
      },
      {
        id: 'node-llm',
        type: 'llm',
        position: { x: 250, y: 150 },
        data: {
          type: 'llm',
          label: '生成问候',
          user_prompt: '请根据用户的问候语生成一个友好的回复：{{input_1.query}}',
          reference_key: 'llm_1',
        },
      },
      {
        id: 'node-answer',
        type: 'answer',
        position: { x: 250, y: 280 },
        data: {
          type: 'answer',
          label: '回复',
          output_type: 'variable',
          output_variable: 'llm_1.text',
          reference_key: 'answer_1',
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-input',
        target: 'node-llm',
        type: 'smoothstep',
      },
      {
        id: 'edge-2',
        source: 'node-llm',
        target: 'node-answer',
        type: 'smoothstep',
      },
    ],
  }
};

/**
 * All mock workflows
 */
export const mockWorkflows: Workflow[] = [
  customerServiceWorkflow,
  dataProcessingWorkflow,
  simpleGreetingWorkflow,
];

/**
 * Get workflow summaries from full workflows
 */
export function getWorkflowSummaries(): WorkflowSummary[] {
  return mockWorkflows.map(workflow => ({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    version: workflow.version,
    tags: workflow.tags,
    updated_at: workflow.updated_at,
  }));
}

/**
 * Get a workflow by ID
 */
export function getMockWorkflowById(id: string): Workflow | undefined {
  return mockWorkflows.find(wf => wf.id === id);
}

/**
 * Generate a new workflow ID
 */
export function generateWorkflowId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty workflow template
 */
export function createEmptyWorkflow(name: string = '新建工作流'): Workflow {
  const now = new Date().toISOString();
  return {
    id: generateWorkflowId(),
    name,
    description: '',
    status: 'draft',
    version: 1,
    tags: [],
    created_at: now,
    updated_at: now,
    definition: {
      nodes: [
        {
          id: 'node-input',
          type: 'input',
          position: { x: 250, y: 50 },
          data: {
            type: 'input',
            label: '用户输入',
            input_variables: [{ name: 'query', type: 'string', description: '用户输入的消息内容' }],
            reference_key: 'input_1',
          },
        },
        {
          id: 'node-answer',
          type: 'answer',
          position: { x: 250, y: 200 },
          data: {
            type: 'answer',
            label: '回复',
            output_type: 'template',
            output_template: '',
            reference_key: 'answer_1',
          },
        },
      ],
      edges: [
        {
          id: 'edge-input-answer',
          source: 'node-input',
          target: 'node-answer',
          type: 'smoothstep',
        },
      ],
    }
  };
}
