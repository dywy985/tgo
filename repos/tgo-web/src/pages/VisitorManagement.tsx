import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVisitorStore } from '@/stores/visitorStore';
import VisitorTable from '@/components/visitor/VisitorTable';
import VisitorFilters from '@/components/visitor/VisitorFilters';
import VisitorDetailPanel from '@/components/visitor/VisitorDetailPanel';
import Pagination from '@/components/ui/Pagination';
import Icon from '@/components/ui/Icon';
import { visitorApiService, type VisitorResponse } from '@/services/visitorApi';

const VisitorManagement: React.FC = () => {
  const { t } = useTranslation();
  const {
    visitors,
    total,
    page,
    pageSize,
    loading,
    error,
    fetchVisitors,
    setPage,
  } = useVisitorStore();

  const [selectedVisitor, setSelectedVisitor] = useState<VisitorResponse | null>(null);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleVisitorClick = useCallback(async (visitor: VisitorResponse) => {
    // 先显示基本信息，然后获取完整详情
    setSelectedVisitor(visitor);
    try {
      const fullDetail = await visitorApiService.getVisitor(visitor.id);
      setSelectedVisitor(fullDetail);
    } catch (err) {
      console.error('Failed to fetch visitor details:', err);
      // 即使获取详情失败，仍然显示基本信息
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedVisitor(null);
  }, []);

  // 当访客数据在面板中被更新时的回调
  const handleVisitorUpdated = useCallback(async (visitorId: string) => {
    // 刷新列表数据
    fetchVisitors();
    
    // 更新当前选中的访客详情
    try {
      const updatedVisitor = await visitorApiService.getVisitor(visitorId);
      setSelectedVisitor(updatedVisitor);
    } catch (err) {
      console.error('Failed to refresh visitor details:', err);
    }
  }, [fetchVisitors]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Icon name="Users" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('visitor.management.title', '访客管理')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('visitor.management.subtitle', '查看并管理所有平台的访客信息')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
              {t('visitor.management.totalVisitors', '总访客数')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {(total || 0).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => fetchVisitors()}
            className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-all"
            title={t('common.refresh', '刷新')}
          >
            <Icon name="RefreshCw" size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <VisitorFilters />
      </div>

      {/* Scrollable Table Container */}
      <div className="flex-1 min-h-0 px-6 overflow-hidden">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30 text-center">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-500 mb-4">
              <Icon name="AlertCircle" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('visitor.management.errorTitle', '加载失败')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
              {error}
            </p>
            <button
              onClick={() => fetchVisitors()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              {t('common.retry', '重试')}
            </button>
          </div>
        ) : loading && (!visitors || visitors.length === 0) ? (
          <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-center gap-3">
              <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('common.loading', '加载中...')}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <VisitorTable visitors={visitors} onVisitorClick={handleVisitorClick} />
          </div>
        )}
      </div>

      {/* Pagination - Fixed at bottom */}
      {!error && totalPages > 1 && (
        <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end shadow-sm">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Visitor Detail Drawer - Using shared VisitorDetailPanel */}
      {selectedVisitor && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/20 backdrop-blur-sm"
          onClick={handleCloseDetail}
        >
          <div 
            className="w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <VisitorDetailPanel
              visitorId={selectedVisitor.id}
              visitorData={selectedVisitor}
              showCloseButton={true}
              onClose={handleCloseDetail}
              onVisitorUpdated={handleVisitorUpdated}
              variant="drawer"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitorManagement;
