/**
 * Optimized Tool Tools Store
 * Uses base store patterns to eliminate duplication and improve maintainability
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { 
  createBaseStoreSlice, 
  type BaseStoreState, 
  type BaseStoreActions,
  type BaseCrudOperations 
} from './base/BaseStore';
import type { ToolSummary, ToolResponse } from '@/types';
import { ToolsApiService, type ToolsQueryParams } from '@/services/toolsApi';
import { OptimizedTransforms } from '@/utils/toolsTransformOptimized';

/**
 * Extended state interface for Tool Tools specific functionality
 */
interface ToolsExtendedState {
  // Tool details state
  toolDetails: ToolResponse | null;
  isLoadingToolDetails: boolean;
  toolDetailsError: string | null;
  
  // API response metadata
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  } | null;
  
  // Additional filters specific to Tool tools
  selectedSourceType: string;
  
  // Computed properties for transformed data
  get transformedStoreItems(): any[];
  get transformedTools(): any[];
}

/**
 * Extended actions interface for Tool Tools specific operations
 */
interface ToolsExtendedActions {
  // Tool details operations
  loadToolDetails: (id: string) => Promise<void>;
  clearToolDetails: () => void;
  setToolDetails: (details: ToolResponse | null) => void;
  setLoadingToolDetails: (loading: boolean) => void;
  setToolDetailsError: (error: string | null) => void;
  
  // Metadata operations
  setMeta: (meta: ToolsExtendedState['meta']) => void;
  
  // Filter operations
  setSelectedSourceType: (sourceType: string) => void;
  
  // Batch operations with transformation
  loadAndTransformTools: (params?: ToolsQueryParams) => Promise<void>;
  refreshAndTransform: () => Promise<void>;
}

/**
 * Complete Tool Tools Store State
 */
type ToolsStoreState = BaseStoreState<ToolSummary> & 
                         ToolsExtendedState & 
                         BaseStoreActions<ToolSummary> & 
                         ToolsExtendedActions &
                         BaseCrudOperations<ToolSummary, any, any>;

/**
 * Create the optimized Tool Tools store
 */
export const useToolsStoreOptimized = create<ToolsStoreState>()(
  devtools(
    (set, get, store) => ({
      // Base store functionality
      ...createBaseStoreSlice<ToolSummary>([])(set, get, store),
      
      // Extended state
      toolDetails: null,
      isLoadingToolDetails: false,
      toolDetailsError: null,
      meta: null,
      selectedSourceType: 'all',
      
      // Computed properties
      get transformedStoreItems() {
        const { items } = get();
        return OptimizedTransforms.toolSummariesToStoreItems(items);
      },
      
      get transformedTools() {
        const { transformedStoreItems } = get();
        return OptimizedTransforms.storeItemsToAiTools(transformedStoreItems);
      },
      
      // Extended actions
      setMeta: (meta) => set({
        meta: meta ? {
          page: 'page' in meta ? meta.page : 1,
          limit: 'limit' in meta ? meta.limit : 20,
          total: meta.total,
          total_pages: meta.total_pages,
          has_next: meta.has_next,
          has_prev: meta.has_prev,
        } : null
      }),
      setSelectedSourceType: (selectedSourceType) => set({ selectedSourceType, currentPage: 1 }),
      
      // Tool details operations
      loadToolDetails: async (id: string) => {
        const { setLoadingToolDetails, setToolDetailsError, setToolDetails } = get();
        
        setLoadingToolDetails(true);
        setToolDetailsError(null);
        
        try {
          const details = await ToolsApiService.getToolDetails(id);
          setToolDetails(details);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load tool details';
          setToolDetailsError(errorMessage);
          console.error(`Failed to load tool details for ${id}:`, error);
        } finally {
          setLoadingToolDetails(false);
        }
      },
      
      clearToolDetails: () => set({ 
        toolDetails: null, 
        toolDetailsError: null 
      }),
      
      setToolDetails: (toolDetails) => set({ toolDetails }),
      setLoadingToolDetails: (isLoadingToolDetails) => set({ isLoadingToolDetails }),
      setToolDetailsError: (toolDetailsError) => set({ toolDetailsError }),
      
      // CRUD Operations Implementation
      loadItems: async (params?: ToolsQueryParams) => {
        const { setLoading, setError, setItems, setMeta } = get();
        
        setLoading(true);
        setError(null);
        
        try {
          const response = await ToolsApiService.getTools(params);
          setItems(response.data);
          setMeta(response.meta);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load tools';
          setError(errorMessage);
          console.error('Failed to load Tool tools:', error);
        } finally {
          setLoading(false);
        }
      },
      
      loadItem: async (id: string) => {
        const { setLoading, setError, setSelectedItem } = get();
        
        setLoading(true);
        setError(null);
        
        try {
          const tool = await ToolsApiService.getTool(id);
          setSelectedItem(tool);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load tool';
          setError(errorMessage);
          console.error(`Failed to load tool ${id}:`, error);
        } finally {
          setLoading(false);
        }
      },
      
      searchItems: async (query: string, filters?: ToolsQueryParams) => {
        const { setSearching, setSearchError, setItems, setMeta, setSearchQuery } = get();
        
        setSearching(true);
        setSearchError(null);
        setSearchQuery(query);
        
        try {
          const response = await ToolsApiService.searchTools(query, filters);
          setItems(response.data);
          setMeta(response.meta);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to search tools';
          setSearchError(errorMessage);
          console.error('Failed to search Tool tools:', error);
        } finally {
          setSearching(false);
        }
      },
      
      loadByCategory: async (category: string, params?: ToolsQueryParams) => {
        const { setLoading, setError, setItems, setMeta, setSelectedCategory } = get();
        
        setLoading(true);
        setError(null);
        setSelectedCategory(category);
        
        try {
          const response = await ToolsApiService.getToolsByCategory(category, params);
          setItems(response.data);
          setMeta(response.meta);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load tools by category';
          setError(errorMessage);
          console.error(`Failed to load tools for category ${category}:`, error);
        } finally {
          setLoading(false);
        }
      },
      
      loadByStatus: async (status: string, params?: ToolsQueryParams) => {
        const { setLoading, setError, setItems, setMeta, setSelectedStatus } = get();
        
        setLoading(true);
        setError(null);
        setSelectedStatus(status);
        
        try {
          const response = await ToolsApiService.getToolsByStatus(status, params);
          setItems(response.data);
          setMeta(response.meta);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load tools by status';
          setError(errorMessage);
          console.error(`Failed to load tools with status ${status}:`, error);
        } finally {
          setLoading(false);
        }
      },
      
      loadPage: async (page: number, pageSize?: number) => {
        const { setLoading, setError, setItems, setMeta, setCurrentPage, searchQuery, selectedCategory, selectedStatus } = get();
        
        setLoading(true);
        setError(null);
        setCurrentPage(page);
        
        try {
          const filters: ToolsQueryParams = {};
          if (searchQuery) filters.search = searchQuery;
          if (selectedCategory && selectedCategory !== 'all') filters.category = selectedCategory;
          if (selectedStatus && selectedStatus !== 'all') filters.status = selectedStatus;
          
          const response = await ToolsApiService.getToolsPage(page, pageSize, filters);
          setItems(response.data);
          setMeta(response.meta);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load page';
          setError(errorMessage);
          console.error(`Failed to load page ${page}:`, error);
        } finally {
          setLoading(false);
        }
      },
      
      // Placeholder CRUD operations (not implemented for tools)
      createItem: async () => { throw new Error('Create tool not implemented'); },
      updateItem: async () => { throw new Error('Update tool not implemented'); },
      deleteItem: async () => { throw new Error('Delete tool not implemented'); },
      deleteItems: async () => { throw new Error('Batch delete tools not implemented'); },
      
      refreshItems: async () => {
        const { loadItems, searchQuery, selectedCategory, selectedStatus, selectedSourceType } = get();
        
        const params: ToolsQueryParams = {};
        if (searchQuery) params.search = searchQuery;
        if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;
        if (selectedStatus && selectedStatus !== 'all') params.status = selectedStatus;
        if (selectedSourceType && selectedSourceType !== 'all') params.tool_source_type = selectedSourceType;
        
        await loadItems(params);
      },
      
      clearErrors: () => set({ 
        error: null, 
        createError: null, 
        updateError: null, 
        deleteError: null, 
        searchError: null,
        toolDetailsError: null,
        hasError: false 
      }),
      
      reset: () => set({
        items: [],
        selectedItem: null,
        toolDetails: null,
        meta: null,
        isLoading: false,
        isLoadingToolDetails: false,
        error: null,
        toolDetailsError: null,
        searchQuery: '',
        selectedCategory: 'all',
        selectedStatus: 'all',
        selectedSourceType: 'all',
        currentPage: 1,
        pageSize: 20,
      }),
      
      // Enhanced operations with transformation
      loadAndTransformTools: async (params?: ToolsQueryParams) => {
        await get().loadItems(params);
        // Transformation happens automatically via computed properties
      },
      
      refreshAndTransform: async () => {
        await get().refreshItems();
        // Transformation happens automatically via computed properties
      },
    }),
    {
      name: 'tools-store-optimized',
    }
  )
);

export default useToolsStoreOptimized;
