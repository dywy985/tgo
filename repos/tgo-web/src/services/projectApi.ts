import { apiClient } from './api';
import type { ToolStoreCredential } from '@/types';

export const projectApi = {
  // 绑定工具商店凭证
  bindToolStoreCredential: async (projectId: string, data: {
    toolstore_user_id: string;
    toolstore_email: string;
    api_key: string;
    refresh_token?: string;
  }) => {
    return await apiClient.post<ToolStoreCredential>(`/v1/toolstore/${projectId}/bindCredential`, data);
  },

  // 获取工具商店凭证状态
  getToolStoreCredential: async (projectId: string) => {
    return await apiClient.get<ToolStoreCredential | null>(`/v1/toolstore/${projectId}/credential`);
  },

  // 解绑工具商店凭证
  unbindToolStoreCredential: async (projectId: string) => {
    return await apiClient.delete(`/v1/toolstore/${projectId}/credential`);
  },
};

export default projectApi;
