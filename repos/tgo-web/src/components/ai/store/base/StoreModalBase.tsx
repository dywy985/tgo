import React from 'react';
import { StoreModalBaseProps } from '../types';

const StoreModalBase: React.FC<StoreModalBaseProps> = ({ 
  isOpen, 
  onClose, 
  sidebar, 
  header, 
  children 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-[1400px] h-full max-h-[900px] bg-[#f8fafc] dark:bg-gray-950 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 ease-out">
        
        {/* Sidebar + Main Content */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          {sidebar}

          {/* Main Area */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Header */}
            {header}

            {/* Content area */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreModalBase;
