import type { KnowledgeBaseStatus } from '@/types';

/**
 * Knowledge base status configuration
 */
export const KNOWLEDGE_BASE_STATUS: Record<KnowledgeBaseStatus, {
  label: string;
  bgColor: string;
  textColor: string;
}> = {
  published: {
    label: '已发布',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700'
  },
  draft: {
    label: '草稿',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700'
  },
  archived: {
    label: '已归档',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700'
  }
};

