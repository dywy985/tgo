/**
 * WuKongIM Integration Test Component
 * Test component for verifying WuKongIM conversation sync functionality
 */

import React, { useState } from 'react';
import { useChatStore } from '@/stores';
import { WuKongIMApiService, WuKongIMUtils } from '@/services/wukongimApi';
import { getChannelKey } from '@/utils/channelUtils';
import type {
  WuKongIMConversationSyncRequest,
  WuKongIMMessagePayload
} from '@/types';

const WuKongIMIntegrationTest: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  
  // Store state
  const chats = useChatStore(state => state.chats);
  const isSyncing = useChatStore(state => state.isSyncing);
  const syncError = useChatStore(state => state.syncError);
  const lastSyncTime = useChatStore(state => state.lastSyncTime);
  const syncVersion = useChatStore(state => state.syncVersion);

  // Historical messages state
  const historicalMessages = useChatStore(state => state.historicalMessages);
  const isLoadingHistory = useChatStore(state => state.isLoadingHistory);
  const historyError = useChatStore(state => state.historyError);
  const hasMoreHistory = useChatStore(state => state.hasMoreHistory);
  const syncConversations = useChatStore(state => state.syncConversations);
  const loadHistoricalMessages = useChatStore(state => state.loadHistoricalMessages);
  const loadMoreHistory = useChatStore(state => state.loadMoreHistory);

  const addResult = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    setTestResults(prev => [...prev, `[${timestamp}] ${prefix} ${message}`]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testHistoricalMessages = async () => {
    addResult('Testing WuKongIM Historical Messages API...');
    setIsRunning(true);

    try {
      // Test message sync request
      const testChannelId = 'test-channel-123';
      const testChannelType = 1; // Personal chat

      addResult(`Testing channel history for: ${testChannelId}`);

      // Test getChannelHistory
      const historyResponse = await WuKongIMApiService.getChannelHistory(
        testChannelId,
        testChannelType,
        20
      );

      addResult(`✅ Channel history API call successful`, 'success');
      addResult(`   - Messages count: ${historyResponse.messages.length}`);
      addResult(`   - Has more: ${historyResponse.more}`);
      addResult(`   - Next seq: ${historyResponse.next_start_seq || 'N/A'}`);

      // Test message processing utilities
      if (historyResponse.messages.length > 0) {
        const firstMessage = historyResponse.messages[0];
        addResult('Testing message processing utilities...');

        // Test message enhancement
        const enhanced = WuKongIMUtils.enhanceMessage(firstMessage);
        addResult(`   - Enhanced message sender: ${enhanced.sender_name}`);
        addResult(`   - Enhanced message avatar: ${enhanced.sender_avatar}`);

        // Test message sorting
        const sorted = WuKongIMUtils.sortMessages(historyResponse.messages, 'desc');
        addResult(`   - Sorted messages (desc): ${sorted.length} messages`);

        // Test message deduplication
        const duplicated = [...historyResponse.messages, ...historyResponse.messages];
        const deduplicated = WuKongIMUtils.deduplicateMessages(duplicated);
        addResult(`   - Deduplication: ${duplicated.length} -> ${deduplicated.length} messages`);

        // Test message merging
        const merged = WuKongIMUtils.mergeMessages(
          historyResponse.messages.slice(0, 2),
          historyResponse.messages.slice(1, 3),
          'asc'
        );
        addResult(`   - Message merging: ${merged.length} unique messages`);
      }

      // Test store integration
      addResult('Testing store integration...');
      await loadHistoricalMessages(testChannelId, testChannelType);

      // Check store state
      const compositeKey = getChannelKey(testChannelId, testChannelType);
      const storeMessages = historicalMessages[compositeKey] || [];
      addResult(`   - Store messages count: ${storeMessages.length}`);
      addResult(`   - Loading state: ${isLoadingHistory}`);
      addResult(`   - Has more in store: ${hasMoreHistory[compositeKey] || false}`);

      if (historyError) {
        addResult(`   - Store error: ${historyError}`, 'error');
      } else {
        addResult(`   - Store integration successful`, 'success');
      }

      // Test load more functionality
      if (hasMoreHistory[compositeKey]) {
        addResult('Testing load more messages...');
        await loadMoreHistory(testChannelId, testChannelType);

        const updatedMessages = historicalMessages[compositeKey] || [];
        addResult(`   - Updated messages count: ${updatedMessages.length}`);
        addResult(`   - Load more successful`, 'success');
      }

      addResult('✅ Historical messages test completed successfully!', 'success');

    } catch (error) {
      addResult(`❌ Historical messages test failed: ${error}`, 'error');
      console.error('Historical messages test error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const testApiDirectly = async () => {
    addResult('Testing WuKongIM API directly...');
    
    try {
      // Test initial sync
      const request: WuKongIMConversationSyncRequest = {
        version: 0,
        msg_count: 5
      };
      
      const response = await WuKongIMApiService.syncConversations(request);
      addResult(`API call successful. Received ${response.conversations.length} conversations`, 'success');
      
      // Log first conversation details if available
      if (response.conversations.length > 0) {
        const firstConv = response.conversations[0];
        addResult(`First conversation: ID=${firstConv.channel_id}, Type=${firstConv.channel_type}, Unread=${firstConv.unread}`);
      }
      
    } catch (error) {
      addResult(`API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const testStoreSync = async () => {
    addResult('Testing store sync functionality...');
    
    try {
      await syncConversations();
      addResult('Store sync completed', 'success');
    } catch (error) {
      addResult(`Store sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const testDataMapping = () => {
    addResult('Testing data mapping...');

    if (chats.length === 0) {
      addResult('No chats available for mapping test', 'error');
      return;
    }

    const firstChat = chats[0];
    const name = firstChat.channelInfo?.name || `访客${String(firstChat.channelId || firstChat.id).slice(-4)}`;
    addResult(`Mapped chat: ID=${firstChat.id}, Name=${name}, Platform=${firstChat.platform}`);
    addResult(`Last message: ${firstChat.lastMessage}`, 'success');
  };

  const testPayloadParsing = () => {
    addResult('Testing payload parsing (new vs legacy format, and stream_data)...');

    // Test stream_data priority (highest priority)
    const streamDataMessage = {
      payload: { content: "Payload content", type: 1 },
      stream_data: "Stream data content (should be prioritized)"
    };
    const streamContent = WuKongIMUtils.extractMessageContent(streamDataMessage);
    addResult(`Stream data priority - Content: "${streamContent}"`, streamContent === "Stream data content (should be prioritized)" ? 'success' : 'error');

    // Test stream_data empty (should fallback to payload)
    const emptyStreamMessage = {
      payload: { content: "Payload content", type: 1 },
      stream_data: ""
    };
    const emptyStreamContent = WuKongIMUtils.extractMessageContent(emptyStreamMessage);
    addResult(`Empty stream_data fallback - Content: "${emptyStreamContent}"`, emptyStreamContent === "Payload content" ? 'success' : 'error');

    // Test new object format
    const newPayload: WuKongIMMessagePayload = {
      content: "Hello from new format!",
      type: 1
    };
    const newContent = WuKongIMUtils.extractMessageContent({ payload: newPayload });
    const newType = WuKongIMUtils.extractMessageType(newPayload);
    addResult(`New format - Content: "${newContent}", Type: ${newType}`, 'success');

    // Test legacy string format (JSON string)
    const legacyJsonPayload = '{"content": "Hello from legacy JSON!", "type": 2}';
    const legacyJsonContent = WuKongIMUtils.extractMessageContent({ payload: legacyJsonPayload });
    const legacyJsonType = WuKongIMUtils.extractMessageType(legacyJsonPayload);
    addResult(`Legacy JSON format - Content: "${legacyJsonContent}", Type: ${legacyJsonType}`, 'success');

    // Test legacy plain string format
    const legacyStringPayload = 'Hello from plain string!';
    const legacyStringContent = WuKongIMUtils.extractMessageContent({ payload: legacyStringPayload });
    const legacyStringType = WuKongIMUtils.extractMessageType(legacyStringPayload);
    addResult(`Legacy string format - Content: "${legacyStringContent}", Type: ${legacyStringType}`, 'success');

    // Test edge cases
    const emptyPayload = '';
    const emptyContent = WuKongIMUtils.extractMessageContent({ payload: emptyPayload });
    addResult(`Empty payload - Content: "${emptyContent}"`, 'info');

    const invalidJsonPayload = '{"invalid": json}';
    const invalidJsonContent = WuKongIMUtils.extractMessageContent({ payload: invalidJsonPayload });
    addResult(`Invalid JSON payload - Content: "${invalidJsonContent}"`, 'info');
  };

  const runAllTests = async () => {
    setIsRunning(true);
    clearResults();
    
    addResult('Starting WuKongIM integration tests...');
    
    // Test 1: Direct API call
    await testApiDirectly();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Store sync
    await testStoreSync();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Data mapping
    testDataMapping();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: Payload parsing
    testPayloadParsing();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 5: Historical messages
    await testHistoricalMessages();

    addResult('All tests completed!', 'success');
    setIsRunning(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">WuKongIM Integration Test</h1>
      
      {/* Store State Display */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-3">Store State</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Chats Count:</strong> {chats.length}
          </div>
          <div>
            <strong>Is Syncing:</strong> {isSyncing ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Sync Version:</strong> {syncVersion}
          </div>
          <div>
            <strong>Last Sync:</strong> {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}
          </div>
          <div className="col-span-2">
            <strong>Sync Error:</strong> {syncError || 'None'}
          </div>
        </div>
      </div>

      {/* Test Controls */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isRunning ? 'Running Tests...' : 'Run All Tests'}
        </button>
        
        <button
          onClick={testApiDirectly}
          disabled={isRunning}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Test API Only
        </button>
        
        <button
          onClick={testStoreSync}
          disabled={isRunning}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          Test Store Sync
        </button>

        <button
          onClick={testPayloadParsing}
          disabled={isRunning}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          Test Payload Parsing
        </button>

        <button
          onClick={testHistoricalMessages}
          disabled={isRunning}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          Test Historical Messages
        </button>
        
        <button
          onClick={clearResults}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Clear Results
        </button>
      </div>

      {/* Test Results */}
      <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm">
        <h3 className="text-white mb-2">Test Results:</h3>
        {testResults.length === 0 ? (
          <div className="text-gray-500">No test results yet. Click "Run All Tests" to start.</div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {testResults.map((result, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {result}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat List Preview */}
      {chats.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Current Chats ({chats.length})</h3>
          <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto">
            {chats.slice(0, 5).map((chat) => (
              <div key={chat.id} className="border-b border-gray-200 py-2 last:border-b-0">
                <div className="font-medium">{chat.channelInfo?.name || `访客${String(chat.channelId || chat.id).slice(-4)}`}</div>
                <div className="text-sm text-gray-600">{chat.lastMessage}</div>
                <div className="text-xs text-gray-500">
                  Platform: {chat.platform} | Unread: {chat.unreadCount} | Time: {chat.timestamp}
                </div>
              </div>
            ))}
            {chats.length > 5 && (
              <div className="text-sm text-gray-500 pt-2">
                ... and {chats.length - 5} more chats
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WuKongIMIntegrationTest;
