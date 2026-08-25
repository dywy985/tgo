import React, { useState, useRef, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTagClasses } from '@/utils/tagColors';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxTagLength?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Tag Input Component
 * Allows users to add and remove tags with visual feedback
 */
export const TagInput: React.FC<TagInputProps> = ({
  tags = [],
  onTagsChange,
  placeholder,
  maxTags = 10,
  maxTagLength = 20,
  disabled = false,
  className = ''
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Use i18n for default placeholder
  const displayPlaceholder = placeholder || t('tagInput.placeholder', '输入标签并按回车键添加');

  // Clear error after a delay
  const clearError = () => {
    setTimeout(() => setError(''), 3000);
  };

  // Validate and add a new tag
  const addTag = (tagName: string) => {
    const trimmedTag = tagName.trim();

    // Validation checks
    if (!trimmedTag) {
      setError(t('tagInput.errors.empty', '标签名称不能为空'));
      clearError();
      return false;
    }

    if (trimmedTag.length > maxTagLength) {
      setError(t('tagInput.errors.tooLong', { max: maxTagLength, defaultValue: `标签名称不能超过${maxTagLength}个字符` }));
      clearError();
      return false;
    }

    if (tags.includes(trimmedTag)) {
      setError(t('tagInput.errors.duplicate', '该标签已存在'));
      clearError();
      return false;
    }

    if (tags.length >= maxTags) {
      setError(t('tagInput.errors.maxReached', { max: maxTags, defaultValue: `最多只能添加${maxTags}个标签` }));
      clearError();
      return false;
    }

    // Add the tag
    const newTags = [...tags, trimmedTag];
    onTagsChange(newTags);
    setInputValue('');
    setError('');
    return true;
  };

  // Remove a tag
  const removeTag = (indexToRemove: number) => {
    const newTags = tags.filter((_, index) => index !== indexToRemove);
    onTagsChange(newTags);
    setError('');
  };

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
        }
        break;
      
      case ',':
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
        }
        break;
      
      case 'Backspace':
        if (!inputValue && tags.length > 0) {
          removeTag(tags.length - 1);
        }
        break;
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Prevent input if it would exceed max length
    if (value.length <= maxTagLength) {
      setInputValue(value);
      setError('');
    }
  };

  // Handle paste event to support multiple tags
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const potentialTags = pastedText.split(/[,，\n\t]/).map(tag => tag.trim()).filter(tag => tag);

    let addedCount = 0;
    for (const tag of potentialTags) {
      if (tags.length + addedCount >= maxTags) {
        setError(t('tagInput.errors.maxReached', { max: maxTags, defaultValue: `最多只能添加${maxTags}个标签` }));
        clearError();
        break;
      }
      if (addTag(tag)) {
        addedCount++;
      }
    }
  };

  // Focus input when container is clicked
  const handleContainerClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className={className}>
      {/* Tag Input Container */}
      <div
        className={`min-h-[40px] w-full px-3 py-2 border rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-colors cursor-text ${
          disabled 
            ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 cursor-not-allowed' 
            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        } ${error ? 'border-red-300 dark:border-red-600 focus-within:ring-red-500 focus-within:border-red-500' : ''}`}
        onClick={handleContainerClick}
      >
        <div className="flex flex-wrap gap-1.5 items-center">
          {/* Existing Tags */}
          {tags.map((tag, index) => (
            <span
              key={index}
              className={`${getTagClasses(tag, {
                size: 'sm',
                includeHover: false,
                includeBorder: true,
                rounded: true
              })} flex items-center gap-1`}
            >
              <span>{tag}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(index);
                  }}
                  className="flex-shrink-0 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
                  title={t('tagInput.removeTag', '删除标签')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          {/* Input Field */}
          {!disabled && tags.length < maxTags && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={tags.length === 0 ? displayPlaceholder : ''}
              className="flex-1 min-w-[120px] outline-none bg-transparent text-sm dark:text-gray-100 dark:placeholder-gray-400"
              disabled={disabled}
            />
          )}
        </div>
      </div>

      {/* Helper Text and Error */}
      <div className="mt-1 flex justify-between items-center text-xs">
        <div className="text-gray-500 dark:text-gray-400">
          {error ? (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          ) : (
            <span>
              {t('tagInput.count', { current: tags.length, max: maxTags, defaultValue: `${tags.length}/${maxTags} 个标签` })}
              {inputValue && ` • ${t('tagInput.currentInput', { current: inputValue.length, max: maxTagLength, defaultValue: `当前输入: ${inputValue.length}/${maxTagLength} 字符` })}`}
            </span>
          )}
        </div>

        {!disabled && (
          <div className="text-gray-400 dark:text-gray-500">
            {t('tagInput.hint', '回车或逗号添加标签')}
          </div>
        )}
      </div>
    </div>
  );
};

export default TagInput;
