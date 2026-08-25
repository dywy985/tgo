import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import MarkdownContent from '@/components/chat/MarkdownContent';

interface OnboardingMarkdownModalProps {
  isOpen: boolean;
  title: string;
  content: string;
  onClose: () => void;
}

/**
 * Check if a URL is an external link (absolute URL)
 */
const isExternalLink = (href: string): boolean => {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
};

/**
 * OnboardingMarkdownModal Component
 * Displays markdown content in a modal with custom link handling
 * - External links open in new tab
 * - Internal links (relative paths) use router navigation
 */
const OnboardingMarkdownModal: React.FC<OnboardingMarkdownModalProps> = ({
  isOpen,
  title,
  content,
  onClose,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Handle link clicks within the markdown content
  const handleLinkClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    
    if (!anchor) return;
    
    const href = anchor.getAttribute('href');
    if (!href) return;

    // External link - let browser handle it (opens in new tab via target="_blank")
    if (isExternalLink(href)) {
      return;
    }

    // Internal link - use router navigation
    e.preventDefault();
    onClose();
    navigate(href);
  }, [navigate, onClose]);

  // Attach click handler to the modal content
  useEffect(() => {
    if (!isOpen) return undefined;

    const modalContent = document.querySelector('.onboarding-markdown-modal-content');
    if (!modalContent) return undefined;

    modalContent.addEventListener('click', handleLinkClick as EventListener);
    return () => {
      modalContent.removeEventListener('click', handleLinkClick as EventListener);
    };
  }, [isOpen, handleLinkClick]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use Portal to render modal at document body level for proper full-screen display
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeInScale">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="onboarding-markdown-modal-content px-6 py-6 max-h-[60vh] overflow-y-auto">
          <MarkdownContent
            content={content}
            className="prose prose-blue dark:prose-invert max-w-none"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-lg shadow-blue-500/25"
          >
            {t('onboarding.modal.close', '关闭')}
          </button>
        </div>

        {/* Animation styles */}
        <style>{`
          @keyframes fadeInScale {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          .animate-fadeInScale {
            animation: fadeInScale 0.2s ease-out;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingMarkdownModal;

