import type { AiTool, ToolCategory } from '@/types';

export const mockAiTools: AiTool[] = [
  {
    id: '1',
    name: '快递100查询',
    description: '实时查询快递物流信息，支持主流快递公司',
    category: 'integration',
    status: 'active',
    version: 'v1.2.0',
    author: '快递100',
    lastUpdated: '2024-01-15',
    usageCount: 1250,
    rating: 4.8,
    tags: ['物流', '快递', 'API'],
    capabilities: ['实时查询', '多快递公司支持', '状态跟踪', '异常提醒'],
    successRate: 98,
    avgResponseTime: '120ms',
    config: {
      apiKey: 'required',
      timeout: 5000,
      retryCount: 3
    }
  },
  {
    id: '2',
    name: '用户画像分析',
    description: '基于用户行为数据生成详细的用户画像报告',
    category: 'data',
    status: 'error',
    version: 'v2.1.3',
    author: '数据团队',
    lastUpdated: '2024-01-12',
    usageCount: 890,
    rating: 4.5,
    tags: ['数据分析', '用户画像', 'AI'],
    capabilities: ['行为分析', '标签生成', '趋势预测', '报告导出'],
    successRate: 85,
    avgResponseTime: '2.5s',
    config: {
      dataSource: 'required',
      analysisDepth: 'deep',
      outputFormat: 'json'
    }
  },
  {
    id: '3',
    name: '智能客服助手',
    description: '提供智能对话和自动回复功能',
    category: 'ai',
    status: 'active',
    version: 'v3.0.1',
    author: 'AI团队',
    lastUpdated: '2024-01-14',
    usageCount: 2100,
    rating: 4.9,
    tags: ['AI', '对话', '自动回复'],
    capabilities: ['智能对话', '情感识别', '多轮对话', '知识库集成'],
    successRate: 96,
    avgResponseTime: '800ms',
    config: {
      model: 'gpt-3.5-turbo',
      maxTokens: 2048,
      temperature: 0.7
    }
  },
  {
    id: '4',
    name: '邮件发送服务',
    description: '批量发送邮件和邮件模板管理',
    category: 'communication',
    status: 'active',
    version: 'v1.5.2',
    author: '通信团队',
    lastUpdated: '2024-01-13',
    usageCount: 567,
    rating: 4.3,
    tags: ['邮件', '通信', '模板'],
    capabilities: ['批量发送', '模板管理', '发送统计', '退信处理'],
    successRate: 94,
    avgResponseTime: '1.2s',
    config: {
      smtpServer: 'required',
      maxBatchSize: 100,
      retryAttempts: 3
    }
  },
  {
    id: '5',
    name: '文档生成器',
    description: '自动生成各类业务文档和报告',
    category: 'productivity',
    status: 'updating',
    version: 'v2.3.0',
    author: '办公团队',
    lastUpdated: '2024-01-10',
    usageCount: 345,
    rating: 4.2,
    tags: ['文档', '报告', '自动化'],
    capabilities: ['模板生成', '数据填充', '格式转换', '批量处理'],
    successRate: 92,
    avgResponseTime: '3.1s',
    config: {
      templatePath: 'required',
      outputFormat: ['pdf', 'docx', 'html'],
      maxFileSize: '10MB'
    }
  },
  {
    id: '6',
    name: '支付接口',
    description: '集成多种支付方式的统一接口',
    category: 'integration',
    status: 'active',
    version: 'v4.1.0',
    author: '支付团队',
    lastUpdated: '2024-01-15',
    usageCount: 1890,
    rating: 4.7,
    tags: ['支付', '接口', '集成'],
    capabilities: ['多支付方式', '安全加密', '交易记录', '退款处理'],
    successRate: 99,
    avgResponseTime: '450ms',
    config: {
      merchantId: 'required',
      secretKey: 'required',
      callbackUrl: 'required',
      timeout: 30000
    }
  }
];

// 工具分类
export const TOOL_CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'productivity', label: '效率工具' },
  { id: 'communication', label: '通信工具' },
  { id: 'data', label: '数据分析' },
  { id: 'ai', label: 'AI工具' },
  { id: 'integration', label: '集成服务' }
];
