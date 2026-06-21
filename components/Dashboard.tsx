import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  Clock3,
  Database,
  Eye,
  ExternalLink,
  Globe2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { PERSONA_PROFILES } from '../constants';
import { AgentConversation, AgentConversationMessage, AgentRunResult, AgentSkillPhase, AppState } from '../types';

type DetailTab = 'overview' | 'vision' | 'knowledge' | 'skill' | 'trace' | 'ops';

type FollowUpMessageMap = Record<string, AgentConversationMessage[]>;

type ActiveFollowUp = {
  conversationId: string;
  conversationKeys: string[];
  messageId: string;
  sentAt: number;
};

const statusTone: Record<string, string> = {
  done: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  running: 'border-aether-400/30 bg-aether-500/10 text-aether-100',
  queued: 'border-white/15 bg-white/5 text-white/65',
  paused: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  skipped: 'border-white/10 bg-white/[0.03] text-white/35',
  pass: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  warn: 'border-yellow-400/30 bg-yellow-500/10 text-yellow-200',
  block: 'border-red-400/30 bg-red-500/10 text-red-200',
};

const sourceTone: Record<string, string> = {
  live: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  cache: 'border-yellow-400/30 bg-yellow-500/10 text-yellow-200',
  error: 'border-red-400/30 bg-red-500/10 text-red-200',
};

const sourceLabel: Record<string, string> = {
  live: '实时模型结果',
  cache: '历史缓存回放',
  error: '错误',
};

const phaseLabel: Record<AgentSkillPhase, string> = {
  observe: '观察',
  context: '上下文',
  knowledge: '知识',
  reason: '推理',
  answer: '回答',
  guard: '守护',
};

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'vision', label: '视觉观察' },
  { id: 'knowledge', label: '知识' },
  { id: 'skill', label: 'Skill' },
  { id: 'trace', label: 'Trace' },
  { id: 'ops', label: '错误/后台' },
];

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const looksGarbled = (value?: string) => /[�]|[鎴鏄浠闂绛鍘鏆鍙鐢鍦鍛瑙妯鐘榧閫鎵鏈鍚娓瀹鐜鑷閲劍劊]{2,}/.test(String(value || ''));

const displayText = (value: string | undefined, fallback: string) => {
  const text = String(value || '').trim();
  return text && !looksGarbled(text) ? text : fallback;
};

const conversationTitle = (conversation?: AgentConversation) => (
  displayText(conversation?.title || conversation?.lastObservation?.summary, '历史会话')
);

const runUnavailable = (conversation?: AgentConversation, run?: AgentRunResult) => (
  conversation && !run ? '当前会话暂无可回显详情，建议重新触发扫码并等待返回。' : ''
);

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>();
  const [run, setRun] = useState<AgentRunResult>();
  const [allConversations, setAllConversations] = useState<AgentConversation[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [followUpText, setFollowUpText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [inFlightMessages, setInFlightMessages] = useState<FollowUpMessageMap>({});
  const [activeFollowUp, setActiveFollowUp] = useState<ActiveFollowUp | null>(null);
  const [thinkingDots, setThinkingDots] = useState(0);
  const [notice, setNotice] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const opsMessageListRef = useRef<HTMLDivElement>(null);

  const loadDisplayRun = async (nextState: AppState) => {
    const conversation = nextState.currentConversation;
    if (conversation?.lastRunSnapshot) return conversation.lastRunSnapshot;
    if (conversation?.lastRunId && window.aether) return window.aether.getRun(conversation.lastRunId);
    return nextState.latestRun;
  };

  const refresh = async () => {
    if (!window.aether) return;
    const [nextState, conversations] = await Promise.all([
      window.aether.getState(),
      window.aether.getConversations({ includeAll: true, limit: 200 }),
    ]);
    setState(nextState);
    setAllConversations(conversations);
    setRun(await loadDisplayRun(nextState));
  };

  const conversationKeys = (conversation?: AgentConversation | null) => {
    if (!conversation?.id) return [];
    const keys = new Set<string>([conversation.id]);
    if (conversation.accountKey) keys.add(`${conversation.accountKey}::${conversation.id}`);
    return [...keys];
  };

  const dedupeMessages = (items: AgentConversationMessage[]) => {
    const map = new Map<string, AgentConversationMessage>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return [...map.values()];
  };

  const clearInFlightByConversation = (keys?: string[]) => {
    if (!keys?.length) return;
    setInFlightMessages(previous => {
      const next = { ...previous };
      let touched = false;
      for (const key of keys) {
        if (!(key in next)) continue;
        delete next[key];
        touched = true;
      }
      return touched ? next : previous;
    });
  };

  const appendInFlightMessage = (keys: string[], message: AgentConversationMessage) => {
    if (!keys.length) return;
    setInFlightMessages(previous => ({
      ...previous,
      ...keys.reduce((acc, key) => ({ ...acc, [key]: [...(previous[key] || []), message] }), {}),
    }));
  };

  useEffect(() => {
    void refresh();
    const removeRun = window.aether?.onRunComplete(nextRun => {
      setRun(nextRun);
      void refresh();
    });
    const removeSettings = window.aether?.onSettingsChanged(settings => setState(previous => previous ? { ...previous, settings } : previous));
    const removeConversationOpened = window.aether?.onConversationOpened(payload => {
      setState(previous => previous ? { ...previous, currentConversation: payload.conversation, latestRun: payload.run || previous.latestRun } : previous);
      setRun(payload.run);
      setActiveTab('overview');
      void refresh();
    });
    const removeConversationDeleted = window.aether?.onConversationDeleted(() => void refresh());
    const removeConversationsCleared = window.aether?.onConversationsCleared(() => void refresh());
    return () => {
      removeRun?.();
      removeSettings?.();
      removeConversationOpened?.();
      removeConversationDeleted?.();
      removeConversationsCleared?.();
    };
  }, []);
  const askFollowUp = async () => {
    const text = followUpText.trim();
    const conversation = state?.currentConversation;
    if (!window.aether || !conversation || !text || chatBusy) return;
    const resolvedAccountKey = conversation.accountKey || 'local:default';
    const targetConversationKeys = conversationKeys(conversation);
    if (!targetConversationKeys.length) {
      setNotice('当前没有可追问的会话，请先选择或刷新后再试。');
      return;
    }
    const sentAt = Date.now();
    const optimisticMessage: AgentConversationMessage = {
      id: `pending-user-${sentAt}`,
      role: 'user',
      text,
      timestamp: sentAt,
    };
    appendInFlightMessage(targetConversationKeys, optimisticMessage);
    setActiveFollowUp({
      conversationId: conversation.id,
      conversationKeys: targetConversationKeys,
      messageId: optimisticMessage.id,
      sentAt,
    });
    setFollowUpText('');
    setChatBusy(true);
    setNotice('');
    try {
      const nextRun = await window.aether.askConversation({
        conversationId: conversation.id,
        ...(resolvedAccountKey ? { accountKey: resolvedAccountKey } : {}),
        query: text,
        persona: state?.settings.persona,
        scene: conversation.scene || run?.scene || 'unknown',
        parentRunId: conversation.lastRunId || run?.id,
      });
      const opened = await window.aether.openConversation({
        accountKey: resolvedAccountKey,
        conversationId: conversation.id,
      });
      setState(previous => previous ? {
        ...previous,
        currentConversation: opened.conversation,
        latestRun: opened.run || nextRun || previous.latestRun,
      } : previous);
      setRun(opened.run || nextRun);
      await refresh();
      clearInFlightByConversation(targetConversationKeys);
      setNotice('继续追问已发送，等待以太返回。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '追问失败，请稍后再试';
      appendInFlightMessage(targetConversationKeys, {
        id: `pending-error-${Date.now()}`,
        role: 'model',
        text: `追问失败：${message}`,
        timestamp: Date.now(),
      });
      setNotice(message);
    } finally {
      setChatBusy(false);
      setActiveFollowUp(null);
    }
  };

  const deleteHistory = async (target: AgentConversation) => {
    if (!window.aether) return;
    if (deleteConfirm !== target.id) {
      setDeleteConfirm(target.id);
      setNotice('再次点击删除按钮，确认后删除该会话。');
      return;
    }
    const result = await window.aether.deleteConversation({
      accountKey: target.accountKey,
      conversationId: target.id,
      deleteLinkedRuns: true,
    });
    setDeleteConfirm('');
    setNotice(result.deleted ? ('会话已删除，共清理 ' + String(result.runsDeleted) + ' 条运行记录。') : '目标会话不存在。');
    await refresh();
  };

  const clearHistory = async (scope: 'account' | 'all') => {
    if (!window.aether) return;
    const key = 'clear:' + scope;
    if (deleteConfirm !== key) {
      setDeleteConfirm(key);
      setNotice(
        scope === 'all'
          ? '再次点击确认，清空全部会话；请注意该操作不可撤销。'
          : '再次点击确认，清空当前账号会话；请注意该操作不可撤销。',
      );
      return;
    }
    const result = await window.aether.clearConversations({
      accountKey: state?.currentConversation?.accountKey || run?.accountKey,
      includeAll: scope === 'all',
      deleteLinkedRuns: true,
      clearMemory: true,
    });
    setDeleteConfirm('');
    setNotice(
      scope === 'all'
        ? '已清空全部会话，共删除 ' + String(result.cleared) + ' 条。'
        : '已清空当前账号会话，共删除 ' + String(result.cleared) + ' 条。',
    );
    await refresh();
  };
  const openConversation = async (item: AgentConversation) => {
    if (!window.aether) return;
    const opened = await window.aether.openConversation({
      accountKey: item.accountKey,
      conversationId: item.id,
    });
    setState(previous => previous ? {
      ...previous,
      currentConversation: opened.conversation,
      latestRun: opened.run || previous.latestRun,
    } : previous);
    setRun(opened.run);
    await refresh();
  };
  const conversation = state?.currentConversation;
  useEffect(() => {
    if (!chatBusy) {
      setThinkingDots(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setThinkingDots(value => (value + 1) % 7);
    }, 320);
    return () => window.clearInterval(timer);
  }, [chatBusy]);

  useEffect(() => {
    const node = opsMessageListRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [conversation?.messages.length, chatBusy, thinkingDots, Object.values(inFlightMessages).reduce((acc, curr) => acc + curr.length, 0)]);

  const currentConversationKeys = conversation ? conversationKeys(conversation) : [];
  const inFlightForCurrent = dedupeMessages(currentConversationKeys.flatMap(key => inFlightMessages[key] || []));
  const shouldShowThinking = chatBusy && activeFollowUp?.conversationId === conversation?.id;
  const thinkingMessage: AgentConversationMessage | undefined = shouldShowThinking ? {
    id: 'pending-thinking',
    role: 'model',
    text: `以太思考中${'.'.repeat(thinkingDots)}`,
    timestamp: Date.now(),
  } : undefined;
  const visibleConversationMessages = [
    ...(conversation?.messages || []),
    ...inFlightForCurrent,
    ...(thinkingMessage ? [thinkingMessage] : []),
  ];
  const profile = PERSONA_PROFILES.find(item => item.id === state?.settings.persona);
  const activeSkills = run?.skills.filter(item => item.status === 'done').length ?? 0;
  const skillGroups = useMemo(() => {
    const groups = new Map<AgentSkillPhase, NonNullable<AgentRunResult['skills']>>();
    for (const skill of run?.skills || []) {
      const phase = skill.phase || 'reason';
      groups.set(phase, [...(groups.get(phase) || []), skill]);
    }
    return [...groups.entries()];
  }, [run]);

  return (
    <div className="min-h-screen bg-[#06080b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(45,212,191,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <nav className="sticky top-0 z-10 border-b border-white/10 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex h-24 max-w-[1500px] items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => window.aether?.closeCurrentWindow()} className="p-2 text-white/60 hover:bg-white/10 hover:text-white" title="关闭窗口">
              <ArrowLeft size={17} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-aether-300"><BrainCircuit size={18} /><span className="text-xs tracking-[0.25em]">以太后台</span></div>
              <h1 className="mt-1 text-xl font-semibold">会话后台</h1>
              <p className="mt-1 text-xs text-white/38">查看会话、技能、Trace 与报错记录</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="border border-white/10 bg-white/5 px-3 py-1 text-white/55">运行环境 {profile?.name || '默认'}</span>
            <span className="border border-aether-400/25 bg-aether-500/10 px-3 py-1 text-aether-200">知识库 {state?.runtime.knowledgeVersion || '未加载'}</span>
            <span className="border border-white/10 bg-white/5 px-3 py-1 text-white/55">打开账号 {state?.runtime.accountCount || 0}</span>
            <button onClick={() => void refresh()} className="border border-white/10 p-2 text-white/55 hover:text-white"><RefreshCw size={14} /></button>
          </div>
        </div>
      </nav>

      <main className="relative z-[1] mx-auto grid max-w-[1500px] gap-5 px-6 py-7 lg:grid-cols-[340px_1fr]">
        <aside className="h-[calc(100vh-116px)] overflow-hidden border border-white/10 bg-black/55">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-aether-200"><MessageSquare size={17} />全部会话</h2>
            <span className="text-xs text-white/35">{allConversations.length} 条</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/40">点击会话可快速切换，默认显示最近扫描与运行详情</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => void clearHistory('account')} className={`border px-2 py-1 text-xs transition ${deleteConfirm === 'clear:account' ? 'border-red-300/50 text-red-100' : 'border-white/10 text-white/45 hover:text-white'}`}>清空当前</button>
              <button onClick={() => void clearHistory('all')} className={`border px-2 py-1 text-xs transition ${deleteConfirm === 'clear:all' ? 'border-red-300/50 text-red-100' : 'border-white/10 text-white/45 hover:text-white'}`}>清空全部</button>
            </div>
          </div>
          <div className="h-[calc(100%-84px)] space-y-2 overflow-auto p-3">
            {allConversations.length ? allConversations.map(item => (
              <div
                key={`${item.accountKey}-${item.id}`}
                role="button"
                tabIndex={0}
                onClick={() => void openConversation(item)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') void openConversation(item);
                }}
                className={`w-full border p-3 text-left transition ${conversation?.id === item.id ? 'border-aether-300/45 bg-aether-300/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-aether-300/30'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium leading-5 text-white/78">{conversationTitle(item)}</p>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={event => {
                      event.stopPropagation();
                      void deleteHistory(item);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteHistory(item);
                      }
                    }}
                    className={`shrink-0 border p-1 ${deleteConfirm === item.id ? 'border-red-300/50 text-red-100' : 'border-white/10 text-white/30 hover:text-red-100'}`}
                    title="删除这条本地历史"
                  >
                    <Trash2 size={13} />
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/35">{item.accountKey}</p>
                <p className="mt-1 text-xs text-white/35">{formatTime(item.updatedAt)} · {Math.ceil(item.messageCount / 2)} 轮</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/42">{displayText(item.lastObservation?.summary || item.messages[item.messages.length - 1]?.text, '暂无摘要')}</p>
              </div>
            )) : (
              <p className="border border-dashed border-white/10 p-4 text-sm leading-6 text-white/35">没有历史会话，先按 Alt+Q 或“解读当前界面”开始扫描后再切换查看。</p>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="border border-aether-400/20 bg-aether-500/[0.06] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs tracking-[0.25em] text-white/35">当前查看</p>
                <h2 className="mt-2 break-words text-2xl font-semibold">{conversationTitle(conversation) || run?.observation.summary || '当前会话暂无摘要'}</h2>
                   <p>{runUnavailable(conversation, run) || '未检测到可回显结果，Alt+Q 先完成一次画面解读后再试。'}</p>
              </div>
              {run ? <span className={`shrink-0 border px-2 py-1 text-xs ${sourceTone[run.source]}`}>{sourceLabel[run.source]}</span> : null}
            </div>
            <div className="mt-4 grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
              <Metric label="运行模型" value={run?.model || '未知'} mono />
              <Metric label="请求ID" value={run?.requestId || '未知'} mono />
              <Metric label="耗时" value={run ? `${run.metrics.latencyMs} ms` : '未知'} />
              <Metric label="完成Skill" value={run ? `${activeSkills} 条` : '0 条'} />
              <Metric label="账号" value={conversation?.accountKey || run?.accountKey || 'local:default'} />
              <Metric label="会话轮次" value={conversation ? `${Math.ceil(conversation.messageCount / 2)} 轮` : '0 轮'} />
            </div>
            {conversation ? (
              <div className="mt-4 flex gap-2">
                <textarea
                  value={followUpText}
                  onChange={event => setFollowUpText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void askFollowUp();
                    }
                  }}
                  placeholder="继续追问这条历史会话"
                  className="min-h-14 flex-1 resize-none border border-white/10 bg-[#08121a] px-3 py-2 text-sm text-white/75 outline-none placeholder:text-white/25 focus:border-aether-300/45"
                />
                <button
                  onClick={() => void askFollowUp()}
                  disabled={!followUpText.trim() || chatBusy}
                  className="flex h-14 w-14 items-center justify-center bg-aether-300 text-[#071018] transition hover:bg-aether-200 disabled:opacity-35"
                  title="发送"
                >
                  <Send size={17} />
                </button>
              </div>
            ) : null}
            {notice && <p className="mt-3 text-xs text-aether-100/75">{notice}</p>}
          </div>

          <div className="border border-white/10 bg-black/55">
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-xs transition ${activeTab === tab.id ? 'bg-aether-300 text-[#071018]' : 'text-white/55 hover:bg-white/8 hover:text-white'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-5">
              {run ? (
                <>
                  {activeTab === 'overview' && <OverviewTab run={run} messages={visibleConversationMessages} messageListRef={opsMessageListRef} />}
                  {activeTab === 'vision' && <VisionTab run={run} />}
                  {activeTab === 'knowledge' && <KnowledgeTab run={run} state={state} />}
                  {activeTab === 'skill' && <SkillTab groups={skillGroups} />}
                  {activeTab === 'trace' && <TraceTab run={run} />}
                  {activeTab === 'ops' && <OpsTab run={run} />}
                </>
              ) : (
                <section className="border border-dashed border-white/15 bg-white/[0.02] p-12 text-center text-white/40">
                  <Activity className="mx-auto mb-4" />
                   <p>{runUnavailable(conversation, run) || '未检测到可回显结果，Alt+Q 先完成一次画面解读后再试。'}</p>
                  {visibleConversationMessages.length ? (
                    <div ref={opsMessageListRef} className="mx-auto mt-5 max-w-2xl space-y-2 text-left" aria-live="polite">
                      {visibleConversationMessages.slice(-6).map(message => <MessagePreview key={message.id} role={message.role} text={message.text} />)}
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="border border-white/10 bg-black/30 p-3">
    <span className="text-white/35">{label}</span>
    <p className={`mt-1 break-all text-white/68 ${mono ? 'font-mono' : ''}`}>{value}</p>
  </div>
);

const MessagePreview: React.FC<{ role: string; text: string }> = ({ role, text }) => (
  <div className="border border-white/10 bg-white/[0.03] p-3">
    <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">{role === 'user' ? '玩家' : '以太'}</p>
    <p className="mt-2 line-clamp-4 text-xs leading-5 text-white/58">{displayText(text, role === 'user' ? '旧问题内容编码异常' : '旧回答内容编码异常')}</p>
  </div>
);

const OverviewTab: React.FC<{
  run: AgentRunResult;
  messages: AgentConversationMessage[];
  messageListRef: React.RefObject<HTMLDivElement>;
}> = ({ run, messages, messageListRef }) => (
  <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
    <div className="border border-aether-400/20 bg-aether-500/[0.05] p-5">
      <h3 className="font-semibold text-aether-200">当前回答</h3>
      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/75">{displayText(run.answer, '旧回答内容编码异常，建议重新解读当前画面。')}</p>
      {run.actions.length > 0 && (
        <div className="mt-4 space-y-2">
          {run.actions.map((action, index) => <div key={action} className="grid grid-cols-[24px_1fr] gap-2 text-xs text-white/60"><span className="text-aether-200">{index + 1}</span>{action}</div>)}
        </div>
      )}
    </div>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="模型耗时" value={`${run.metrics.modelLatencyMs} ms`} />
        <Metric label="重试次数" value={`${run.metrics.retries}`} />
        <Metric label="知识命中" value={`${run.knowledge.length} 条`} />
        <Metric label="memory 写入" value={`${run.metrics.memoryWrites} 条`} />
      </div>
      <div className="border border-white/10 bg-white/[0.03] p-4">
        <h3 className="font-semibold text-aether-200">会话消息</h3>
        <div ref={messageListRef} className="mt-3 grid max-h-72 gap-2 overflow-auto md:grid-cols-2" aria-live="polite">
          {messages.slice(-4).map(message => <MessagePreview key={message.id} role={message.role} text={message.text} />)}
          {!messages.length && <p className="text-sm text-white/40">暂无会话消息。</p>}
        </div>
      </div>
    </div>
  </div>
);

const VisionTab: React.FC<{ run: AgentRunResult }> = ({ run }) => (
  <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    <div className="border border-white/10 bg-white/[0.03] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-aether-200">
        <Eye size={17} />视觉观察
      </h3>
      <p className="mt-4 text-sm leading-6 text-white/70">{run.observation.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="border border-white/10 bg-white/5 px-2 py-1">{run.observation.contextKind}</span>
        <span className="border border-white/10 bg-white/5 px-2 py-1">{run.observation.app}</span>
        {run.observation.game && <span className="border border-white/10 bg-white/5 px-2 py-1">{run.observation.game}</span>}
        <span className="border border-white/10 bg-white/5 px-2 py-1">场景：{run.observation.scene}</span>
        <span className="border border-white/10 bg-white/5 px-2 py-1">置信度：{Math.round(run.observation.confidence * 100)}%</span>
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold text-aether-200">观察事实</h3>
        <div className="mt-4 space-y-2">
          {run.observation.facts.length
            ? run.observation.facts.map(fact => <div key={fact} className="border-l-2 border-aether-400/50 pl-3 text-xs leading-5 text-white/55">{fact}</div>)
            : <p className="text-sm text-white/40">暂无可归因事实。</p>}
        </div>
      </div>
      <div className="border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold text-aether-200">OCR 识别文本</h3>
        <p className="mt-4 text-xs leading-5 text-white/60">
          {run.observation.ocrText.length ? run.observation.ocrText.join(' / ') : '暂无稳定可读文本。'}
        </p>
      </div>
      <div className="border border-white/10 bg-white/[0.03] p-5 md:col-span-2">
        <h3 className="font-semibold text-aether-200">截图来源</h3>
        {run.captureInfo ? (
          <div className="mt-4 grid gap-2 text-xs text-white/55 md:grid-cols-2">
            <p>捕获方式：{run.captureInfo.captureMode || '未知'}</p>
            <p>显示器：{run.captureInfo.displayId ?? '未知'}</p>
            <p>来源：{run.captureInfo.sourceName || run.inputSourceName}</p>
            <p>sourceId：{run.captureInfo.sourceId || '未知'}</p>
            <p>隐藏助手：{run.captureInfo.hiddenAssistant && (run.captureInfo.hiddenAssistant.control || run.captureInfo.hiddenAssistant.answer || run.captureInfo.hiddenAssistant.agentOps) ? '已隐藏' : '未隐藏'}</p>
            <p>延迟：{run.captureInfo.hiddenAssistant?.delayMs ?? 0} ms</p>
            {run.captureInfo.fallbackReason && <p className="md:col-span-2">退化原因：{run.captureInfo.fallbackReason}</p>}
          </div>
        ) : (
          <p className="mt-4 text-xs text-white/40">暂无抓取详情。</p>
        )}
      </div>
    </div>
  </div>
);

const syncReasonLabel = (reason?: string) => ({
  'missing-runtime-pack': '运行目录缺少运行知识包',
  'bundled-version-newer': '本地内置版本优先',
  'same-date-content-different': '检测到同日构建差异，已重建快照',
  'same-version-content-different': '同版本内容差异已覆盖',
  'runtime-version-newer': '运行目录版本更新，已保留差异',
  'runtime-pack-current': '当前运行包无可用更新',
  'manual-import': '手动导入知识包',
}[reason || ''] || reason || '未知');

const KnowledgeTab: React.FC<{ run: AgentRunResult; state?: AppState }> = ({ run, state }) => {
  const runtime = state?.runtime;
  const partitions = runtime?.knowledgePartitions || [];
  const sourceTiers = runtime?.knowledgeSourceTiers || [];
  const sync = runtime?.knowledgeSync;
  const versionMismatch = Boolean(runtime?.knowledgeBuiltInVersion && runtime.knowledgeVersion !== runtime.knowledgeBuiltInVersion);
  return (
    <div className="space-y-5">
      <section className={`border p-5 ${versionMismatch ? 'border-yellow-400/25 bg-yellow-500/[0.05]' : 'border-aether-400/20 bg-aether-500/[0.045]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-aether-200"><Database size={17} />知识包</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              当前检索策略：{runtime?.ragStrategy || 'SQLite FTS5 BM25 + 关键词匹配 + 来源可信度'}。
              {runtime?.embeddingEnabled ? ' 预留 embedding_score / semantic_score 校验逻辑。' : ''}
            </p>
          </div>
          <span className="border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/55">{syncReasonLabel(sync?.reason)}</span>
        </div>
        <div className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
          <Metric label="运行版本" value={runtime?.knowledgeVersion || '未知'} mono />
          <Metric label="内置版本" value={runtime?.knowledgeBuiltInVersion || '未知'} mono />
          <Metric label="知识卡片" value={`${runtime?.knowledgeEntries || 0} 条`} mono />
          <Metric label="更新时间" value={runtime?.knowledgeUpdatedAt || sync?.syncedAt || '未知'} mono />
        </div>
        <div className="mt-4 grid gap-3 text-xs xl:grid-cols-3">
          <PathBlock label="运行知识路径" value={runtime?.knowledgeRuntimePath} />
          <PathBlock label="内置知识路径" value={runtime?.knowledgeBundledPath} />
          <PathBlock label="语料目录" value={runtime?.knowledgeCorpusDir} />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-medium text-white/58">按游戏分桶</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {partitions.length
                ? partitions.map(partition => (
                  <div key={partition.game} className="border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm font-medium text-white/75">{partition.game}</p>
                    <p className="mt-1 text-xs text-aether-100">{partition.count} 条</p>
                    <p className="mt-2 break-words text-[11px] leading-5 text-white/36">
                      {Object.entries(partition.tiers || {}).map(([tier, count]) => `${tier} ${count}`).join(' / ') || '暂无来源层级'}
                    </p>
                  </div>
                ))
                : <p className="text-sm text-white/40">当前无分桶数据</p>}
            </div>
          </div>
          <div className="border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-medium text-white/58">来源层级</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sourceTiers.length
                ? sourceTiers.map(item => (
                  <span key={item.tier} className="border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/55">
                    {item.tier} · {item.count}
                  </span>
                ))
                : <span className="text-sm text-white/40">暂无来源统计</span>}
            </div>
            {versionMismatch && (
              <p className="mt-3 text-xs leading-5 text-yellow-100/75">
                运行知识版本与内置版本不一致，已保持运行版本为准；可在设置中触发重载。
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="border border-white/10 bg-white/[0.03] p-5">
          <h3 className="flex items-center gap-2 font-semibold text-aether-200"><Database size={17} />RAG 命中</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {run.knowledge.length ? run.knowledge.map(item => (
              <div key={item.id} className="border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{item.game} · {item.title}</p>
                  <span className="shrink-0 border border-aether-300/20 px-2 py-0.5 text-[10px] text-aether-100">{item.sourceTier || 'local'}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/45">{item.content}</p>
              </div>
            )) : <p className="text-sm text-white/40">当前无本地知识命中。</p>}
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-white/10 bg-white/[0.03] p-5">
            <h3 className="flex items-center gap-2 font-semibold text-aether-200"><Globe2 size={17} />检索策略</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {run.retrievalSource.map(source => <span key={source} className="border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/55">{source}</span>)}
            </div>
            <div className="mt-4 grid gap-2 text-xs md:grid-cols-2">
              <Metric label="Guide Intent" value={run.guideIntent || 'none'} mono />
              <Metric label="Retrieval Policy" value={run.retrievalPolicy || run.knowledgeMatchMode || 'unknown'} mono />
              <Metric label="Exact QA" value={run.localExactQaMatch ? 'yes' : 'no'} />
              <Metric label="Extracted URLs" value={`${run.extractedUrls?.length || 0}`} />
            </div>
            {run.answerPlan && (
              <div className="mt-4 border border-aether-300/15 bg-aether-300/[0.04] p-3 text-xs">
                <p className="font-medium text-aether-100">答案计划</p>
                <p className="mt-2 text-white/55">分面：{run.answerPlan.facets.length ? run.answerPlan.facets.join(' / ') : '未拆分'}</p>
                <p className="mt-1 text-white/45">必须覆盖：{run.answerPlan.requiredSections.length ? run.answerPlan.requiredSections.join(' / ') : '默认回答结构'}</p>
              </div>
            )}
            {run.webQueries?.length ? (
              <p className="mt-3 break-all font-mono text-[10px] leading-5 text-white/32">{run.webQueries.slice(0, 6).join('\n')}</p>
            ) : null}
            <p className="mt-4 break-all font-mono text-[10px] leading-5 text-white/30">
              {run.tavilyRequestIds.length ? run.tavilyRequestIds.join('\n') : '无 Tavily 请求'}
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-5">
            <h3 className="flex items-center gap-2 font-semibold text-aether-200"><ExternalLink size={17} />引用来源</h3>
            <div className="mt-4 space-y-2">
              {run.citations.length ? run.citations.map(citation => (
                <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer" className="block border border-white/10 bg-black/20 p-3 text-xs hover:border-aether-300/30">
                  <p className="text-white/70">{citation.author} · {citation.title}</p>
                  <p className="mt-1 text-white/40">{citation.version} · {citation.sourceTier || citation.sourceType}</p>
                  <p className="mt-1 truncate text-white/30">{citation.url}</p>
                </a>
              )) : <p className="text-sm text-white/40">当前无可引用来源。</p>}
            </div>
          </div>
        </div>
      </div>
      {run.filteredSources.length > 0 && (
        <section className="border border-yellow-400/20 bg-yellow-500/[0.04] p-5">
          <h3 className="font-semibold text-yellow-100">过滤来源</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {run.filteredSources.map(source => (
              <p key={`${source.url}-${source.reason}`} className="border border-white/8 p-3 text-xs text-white/45">
                {source.reason} · {source.title || source.url}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const PathBlock: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="border border-white/10 bg-black/20 p-3">
    <p className="text-white/35">{label}</p>
    <p className="mt-1 break-all font-mono text-[10px] leading-5 text-white/52">{value || '未设置'}</p>
  </div>
);

const SkillTab: React.FC<{ groups: Array<[AgentSkillPhase, AgentRunResult['skills']]> }> = ({ groups }) => (
  <div className="space-y-4">
    {groups.map(([phase, skills]) => (
      <section key={phase} className="border border-white/10 bg-white/[0.03] p-5">
        <h3 className="flex items-center gap-2 font-semibold text-aether-200"><Zap size={17} />{phaseLabel[phase] || phase}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {skills.map(skill => (
            <div key={skill.id} className="border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{skill.displayName || skill.name}</p>
                <span className={`border px-2 py-0.5 text-[10px] ${statusTone[skill.status]}`}>{skill.status}</span>
              </div>
              <p className="mt-2 font-mono text-[10px] text-white/28">{skill.name}</p>
              <p className="mt-2 text-xs leading-5 text-white/45">{skill.intent}</p>
              <p className="mt-2 text-[11px] leading-5 text-white/35">触发原因：{skill.triggerReason || skill.inputSummary || '无说明'}</p>
              <p className="mt-1 text-[11px] leading-5 text-white/50">输出：{skill.outputSummary || skill.output}</p>
              <p className="mt-1 font-mono text-[10px] text-white/25">{skill.latencyMs}ms · {Math.round(skill.confidence * 100)}%</p>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

const TraceTab: React.FC<{ run: AgentRunResult }> = ({ run }) => (
  <div className="space-y-2">
    {run.trace.map((step, index) => (
      <div key={step.id} className="grid grid-cols-[30px_1fr_auto] gap-3 border border-white/10 bg-white/[0.035] p-3">
        <div className="flex h-7 w-7 items-center justify-center bg-aether-500/15 text-xs text-aether-100">{index + 1}</div>
        <div>
          <div className="flex items-center gap-2"><p className="text-sm font-medium">{step.title}</p><span className="text-[10px] uppercase text-white/30">{step.kind}</span></div>
          <p className="mt-1 text-xs leading-5 text-white/48">{step.detail}</p>
        </div>
        <span className="font-mono text-xs text-white/35">{step.durationMs}ms</span>
      </div>
    ))}
  </div>
);

const OpsTab: React.FC<{ run: AgentRunResult }> = ({ run }) => (
  <div className="grid gap-5 xl:grid-cols-3">
    <div className="border border-white/10 bg-white/[0.03] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-aether-200"><ShieldCheck size={17} />规则与守护</h3>
      <div className="mt-4 space-y-2">
        {run.rules.map(rule => (
          <div key={rule.id} className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{rule.name}</p>
              <span className={`border px-2 py-0.5 text-[10px] ${statusTone[rule.verdict]}`}>{rule.verdict}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">{rule.detail}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="border border-white/10 bg-white/[0.03] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-aether-200"><UserRound size={17} />账号上下文</h3>
      <p className="mt-4 text-sm leading-6 text-white/60">
        {run.accountContextUsed?.summary || '无账号上下文可用'}
      </p>
      <div className="mt-4 space-y-2">
        {run.memory.slice(-6).reverse().map(item => (
          <div key={item.id} className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.label}</p>
              <span className="text-[10px] text-white/30">{item.scope}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="space-y-5">
      <div className="border border-white/10 bg-white/[0.03] p-5">
        <h3 className="flex items-center gap-2 font-semibold text-aether-200"><Clock3 size={17} />后台任务</h3>
        <div className="mt-4 space-y-2">
          {run.schedule.map(item => (
            <div key={item.id} className="border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <span className={`border px-2 py-0.5 text-[10px] ${statusTone[item.status]}`}>{item.status}</span>
              </div>
              <p className="mt-1 text-xs text-white/40">
                {item.cadence} · {item.nextRun}
              </p>
            </div>
          ))}
        </div>
      </div>
      {run.errors.length > 0 && (
        <div className="border border-red-400/20 bg-red-500/[0.05] p-5">
          <h3 className="font-semibold text-red-200">错误记录</h3>
          <div className="mt-3 space-y-2">
            {run.errors.map((error, index) => (
              <p key={`${error.timestamp}-${index}`} className="text-xs text-red-100/65">{error.attempt} 次尝试 · {error.stage} · {error.message}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);



