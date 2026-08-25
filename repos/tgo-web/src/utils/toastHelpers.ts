/**
 * Toast Helper Functions
 * Provides convenience functions for common toast scenarios using the UI component system
 */

import { ToastType } from '@/components/ui/Toast';

// Type for the toast function from useToast hook
export type ShowToastFunction = (type: ToastType, title: string, message?: string, duration?: number) => void;

/**
 * Show API error with appropriate message
 */
export const showApiError = (showToast: ShowToastFunction, error: unknown): void => {
  let title = '操作失败';
  let message = '请稍后重试';
  
  if (error instanceof Error) {
    title = '操作失败';
    message = error.message;
    
    // Handle authentication errors specially
    if (message.includes('身份验证失败') || message.includes('401')) {
      title = '身份验证失败';
      message = '请重新登录后再试';
      // Show error with longer duration for auth issues
      showToast('error', title, message, 8000);
      return;
    }
    
    // Handle specific error types
    if (message.includes('网络连接失败') || message.includes('Network')) {
      title = '网络错误';
      message = '请检查网络连接后重试';
    } else if (message.includes('权限不足') || message.includes('403')) {
      title = '权限不足';
      message = '无法执行此操作';
    } else if (message.includes('文件过大') || message.includes('413')) {
      title = '文件过大';
      message = '请选择较小的文件';
    } else if (message.includes('不支持的文件类型') || message.includes('415')) {
      title = '文件类型错误';
      message = '不支持的文件类型';
    } else if (message.includes('服务器') || message.includes('500')) {
      title = '服务器错误';
      message = '服务暂时不可用，请稍后重试';
    }
  }
  
  showToast('error', title, message);
};

/**
 * Show network error
 */
export const showNetworkError = (showToast: ShowToastFunction): void => {
  showToast('error', '网络错误', '网络连接失败，请检查网络连接后重试');
};

/**
 * Show success message
 */
export const showSuccess = (showToast: ShowToastFunction, message: string, details?: string): void => {
  showToast('success', message, details);
};

/**
 * Show warning message
 */
export const showWarning = (showToast: ShowToastFunction, message: string, details?: string): void => {
  showToast('warning', message, details);
};

/**
 * Show info message
 */
export const showInfo = (showToast: ShowToastFunction, message: string, details?: string): void => {
  showToast('info', message, details);
};

/**
 * Show authentication error with special handling
 */
export const showAuthError = (showToast: ShowToastFunction, message?: string): void => {
  const title = '身份验证失败';
  const authMessage = message || '请重新登录后再试';
  showToast('error', title, authMessage, 8000);
  
  // Log for potential redirect logic
  console.log('Authentication required - redirect to login if needed');
};

/**
 * Show file operation success
 */
export const showFileSuccess = (showToast: ShowToastFunction, operation: string, fileName: string): void => {
  const messages = {
    upload: '上传成功',
    delete: '删除成功',
    download: '下载完成',
  };
  
  const title = messages[operation as keyof typeof messages] || '操作成功';
  showToast('success', title, `文件 "${fileName}" ${title.replace('成功', '').replace('完成', '')}`);
};

/**
 * Show file operation error
 */
export const showFileError = (showToast: ShowToastFunction, operation: string, fileName: string, error?: unknown): void => {
  const messages = {
    upload: '上传失败',
    delete: '删除失败',
    download: '下载失败',
  };
  
  const title = messages[operation as keyof typeof messages] || '操作失败';
  let message = `文件 "${fileName}" ${title}`;
  
  if (error instanceof Error) {
    message += `：${error.message}`;
  }
  
  showToast('error', title, message);
};

/**
 * Show knowledge base operation success
 */
export const showKnowledgeBaseSuccess = (showToast: ShowToastFunction, operation: string, name?: string): void => {
  const messages = {
    create: '创建成功',
    update: '更新成功',
    delete: '删除成功',
  };
  
  const title = messages[operation as keyof typeof messages] || '操作成功';
  const message = name ? `知识库 "${name}" ${title}` : `知识库${title}`;
  showToast('success', title, message);
};

/**
 * Show knowledge base operation error
 */
export const showKnowledgeBaseError = (showToast: ShowToastFunction, operation: string, error?: unknown, name?: string): void => {
  const messages = {
    create: '创建失败',
    update: '更新失败',
    delete: '删除失败',
    load: '加载失败',
  };
  
  const title = messages[operation as keyof typeof messages] || '操作失败';
  let message = name ? `知识库 "${name}" ${title}` : `知识库${title}`;
  
  if (error instanceof Error) {
    message += `：${error.message}`;
  }
  
  showToast('error', title, message);
};
