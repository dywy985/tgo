import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { visitorApiService, type VisitorListParams, type VisitorResponse } from '@/services/visitorApi';

interface VisitorState {
  visitors: VisitorResponse[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  filters: Partial<VisitorListParams>;
  
  // Actions
  fetchVisitors: () => Promise<void>;
  setFilters: (filters: Partial<VisitorListParams>) => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
}

export const useVisitorStore = create<VisitorState>()(
  devtools(
    (set, get) => ({
      visitors: [],
      total: 0,
      page: 1,
      pageSize: 20,
      loading: false,
      error: null,
      filters: {},

      fetchVisitors: async () => {
        const { page, pageSize, filters } = get();
        set({ loading: true, error: null });
        try {
          // Map page/pageSize to offset/limit as per OpenAPI spec
          const response = await visitorApiService.listVisitors({
            offset: (page - 1) * pageSize,
            limit: pageSize,
            ...filters,
          });
          set({
            visitors: response.data || [],
            total: response.pagination?.total || 0,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch visitors',
            loading: false,
          });
        }
      },

      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
          page: 1, // Reset to first page on filter change
        }));
        get().fetchVisitors();
      },

      setSorting: (sortBy, sortOrder) => {
        set((state) => ({
          filters: { ...state.filters, sort_by: sortBy, sort_order: sortOrder },
          page: 1,
        }));
        get().fetchVisitors();
      },

      setPage: (page) => {
        set({ page });
        get().fetchVisitors();
      },

      resetFilters: () => {
        set({ filters: {}, page: 1 });
        get().fetchVisitors();
      },
    }),
    { name: 'VisitorStore' }
  )
);
