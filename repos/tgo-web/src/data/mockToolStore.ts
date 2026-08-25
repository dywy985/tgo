import type { ToolStoreItem, ToolStoreCategory } from '@/types';

/**
 * Tool Store Categories
 */
export const TOOL_STORE_CATEGORIES: ToolStoreCategory[] = [
  { id: 'all', slug: 'all', name_zh: '全部', name_en: 'All', icon: 'Grid3X3', label: '全部' },
  { id: 'model', slug: 'model', name_zh: '模型', name_en: 'Models', icon: 'Brain', label: '模型' },
  { id: 'tool', slug: 'tool', name_zh: '工具', name_en: 'Tools', icon: 'Wrench', label: '工具' },
  { id: 'agent', slug: 'agent', name_zh: 'Agent 策略', name_en: 'Agent Strategies', icon: 'Bot', label: 'Agent 策略' },
  { id: 'extension', slug: 'extension', name_zh: '扩展', name_en: 'Extensions', icon: 'Puzzle', label: '扩展' },
  { id: 'plugin', slug: 'plugin', name_zh: '插件库', name_en: 'Plugins', icon: 'Package', label: '插件库' },
];

/**
 * Mock Tool Store Items
 */
export const mockToolStoreItems: ToolStoreItem[] = [
  {
    id: 'mcp-sse-streamable-http',
    name: 'Tool SSE / StreamableHTTP',
    description: '通过 HTTP with SSE 或 Streamable HTTP 传输方式使用 Tool 协议来连接和管理工具。',
    author: 'langgenius',
    authorHandle: 'mcp_sse',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['HTTP', 'SSE', 'Streamable', 'Tool'],
    downloads: 71652,
    rating: 4.8,
    ratingCount: 234,
    version: '1.2.0',
    lastUpdated: '2024-01-15',
    featured: true,
    verified: true,
    icon: '🔗',
    screenshots: [],
    longDescription: `# Tool SSE / StreamableHTTP

这是一个强大的 **工具**，支持通过 HTTP with SSE 或 Streamable HTTP 传输方式来连接和管理各种工具和服务。

## 主要特性

- **高性能连接**: 支持 Server-Sent Events (SSE) 实时通信
- **流式传输**: 优化的 Streamable HTTP 协议支持
- **自动重连**: 内置连接断线重连机制
- **错误处理**: 完善的错误处理和日志记录

## 使用场景

1. **实时数据同步**: 适用于需要实时数据更新的应用场景
2. **长连接通信**: 支持长时间保持连接的服务
3. **流式数据处理**: 处理大量数据流的场景

> **注意**: 使用前请确保服务器支持 SSE 或 Streamable HTTP 协议。

更多信息请访问 [官方文档](https://example.com/docs)。`,
    requirements: ['Node.js >= 16', 'HTTP Server'],
    changelog: '修复了连接稳定性问题，增加了错误重试机制。',
    methods: [
      {
        id: 'connect',
        name: 'connect',
        description: '建立与 Tool 服务器的连接',
        parameters: [
          {
            name: 'url',
            type: 'string',
            required: true,
            description: 'Tool 服务器的 URL 地址',
            example: 'http://localhost:3000/mcp'
          },
          {
            name: 'options',
            type: 'object',
            required: false,
            description: '连接选项配置',
            example: '{ timeout: 5000, retries: 3 }'
          }
        ],
        returnType: 'Promise<Connection>',
        example: 'await mcp.connect("http://localhost:3000/mcp", { timeout: 5000 })'
      },
      {
        id: 'send',
        name: 'send',
        description: '向 Tool 服务器发送消息',
        parameters: [
          {
            name: 'message',
            type: 'object',
            required: true,
            description: '要发送的消息对象',
            example: '{ type: "request", method: "tools/list" }'
          }
        ],
        returnType: 'Promise<Response>',
        example: 'await mcp.send({ type: "request", method: "tools/list" })'
      },
      {
        id: 'disconnect',
        name: 'disconnect',
        description: '断开与 Tool 服务器的连接',
        parameters: [],
        returnType: 'Promise<void>',
        example: 'await mcp.disconnect()'
      }
    ]
  },
  {
    id: 'tavily-search',
    name: 'Tavily',
    description: '一个强大的搜索AI搜索引擎，为AI代理提供实时网络搜索功能，提供准确和相关的搜索结果。',
    author: 'langgenius',
    authorHandle: 'tavily',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['Search', 'AI', 'Web', 'Real-time'],
    downloads: 69261,
    rating: 4.9,
    ratingCount: 189,
    version: '2.1.0',
    lastUpdated: '2024-01-12',
    featured: true,
    verified: true,
    icon: '🔍',
    screenshots: [],
    longDescription: `# Tavily AI 搜索引擎

**Tavily** 是专为 AI 代理设计的搜索引擎，提供实时、准确的网络搜索结果。

## 核心优势

- **AI 优化**: 专门为 AI 代理和自动化系统设计
- **实时搜索**: 提供最新的网络信息和数据
- **高准确性**: 智能过滤和排序搜索结果
- **快速响应**: 平均响应时间 < 200ms

## 支持的搜索类型

1. **网页搜索**: 全网内容搜索
2. **新闻搜索**: 实时新闻和资讯
3. **学术搜索**: 学术论文和研究资料

### API 特性

- RESTful API 接口
- JSON 格式返回
- 支持批量查询
- 内置缓存机制

*适用于各种 AI 应用场景，提供可靠的信息检索服务。*`,
    requirements: ['API Key', 'Internet Connection'],
    changelog: '增加了搜索结果过滤功能，提升了搜索准确性。',
    methods: [
      {
        id: 'search',
        name: 'search',
        description: '执行网络搜索查询',
        parameters: [
          {
            name: 'query',
            type: 'string',
            required: true,
            description: '搜索查询字符串',
            example: 'AI 人工智能最新发展'
          },
          {
            name: 'maxResults',
            type: 'number',
            required: false,
            description: '最大返回结果数量',
            example: '10'
          }
        ],
        returnType: 'Promise<SearchResult[]>',
        example: 'await tavily.search("AI 人工智能最新发展", 10)'
      },
      {
        id: 'searchNews',
        name: 'searchNews',
        description: '搜索最新新闻',
        parameters: [
          {
            name: 'query',
            type: 'string',
            required: true,
            description: '新闻搜索查询',
            example: '科技新闻'
          }
        ],
        returnType: 'Promise<NewsResult[]>',
        example: 'await tavily.searchNews("科技新闻")'
      }
    ]
  },
  {
    id: 'json-processor',
    name: 'JSON 处理',
    description: '利用 jsonpath_ng 处理 JSON 内容的工具',
    author: 'langgenius',
    authorHandle: 'json_process',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['JSON', 'Processing', 'Data'],
    downloads: 65407,
    rating: 4.7,
    ratingCount: 156,
    version: '1.5.2',
    lastUpdated: '2024-01-10',
    featured: false,
    verified: true,
    icon: '📄',
    screenshots: [],
    longDescription: '强大的 JSON 处理工具，支持复杂的 JSON 路径查询和数据转换。',
    requirements: ['Python >= 3.8'],
    changelog: '优化了大文件处理性能，修复了路径解析bug。'
  },
  {
    id: 'markdown-exporter',
    name: 'Markdown 导出器',
    description: '导出 Markdown 为 DOCX, PPTX, XLSX, PDF, PNG, HTML, MD, CSV, JSON, JSONL, XML等格式',
    author: 'bowenliang123',
    authorHandle: 'md_exporter',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['Markdown', 'Export', 'Document'],
    downloads: 62648,
    rating: 4.6,
    ratingCount: 203,
    version: '3.0.1',
    lastUpdated: '2024-01-08',
    featured: false,
    verified: true,
    icon: '📝',
    screenshots: [],
    longDescription: '全能的 Markdown 导出工具，支持多种格式输出，满足各种文档需求。',
    requirements: ['Pandoc', 'LibreOffice'],
    changelog: '新增 XML 格式支持，优化了 PDF 导出质量。'
  },
  {
    id: 'google-search',
    name: 'Google',
    description: '一个用于获取 Google SERP 搜索结果的AI代理工具，为AI提供实时的网络搜索能力。',
    author: 'langgenius',
    authorHandle: 'google',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['Google', 'Search', 'SERP'],
    downloads: 53954,
    rating: 4.5,
    ratingCount: 178,
    version: '1.8.0',
    lastUpdated: '2024-01-05',
    featured: false,
    verified: true,
    icon: '🔍',
    screenshots: [],
    longDescription: '集成 Google 搜索功能的 AI 代理工具，提供准确的搜索结果。',
    requirements: ['Google API Key'],
    changelog: '增加了搜索结果缓存，提升了响应速度。'
  },
  {
    id: 'firecrawl-api',
    name: 'Firecrawl',
    description: 'Firecrawl API 集成，用于网页内容抓取和数据提取。',
    author: 'langgenius',
    authorHandle: 'firecrawl',
    category: 'tool',
    categories: [TOOL_STORE_CATEGORIES[2]], // 工具
    tags: ['Web Scraping', 'API', 'Data'],
    downloads: 39930,
    rating: 4.4,
    ratingCount: 145,
    version: '2.3.0',
    lastUpdated: '2024-01-03',
    featured: false,
    verified: true,
    icon: '🔥',
    screenshots: [],
    longDescription: '强大的网页抓取工具，支持动态内容提取和数据清洗。',
    requirements: ['Firecrawl API Key'],
    changelog: '支持更多网站类型，增加了反爬虫检测。'
  }
];

/**
 * Get featured tools
 */
export const getFeaturedTools = (): ToolStoreItem[] => {
  return mockToolStoreItems.filter(item => item.featured);
};

/**
 * Get tools by category
 */
export const getToolsByCategory = (categoryId: string): ToolStoreItem[] => {
  if (categoryId === 'all') {
    return mockToolStoreItems;
  }
  return mockToolStoreItems.filter(item => item.category === categoryId);
};

/**
 * Search tools
 */
export const searchTools = (query: string, categoryId?: string): ToolStoreItem[] => {
  let tools = categoryId && categoryId !== 'all' 
    ? getToolsByCategory(categoryId) 
    : mockToolStoreItems;

  if (!query.trim()) {
    return tools;
  }

  const searchTerm = query.toLowerCase().trim();
  return tools.filter(tool =>
    (tool.name?.toLowerCase().includes(searchTerm)) ||
    (tool.description?.toLowerCase().includes(searchTerm)) ||
    (tool.author?.toLowerCase().includes(searchTerm)) ||
    (tool.tags?.some(tag => tag.toLowerCase().includes(searchTerm)))
  );
};
