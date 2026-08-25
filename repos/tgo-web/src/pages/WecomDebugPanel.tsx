import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api';
import { FiSend, FiMessageSquare, FiCpu, FiRefreshCw } from 'react-icons/fi';

interface WecomSession {
  from_user: string;
  conv_name: string;
  msg_count: number;
  last_at: string | null;
}

interface WecomMessage {
  id: string;
  from_user: string;
  content: string | null;
  sender_name: string | null;
  source_type: string;
  is_question: boolean | null;
  is_from_colleague: boolean | null;
  conv_name: string | null;
  fetched_at: string | null;
  ai_reply: string | null;
}

interface SendResult {
  ok: boolean;
  bridge_status?: number;
  data?: any;
  error?: string;
}

interface TriggerConfig {
  mode: 'hybrid' | 'mention' | 'auto' | 'disabled';
  score_threshold: number;
  llm_prefilter: boolean;
  ignore_members: string[];
}

const WecomDebugPanel: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'messages' | 'send' | 'trigger'>('messages');
  const [sessions, setSessions] = useState<WecomSession[]>([]);
  const [currentConv, setCurrentConv] = useState<string>('');
  const [messages, setMessages] = useState<WecomMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // 发送表单
  const [channel, setChannel] = useState<'worktool' | 'aibot'>('worktool');
  const [sendTitle, setSendTitle] = useState('');
  const [sendChatid, setSendChatid] = useState('');
  const [sendRobot, setSendRobot] = useState('');
  const [sendContent, setSendContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');

  // 触发配置
  const [triggerCfg, setTriggerCfg] = useState<TriggerConfig>({
    mode: 'hybrid', score_threshold: 60, llm_prefilter: false, ignore_members: [],
  });
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [triggerSaved, setTriggerSaved] = useState(false);

  const loadTrigger = useCallback(async () => {
    try {
      const data = await apiClient.get<{ trigger: TriggerConfig }>('/v1/debug/wecom/trigger');
      setTriggerCfg({ ...data.trigger });
    } catch (e: any) {
      setError('加载触发配置失败: ' + (e?.getUserMessage?.() || e?.message || e));
    }
  }, []);

  const saveTrigger = async () => {
    setSavingTrigger(true);
    setTriggerSaved(false);
    try {
      await apiClient.put('/v1/debug/wecom/trigger', {
        trigger: {
          ...triggerCfg,
          ignore_members: triggerCfg.ignore_members.join(',').split(/[,，\s]+/).map((s: string) => s.trim()).filter(Boolean),
        },
      });
      setTriggerSaved(true);
      setError('');
      setTimeout(() => setTriggerSaved(false), 2000);
    } catch (e: any) {
      setError('保存触发配置失败: ' + (e?.getUserMessage?.() || e?.message || e));
    } finally {
      setSavingTrigger(false);
    }
  };

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await apiClient.get<{ count: number; sessions: WecomSession[] }>('/v1/debug/wecom/sessions');
      setSessions(data.sessions || []);
      setError('');
    } catch (e: any) {
      setError('加载会话失败: ' + (e?.getUserMessage?.() || e?.message || e));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMessages = useCallback(async (conv: string) => {
    setLoadingMsgs(true);
    try {
      const data = await apiClient.get<{ count: number; messages: WecomMessage[] }>(
        '/v1/debug/wecom/messages?conv=' + encodeURIComponent(conv) + '&limit=300'
      );
      setMessages(data.messages || []);
    } catch (e: any) {
      setError('加载消息失败: ' + (e?.getUserMessage?.() || e?.message || e));
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => { loadSessions(); loadTrigger(); }, [loadSessions, loadTrigger]);

  const selectConv = (conv: string, name: string) => {
    setCurrentConv(conv);
    setSendTitle(name);
    loadMessages(conv);
  };

  const doSend = async () => {
    if (!sendContent.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      if (channel === 'worktool') {
        if (!sendTitle.trim()) { setError('群名必填'); setSending(false); return; }
        const data = await apiClient.post<SendResult>('/v1/debug/wecom/send/worktool', {
          title: sendTitle, content: sendContent, robot_id: sendRobot,
        });
        setSendResult(data);
      } else {
        if (!sendChatid.trim()) { setError('chatid 必填'); setSending(false); return; }
        const data = await apiClient.post<SendResult>('/v1/debug/wecom/send/aibot', {
          chatid: sendChatid, content: sendContent,
        });
        setSendResult(data);
      }
      setError('');
    } catch (e: any) {
      setError('发送失败: ' + (e?.getUserMessage?.() || e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (s: string | null) => {
    if (!s) return '';
    try { return new Date(s).toLocaleString('zh-CN', { hour12: false }); } catch { return s; }
  };

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">企微通道调试</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            wecom-reader 群聊数据（来自 TGO inbox）+ WorkTool / aibot 发送工具
          </p>
        </div>
        <button
          onClick={() => { loadSessions(); if (currentConv) loadMessages(currentConv); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100"
        >
          <FiRefreshCw /> {t('common.refresh', '刷新')}
        </button>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">{error}</div>}

      <div className="flex gap-1 mb-2">
        {([
          ['messages', '聊天记录'],
          ['send', '发送调试'],
          ['trigger', '触发设置'],
        ] as Array<['messages' | 'send' | 'trigger', string]>).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${
              tab === id ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >{label}</button>
        ))}
      </div>

      {tab !== 'trigger' ? (
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 会话列表 */}
        <div className="w-56 shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
            群聊会话 ({sessions.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingSessions && <div className="p-3 text-xs text-gray-400">加载中...</div>}
            {!loadingSessions && sessions.length === 0 && (
              <div className="p-3 text-xs text-gray-400">暂无数据（bridge 全量转发后出现）</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.from_user}
                onClick={() => selectConv(s.from_user, s.conv_name)}
                className={`px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 ${
                  currentConv === s.from_user ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{s.conv_name}</div>
                <div className="text-xs text-gray-400">{s.from_user} · {s.msg_count}条</div>
              </div>
            ))}
          </div>
        </div>

        {/* 聊天记录 */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
            {currentConv ? (messages[0]?.conv_name || currentConv) : '选择会话查看'}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingMsgs && <div className="text-xs text-gray-400">加载中...</div>}
            {!loadingMsgs && currentConv && messages.length === 0 && (
              <div className="text-xs text-gray-400">该会话暂无消息</div>
            )}
            {!currentConv && !loadingMsgs && (
              <div className="text-xs text-gray-400">← 左侧选择群聊查看消息记录</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[85%] ${m.is_from_colleague ? 'ml-auto text-right' : ''}`}>
                <div className="text-xs text-gray-400 mb-0.5">
                  {m.sender_name || '未知'} · {fmtTime(m.fetched_at)}
                  {m.is_question && <span className="ml-1 text-blue-500">[问句]</span>}
                  {m.source_type === 'worktool' && <span className="ml-1 text-purple-500">[WT]</span>}
                </div>
                <div className={`inline-block rounded-lg px-3 py-1.5 text-sm break-all ${
                  m.is_from_colleague
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-gray-800 dark:text-gray-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}>
                  {m.content || '(非文本)'}
                </div>
                {m.ai_reply && (
                  <div className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">AI: {m.ai_reply.slice(0, 120)}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 发送工具 */}
        <div className="w-72 shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <FiSend /> 发送调试
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setChannel('worktool')}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium ${
                channel === 'worktool' ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >WorkTool</button>
            <button
              onClick={() => setChannel('aibot')}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium ${
                channel === 'aibot' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >aibot</button>
          </div>

          {channel === 'worktool' ? (
            <>
              <label className="text-xs text-gray-500 dark:text-gray-400">目标群名（精确匹配）</label>
              <input
                value={sendTitle}
                onChange={(e) => setSendTitle(e.target.value)}
                placeholder="如：K6客户群"
                className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
              <label className="text-xs text-gray-500 dark:text-gray-400">robot_id（可选，留空用平台配置）</label>
              <input
                value={sendRobot}
                onChange={(e) => setSendRobot(e.target.value)}
                placeholder="手机生成的 robot_id"
                className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </>
          ) : (
            <>
              <label className="text-xs text-gray-500 dark:text-gray-400">chatid（wr_ 开头）</label>
              <input
                value={sendChatid}
                onChange={(e) => setSendChatid(e.target.value)}
                placeholder="如：wrT0WARQAA..."
                className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </>
          )}

          <label className="text-xs text-gray-500 dark:text-gray-400">消息内容</label>
          <textarea
            value={sendContent}
            onChange={(e) => setSendContent(e.target.value)}
            placeholder="输入要发送的内容..."
            rows={4}
            className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none"
          />

          <button
            onClick={doSend}
            disabled={sending}
            className={`px-3 py-2 rounded-md text-sm font-medium text-white ${
              channel === 'worktool' ? 'bg-teal-500 hover:bg-teal-600' : 'bg-purple-500 hover:bg-purple-600'
            } disabled:opacity-50`}
          >
            {sending ? '发送中...' : '发送'}
          </button>

          {sendResult && (
            <div className={`text-xs rounded-md p-2 break-all ${
              sendResult.ok ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(sendResult, null, 2)}</pre>
            </div>
          )}

          <div className="text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2 mt-auto">
            <div className="flex items-center gap-1 mb-1"><FiMessageSquare /> 数据来源</div>
            <p>群聊记录来自 TGO inbox（bridge 全量转发）。</p>
            <p className="mt-1 flex items-center gap-1"><FiCpu /> 发送走 tgo-api 代理 → bridge 通道服务。</p>
          </div>
        </div>
      </div>
      ) : (
      /* ---------- 触发设置 ---------- */
      <div className="max-w-lg bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">AI 触发规则</div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          消息进入后会先做规则评分（0-100，零 token），再按此配置决定是否调用 AI 回答。
          @机器人 的消息<b>必定回复</b>（不占评分）。
        </p>

        <label className="text-xs text-gray-500 dark:text-gray-400">触发模式</label>
        <select
          value={triggerCfg.mode}
          onChange={(e) => setTriggerCfg({ ...triggerCfg, mode: e.target.value as TriggerConfig['mode'] })}
          className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="hybrid">hybrid（@必回 + 评分达标自动回）</option>
          <option value="auto">auto（纯评分，不@也回高分问题）</option>
          <option value="mention">mention（仅 @机器人 才回）</option>
          <option value="disabled">disabled（关闭 AI 自动回复）</option>
        </select>

        <label className="text-xs text-gray-500 dark:text-gray-400">评分阈值（0-100，默认 60）</label>
        <input
          type="number" min={1} max={100}
          value={triggerCfg.score_threshold}
          onChange={(e) => setTriggerCfg({ ...triggerCfg, score_threshold: Number(e.target.value) })}
          className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        />
        <div className="text-xs text-gray-400">
          参考：问句+40 ｜ 求助词(报错/打不开/登录不上)+40 ｜ 疑问词(怎么/如何)+30 ｜ 产品词(K6/K8/K9)+20 ｜ 广告-50 ｜ 闲聊-30
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={triggerCfg.llm_prefilter}
            onChange={(e) => setTriggerCfg({ ...triggerCfg, llm_prefilter: e.target.checked })}
            className="w-4 h-4"
          />
          LLM 预判（模糊区消息交给 AI 判断是否客户问题，每次约 200 token）
        </label>

        <label className="text-xs text-gray-500 dark:text-gray-400">忽略成员（逗号分隔，这些人的消息不触发 AI）</label>
        <input
          value={triggerCfg.ignore_members.join(',')}
          onChange={(e) => setTriggerCfg({ ...triggerCfg, ignore_members: e.target.value.split(',') })}
          placeholder="如：张三,李四"
          className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        />

        <button
          onClick={saveTrigger}
          disabled={savingTrigger}
          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
        >
          {savingTrigger ? '保存中...' : '保存配置'}
        </button>
        {triggerSaved && <div className="text-xs text-teal-600 dark:text-teal-400">✓ 已保存</div>}
      </div>
      )}
    </div>
  );
};

export default WecomDebugPanel;
