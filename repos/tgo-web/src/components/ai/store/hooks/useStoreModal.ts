import { useState, useEffect, useCallback } from 'react';
import { useStoreAuthStore } from '@/stores/storeAuthStore';

interface UseStoreModalOptions<T, C> {
  isOpen: boolean;
  fetchItems: (params: { category?: string; search?: string }) => Promise<{ items: T[]; total: number }>;
  fetchCategories: () => Promise<C[]>;
  onUnauthorized?: () => void;
  searchDebounce?: number;
}

export function useStoreModal<T, C>({
  isOpen,
  fetchItems,
  fetchCategories,
  onUnauthorized,
  searchDebounce = 300
}: UseStoreModalOptions<T, C>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<T[]>([]);
  const [categories, setCategories] = useState<C[]>([]);
  const [total, setTotal] = useState(0);

  const { isAuthenticated, verifySession } = useStoreAuthStore();

  // Handle search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, searchDebounce);
    return () => clearTimeout(timer);
  }, [searchQuery, searchDebounce]);

  // Initial load
  useEffect(() => {
    if (isOpen) {
      const loadCategories = async () => {
        try {
          const data = await fetchCategories();
          setCategories(data);
        } catch (error) {
          console.error('Failed to fetch categories:', error);
        }
      };
      
      loadCategories();

      if (isAuthenticated) {
        verifySession();
      }
    }
  }, [isOpen, fetchCategories, isAuthenticated, verifySession]);

  // Load items when category or search changes
  const loadItems = useCallback(async () => {
    if (!isOpen) return;
    
    setLoading(true);
    try {
      const data = await fetchItems({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: debouncedSearchQuery || undefined,
      });
      setItems(data?.items || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, selectedCategory, debouncedSearchQuery, fetchItems]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Handle unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      if (isOpen && onUnauthorized) {
        onUnauthorized();
      }
    };
    window.addEventListener('store-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('store-unauthorized', handleUnauthorized);
  }, [isOpen, onUnauthorized]);

  return {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    loading,
    items,
    setItems,
    categories,
    setCategories,
    total,
    setTotal,
    loadItems
  };
}
