/**
 * AI 流式消息测试工具
 * 用于测试和验证流式消息增量更新功能
 */

import { useChatStore } from '../stores/chatStore';

/**
 * 模拟流式消息事件
 */
export const simulateStreamMessage = (clientMsgNo: string, content: string): void => {
  console.log('🧪 Test: Simulating stream message', {
    clientMsgNo,
    contentLength: content.length,
    contentPreview: content.substring(0, 50)
  });
  
  // 直接调用 chat store 的方法
  const store = useChatStore.getState();
  store.appendStreamMessageContent(clientMsgNo, content);
};

/**
 * 模拟完整的 AI 流式回复
 */
export const simulateAIStreamResponse = async (
  clientMsgNo: string,
  fullResponse: string,
  chunkSize: number = 10,
  delayMs: number = 100
): Promise<void> => {
  console.log('🧪 Test: Starting AI stream simulation', {
    clientMsgNo,
    fullResponseLength: fullResponse.length,
    chunkSize,
    delayMs,
    estimatedDuration: (fullResponse.length / chunkSize) * delayMs
  });
  
  const store = useChatStore.getState();
  let sentLength = 0;
  
  while (sentLength < fullResponse.length) {
    const chunk = fullResponse.substring(sentLength, sentLength + chunkSize);
    
    console.log('🧪 Test: Sending chunk', {
      chunkNumber: Math.floor(sentLength / chunkSize) + 1,
      chunkLength: chunk.length,
      sentLength,
      totalLength: fullResponse.length,
      progress: `${Math.round((sentLength / fullResponse.length) * 100)}%`
    });
    
    store.appendStreamMessageContent(clientMsgNo, chunk);
    sentLength += chunk.length;
    
    // Wait before sending next chunk
    if (sentLength < fullResponse.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.log('🧪 Test: AI stream simulation completed', {
    clientMsgNo,
    totalSent: sentLength
  });
};

/**
 * 测试示例：Markdown 格式的 AI 回复
 */
export const testMarkdownStreamResponse = async (clientMsgNo: string): Promise<void> => {
  const markdownResponse = `# 解决方案

根据您的问题，我为您准备了以下解决方案：

## 1. 检查配置

首先，请确保您的配置文件正确设置：

\`\`\`javascript
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3
};
\`\`\`

## 2. 验证连接

使用以下命令验证网络连接：

\`\`\`bash
ping api.example.com
curl -I https://api.example.com/health
\`\`\`

## 3. 查看日志

检查应用日志以获取更多信息：

- **错误日志**: \`/var/log/app/error.log\`
- **访问日志**: \`/var/log/app/access.log\`

## 4. 常见问题

| 问题 | 解决方案 |
|------|---------|
| 连接超时 | 增加 timeout 配置 |
| 认证失败 | 检查 API 密钥 |
| 限流错误 | 实现重试机制 |

希望这些信息能帮到您！如有其他问题，请随时告诉我。`;

  await simulateAIStreamResponse(clientMsgNo, markdownResponse, 15, 50);
};

/**
 * 检查消息是否存在
 */
export const checkMessageExists = (clientMsgNo: string): boolean => {
  const store = useChatStore.getState();
  const message = store.messages.find(
    msg => msg.metadata?.wukongim?.client_msg_no === clientMsgNo
  );
  
  const exists = !!message;
  console.log('🧪 Test: Check message exists', {
    clientMsgNo,
    exists,
    messageId: message?.id,
    contentLength: message?.content.length,
    contentPreview: message?.content.substring(0, 50)
  });
  
  return exists;
};

/**
 * 获取消息内容
 */
export const getMessageContent = (clientMsgNo: string): string | null => {
  const store = useChatStore.getState();
  const message = store.messages.find(
    msg => msg.metadata?.wukongim?.client_msg_no === clientMsgNo
  );
  
  if (!message) {
    console.warn('🧪 Test: Message not found', { clientMsgNo });
    return null;
  }
  
  console.log('🧪 Test: Get message content', {
    clientMsgNo,
    messageId: message.id,
    contentLength: message.content.length,
    hasStreamData: message.metadata?.has_stream_data,
    isStreaming: message.metadata?.is_streaming
  });
  
  return message.content;
};

/**
 * 列出所有消息
 */
export const listAllMessages = (): void => {
  const store = useChatStore.getState();
  
  console.log('🧪 Test: All messages', {
    totalCount: store.messages.length,
    messages: store.messages.map(msg => ({
      id: msg.id,
      client_msg_no: msg.metadata?.wukongim?.client_msg_no,
      type: msg.type,
      contentLength: msg.content.length,
      contentPreview: msg.content.substring(0, 30),
      hasStreamData: msg.metadata?.has_stream_data,
      isStreaming: msg.metadata?.is_streaming
    }))
  });
};

/**
 * 测试流式消息处理器是否已注册
 */
export const testStreamHandlerRegistration = (): void => {
  console.log('🧪 Test: Checking stream handler registration');
  
  // 尝试发送一个测试事件
  const testClientMsgNo = 'test-' + Date.now();
  const testContent = 'Test content';
  
  console.log('🧪 Test: Sending test stream message', {
    clientMsgNo: testClientMsgNo,
    content: testContent
  });
  
  // 模拟流式消息
  simulateStreamMessage(testClientMsgNo, testContent);
  
  // 检查是否被处理
  setTimeout(() => {
    const exists = checkMessageExists(testClientMsgNo);
    if (exists) {
      console.log('✅ Test: Stream handler is working correctly');
    } else {
      console.warn('⚠️ Test: Stream handler may not be registered or message not found');
    }
  }, 100);
};

/**
 * 运行完整的流式消息测试套件
 */
export const runStreamMessageTests = async (): Promise<void> => {
  console.log('🧪 ========================================');
  console.log('🧪 AI 流式消息测试套件');
  console.log('🧪 ========================================');
  console.log('');
  
  // 测试 1: 列出当前消息
  console.log('📋 测试 1: 列出当前消息');
  listAllMessages();
  console.log('');
  
  // 测试 2: 检查流式处理器注册
  console.log('📋 测试 2: 检查流式处理器注册');
  testStreamHandlerRegistration();
  console.log('');
  
  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 测试 3: 查找一个现有消息进行测试
  const store = useChatStore.getState();
  const testMessage = store.messages.find(msg => 
    msg.metadata?.wukongim?.client_msg_no
  );
  
  if (testMessage) {
    const clientMsgNo = testMessage.metadata!.wukongim!.client_msg_no;
    
    console.log('📋 测试 3: 追加内容到现有消息');
    console.log('   使用消息:', {
      id: testMessage.id,
      client_msg_no: clientMsgNo,
      originalContent: testMessage.content.substring(0, 50)
    });
    
    // 追加一些测试内容
    simulateStreamMessage(clientMsgNo, '\n\n[测试追加内容]');
    
    // 检查结果
    setTimeout(() => {
      const updatedContent = getMessageContent(clientMsgNo);
      console.log('   更新后的内容:', updatedContent?.substring(0, 100));
    }, 100);
  } else {
    console.log('📋 测试 3: 跳过（没有找到可用的测试消息）');
  }
  
  console.log('');
  console.log('🧪 ========================================');
  console.log('🧪 测试完成');
  console.log('🧪 ========================================');
};

/**
 * 显示使用帮助
 */
export const showStreamTestHelp = (): void => {
  console.log('🧪 ========================================');
  console.log('🧪 AI 流式消息测试工具');
  console.log('🧪 ========================================');
  console.log('');
  console.log('可用命令:');
  console.log('');
  console.log('1. runStreamMessageTests()');
  console.log('   运行完整的测试套件');
  console.log('');
  console.log('2. listAllMessages()');
  console.log('   列出所有消息');
  console.log('');
  console.log('3. simulateStreamMessage(clientMsgNo, content)');
  console.log('   模拟单个流式消息片段');
  console.log('   示例: simulateStreamMessage("msg-123", "Hello ")');
  console.log('');
  console.log('4. simulateAIStreamResponse(clientMsgNo, fullResponse, chunkSize, delayMs)');
  console.log('   模拟完整的 AI 流式回复');
  console.log('   示例: simulateAIStreamResponse("msg-123", "完整回复内容", 10, 100)');
  console.log('');
  console.log('5. testMarkdownStreamResponse(clientMsgNo)');
  console.log('   测试 Markdown 格式的流式回复');
  console.log('   示例: testMarkdownStreamResponse("msg-123")');
  console.log('');
  console.log('6. checkMessageExists(clientMsgNo)');
  console.log('   检查消息是否存在');
  console.log('');
  console.log('7. getMessageContent(clientMsgNo)');
  console.log('   获取消息内容');
  console.log('');
  console.log('🧪 ========================================');
};

// 在开发环境中将测试函数添加到全局对象
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).simulateStreamMessage = simulateStreamMessage;
  (window as any).simulateAIStreamResponse = simulateAIStreamResponse;
  (window as any).testMarkdownStreamResponse = testMarkdownStreamResponse;
  (window as any).checkMessageExists = checkMessageExists;
  (window as any).getMessageContent = getMessageContent;
  (window as any).listAllMessages = listAllMessages;
  (window as any).testStreamHandlerRegistration = testStreamHandlerRegistration;
  (window as any).runStreamMessageTests = runStreamMessageTests;
  (window as any).showStreamTestHelp = showStreamTestHelp;
  
  console.log('🧪 AI 流式消息测试工具已加载');
  console.log('🧪 使用 showStreamTestHelp() 查看帮助');
}

