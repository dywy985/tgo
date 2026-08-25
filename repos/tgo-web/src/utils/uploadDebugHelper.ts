/**
 * Upload Debug Helper
 * Utilities to help debug file upload and date formatting issues
 */

import { transformFileToKnowledgeFile, getCurrentDateFormatted } from './knowledgeBaseTransforms';
import type { FileResponse } from '@/services/knowledgeBaseApi';

/**
 * Test date formatting with various date formats
 */
export const testDateFormatting = (): void => {
  console.group('🗓️ Date Formatting Tests');
  
  const testDates = [
    '2024-01-15T10:30:00Z',
    '2024-01-15T10:30:00.123Z',
    '2024-01-15',
    '2024/01/15',
    '01/15/2024',
    '',
    null,
    undefined,
    'invalid-date',
    '2024-13-45', // Invalid date
  ];

  testDates.forEach(dateStr => {
    try {
      const formatted = getCurrentDateFormatted();
      console.log(`Input: "${dateStr}" -> Output: "${formatted}"`);
    } catch (error) {
      console.error(`Input: "${dateStr}" -> Error:`, error);
    }
  });
  
  console.groupEnd();
};

/**
 * Test file transformation with mock API response
 */
export const testFileTransformation = (): void => {
  console.group('📁 File Transformation Tests');
  
  const mockFileResponses: Partial<FileResponse>[] = [
    {
      id: 'test-1',
      original_filename: 'test-file.pdf',
      file_size: 1024000,
      content_type: 'application/pdf',
      status: 'completed',
      document_count: 1,
      total_tokens: 100,
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 'test-2',
      original_filename: 'no-date-file.docx',
      file_size: 512000,
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 'completed',
      document_count: 1,
      total_tokens: 50,
      created_at: '', // Empty date
      updated_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 'test-3',
      original_filename: 'invalid-date-file.txt',
      file_size: 1024,
      content_type: 'text/plain',
      status: 'completed',
      document_count: 1,
      total_tokens: 10,
      created_at: 'invalid-date-string',
      updated_at: '2024-01-15T10:30:00Z',
    },
  ];

  mockFileResponses.forEach((mockFile, index) => {
    try {
      console.log(`\n--- Test ${index + 1}: ${mockFile.original_filename} ---`);
      console.log('Input:', mockFile);
      
      const transformed = transformFileToKnowledgeFile(mockFile as FileResponse);
      console.log('Output:', {
        id: transformed.id,
        name: transformed.name,
        uploadDate: transformed.uploadDate,
        status: transformed.status,
        statusType: transformed.statusType,
      });
    } catch (error) {
      console.error(`Test ${index + 1} failed:`, error);
    }
  });
  
  console.groupEnd();
};

/**
 * Monitor upload progress state changes
 */
export const createUploadProgressMonitor = () => {
  const progressHistory: Array<{
    timestamp: number;
    fileId: string;
    fileName: string;
    progress: number;
    status: string;
  }> = [];

  return {
    logProgress: (fileId: string, fileName: string, progress: number, status: string) => {
      const entry = {
        timestamp: Date.now(),
        fileId,
        fileName,
        progress,
        status,
      };
      progressHistory.push(entry);
      console.log(`📊 Upload Progress [${fileName}]: ${progress}% (${status})`);
    },
    
    getHistory: () => progressHistory,
    
    analyzeProgress: (fileId: string) => {
      const fileProgress = progressHistory.filter(entry => entry.fileId === fileId);
      
      console.group(`📈 Progress Analysis for ${fileId}`);
      console.log('Total progress updates:', fileProgress.length);
      
      if (fileProgress.length > 0) {
        const first = fileProgress[0];
        const last = fileProgress[fileProgress.length - 1];
        const duration = last.timestamp - first.timestamp;
        
        console.log('Start:', first);
        console.log('End:', last);
        console.log('Duration:', `${duration}ms`);
        console.log('Final status:', last.status);
        
        // Check for progress anomalies
        const progressValues = fileProgress.map(p => p.progress);
        const hasBackwardProgress = progressValues.some((val, idx) => 
          idx > 0 && val < progressValues[idx - 1]
        );
        
        if (hasBackwardProgress) {
          console.warn('⚠️ Backward progress detected!');
        }
        
        const stuckProgress = progressValues.filter((val, idx, arr) => 
          idx > 0 && val === arr[idx - 1]
        ).length;
        
        if (stuckProgress > 3) {
          console.warn(`⚠️ Progress stuck for ${stuckProgress} updates`);
        }
      }
      
      console.groupEnd();
    },
    
    clear: () => {
      progressHistory.length = 0;
      console.log('🧹 Progress history cleared');
    },
  };
};

/**
 * Test current date formatting
 */
export const testCurrentDateFormatting = (): void => {
  console.group('📅 Current Date Formatting Test');
  
  const currentDate = getCurrentDateFormatted();
  const jsDate = new Date().toLocaleDateString('zh-CN');
  
  console.log('getCurrentDateFormatted():', currentDate);
  console.log('new Date().toLocaleDateString("zh-CN"):', jsDate);
  console.log('Match:', currentDate === jsDate);
  
  console.groupEnd();
};

// Export for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).uploadDebug = {
    testDates: testDateFormatting,
    testFiles: testFileTransformation,
    testCurrentDate: testCurrentDateFormatting,
    createMonitor: createUploadProgressMonitor,
  };
  
  console.log('🔧 Upload debug utilities available at window.uploadDebug');
  console.log('   - window.uploadDebug.testDates() - Test date formatting');
  console.log('   - window.uploadDebug.testFiles() - Test file transformation');
  console.log('   - window.uploadDebug.testCurrentDate() - Test current date');
  console.log('   - window.uploadDebug.createMonitor() - Create progress monitor');
}
