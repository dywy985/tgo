import React, { useState } from 'react';
import ChatMessage from '@/components/chat/ChatMessage';
import type { Message } from '@/types';
import { markdownExamples } from '@/utils/markdownTest';

/**
 * Markdown 渲染测试页面
 * 用于验证和测试 Markdown 渲染功能
 */
const MarkdownTestPage: React.FC = () => {
  const [selectedExample, setSelectedExample] = useState<string>('aiResponse');

  // 创建测试消息
  const createTestMessage = (
    id: string,
    content: string,
    type: 'visitor' | 'staff',
    hasStreamData: boolean
  ): Message => {
    return {
      id,
      content,
      timestamp: new Date().toISOString(),
      type,
      fromInfo: {
        name: type === 'visitor' ? '测试访客' : 'AI 助手',
        avatar: type === 'visitor'
          ? 'https://i.pravatar.cc/32?img=1'
          : 'https://i.pravatar.cc/32?img=2',
        channel_id: type === 'visitor' ? 'test-visitor' : 'test-staff',
        channel_type: 1
      },
      platform: 'wechat',
      payloadType: 1,
      status: 'delivered',
      isRead: false,
      metadata: {
        has_stream_data: hasStreamData
      }
    };
  };

  // 测试消息列表
  const testMessages: Array<{ title: string; message: Message }> = [
    {
      title: '访客消息 - 带 Markdown（stream_data）',
      message: createTestMessage(
        '1',
        markdownExamples[selectedExample as keyof typeof markdownExamples],
        'visitor',
        true
      )
    },
    {
      title: '访客消息 - 纯文本（无 stream_data）',
      message: createTestMessage(
        '2',
        '这是一条普通的文本消息，不应该渲染 Markdown。**这不应该是粗体**',
        'visitor',
        false
      )
    },
    {
      title: 'AI 助手消息 - 带 Markdown（stream_data）',
      message: createTestMessage(
        '3',
        markdownExamples[selectedExample as keyof typeof markdownExamples],
        'staff',
        true
      )
    },
    {
      title: 'AI 助手消息 - 纯文本（无 stream_data）',
      message: createTestMessage(
        '4',
        '这是一条普通的 AI 回复，不应该渲染 Markdown。**这不应该是粗体**',
        'staff',
        false
      )
    }
  ];

  const exampleOptions = [
    { value: 'basic', label: '基本格式' },
    { value: 'lists', label: '列表' },
    { value: 'code', label: '代码块' },
    { value: 'links', label: '链接和图片' },
    { value: 'blockquote', label: '引用' },
    { value: 'table', label: '表格' },
    { value: 'mixed', label: '混合格式' },
    { value: 'aiResponse', label: 'AI 回复示例' }
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Markdown 渲染功能测试
          </h1>
          <p className="text-gray-600">
            验证 stream_data 字段的 Markdown 渲染功能是否正常工作
          </p>
        </div>

        {/* 控制面板 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            选择测试示例
          </h2>
          <div className="flex flex-wrap gap-2">
            {exampleOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setSelectedExample(option.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedExample === option.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 测试说明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            📋 测试说明
          </h3>
          <ul className="space-y-2 text-blue-800">
            <li>✅ 带 <code className="bg-blue-100 px-2 py-0.5 rounded">stream_data</code> 的消息应该渲染 Markdown 格式</li>
            <li>✅ 不带 <code className="bg-blue-100 px-2 py-0.5 rounded">stream_data</code> 的消息应该显示纯文本</li>
            <li>✅ 访客消息使用白色背景，深色文本</li>
            <li>✅ AI 助手消息使用蓝色背景，白色文本</li>
            <li>✅ 代码块应该有语言标签和灰色背景</li>
            <li>✅ 链接应该在新窗口打开</li>
          </ul>
        </div>

        {/* 测试消息显示 */}
        <div className="space-y-6">
          {testMessages.map(({ title, message }, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    message.metadata?.has_stream_data
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {message.metadata?.has_stream_data ? 'Markdown 渲染' : '纯文本'}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    message.type === 'visitor'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {message.type === 'visitor' ? '访客' : 'AI 助手'}
                  </span>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-lg">
                <ChatMessage message={message} />
              </div>
            </div>
          ))}
        </div>

        {/* 控制台测试命令 */}
        <div className="bg-gray-900 text-gray-100 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold mb-3">
            🧪 控制台测试命令
          </h3>
          <div className="space-y-2 font-mono text-sm">
            <div className="bg-gray-800 p-3 rounded">
              <span className="text-green-400">// 运行所有测试</span>
              <br />
              <span className="text-yellow-300">runAllMarkdownTests()</span>
            </div>
            <div className="bg-gray-800 p-3 rounded">
              <span className="text-green-400">// 检查 Markdown 元素</span>
              <br />
              <span className="text-yellow-300">testMarkdownRendering()</span>
            </div>
            <div className="bg-gray-800 p-3 rounded">
              <span className="text-green-400">// 查看示例内容</span>
              <br />
              <span className="text-yellow-300">console.log(markdownExamples.aiResponse)</span>
            </div>
            <div className="bg-gray-800 p-3 rounded">
              <span className="text-green-400">// 检查依赖</span>
              <br />
              <span className="text-yellow-300">checkMarkdownDependencies()</span>
            </div>
          </div>
        </div>

        {/* 原始内容预览 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📝 当前示例的原始 Markdown 内容
          </h3>
          <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
            <code className="text-gray-800">
              {markdownExamples[selectedExample as keyof typeof markdownExamples]}
            </code>
          </pre>
        </div>

        {/* 检查清单 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            ✓ 功能检查清单
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">Markdown 元素</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>□ 标题（H1-H6）</li>
                <li>□ 粗体和斜体</li>
                <li>□ 列表（有序/无序）</li>
                <li>□ 代码块和行内代码</li>
                <li>□ 链接和图片</li>
                <li>□ 表格</li>
                <li>□ 引用</li>
                <li>□ 分隔线</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">样式和功能</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>□ 访客消息样式正确</li>
                <li>□ AI 消息样式正确（白色文本）</li>
                <li>□ 代码块有语言标签</li>
                <li>□ 链接新窗口打开</li>
                <li>□ 纯文本消息不渲染 Markdown</li>
                <li>□ 图片懒加载</li>
                <li>□ 响应式布局</li>
                <li>□ 无控制台错误</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkdownTestPage;

