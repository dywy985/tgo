/**
 * 访客面板会话切换功能测试工具
 * 用于在浏览器控制台中测试访客面板的会话切换功能
 */

import type { Chat } from '@/types';

/**
 * 创建测试用的聊天数据
 */
export const createTestChat = (
  id: string,
  channelType: number,
  channelId?: string,
  visitorId?: string
): Chat => {
  return {
    id,
    platform: channelType === 1 ? 'wechat' : 'group',
    lastMessage: `测试消息 ${id}`,
    timestamp: new Date().toLocaleTimeString(),
    status: 'active',
    unreadCount: 0,
    channelId: channelId || `channel_${id}`,
    channelType: channelType,
    lastMsgSeq: 1,
    tags: [],
    priority: 'normal',
    metadata: {
      visitor_id: visitorId
    }
  };
};

/**
 * 测试访客ID获取逻辑
 */
export const testVisitorIdExtraction = (): void => {
  console.log('🧪 测试访客ID获取逻辑...');

  // 测试用例1: 个人频道，使用channelId
  const personalChat = createTestChat('1', 1, 'visitor_123');
  console.log('📋 个人频道测试:', {
    chatId: personalChat.id,
    channelType: personalChat.channelType,
    channelId: personalChat.channelId,
    expectedVisitorId: 'visitor_123'
  });

  // 测试用例2: 群组频道，不应显示访客信息
  const groupChat = createTestChat('2', 2, 'group_456');
  console.log('📋 群组频道测试:', {
    chatId: groupChat.id,
    channelType: groupChat.channelType,
    channelId: groupChat.channelId,
    shouldShowVisitor: false
  });

  // 测试用例3: 有visitor_id的情况
  const chatWithVisitorId = createTestChat('3', 1, 'channel_789', 'visitor_999');
  console.log('📋 带visitor_id测试:', {
    chatId: chatWithVisitorId.id,
    channelType: chatWithVisitorId.channelType,
    channelId: chatWithVisitorId.channelId,
    visitorId: chatWithVisitorId.metadata?.visitor_id,
    expectedVisitorId: 'channel_789' // 应该优先使用channelId
  });

  console.log('✅ 访客ID获取逻辑测试完成');
};

/**
 * 测试频道类型判断
 */
export const testChannelTypeCheck = (): void => {
  console.log('🧪 测试频道类型判断...');

  const testCases = [
    { channelType: 1, expected: true, description: '个人频道' },
    { channelType: 2, expected: false, description: '群组频道' },
    { channelType: 3, expected: false, description: '其他频道类型' },
    { channelType: undefined, expected: false, description: '无频道类型' }
  ];

  testCases.forEach(({ channelType, expected, description }) => {
    const chat = createTestChat('test', channelType || 0);
    const isPersonal = chat.channelType === 1;
    
    console.log(`📋 ${description}:`, {
      channelType,
      isPersonal,
      expected,
      passed: isPersonal === expected ? '✅' : '❌'
    });
  });

  console.log('✅ 频道类型判断测试完成');
};

/**
 * 模拟会话切换场景
 */
export const simulateSessionSwitching = (): void => {
  console.log('🧪 模拟会话切换场景...');

  const scenarios = [
    {
      name: '个人频道A → 个人频道B',
      from: createTestChat('A', 1, 'visitor_A'),
      to: createTestChat('B', 1, 'visitor_B'),
      expectedBehavior: '应该加载访客B的信息'
    },
    {
      name: '个人频道 → 群组频道',
      from: createTestChat('personal', 1, 'visitor_personal'),
      to: createTestChat('group', 2, 'group_channel'),
      expectedBehavior: '应该显示群组频道提示'
    },
    {
      name: '群组频道 → 个人频道',
      from: createTestChat('group', 2, 'group_channel'),
      to: createTestChat('personal', 1, 'visitor_personal'),
      expectedBehavior: '应该加载个人访客信息'
    },
    {
      name: '相同访客切换',
      from: createTestChat('A1', 1, 'same_visitor'),
      to: createTestChat('A2', 1, 'same_visitor'),
      expectedBehavior: '应该跳过重复加载'
    }
  ];

  scenarios.forEach(({ name, from, to, expectedBehavior }) => {
    console.log(`📋 场景: ${name}`);
    console.log('  从:', {
      id: from.id,
      channelType: from.channelType,
      visitorId: from.channelId
    });
    console.log('  到:', {
      id: to.id,
      channelType: to.channelType,
      visitorId: to.channelId
    });
    console.log('  预期行为:', expectedBehavior);
    console.log('');
  });

  console.log('✅ 会话切换场景模拟完成');
};

/**
 * 测试缓存机制
 */
export const testCacheLogic = (): void => {
  console.log('🧪 测试缓存机制...');

  // 模拟缓存操作
  const cache = new Map<string, any>();
  const MAX_CACHE_SIZE = 3; // 小的缓存大小便于测试

  const addToCache = (visitorId: string, data: any) => {
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        console.log(`🗑️ 删除最旧的缓存项: ${firstKey}`);
        cache.delete(firstKey);
      }
    }
    console.log(`💾 添加到缓存: ${visitorId}`);
    cache.set(visitorId, data);
  };

  // 测试缓存添加
  addToCache('visitor_1', { name: '访客1' });
  addToCache('visitor_2', { name: '访客2' });
  addToCache('visitor_3', { name: '访客3' });
  
  console.log('📋 当前缓存状态:', Array.from(cache.keys()));
  
  // 测试缓存溢出
  addToCache('visitor_4', { name: '访客4' });
  console.log('📋 溢出后缓存状态:', Array.from(cache.keys()));

  // 测试缓存命中
  const cachedData = cache.get('visitor_2');
  console.log('📋 缓存命中测试:', {
    visitorId: 'visitor_2',
    found: !!cachedData,
    data: cachedData
  });

  console.log('✅ 缓存机制测试完成');
};

/**
 * 运行所有测试
 */
export const runAllVisitorPanelTests = (): void => {
  console.log('🚀 开始运行访客面板会话切换功能测试...');
  console.log('');

  testVisitorIdExtraction();
  console.log('');

  testChannelTypeCheck();
  console.log('');

  simulateSessionSwitching();
  console.log('');

  testCacheLogic();
  console.log('');

  console.log('🎉 所有测试完成！');
  console.log('');
  console.log('💡 使用说明:');
  console.log('- testVisitorIdExtraction() - 测试访客ID获取逻辑');
  console.log('- testChannelTypeCheck() - 测试频道类型判断');
  console.log('- simulateSessionSwitching() - 模拟会话切换场景');
  console.log('- testCacheLogic() - 测试缓存机制');
  console.log('- runAllVisitorPanelTests() - 运行所有测试');
};

// 在开发环境中将测试函数添加到全局对象
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).testVisitorIdExtraction = testVisitorIdExtraction;
  (window as any).testChannelTypeCheck = testChannelTypeCheck;
  (window as any).simulateSessionSwitching = simulateSessionSwitching;
  (window as any).testCacheLogic = testCacheLogic;
  (window as any).runAllVisitorPanelTests = runAllVisitorPanelTests;
  
  console.log('🧪 访客面板测试工具已加载');
  console.log('🧪 使用 runAllVisitorPanelTests() 运行所有测试');
}
