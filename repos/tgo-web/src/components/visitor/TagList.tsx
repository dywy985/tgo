import React from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { useTranslation } from 'react-i18next';

interface TagListProps {
  tags?: string[];
  onAddTag?: () => void;
}

/**
 * Tag list component for visitor tags
 */
const TagList: React.FC<TagListProps> = ({ tags = [], onAddTag }) => {
  const { t } = useTranslation();
  const handleAddTag = (): void => {
    onAddTag?.();
  };

  return (
    <div className="pt-4 space-y-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('visitor.tags.title', '\u6807\u7b7e')}</h4>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {tags.map((tag, index) => (
          <Badge 
            key={index}
            variant="secondary"
            size="md"
            className="border border-gray-200/80"
          >
            {tag}
          </Badge>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:bg-blue-100 px-1 py-0.5 rounded-full"
          onClick={handleAddTag}
        >
          + {t('visitor.tags.addButton', '\u6dfb\u52a0')}
        </Button>
      </div>
    </div>
  );
};

export default TagList;
