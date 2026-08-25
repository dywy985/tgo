import type { KnowledgeBaseItem } from '@/types';

export const mockKnowledgeBases: KnowledgeBaseItem[] = [
  {
    id: '1',
    title: '产品知识库',
    content: '包含所有产品型号、参数、价格和常见问题，持续更新中，用于解答售前咨询。',
    category: 'product',
    tags: ['产品', '官方', '核心'],
    author: '产品团队',
    createdAt: '2023-03-01',
    updatedAt: '2023-03-18',
    views: 156,
    status: 'published'
  },
  {
    id: '2',
    title: '技术支持文档',
    content: '详细的产品技术规格、故障排除步骤和解决方案，面向内部技术支持团队。',
    category: 'support',
    tags: ['技术', '故障排除'],
    author: '技术团队',
    createdAt: '2023-02-15',
    updatedAt: '2023-03-12',
    views: 212,
    status: 'draft'
  },
  {
    id: '3',
    title: '培训材料',
    content: '内部员工培训文档和学习资料，仅限 HR 和培训部门访问。',
    category: 'training',
    tags: ['培训', '内部'],
    author: 'HR团队',
    createdAt: '2023-02-20',
    updatedAt: '2023-03-10',
    views: 45,
    status: 'archived'
  }
];
