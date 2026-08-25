import React, { useState, useEffect } from 'react';
import { Bot, ShieldCheck, Check, Plus, Loader2, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentStoreItem, ToolStoreItem } from '@/types';
import { storeApi } from '@/services/storeApi';
import { StoreDetailPanel } from './store';

interface AgentStoreDetailProps {
  agent: AgentStoreItem | null;
  isOpen: boolean;
  onClose: () => void;
  onInstall: (agent: AgentStoreItem) => void;
  isInstalled: boolean;
  installingId: string | null;
  onModelClick?: (modelId: string) => void;
  onToolClick?: (toolId: string) => void;
}

const AgentStoreDetail: React.FC<AgentStoreDetailProps> = ({ 
  agent, 
  isOpen, 
  onClose, 
  onInstall, 
  isInstalled, 
  installingId, 
  onModelClick, 
  onToolClick 
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const [toolsDetail, setToolsDetail] = useState<ToolStoreItem[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  useEffect(() => {
    const fetchToolsDetail = async () => {
      if (!agent?.recommended_tools?.length) {
        setToolsDetail([]);
        return;
      }
      setLoadingTools(true);
      try {
        const tools = await Promise.all(agent.recommended_tools.map(id => storeApi.getTool(id)));
        setToolsDetail(tools);
      } catch (error) {
        console.error('Failed to fetch tools detail:', error);
      } finally {
        setLoadingTools(false);
      }
    };
    if (isOpen && agent) fetchToolsDetail();
  }, [isOpen, agent?.id]);

  if (!agent) return null;

  const title = currentLang === 'zh' ? (agent.title_zh || agent.name) : (agent.title_en || agent.title_zh || agent.name);
  const description = currentLang === 'zh' ? agent.description_zh : (agent.description_en || agent.description_zh);

  return (
    <StoreDetailPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('modelDetail.details', '员工详情')}
      footer={
        <div className="flex flex-col gap-4">
          <button
            onClick={() => onInstall(agent)}
            disabled={isInstalled || installingId === agent.id}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl ${
              isInstalled 
                ? 'bg-green-500 text-white cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20 active:scale-[0.98]'
            }`}
          >
            {isInstalled ? (
              <><Check className="w-5 h-5" /> {t('common.installed', '已在团队中')}</>
            ) : installingId === agent.id ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> 招聘中...</>
            ) : (
              <><Plus className="w-5 h-5" /> {t('agents.store.hireNow', '立即招聘')}</>
            )}
          </button>
          <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            招聘后该员工将立即出现在您的 AI 员工列表中
          </p>
        </div>
      }
    >
      <div className="space-y-10">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-[2rem] bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-5xl border border-indigo-100 dark:border-indigo-800 overflow-hidden">
            {agent.avatar_url ? (
              <img src={agent.avatar_url} alt={title} className="w-full h-full object-cover" />
            ) : (
              <Bot className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight">{title}</h1>
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.tags?.map(tag => (
                <span key={tag} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-black uppercase tracking-wider rounded-lg">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{t('modelDetail.intro', '员工介绍')}</h3>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
            {description || '暂无详细描述'}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">技能配置</h3>
          <div className="space-y-6">
            <div 
              onClick={() => agent.model?.id && onModelClick?.(agent.model.id)}
              className={`p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 transition-all ${agent.model?.id ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-indigo-200 dark:hover:border-indigo-900 shadow-sm hover:shadow-md' : ''}`}
            >
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">推荐模型</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">{agent.model?.title_zh || agent.model?.name || '通用模型'}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <Wrench className="w-3 h-3" />
                预装工具 ({agent.recommended_tools?.length || 0})
              </div>
              
              {loadingTools ? (
                <div className="p-8 bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">加载工具详情...</span>
                </div>
              ) : toolsDetail.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {toolsDetail.map(tool => (
                    <div 
                      key={tool.id}
                      onClick={() => onToolClick?.(tool.id)}
                      className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-900 hover:bg-white dark:hover:bg-gray-800 transition-all cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-900 flex items-center justify-center text-xl border border-gray-100 dark:border-gray-800">
                        {tool.icon || '🛠️'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                          {currentLang === 'zh' ? (tool.title_zh || tool.name) : (tool.title_en || tool.title_zh || tool.name)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-xs text-gray-400 font-medium">该员工暂无预装工具</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </StoreDetailPanel>
  );
};

export default AgentStoreDetail;
