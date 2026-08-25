/**
 * Base Store Pattern
 * Provides common store functionality and patterns
 */

import { StateCreator } from 'zustand';
import type { BaseQueryParams } from '@/services/base/BaseApiService';

/**
 * Base loading states interface
 */
export interface BaseLoadingStates {
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isSearching: boolean;
}

/**
 * Base error states interface
 */
export interface BaseErrorStates {
  error: string | null;
  createError: string | null;
  updateError: string | null;
  deleteError: string | null;
  searchError: string | null;
  hasError: boolean;
}

/**
 * Base pagination state interface
 */
export interface BasePaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Base filter state interface
 */
export interface BaseFilterState {
  searchQuery: string;
  selectedCategory: string;
  selectedStatus: string;
  selectedTags: string[];
}

/**
 * Base CRUD operations interface
 */
export interface BaseCrudOperations<T, TCreate, TUpdate> {
  // Read operations
  loadItems: (params?: BaseQueryParams) => Promise<void>;
  loadItem: (id: string) => Promise<void>;
  searchItems: (query: string, filters?: BaseQueryParams) => Promise<void>;
  loadByCategory: (category: string, params?: BaseQueryParams) => Promise<void>;
  loadByStatus: (status: string, params?: BaseQueryParams) => Promise<void>;
  loadPage: (page: number, pageSize?: number) => Promise<void>;
  
  // Create operations
  createItem: (data: TCreate) => Promise<T>;
  
  // Update operations
  updateItem: (id: string, data: TUpdate) => Promise<T>;
  
  // Delete operations
  deleteItem: (id: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  
  // Utility operations
  refreshItems: () => Promise<void>;
  clearErrors: () => void;
  reset: () => void;
}

/**
 * Base store state interface
 */
export interface BaseStoreState<T> extends 
  BaseLoadingStates, 
  BaseErrorStates, 
  BasePaginationState, 
  BaseFilterState {
  
  // Data
  items: T[];
  selectedItem: T | null;
  
  // Computed properties
  filteredItems: T[];
  paginatedItems: T[];
  
  // Selection
  selectedItems: string[];
  
  // UI state
  showCreateModal: boolean;
  showUpdateModal: boolean;
  showDeleteModal: boolean;
}

/**
 * Base store actions interface
 */
export interface BaseStoreActions<T> {
  // Data setters
  setItems: (items: T[]) => void;
  setSelectedItem: (item: T | null) => void;
  addItem: (item: T) => void;
  updateItemInList: (id: string, updates: Partial<T>) => void;
  removeItem: (id: string) => void;
  
  // Loading state setters
  setLoading: (loading: boolean) => void;
  setCreating: (creating: boolean) => void;
  setUpdating: (updating: boolean) => void;
  setDeleting: (deleting: boolean) => void;
  setSearching: (searching: boolean) => void;
  
  // Error state setters
  setError: (error: string | null) => void;
  setCreateError: (error: string | null) => void;
  setUpdateError: (error: string | null) => void;
  setDeleteError: (error: string | null) => void;
  setSearchError: (error: string | null) => void;
  
  // Pagination setters
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setMeta: (meta: { total: number; total_pages: number; has_next: boolean; has_prev: boolean }) => void;
  
  // Filter setters
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setSelectedStatus: (status: string) => void;
  setSelectedTags: (tags: string[]) => void;
  
  // Selection setters
  setSelectedItems: (ids: string[]) => void;
  toggleItemSelection: (id: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  
  // Modal setters
  setShowCreateModal: (show: boolean) => void;
  setShowUpdateModal: (show: boolean) => void;
  setShowDeleteModal: (show: boolean) => void;
}

/**
 * Create base store slice
 */
export const createBaseStoreSlice = <T extends { id: string }>(
  initialItems: T[] = []
): StateCreator<
  BaseStoreState<T> & BaseStoreActions<T>,
  [],
  [],
  BaseStoreState<T> & BaseStoreActions<T>
> => (set, get) => ({
  // Initial state
  items: initialItems,
  selectedItem: null,
  selectedItems: [],
  
  // Loading states
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
  isSearching: false,
  
  // Error states
  error: null,
  createError: null,
  updateError: null,
  deleteError: null,
  searchError: null,
  hasError: false,
  
  // Pagination state
  currentPage: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
  
  // Filter state
  searchQuery: '',
  selectedCategory: 'all',
  selectedStatus: 'all',
  selectedTags: [],
  
  // Modal state
  showCreateModal: false,
  showUpdateModal: false,
  showDeleteModal: false,
  
  // Computed properties
  get filteredItems() {
    const { items, searchQuery, selectedCategory, selectedStatus, selectedTags } = get();
    
    return items.filter(item => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          (item as any).name,
          (item as any).title,
          (item as any).description,
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!searchableText.includes(query)) return false;
      }
      
      // Category filter
      if (selectedCategory && selectedCategory !== 'all') {
        if ((item as any).category !== selectedCategory) return false;
      }
      
      // Status filter
      if (selectedStatus && selectedStatus !== 'all') {
        if ((item as any).status !== selectedStatus) return false;
      }
      
      // Tags filter
      if (selectedTags.length > 0) {
        const itemTags = (item as any).tags || [];
        if (!selectedTags.some(tag => itemTags.includes(tag))) return false;
      }
      
      return true;
    });
  },
  
  get paginatedItems() {
    const { filteredItems, currentPage, pageSize } = get();
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredItems.slice(startIndex, endIndex);
  },
  
  // Data setters
  setItems: (items) => set({ items }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  addItem: (item) => set(state => ({ items: [...state.items, item] })),
  updateItemInList: (id, updates) => set(state => ({
    items: state.items.map(item => 
      item.id === id ? { ...item, ...updates } : item
    )
  })),
  removeItem: (id) => set(state => ({
    items: state.items.filter(item => item.id !== id),
    selectedItems: state.selectedItems.filter(selectedId => selectedId !== id)
  })),
  
  // Loading state setters
  setLoading: (isLoading) => set({ isLoading }),
  setCreating: (isCreating) => set({ isCreating }),
  setUpdating: (isUpdating) => set({ isUpdating }),
  setDeleting: (isDeleting) => set({ isDeleting }),
  setSearching: (isSearching) => set({ isSearching }),
  
  // Error state setters
  setError: (error) => set({ error, hasError: !!error }),
  setCreateError: (createError) => set({ createError }),
  setUpdateError: (updateError) => set({ updateError }),
  setDeleteError: (deleteError) => set({ deleteError }),
  setSearchError: (searchError) => set({ searchError }),
  
  // Pagination setters
  setCurrentPage: (currentPage) => set({ currentPage }),
  setPageSize: (pageSize) => set({ pageSize }),
  setMeta: (meta) => set({
    totalItems: meta.total,
    totalPages: meta.total_pages,
    hasNext: meta.has_next,
    hasPrev: meta.has_prev,
  }),
  
  // Filter setters
  setSearchQuery: (searchQuery) => set({ searchQuery, currentPage: 1 }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory, currentPage: 1 }),
  setSelectedStatus: (selectedStatus) => set({ selectedStatus, currentPage: 1 }),
  setSelectedTags: (selectedTags) => set({ selectedTags, currentPage: 1 }),
  
  // Selection setters
  setSelectedItems: (selectedItems) => set({ selectedItems }),
  toggleItemSelection: (id) => set(state => ({
    selectedItems: state.selectedItems.includes(id)
      ? state.selectedItems.filter(selectedId => selectedId !== id)
      : [...state.selectedItems, id]
  })),
  selectAllItems: () => set(state => ({
    selectedItems: state.filteredItems.map(item => item.id)
  })),
  clearSelection: () => set({ selectedItems: [] }),
  
  // Modal setters
  setShowCreateModal: (showCreateModal) => set({ showCreateModal }),
  setShowUpdateModal: (showUpdateModal) => set({ showUpdateModal }),
  setShowDeleteModal: (showDeleteModal) => set({ showDeleteModal }),
});

export default createBaseStoreSlice;
