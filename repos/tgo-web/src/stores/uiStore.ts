import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/constants';


type Theme = 'light' | 'dark' | 'system';
type SidebarState = 'expanded' | 'collapsed' | 'hidden';

interface UIState {
  // 主题设置
  theme: Theme;

  // 布局状态
  sidebarState: SidebarState;
  chatListCollapsed: boolean;
  visitorPanelCollapsed: boolean;
  aiMenuCollapsed: boolean;

  // 加载状态
  globalLoading: boolean;
  loadingMessage: string;

  // 通知状态
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    timestamp: number;
    autoClose?: boolean;
    duration?: number;
  }>;

  // 模态框状态
  modals: Record<string, {
    isOpen: boolean;
    data?: any;
  }>;

  // 响应式状态
  isMobile: boolean;
  isTablet: boolean;
  screenWidth: number;
  screenHeight: number;

  // 连接状态
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // 用户偏好
  preferences: {
    language: 'zh-CN' | 'en-US';
    fontSize: 'small' | 'medium' | 'large';
    density: 'compact' | 'comfortable' | 'spacious';
    animations: boolean;
    soundEnabled: boolean;
    autoSave: boolean;
    // 通知相关设置
    notificationEnabled: boolean;      // 是否启用桌面通知
    notificationSound: boolean;        // 是否播放声音
    notifyOnBackground: boolean;       // 页面不可见时通知
    notifyOnOtherConversation: boolean; // 其他会话消息通知
    notifyOnNewVisitor: boolean;       // 新访客通知
  };

  // Actions
  setTheme: (theme: Theme) => void;
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  setChatListCollapsed: (collapsed: boolean) => void;
  setVisitorPanelCollapsed: (collapsed: boolean) => void;
  setAIMenuCollapsed: (collapsed: boolean) => void;

  // 加载状态
  setGlobalLoading: (loading: boolean, message?: string) => void;

  // 通知管理
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // 模态框管理
  openModal: (modalId: string, data?: any) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;

  // 响应式更新
  updateScreenSize: (width: number, height: number) => void;

  // 连接状态更新
  setConnectionStatus: (status: { isConnected: boolean; isConnecting: boolean; error?: string }) => void;

  // 用户偏好
  updatePreferences: (preferences: Partial<UIState['preferences']>) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UIState['preferences'] = {
  language: 'zh-CN',
  fontSize: 'medium',
  density: 'comfortable',
  animations: true,
  soundEnabled: true,
  autoSave: true,
  // 通知相关默认设置
  notificationEnabled: true,
  notificationSound: true,
  notifyOnBackground: true,
  notifyOnOtherConversation: true,
  notifyOnNewVisitor: true,
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        // 初始状态
        theme: 'system',
        sidebarState: 'expanded',
        chatListCollapsed: false,
        visitorPanelCollapsed: false,
        aiMenuCollapsed: false,
        globalLoading: false,
        loadingMessage: '',
        notifications: [],
        modals: {},
        isMobile: false,
        isTablet: false,
        screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
        screenHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
        isConnected: false,
        isConnecting: false,
        connectionError: null,
        preferences: defaultPreferences,

        // Actions
        setTheme: (theme) => {
          set({ theme }, false, 'setTheme');

          // 应用主题到DOM
          if (typeof document !== 'undefined') {
            const root = document.documentElement;
            if (theme === 'dark') {
              root.classList.add('dark');
            } else if (theme === 'light') {
              root.classList.remove('dark');
            } else {
              // system theme
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (prefersDark) {
                root.classList.add('dark');
              } else {
                root.classList.remove('dark');
              }
            }
          }
        },

        setSidebarState: (state) => set({ sidebarState: state }, false, 'setSidebarState'),

        toggleSidebar: () => {
          const { sidebarState } = get();
          const newState = sidebarState === 'expanded' ? 'collapsed' : 'expanded';
          set({ sidebarState: newState }, false, 'toggleSidebar');
        },

        setChatListCollapsed: (collapsed) => set({ chatListCollapsed: collapsed }, false, 'setChatListCollapsed'),
        setVisitorPanelCollapsed: (collapsed) => set({ visitorPanelCollapsed: collapsed }, false, 'setVisitorPanelCollapsed'),
        setAIMenuCollapsed: (collapsed) => set({ aiMenuCollapsed: collapsed }, false, 'setAIMenuCollapsed'),

        // 加载状态
        setGlobalLoading: (loading, message = '') => set({
          globalLoading: loading,
          loadingMessage: message
        }, false, 'setGlobalLoading'),

        // 通知管理
        addNotification: (notification) => {
          const id = Date.now().toString();
          const newNotification = {
            ...notification,
            id,
            timestamp: Date.now(),
            autoClose: notification.autoClose ?? true,
            duration: notification.duration ?? 5000
          };

          set(
            (state) => ({
              notifications: [...state.notifications, newNotification]
            }),
            false,
            'addNotification'
          );

          // 自动关闭通知
          if (newNotification.autoClose) {
            setTimeout(() => {
              get().removeNotification(id);
            }, newNotification.duration);
          }
        },

        removeNotification: (id) => set(
          (state) => ({
            notifications: state.notifications.filter(n => n.id !== id)
          }),
          false,
          'removeNotification'
        ),

        clearNotifications: () => set({ notifications: [] }, false, 'clearNotifications'),

        // 模态框管理
        openModal: (modalId, data) => set(
          (state) => ({
            modals: {
              ...state.modals,
              [modalId]: { isOpen: true, data }
            }
          }),
          false,
          'openModal'
        ),

        closeModal: (modalId) => set(
          (state) => ({
            modals: {
              ...state.modals,
              [modalId]: { isOpen: false, data: undefined }
            }
          }),
          false,
          'closeModal'
        ),

        closeAllModals: () => set(
          (state) => {
            const closedModals: Record<string, { isOpen: boolean; data?: any }> = {};
            Object.keys(state.modals).forEach(key => {
              closedModals[key] = { isOpen: false, data: undefined };
            });
            return { modals: closedModals };
          },
          false,
          'closeAllModals'
        ),

        // 响应式更新
        updateScreenSize: (width, height) => {
          const isMobile = width < 768;
          const isTablet = width >= 768 && width < 1024;

          set({
            screenWidth: width,
            screenHeight: height,
            isMobile,
            isTablet,
            // 在移动设备上自动折叠侧边栏
            sidebarState: isMobile ? 'collapsed' : get().sidebarState
          }, false, 'updateScreenSize');
        },

        // 连接状态更新
        setConnectionStatus: (status) => set({
          isConnected: status.isConnected,
          isConnecting: status.isConnecting,
          connectionError: status.error || null
        }, false, 'setConnectionStatus'),

        // 用户偏好
        updatePreferences: (newPreferences) => set(
          (state) => ({
            preferences: { ...state.preferences, ...newPreferences }
          }),
          false,
          'updatePreferences'
        ),

        resetPreferences: () => set({
          preferences: defaultPreferences
        }, false, 'resetPreferences')
      }),
      {
        name: STORAGE_KEYS.UI,
        partialize: (state) => ({
          // 持久化用户偏好和布局设置
          theme: state.theme,
          sidebarState: state.sidebarState,
          chatListCollapsed: state.chatListCollapsed,
          visitorPanelCollapsed: state.visitorPanelCollapsed,
          aiMenuCollapsed: state.aiMenuCollapsed,
          preferences: state.preferences
        })
      }
    ),
    { name: STORAGE_KEYS.UI }
  )
);

// 初始化响应式监听
if (typeof window !== 'undefined') {
  const updateSize = () => {
    useUIStore.getState().updateScreenSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', updateSize);
  updateSize(); // 初始化

  // 监听系统主题变化
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => {
    const { theme, setTheme } = useUIStore.getState();
    if (theme === 'system') {
      setTheme('system'); // 触发重新应用主题
    }
  };

  mediaQuery.addEventListener('change', handleThemeChange);
}
