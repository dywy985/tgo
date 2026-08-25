import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type DefaultModelValue = string | null;
export type ThemeMode = 'light' | 'dark' | 'system';

interface AppSettingsState {
  defaultLlmModel: DefaultModelValue;
  defaultEmbeddingModel: DefaultModelValue;
  themeMode: ThemeMode;
  setDefaultLlmModel: (value: DefaultModelValue) => void;
  setDefaultEmbeddingModel: (value: DefaultModelValue) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useAppSettingsStore = create<AppSettingsState>()(
  devtools(
    persist(
      (set) => ({
        defaultLlmModel: null,
        defaultEmbeddingModel: null,
        themeMode: 'system',
        setDefaultLlmModel: (value) => set({ defaultLlmModel: value }, false, 'setDefaultLlmModel'),
        setDefaultEmbeddingModel: (value) => set({ defaultEmbeddingModel: value }, false, 'setDefaultEmbeddingModel'),
        setThemeMode: (mode) => set({ themeMode: mode }, false, 'setThemeMode'),
      }),
      {
        name: 'app-settings',
        partialize: (state) => ({
          defaultLlmModel: state.defaultLlmModel,
          defaultEmbeddingModel: state.defaultEmbeddingModel,
          themeMode: state.themeMode,
        }),
      }
    ),
    { name: 'app-settings-store' }
  )
);
