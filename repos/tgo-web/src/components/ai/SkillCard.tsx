import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Sparkles, ShieldCheck, User, Clock, Trash2, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Skill data shape matching the backend SkillSummary response. */
export interface Skill {
  name: string;
  description: string;
  author: string | null;
  is_official: boolean;
  is_featured: boolean;
  tags: string[];
  updated_at: string | null;
  enabled: boolean;
}

interface SkillCardProps {
  skill: Skill;
  enabled: boolean;
  onToggle: (skill: Skill, enabled: boolean) => void;
  onClick: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

/** Format an ISO date string to a human-readable locale string. */
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, enabled, onToggle, onClick, onDelete }) => {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <div
      className={`group relative bg-white dark:bg-gray-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border h-full cursor-pointer ${
        enabled
          ? 'border-gray-100 dark:border-gray-700'
          : 'border-gray-100 dark:border-gray-700 opacity-60'
      }`}
      onClick={() => onClick(skill)}
    >
      <div>
        {/* Header: title + toggle */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base truncate" title={skill.name}>
              {skill.name}
            </h3>
            {skill.is_featured && (
              <Sparkles className="w-4 h-4 text-blue-500 fill-blue-500/20 flex-shrink-0" />
            )}
          </div>

          {/* Toggle switch - top right, aligned with title */}
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onToggle(skill, !enabled)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none"
              style={{ backgroundColor: enabled ? '#3b82f6' : '#d1d5db' }}
              title={enabled ? t('skills.disable', '禁用技能') : t('skills.enable', '启用技能')}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-3">
            {skill.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
              >
                {tag}
              </span>
            ))}
            {skill.tags.length > 3 && (
              <span className="px-1.5 py-0.5 text-[10px] text-gray-400">+{skill.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6 line-clamp-3 h-[4.5em]">
          {skill.description}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {skill.is_official ? (
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
            <span className="truncate max-w-[80px]">
              {skill.is_official ? t('common.official', '官方') : (skill.author || '-')}
            </span>
          </div>
          <div className="w-px h-3 bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{formatDate(skill.updated_at)}</span>
          </div>
        </div>

        {/* Menu (view / delete) */}
        {!skill.is_official && (
          <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 bottom-full mb-2 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onClick(skill);
                  }}
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 mr-2" /> {t('common.view', '查看')}
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(skill);
                  }}
                  className="w-full flex items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> {t('common.delete', '删除')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillCard;
