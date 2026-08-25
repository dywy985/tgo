/**
 * Time Formatting Test Utilities
 * Test functions to verify time formatting works correctly
 */

import {
  formatDateTime,
  formatKnowledgeBaseUpdatedTime,
  formatTimeOnly,
  formatDateOnly,
  formatRelativeTime,
  formatSmartTime,
  isToday,
  isYesterday,
  normalizeTimestamp
} from './timeFormatting';

/**
 * Test all time formatting functions with various inputs
 */
export const testTimeFormatting = (): void => {
  console.group('🕒 Time Formatting Tests');

  // Test timestamps
  const testTimestamps = [
    '2024-01-15T14:30:25.123Z', // ISO with milliseconds
    '2024-01-15T14:30:25Z', // ISO without milliseconds
    '2024-01-15T14:30:00.000Z', // ISO with zero seconds
    new Date().toISOString(), // Current time
    new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    'invalid-date-string', // Invalid date
    '', // Empty string
  ];

  console.log('📅 Testing formatKnowledgeBaseUpdatedTime:');
  testTimestamps.forEach((timestamp, index) => {
    try {
      const result = formatKnowledgeBaseUpdatedTime(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> "${result}"`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.log('\n⏰ Testing formatTimeOnly:');
  testTimestamps.slice(0, 5).forEach((timestamp, index) => {
    try {
      const result = formatTimeOnly(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> "${result}"`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.log('\n📆 Testing formatDateOnly:');
  testTimestamps.slice(0, 5).forEach((timestamp, index) => {
    try {
      const result = formatDateOnly(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> "${result}"`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.log('\n🔄 Testing formatRelativeTime:');
  testTimestamps.slice(3, 8).forEach((timestamp, index) => {
    try {
      const result = formatRelativeTime(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> "${result}"`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.log('\n🧠 Testing formatSmartTime:');
  testTimestamps.slice(3, 8).forEach((timestamp, index) => {
    try {
      const result = formatSmartTime(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> "${result}"`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.log('\n✅ Testing date validation functions:');
  const now = new Date();
  const today = now.toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`  isToday("${today}") ->`, isToday(today));
  console.log(`  isToday("${yesterday}") ->`, isToday(yesterday));
  console.log(`  isYesterday("${yesterday}") ->`, isYesterday(yesterday));
  console.log(`  isYesterday("${twoDaysAgo}") ->`, isYesterday(twoDaysAgo));

  console.log('\n🔧 Testing normalizeTimestamp:');
  ['2024-01-15T14:30:25Z', 'invalid-date', ''].forEach((timestamp, index) => {
    try {
      const result = normalizeTimestamp(timestamp);
      console.log(`  ${index + 1}. "${timestamp}" -> ${result.toISOString()}`);
    } catch (error) {
      console.error(`  ${index + 1}. "${timestamp}" -> ERROR:`, error);
    }
  });

  console.groupEnd();
};

/**
 * Test knowledge base time formatting specifically
 */
export const testKnowledgeBaseTimeFormatting = (): void => {
  console.group('📚 Knowledge Base Time Formatting Tests');

  // Simulate API responses
  const mockApiResponses = [
    {
      id: 'kb1',
      title: 'Test Knowledge Base 1',
      created_at: '2024-01-15T14:30:25.123Z',
      updated_at: '2024-01-15T16:45:30.456Z',
    },
    {
      id: 'kb2',
      title: 'Test Knowledge Base 2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'kb3',
      title: 'Test Knowledge Base 3',
      created_at: '2024-01-14T09:15:00Z',
      updated_at: '2024-01-14T18:30:45Z',
    },
  ];

  console.log('🔄 Processing mock API responses:');
  mockApiResponses.forEach((response, index) => {
    console.log(`\n--- Knowledge Base ${index + 1}: ${response.title} ---`);
    console.log('Raw created_at:', response.created_at);
    console.log('Raw updated_at:', response.updated_at);
    console.log('Formatted created_at:', formatKnowledgeBaseUpdatedTime(response.created_at));
    console.log('Formatted updated_at:', formatKnowledgeBaseUpdatedTime(response.updated_at));
    console.log('Smart updated_at:', formatSmartTime(response.updated_at));
    console.log('Relative updated_at:', formatRelativeTime(response.updated_at));
  });

  console.groupEnd();
};

/**
 * Test timezone handling
 */
export const testTimezoneHandling = (): void => {
  console.group('🌍 Timezone Handling Tests');

  const utcTimestamp = '2024-01-15T14:30:25Z';
  console.log('UTC Timestamp:', utcTimestamp);
  console.log('User Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  console.log('\nFormatted in different ways:');
  console.log('formatKnowledgeBaseUpdatedTime:', formatKnowledgeBaseUpdatedTime(utcTimestamp));
  console.log('formatDateTime (date+time):', formatDateTime(utcTimestamp));
  console.log('formatDateTime (time only):', formatDateTime(utcTimestamp, { includeDate: false }));
  console.log('formatDateTime (date only):', formatDateTime(utcTimestamp, { includeTime: false }));

  // Test with different locales
  console.log('\nTesting different locales:');
  const locales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
  locales.forEach(locale => {
    try {
      const result = formatDateTime(utcTimestamp, { locale });
      console.log(`  ${locale}: ${result}`);
    } catch (error) {
      console.error(`  ${locale}: ERROR -`, error);
    }
  });

  console.groupEnd();
};

/**
 * Performance test for time formatting
 */
export const testTimeFormattingPerformance = (): void => {
  console.group('⚡ Time Formatting Performance Tests');

  const testTimestamp = '2024-01-15T14:30:25.123Z';
  const iterations = 1000;

  // Test formatKnowledgeBaseUpdatedTime performance
  console.time('formatKnowledgeBaseUpdatedTime x1000');
  for (let i = 0; i < iterations; i++) {
    formatKnowledgeBaseUpdatedTime(testTimestamp);
  }
  console.timeEnd('formatKnowledgeBaseUpdatedTime x1000');

  // Test formatRelativeTime performance
  console.time('formatRelativeTime x1000');
  for (let i = 0; i < iterations; i++) {
    formatRelativeTime(testTimestamp);
  }
  console.timeEnd('formatRelativeTime x1000');

  // Test formatSmartTime performance
  console.time('formatSmartTime x1000');
  for (let i = 0; i < iterations; i++) {
    formatSmartTime(testTimestamp);
  }
  console.timeEnd('formatSmartTime x1000');

  console.groupEnd();
};

// Export for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).timeFormattingTests = {
    testAll: testTimeFormatting,
    testKnowledgeBase: testKnowledgeBaseTimeFormatting,
    testTimezone: testTimezoneHandling,
    testPerformance: testTimeFormattingPerformance,
  };
  
  console.log('🧪 Time formatting tests available at window.timeFormattingTests');
  console.log('   - window.timeFormattingTests.testAll() - Test all formatting functions');
  console.log('   - window.timeFormattingTests.testKnowledgeBase() - Test KB-specific formatting');
  console.log('   - window.timeFormattingTests.testTimezone() - Test timezone handling');
  console.log('   - window.timeFormattingTests.testPerformance() - Performance tests');
}
