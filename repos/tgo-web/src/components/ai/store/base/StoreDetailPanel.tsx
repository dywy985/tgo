import React from 'react';
import { X } from 'lucide-react';
import { StoreDetailPanelProps } from '../types';

const StoreDetailPanel: React.FC<StoreDetailPanelProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  headerActions,
  footer,
  children 
}) => {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      {/* Side Panel */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[600px] lg:max-w-2xl bg-white dark:bg-gray-950 shadow-2xl z-[70] transform transition-transform duration-500 ease-out flex flex-col border-l border-gray-100 dark:border-gray-800 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <header className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          </div>

          {headerActions}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 backdrop-blur-xl">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
};

export default StoreDetailPanel;
