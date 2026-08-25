import type { Agent } from '@/types';

export const mockAgents: Agent[] = [
  {
    id: '1',
    name: '张三',
    description: '负责接收订单查询任务, 并分派给相关专家处理。这是一个协调者 Agent 的例子, 它的描述可能会比较长, 需要进行...',
    avatar: 'https://i.pravatar.cc/48?img=1',
    status: 'active',
    type: 'coordinator',
    role: '客服协调员',
    llmModel: 'gemini-1.5-pro',
    endpoint: 'http://127.0.0.1:8001/a2a',
    capabilities: ['订单查询', '任务分派', '客服协调'],
    lastActive: '2024-01-15 14:30',
    conversationCount: 156,
    successRate: 95.2,
    responseTime: '1.2s',
    tags: ['协调员', 'Coordinator', 'gemini-1.5-pro'],
    tools: ['1', '3'], // 关联了快递查询和数据库查询工具
    knowledgeBases: ['1', '2'] // 关联了产品知识库和支持知识库
  },
  {
    id: '2',
    name: '李四',
    description: '调用快递100 Tool服务查询实时快递状态。',
    avatar: 'https://i.pravatar.cc/48?img=2',
    status: 'inactive',
    type: 'expert',
    role: '快递查询专员',
    llmModel: 'gemini-1.5-flash',
    endpoint: 'http://127.0.0.1:8002/a2a',
    capabilities: ['快递查询', '物流跟踪', 'Tool服务'],
    lastActive: '2024-01-15 12:15',
    conversationCount: 89,
    successRate: 98.7,
    responseTime: '0.8s',
    tags: ['快递专员', 'Expert', 'gemini-1.5-flash'],
    tools: ['1'], // 关联了快递查询工具
    knowledgeBases: ['3'] // 关联了物流知识库
  },
  {
    id: '3',
    name: '王五',
    description: '根据用户数据生成画像报告 (Tool连接失败)。',
    avatar: 'https://i.pravatar.cc/48?img=3',
    status: 'error',
    type: 'expert',
    role: '用户画像分析师',
    llmModel: 'gemini-1.0-pro',
    endpoint: '-',
    capabilities: ['用户画像', '数据分析', '行为分析'],
    lastActive: '2024-01-15 15:45',
    conversationCount: 234,
    successRate: 92.8,
    responseTime: '2.1s',
    tags: ['分析师', 'Analyst', 'claude-3-sonnet'],
    tools: ['2'], // 关联了数据分析工具
    knowledgeBases: [] // 暂无关联知识库
  },
  {
    id: '4',
    name: '赵六',
    description: '处理售后服务请求，包括退换货、维修等问题。',
    avatar: 'https://i.pravatar.cc/48?img=4',
    status: 'active',
    type: 'expert',
    role: '售后服务专员',
    llmModel: 'gpt-4-turbo',
    endpoint: 'http://127.0.0.1:8004/a2a',
    capabilities: ['售后服务', '退换货', '维修咨询'],
    lastActive: '2024-01-15 11:20',
    conversationCount: 67,
    successRate: 88.5,
    responseTime: '1.8s',
    tags: ['售后专员', 'Support', 'gpt-4-turbo'],
    tools: ['4'], // 关联了客服工具
    knowledgeBases: ['2'] // 关联了支持知识库
  },
  {
    id: '5',
    name: '孙七',
    description: '专门处理技术支持问题，解答产品使用相关疑问。',
    avatar: 'https://i.pravatar.cc/48?img=5',
    status: 'active',
    type: 'expert',
    role: '技术支持专员',
    llmModel: 'gemini-1.5-pro',
    endpoint: 'http://127.0.0.1:8005/a2a',
    capabilities: ['技术支持', '产品咨询', '故障排除'],
    lastActive: '2024-01-15 16:10',
    conversationCount: 145,
    successRate: 94.1,
    responseTime: '1.5s',
    tags: ['技术专员', 'Technical', 'gemini-1.5-pro'],
    tools: ['3'], // 关联了数据库查询工具
    knowledgeBases: ['1', '2'] // 关联了产品和支持知识库
  },
  {
    id: '6',
    name: '周八',
    description: '负责销售咨询和产品推荐，提供专业的购买建议。',
    avatar: 'https://i.pravatar.cc/48?img=6',
    status: 'inactive',
    type: 'expert',
    role: '销售咨询专员',
    llmModel: 'claude-3-haiku',
    endpoint: 'http://127.0.0.1:8006/a2a',
    capabilities: ['销售咨询', '产品推荐', '价格咨询'],
    lastActive: '2024-01-15 09:30',
    conversationCount: 78,
    successRate: 91.3,
    responseTime: '1.1s',
    tags: ['销售专员', 'Sales', 'claude-3-haiku'],
    tools: [], // 暂无关联工具
    knowledgeBases: ['1'] // 关联了产品知识库
  },
  // Test entries for default avatar generation
  {
    id: '7',
    name: 'Alice',
    description: '英文客服专员，负责处理国际客户的咨询和支持。',
    avatar: '', // Empty avatar - should show "A" with red gradient
    status: 'active',
    type: 'expert',
    role: '国际客服',
    llmModel: 'gpt-4',
    endpoint: 'http://127.0.0.1:8007/a2a',
    capabilities: ['英文客服', '国际支持', '跨文化沟通'],
    lastActive: '2024-01-15 16:45',
    conversationCount: 234,
    successRate: 98.1,
    responseTime: '0.8s',
    tags: ['英文', 'International', 'gpt-4'],
    tools: ['1', '4'], // 关联了快递查询和翻译工具
    knowledgeBases: ['1', '3'] // 关联了产品知识库和培训知识库
  },
  {
    id: '8',
    name: 'Bob',
    description: '技术支持专员，专门处理产品技术问题和故障排除。',
    avatar: 'placeholder.jpg', // Invalid avatar - should show "B" with orange gradient
    status: 'inactive',
    type: 'expert',
    role: '技术支持',
    llmModel: 'claude-3-haiku',
    endpoint: 'http://127.0.0.1:8008/a2a',
    capabilities: ['技术支持', '故障排除', '产品指导'],
    lastActive: '2024-01-15 10:30',
    conversationCount: 167,
    successRate: 94.5,
    responseTime: '1.5s',
    tags: ['技术', 'Technical', 'claude-3-haiku'],
    tools: ['2', '3'], // 关联了支付系统和数据库查询工具
    knowledgeBases: ['1', '2'] // 关联了产品知识库和支持知识库
  },
  {
    id: '9',
    name: '陈七',
    description: '销售顾问，负责产品推荐和销售咨询服务。',
    avatar: '', // Empty avatar - should show "陈" with appropriate color
    status: 'active',
    type: 'expert',
    role: '销售顾问',
    llmModel: 'gemini-1.5-flash',
    endpoint: 'http://127.0.0.1:8009/a2a',
    capabilities: ['产品推荐', '销售咨询', '客户关系'],
    lastActive: '2024-01-15 15:20',
    conversationCount: 298,
    successRate: 97.3,
    responseTime: '1.0s',
    tags: ['销售', 'Sales', 'gemini-1.5-flash'],
    tools: ['1', '2'], // 关联了快递查询和支付系统工具
    knowledgeBases: ['1', '3'] // 关联了产品知识库和培训知识库
  }
];
