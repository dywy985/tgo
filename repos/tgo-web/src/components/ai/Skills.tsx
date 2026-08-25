import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LuZap, LuSearch, LuLoader } from 'react-icons/lu';
import { Github } from 'lucide-react';
import SkillCard, { type Skill } from './SkillCard';
import SkillFormModal from './SkillFormModal';
import SkillDetailModal from './SkillDetailModal';
import { useToast } from '@/hooks/useToast';
import SkillsApiService, { type SkillSummary } from '@/services/skillsApi';

const Skills: React.FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      const list: SkillSummary[] = await SkillsApiService.listSkills();
      setSkills(
        list.map((s) => ({
          name: s.name,
          description: s.description,
          author: s.author,
          is_official: s.is_official,
          is_featured: s.is_featured,
          tags: s.tags,
          updated_at: s.updated_at,
          enabled: s.enabled,
        })),
      );
    } catch (err) {
      showError(
        t('skills.fetchFailed', '获取技能列表失败'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t, showError]);

  useEffect(() => {
    fetchSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Local search / filter
  // ---------------------------------------------------------------------------
  const filteredSkills = skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ---------------------------------------------------------------------------
  // Import modal
  // ---------------------------------------------------------------------------
  const [isFormOpen, setIsFormOpen] = useState(false);

  const openImportModal = () => {
    setIsFormOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Detail modal (read-only)
  // ---------------------------------------------------------------------------
  const [viewingSkillName, setViewingSkillName] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Toggle skill enabled/disabled (calls backend API)
  // ---------------------------------------------------------------------------
  const handleToggle = useCallback(
    async (skill: Skill, newEnabled: boolean) => {
      // Optimistic update
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skill.name ? { ...s, enabled: newEnabled } : s,
        ),
      );

      try {
        await SkillsApiService.toggleSkill(skill.name, newEnabled);
      } catch (err) {
        // Revert on error
        setSkills((prev) =>
          prev.map((s) =>
            s.name === skill.name ? { ...s, enabled: !newEnabled } : s,
          ),
        );
        showError(
          t('skills.toggleFailed', '切换技能状态失败'),
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [t, showError],
  );

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  const handleDelete = async (skill: Skill) => {
    if (skill.is_official) return;
    const confirmed = window.confirm(
      t('skills.deleteConfirm', '确定要删除技能 "{{name}}" 吗？此操作不可撤销。', { name: skill.name }),
    );
    if (!confirmed) return;

    try {
      await SkillsApiService.deleteSkill(skill.name);
      showSuccess(t('skills.deleteSuccess', '技能已删除'));
      fetchSkills();
    } catch (err) {
      showError(
        t('skills.deleteFailed', '删除技能失败'),
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="flex-grow flex flex-col bg-[#f8fafc] dark:bg-gray-950 overflow-hidden h-full">
      {/* Header */}
      <header className="px-8 py-5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <LuZap className="w-7 h-7 text-blue-600" />
            {t('skills.title', '技能管理')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('skills.subtitle', '为 AI 员工定义可复用的专业指令集')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative group hidden sm:block">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder={t('skills.search.placeholder', '搜索技能...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-48 lg:w-64 bg-gray-100/50 dark:bg-gray-800/50 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl text-sm transition-all outline-none"
            />
          </div>

          <div className="h-8 w-px bg-gray-200 dark:bg-gray-800 mx-1 hidden sm:block" />

          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-95"
            onClick={openImportModal}
          >
            <Github className="w-4 h-4" />
            <span className="hidden lg:inline">{t('skills.import.submit', '导入技能')}</span>
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-[1600px] mx-auto p-8 space-y-8">
          {/* Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200 dark:shadow-none flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
            <div className="relative z-10">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <LuZap className="w-6 h-6" />
                {t('skills.banner.title', '打造专业技能')}
              </h3>
              <p className="text-blue-100 text-sm mt-1 opacity-90 max-w-xl">
                {t(
                  'skills.banner.description',
                  '通过创建技能，您可以将复杂的任务拆解为标准化的指令模板。让 AI 员工像专家一样，遵循最佳实践来完成代码审查、文案创作、数据分析等特定任务。',
                )}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('skills.listTitle', '技能列表')}
              </h3>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <LuLoader className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredSkills.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <LuZap className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {t('skills.empty.title', '暂无技能')}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm text-center">
                  {t('skills.empty.description', '创建您的第一个技能，让 AI 员工更专业')}
                </p>
              </div>
            )}

            {/* Grid */}
            {!isLoading && filteredSkills.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    enabled={skill.enabled}
                    onToggle={handleToggle}
                    onClick={(s) => setViewingSkillName(s.name)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <SkillFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        skill={null}
        onSaved={fetchSkills}
      />

      {/* Detail (read-only) Modal */}
      <SkillDetailModal
        isOpen={!!viewingSkillName}
        onClose={() => setViewingSkillName(null)}
        skillName={viewingSkillName}
      />
    </main>
  );
};

export default Skills;
