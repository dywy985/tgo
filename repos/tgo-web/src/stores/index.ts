// 导出所有store
export { useChatStore, chatSelectors, StreamEndReason } from './chatStore';
export type { StreamEndReasonType } from './chatStore';
export { useAIStore } from './aiStore';
export { useKnowledgeStore } from './knowledgeStore';
export { usePlatformStore } from './platformStore';
export { useUIStore } from './uiStore';
export { useAuthStore } from './authStore';
export { useSetupStore } from './setupStore';
export { useVisitorStore } from './visitorStore';

// 新拆分的 stores (可选直接使用，但 chatStore 提供向后兼容的聚合接口)
export { useConversationStore, conversationSelectors } from './conversationStore';
export { useMessageStore, messageSelectors } from './messageStore';
export { useSyncStore, syncSelectors } from './syncStore';

export const aiSelectors = {
  agents: (state: any) => state.agents,
  tools: (state: any) => state.tools,
  selectedAgent: (state: any) => state.selectedAgent,
  selectedTool: (state: any) => state.selectedTool,
  agentCurrentPage: (state: any) => state.agentCurrentPage,
  agentPageSize: (state: any) => state.agentPageSize
};

export const knowledgeSelectors = {
  knowledgeBases: (state: any) => state.knowledgeBases,
  searchQuery: (state: any) => state.searchQuery,
  isLoading: (state: any) =>
    state.isLoading || state.isCreating || state.isUpdating || state.isDeleting
};

export const platformSelectors = {
  platforms: (state: any) => state.platforms,
  selectedPlatform: (state: any) => state.selectedPlatform,
  searchQuery: (state: any) => state.searchQuery,
  statusFilter: (state: any) => state.statusFilter,
  isLoading: (state: any) =>
    state.isLoading || state.isConnecting || state.isUpdating || state.isDeleting,
  isLoadingDetail: (state: any) => state.isLoadingDetail,
  detailLoadError: (state: any) => state.detailLoadError
};

export const uiSelectors = {
  theme: (state: any) => state.theme,
  sidebarState: (state: any) => state.sidebarState,
  notifications: (state: any) => state.notifications,
  isMobile: (state: any) => state.isMobile,
  isTablet: (state: any) => state.isTablet,
  preferences: (state: any) => state.preferences
};
