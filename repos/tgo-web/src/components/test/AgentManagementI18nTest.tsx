import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Test component to verify Agent Management i18n implementation
 */
const AgentManagementI18nTest: React.FC = () => {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Agent Management i18n Test</h1>
        <button
          onClick={toggleLanguage}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Switch to {i18n.language === 'zh' ? 'English' : '中文'}
        </button>
        <p className="mt-2 text-sm text-gray-600">
          Current language: {i18n.language}
        </p>
      </div>

      <div className="space-y-6">
        {/* Page Title and Actions */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Page Title & Actions</h2>
          <div className="space-y-2">
            <p><strong>Title:</strong> {t('agents.title', 'AI员工管理')}</p>
            <p><strong>Create:</strong> {t('agents.actions.create', '创建AI员工')}</p>
            <p><strong>Refresh:</strong> {t('agents.actions.refresh', '刷新')}</p>
            <p><strong>Edit:</strong> {t('agents.actions.edit', '编辑AI员工')}</p>
            <p><strong>Delete:</strong> {t('agents.actions.delete', '删除AI员工')}</p>
          </div>
        </section>

        {/* Messages */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Messages</h2>
          <div className="space-y-2">
            <p><strong>Load Failed:</strong> {t('agents.messages.loadFailed', '加载失败')}</p>
            <p><strong>Load Failed Desc:</strong> {t('agents.messages.loadFailedDesc', '无法加载AI员工列表，请稍后重试')}</p>
            <p><strong>Refresh Success:</strong> {t('agents.messages.refreshSuccess', '刷新成功')}</p>
            <p><strong>Create Success:</strong> {t('agents.messages.createSuccessDesc', 'AI员工 "{name}" 已成功创建', { name: 'Test Agent' })}</p>
            <p><strong>Delete Success:</strong> {t('agents.messages.deleteSuccessDesc', 'AI员工 "{name}" 已删除', { name: 'Test Agent' })}</p>
          </div>
        </section>

        {/* Card Content */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Card Content</h2>
          <div className="space-y-2">
            <p><strong>Default Role:</strong> {t('agents.card.defaultRole', 'AI员工')}</p>
            <p><strong>No Tools:</strong> {t('agents.card.noTools', '未关联工具')}</p>
            <p><strong>No Knowledge Bases:</strong> {t('agents.card.noKnowledgeBases', '未关联知识库')}</p>
            <p><strong>LLM Label:</strong> {t('agents.card.llmLabel', 'LLM')}</p>
            <p><strong>Edit Tooltip:</strong> {t('agents.card.editTooltip', '编辑AI员工')}</p>
            <p><strong>View More:</strong> {t('agents.actions.viewMore', '查看更多')}</p>
            <p><strong>Collapse:</strong> {t('agents.actions.collapse', '收起')}</p>
          </div>
        </section>

        {/* Empty State */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Empty State</h2>
          <div className="space-y-2">
            <p><strong>Title:</strong> {t('agents.empty.title', '暂无AI员工')}</p>
            <p><strong>Description:</strong> {t('agents.empty.description', '点击「创建AI员工」按钮开始创建您的第一个AI员工')}</p>
          </div>
        </section>

        {/* Error State */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Error State</h2>
          <div className="space-y-2">
            <p><strong>Title:</strong> {t('agents.error.title', '加载失败')}</p>
            <p><strong>Retry:</strong> {t('agents.error.retry', '重试')}</p>
          </div>
        </section>

        {/* Modal Content */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Modal Content</h2>
          <div className="space-y-2">
            <p><strong>Create Title:</strong> {t('agents.modal.create.title', '创建AI员工')}</p>
            <p><strong>Edit Title:</strong> {t('agents.modal.edit.title', '编辑AI员工')}</p>
            <p><strong>Delete Title:</strong> {t('agents.modal.delete.title', '删除AI员工')}</p>
            <p><strong>Delete Message:</strong> {t('agents.modal.delete.message', '确定要删除AI员工 "{name}" 吗？此操作不可撤销。', { name: 'Test Agent' })}</p>
            <p><strong>Delete Confirm:</strong> {t('agents.modal.delete.confirm', '删除')}</p>
            <p><strong>Delete Cancel:</strong> {t('agents.modal.delete.cancel', '取消')}</p>
          </div>
        </section>

        {/* Pagination */}
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Pagination</h2>
          <div className="space-y-2">
            <p><strong>Previous:</strong> {t('agents.pagination.previous', 'Previous')}</p>
            <p><strong>Next:</strong> {t('agents.pagination.next', 'Next')}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AgentManagementI18nTest;
