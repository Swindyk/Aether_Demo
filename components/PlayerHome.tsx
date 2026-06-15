import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Database,
  ExternalLink,
  Link2,
  MessageSquare,
  RefreshCw,
  ScanEye,
  Send,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PERSONA_PROFILES } from '../constants';
import { AgentConversation, AppState, AssistantStatus, DesktopSource, GameAccount, GameId, SceneId } from '../types';

const AVATAR_SRC = './brand/aether-avatar.png';
const DEMO_Genshin_UID = '167910237';

const painPoints: Array<{ id: SceneId; title: string; desc: string; prompt: string }> = [
  { id: 'gear', title: '装备要不要换', desc: '词条 适配 提升空间', prompt: '帮我判断当前装备值不值得换，直接给结论和下一步' },
  { id: 'roster', title: '这队能不能打', desc: '配队 循环 生存风险', prompt: '帮我看这套队伍能不能打，指出最大问题和调整建议' },
  { id: 'story', title: '剧情人物是谁', desc: '人物关系 防剧透解释', prompt: '帮我解释当前剧情人物和线索，不要剧透后续内容' },
  { id: 'explore', title: '探索卡在哪', desc: '路线 解谜 可见线索', prompt: '我卡点了，帮我根据当前画面找下一步线索' },
];

const personaDemo = [
  {
    name: '新手玩家',
    text: '先告诉我现在按什么 做什么 少讲术语',
  },
  {
    name: '进阶玩家',
    text: '直接判断收益 风险和替代方案',
  },
  {
    name: '剧情玩家',
    text: '解释人物关系 默认防剧透',
  },
];

const resultLabel = {
  live: '实时分析',
  cache: '缓存回放',
  error: '分析失败',
};

const statusLabel: Record<AssistantStatus['state'], string> = {
  idle: '等待解读',
  capturing: '正在捕获画面',
  analyzing: '正在分析',
  ready: '回答已准备',
  error: '上次分析失败',
};

const fallbackSourceName = (id?: string) => ({
  'demo:gear': '原神 · 装备搭配',
  'demo:roster': '原神 · 队伍配置',
  'demo:story': '星穹铁道 · 剧情回顾',
  'demo:explore': '星穹铁道 · 探索指引',
}[id || ''] || '鼠标所在屏幕');

const formatConversationTime = (timestamp?: number) => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const conversationTitle = (conversation: AgentConversation) => (
  conversation.title || conversation.lastObservation?.summary || '历史会话'
);

const safeAnswer = (latest?: AppState['latestRun']) => {
  if (!latest) return undefined;
  if (latest.playerAnswer) {
    return {
      conclusion: latest.playerAnswer.conclusion || latest.observation.summary,
      currentTeam: latest.playerAnswer.currentTeam || '当前截图没有稳定识别到完整队伍。',
      betterTeams: latest.playerAnswer.betterTeams || [],
      buildAdvice: latest.playerAnswer.buildAdvice || [],
      basis: latest.playerAnswer.basis || '基于截图和账号角色判断',
      sourcesUsed: latest.playerAnswer.sourcesUsed || [],
      text: latest.playerAnswer.text || latest.answer,
    };
  }
  const lines = String(latest.answer || '')
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line && !/ModelScope|choices|JSON|自动重试|重试|request|runtime|trace/i.test(line));
  return {
    conclusion: lines[0] || latest.observation.summary,
    currentTeam: lines[1] || '当前截图没有稳定识别到完整队伍。',
    betterTeams: [],
    buildAdvice: lines.slice(2, 5),
    basis: latest.citations.length ? '参考已采用攻略来源' : '基于截图和账号角色判断',
    sourcesUsed: latest.citations.map(item => item.author || item.title).slice(0, 3),
    text: lines.join('\n'),
  };
};

export const PlayerHome: React.FC = () => {
  const [state, setState] = useState<AppState>();
  const [status, setStatus] = useState<AssistantStatus>({ state: 'idle', message: '按 Alt+Q 解读当前画面' });
  const [busy, setBusy] = useState<'scan' | ''>('');
  const [notice, setNotice] = useState('');
  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [accountGame, setAccountGame] = useState<GameId>('genshin');
  const [uid, setUid] = useState('');
  const [accountBusy, setAccountBusy] = useState('');
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [recentConversations, setRecentConversations] = useState<AgentConversation[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = async () => {
    if (!window.aether) return;
    const [nextState, nextAccounts, nextSources, nextStatus, nextConversations] = await Promise.all([
      window.aether.getState(),
      window.aether.listAccounts(),
      window.aether.listSources(),
      window.aether.getAssistantStatus(),
      window.aether.getConversations({ limit: 3 }),
    ]);
    setState(nextState);
    setAccounts(nextAccounts);
    setSources(nextSources);
    setStatus(nextStatus);
    setRecentConversations(nextConversations);
  };

  useEffect(() => {
    void refresh();
    const removeRun = window.aether?.onRunComplete(run => {
      setState(previous => previous ? { ...previous, latestRun: run } : previous);
      void refresh();
    });
    const removeSettings = window.aether?.onSettingsChanged(settings => setState(previous => previous ? { ...previous, settings } : previous));
    const removeStatus = window.aether?.onAssistantStatusChanged(setStatus);
    const removeShowLatest = window.aether?.onShowLatest(() => document.getElementById('latest-answer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    const removeConversationSelected = window.aether?.onConversationSelected(conversation => {
      setState(previous => previous ? { ...previous, currentConversation: conversation } : previous);
      void refresh();
    });
    return () => {
      removeRun?.();
      removeSettings?.();
      removeStatus?.();
      removeShowLatest?.();
      removeConversationSelected?.();
    };
  }, []);

  const update = async (patch: Parameters<NonNullable<typeof window.aether>['updateSettings']>[0]) => {
    if (!window.aether || !state) return;
    const settings = await window.aether.updateSettings(patch);
    setState({ ...state, settings });
  };

  const analyzeNow = async () => {
    if (!window.aether || busy) return;
    setBusy('scan');
    setNotice('');
    try {
      const run = await window.aether.quickScan();
      if (run) {
        await refresh();
        const runError = run.errors?.length ? run.errors[run.errors.length - 1] : undefined;
        setNotice(run.source === 'error' ? `这次没有完成分析：${runError?.message || run.summary}` : '已完成当前画面解读。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '这次没有完成画面解读');
    } finally {
      setBusy('');
    }
  };

  const connectAccount = async () => {
    if (!window.aether || !uid.trim() || accountBusy) return;
    setAccountBusy('connect');
    setNotice('');
    try {
      const account = await window.aether.connectAccount({ game: accountGame, uid: uid.trim() });
      setUid('');
      setAccounts(await window.aether.listAccounts());
      setNotice(account.error ? `账号已保存，同步暂未完成：${account.error}` : `已同步 ${account.nickname || account.label} 的 ${account.characterCount} 个公开角色`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '账号连接失败');
    } finally {
      setAccountBusy('');
    }
  };

  const syncAccount = async (accountId: string) => {
    if (!window.aether || accountBusy) return;
    setAccountBusy(accountId);
    try {
      await window.aether.syncAccount(accountId);
      setAccounts(await window.aether.listAccounts());
      setNotice('公开角色状态已更新');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '账号同步失败');
    } finally {
      setAccountBusy('');
    }
  };

  const removeAccount = async (accountId: string) => {
    if (!window.aether || accountBusy) return;
    setAccountBusy(accountId);
    try {
      await window.aether.removeAccount(accountId);
      setAccounts(await window.aether.listAccounts());
      setNotice('已断开该公开 UID');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '账号断开失败');
    } finally {
      setAccountBusy('');
    }
  };

  const askPainPoint = async (item: typeof painPoints[number]) => {
    if (!window.aether || busy) return;
    setBusy('scan');
    setNotice('');
    try {
      const settings = await window.aether.updateSettings({ selectedScene: item.id });
      setState(previous => previous ? { ...previous, settings } : previous);
      const run = await window.aether.runAgent({
        query: item.prompt,
        persona: settings.persona,
        scene: item.id,
        mode: 'scan',
        includeVision: true,
        analysisMode: 'deep',
      });
      await refresh();
      setNotice(run.source === 'error' ? '这次没看清，换无边框窗口后再试' : '已按这个问题解读当前画面');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '这次没有完成画面解读');
    } finally {
      setBusy('');
    }
  };

  const askFollowUp = async () => {
    const text = followUpText.trim();
    if (!window.aether || !text || chatBusy) return;
    const conversationId = state?.currentConversation?.id || latest?.conversationId;
    if (!conversationId) {
      setNotice('请先按 Alt+Q 或点击“让我看看”创建一个会话');
      return;
    }
    setChatBusy(true);
    setNotice('');
    try {
      await window.aether.askConversation({
        conversationId,
        accountKey: state?.currentConversation?.accountKey || latest?.accountKey,
        query: text,
        persona: state?.settings.persona,
        scene: state?.currentConversation?.scene || latest?.scene || state?.settings.selectedScene || 'unknown',
        parentRunId: state?.currentConversation?.lastRunId || latest?.id,
      });
      setFollowUpText('');
      await refresh();
      setNotice('已基于当前会话继续回答');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '追问失败，请稍后再试');
    } finally {
      setChatBusy(false);
    }
  };

  const openConversation = async (conversation: AgentConversation) => {
    if (!window.aether) return;
    try {
      const opened = await window.aether.openConversation({
        accountKey: conversation.accountKey,
        conversationId: conversation.id,
      });
      setState(previous => previous ? {
        ...previous,
        currentConversation: opened.conversation,
        latestRun: opened.run || previous.latestRun,
      } : previous);
      setRecentConversations(await window.aether.getConversations({ limit: 3 }));
      setNotice('已打开这条历史会话，可以继续问。');
      document.getElementById('latest-answer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '打开历史会话失败');
    }
  };

  const chooseSource = async (sourceId: string) => {
    if (!window.aether) return;
    if (sourceId === 'cursor-display') {
      const result = await window.aether.followScreen({ continuous: false });
      setState(previous => previous ? { ...previous, settings: result.settings } : previous);
      setNotice(`已改为：${result.sourceName}`);
      return;
    }
    const source = sources.find(item => item.id === sourceId);
    if (!source) return;
    const nextSettings = await window.aether.selectSource(source);
    setState(previous => previous ? { ...previous, settings: nextSettings } : previous);
    setNotice(`已选择：${source.name}`);
  };

  if (!window.aether) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071018] p-8 text-white">
        <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7 text-sm leading-7 text-white/65">
          请从以太桌面应用启动，才能使用热键截图、画面解读和本地知识库。
        </div>
      </div>
    );
  }

  const latest = state?.latestRun;
  const conversation = state?.currentConversation;
  const latestMatchesConversation = !conversation?.lastRunId || latest?.id === conversation.lastRunId;
  const activeRun = latestMatchesConversation ? latest : undefined;
  const profile = PERSONA_PROFILES.find(item => item.id === state?.settings.persona) ?? PERSONA_PROFILES[0];
  const currentSource = state?.settings.selectedSourceName || fallbackSourceName(state?.settings.selectedSourceId);
  const latestError = activeRun?.source === 'error' && activeRun.errors?.length ? activeRun.errors[activeRun.errors.length - 1] : undefined;
  const staleTokenError = Boolean(latestError?.message.includes('未配置模型服务') && state?.runtime.tokenConfigured);
  const displayAnswer = safeAnswer(activeRun);
  const activeSummary = conversation?.lastObservation?.summary || activeRun?.observation.summary || '还没有开始解读';

  return (
    <div className="min-h-screen overflow-hidden bg-[#071018] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_90%_25%,rgba(59,130,246,0.13),transparent_34%)]" />

      <header className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-7 py-6">
          <div className="flex items-center gap-3">
            <img src={AVATAR_SRC} alt="以太" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="text-xl font-semibold">以太</h1>
              <p className="text-xs text-white/45">卡点时按一下的 AI 游戏助手</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden items-center gap-2 text-xs md:flex ${state?.runtime.tokenConfigured ? 'text-emerald-200' : 'text-yellow-200'}`}>
              <span className={`h-2 w-2 rounded-full ${state?.runtime.tokenConfigured ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
              {state?.runtime.tokenConfigured ? '模型已连接' : '等待连接'}
            </span>
            <button onClick={() => window.aether?.openAgentOps()} className="rounded-xl p-2.5 text-white/35 transition hover:bg-white/5 hover:text-white" title="以太后台">
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl space-y-6 px-7 pb-10">
        <section className="relative min-h-[390px] overflow-hidden rounded-[32px] border border-white/10 bg-[#0a1720]">
          <img src="./demo/genshin-roster.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-38" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#071018] via-[#071018]/90 to-[#071018]/30" />
          <div className="relative z-[2] flex min-h-[390px] max-w-2xl flex-col justify-center p-9 md:p-12">
            <div className="mb-5 flex items-center gap-2 text-sm text-aether-200"><Sparkles size={16} />Alt+Q 让我看看</div>
            <h2 className="flex flex-col gap-3 text-4xl font-semibold leading-none md:gap-4 md:text-5xl">
              <span>卡点了？</span>
              <span>我来看看</span>
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/60">
              不用切出去翻攻略，按一下，让以太先看懂你卡在哪。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={analyzeNow} disabled={Boolean(busy) || status.state === 'capturing' || status.state === 'analyzing'} className="flex items-center gap-2 rounded-2xl bg-aether-300 px-6 py-3 text-sm font-semibold text-[#071018] shadow-[0_12px_32px_rgba(45,212,191,0.25)] transition hover:bg-aether-200 disabled:opacity-50">
                <ScanEye size={16} />{busy || status.state === 'capturing' || status.state === 'analyzing' ? '正在看' : '让我看看'}
              </button>
              <button onClick={() => window.aether?.showLatest()} className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-5 py-3 text-sm text-white/75 backdrop-blur transition hover:bg-white/10">
                最近回答 <ChevronRight size={16} />
              </button>
            </div>
            <p className="mt-4 text-xs text-aether-100/60">
              {statusLabel[status.state]} · {status.message}
              {status.shortcutReady === false && !status.message.includes('快捷键') ? ' · 热键冲突 可点按钮' : ''}
            </p>
            {notice && <p className="mt-4 text-xs text-aether-100/75">{notice}</p>}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {painPoints.map(item => (
            <button
              key={item.id}
              onClick={() => void askPainPoint(item)}
              disabled={Boolean(busy)}
              className={`rounded-3xl border p-5 text-left transition disabled:opacity-50 ${state?.settings.selectedScene === item.id ? 'border-aether-300/50 bg-aether-300/10' : 'border-white/10 bg-white/[0.035] hover:border-aether-300/35 hover:bg-aether-300/[0.06]'}`}
            >
              <p className="text-lg font-semibold">{item.title}</p>
              <p className="mt-2 text-xs text-white/42">{item.desc}</p>
              <p className="mt-5 flex items-center gap-1 text-xs text-aether-200">按这个问 <ChevronRight size={13} /></p>
            </button>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs text-aether-200">回答偏好</p>
            <h3 className="mt-1 text-xl font-semibold">{profile.name}</h3>
            <p className="mt-2 text-sm text-white/45">{profile.tagline}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {PERSONA_PROFILES.map(item => (
                <button
                  key={item.id}
                  onClick={() => void update({ persona: item.id })}
                  className={`rounded-2xl border p-3 text-left transition ${item === PERSONA_PROFILES[0] ? 'col-span-2' : ''} ${state?.settings.persona === item.id ? 'border-aether-300/55 bg-aether-300/10 text-white' : 'border-white/8 bg-black/15 text-white/45 hover:border-white/20 hover:text-white/75'}`}
                >
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="mt-1 truncate text-[11px]">{item.focus[0]} · {item.focus[1]}</p>
                </button>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-aether-300/15 bg-aether-300/[0.05] p-4">
              <p className="text-xs text-aether-200">同一张截图会这样变</p>
              <div className="mt-3 space-y-2">
                {personaDemo.map(item => (
                  <p key={item.name} className="grid grid-cols-[72px_1fr] gap-2 text-xs leading-5 text-white/52">
                    <span className="text-white/85">{item.name}</span>
                    <span>{item.text}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div id="latest-answer" className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-aether-200">最近一次回答</p>
                <h3 className="mt-1 text-xl font-semibold">{activeSummary}</h3>
              </div>
              {activeRun
                ? <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45">{resultLabel[activeRun.source]}</span>
                : conversation && <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45">历史会话</span>}
            </div>
            {recentConversations.length > 0 && (
              <div className="mt-4 border-t border-white/8 pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-white/45">最近会话</p>
                  <span className="text-[11px] text-white/28">点开后可以接着问</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {recentConversations.map(item => (
                    <button
                      key={item.id}
                      onClick={() => void openConversation(item)}
                      className={`min-h-20 rounded-2xl border px-3 py-2 text-left transition ${conversation?.id === item.id ? 'border-aether-300/45 bg-aether-300/[0.08]' : 'border-white/10 bg-black/15 hover:border-aether-300/30'}`}
                    >
                      <p className="line-clamp-2 text-xs font-medium leading-5 text-white/72">{conversationTitle(item)}</p>
                      <p className="mt-1 text-[11px] text-white/32">{formatConversationTime(item.updatedAt)} · {Math.ceil(item.messageCount / 2)} 轮</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeRun || conversation ? (
              <div className="mt-5">
                {displayAnswer && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-aether-200">结论</p>
                      <p className="mt-1 text-base font-semibold leading-7 text-white/85">{displayAnswer.conclusion}</p>
                    </div>
                    <div>
                      <p className="text-xs text-aether-200">当前队伍</p>
                      <p className="mt-1 text-sm leading-6 text-white/62">{displayAnswer.currentTeam}</p>
                    </div>
                    {displayAnswer.betterTeams.length > 0 && (
                      <div>
                        <p className="text-xs text-aether-200">更优选择</p>
                        <div className="mt-2 space-y-2">
                          {displayAnswer.betterTeams.map(team => (
                            <div key={`${team.title}-${team.members.join('-')}`} className="rounded-2xl border border-white/8 bg-black/15 p-3">
                              <p className="text-sm font-medium text-white/82">{team.title}{team.members.length ? ` · ${team.members.join(' / ')}` : ''}</p>
                              <p className="mt-1 text-xs leading-5 text-white/50">{team.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {displayAnswer.buildAdvice.length > 0 && (
                      <div>
                        <p className="text-xs text-aether-200">养成建议</p>
                        <div className="mt-2 space-y-1.5">
                          {displayAnswer.buildAdvice.slice(0, 3).map(item => <p key={item} className="text-xs leading-5 text-white/55">· {item}</p>)}
                        </div>
                      </div>
                    )}
                    <p className="rounded-2xl border border-aether-300/15 bg-aether-300/[0.045] px-4 py-3 text-xs leading-5 text-white/50">依据：{displayAnswer.basis}</p>
                  </div>
                )}
                {latestError && (
                  <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-xs leading-6 text-red-100/75">
                    {staleTokenError ? '这是旧失败记录。重新解读当前画面即可生成新结果。' : '这次没有生成可靠答案，请稍后再试。'}
                  </p>
                )}
                {activeRun?.citations.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeRun.citations.slice(0, 3).map(citation => (
                      <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45 hover:text-white">
                        <ExternalLink size={11} />{citation.author || citation.title}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-aether-100"><MessageSquare size={15} />继续追问</p>
                    <span className="text-[11px] text-white/35">{conversation?.accountKey || activeRun?.accountKey || 'local:default'}</span>
                  </div>
                  {conversation?.messages?.length ? (
                    <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                      {conversation.messages.slice(-8).map(message => (
                        <div key={message.id} className={`rounded-xl border px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'ml-8 border-aether-300/20 bg-aether-300/[0.06] text-aether-50' : 'mr-8 border-white/8 bg-white/[0.035] text-white/58'}`}>
                          <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/28">{message.role === 'user' ? '玩家' : '以太'}</p>
                          <p>{message.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs leading-5 text-white/35">本次解读已经创建会话，接着问会参考刚才的画面和资料。</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <textarea
                      value={followUpText}
                      onChange={event => setFollowUpText(event.target.value)}
                      onKeyDown={event => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void askFollowUp();
                      }}
                      placeholder="继续问：比如我现在先换武器还是先调整队伍？"
                      className="min-h-16 flex-1 resize-none rounded-xl border border-white/10 bg-[#08121a] px-3 py-2 text-sm text-white/75 outline-none placeholder:text-white/25 focus:border-aether-300/45"
                    />
                    <button
                      onClick={() => void askFollowUp()}
                      disabled={!followUpText.trim() || chatBusy}
                      className="flex h-16 w-14 items-center justify-center rounded-xl bg-aether-300 text-[#071018] transition hover:bg-aether-200 disabled:opacity-35"
                      title="发送追问"
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-white/40">
                  按 Alt+Q 或点“让我看看”，以太会看当前截图并给短答案。
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 opacity-70">
                  <p className="flex items-center gap-2 text-sm font-medium text-aether-100"><MessageSquare size={15} />继续追问</p>
                  <div className="mt-3 flex gap-2">
                    <textarea
                      disabled
                      placeholder="先解读一次画面，就能在这里接着问。"
                      className="min-h-16 flex-1 resize-none rounded-xl border border-white/10 bg-[#08121a] px-3 py-2 text-sm text-white/55 outline-none placeholder:text-white/25"
                    />
                    <button disabled className="flex h-16 w-14 items-center justify-center rounded-xl bg-aether-300 text-[#071018] opacity-35" title="发送追问">
                      <Send size={17} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex items-center gap-2 text-xs text-aether-200"><Link2 size={14} />让建议更懂你的账号</div>
            <h3 className="mt-2 text-xl font-semibold">连接公开角色展示</h3>
            <p className="mt-2 text-sm leading-6 text-white/45">只读取你主动公开的角色与装备，不需要登录游戏账号。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <select value={accountGame} onChange={event => setAccountGame(event.target.value as GameId)} className="rounded-xl border border-white/10 bg-[#08121a] px-3 py-2 text-sm text-white/70 outline-none">
                <option value="genshin">原神</option>
                <option value="starrail">星穹铁道</option>
              </select>
              <input value={uid} onChange={event => setUid(event.target.value.replace(/\D/g, ''))} onKeyDown={event => event.key === 'Enter' && void connectAccount()} placeholder="输入游戏 UID" className="min-w-48 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none focus:border-aether-300/45" />
              <button onClick={() => void connectAccount()} disabled={!uid || Boolean(accountBusy)} className="rounded-xl bg-aether-300 px-4 py-2 text-sm font-semibold text-[#071018] disabled:opacity-40">{accountBusy === 'connect' ? '正在同步…' : '连接账号'}</button>
              <button onClick={() => { setAccountGame('genshin'); setUid(DEMO_Genshin_UID); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55 hover:text-white">使用演示 UID</button>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/35">只读取公开角色展示 不登录 不读取背包 不读取游戏进程</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.length ? accounts.map(account => (
              <div key={account.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{account.nickname || account.label}</p>
                    <p className="mt-1 text-xs text-white/35">{account.game === 'genshin' ? '原神' : '星穹铁道'} · UID {account.uid}</p>
                  </div>
                  <Database size={15} className="text-aether-200" />
                </div>
                <p className="mt-3 text-xs text-white/50">已读取公开角色 {account.characterCount} 个{account.error ? ` · ${account.error}` : ''}</p>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={() => void syncAccount(account.id)} disabled={Boolean(accountBusy)} className="text-xs text-aether-200 hover:text-white">{accountBusy === account.id ? '正在更新…' : '更新角色状态'}</button>
                  <button onClick={() => void removeAccount(account.id)} disabled={Boolean(accountBusy)} className="flex items-center gap-1 text-xs text-white/35 hover:text-red-200"><Trash2 size={12} />断开</button>
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-white/35">连接 UID 后，以太会把公开角色池与画面一起纳入配队和练度判断。</div>
            )}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-aether-300/15 bg-aether-300/[0.045] px-6 py-5">
          <div>
            <p className="text-sm font-medium">当前画面来源：{currentSource}</p>
            <p className="mt-1 text-xs text-white/35">默认读取鼠标所在屏幕。独占全屏或受保护画面可能无法截图，建议使用无边框窗口模式。</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={state?.settings.captureMode === 'cursor-display' ? 'cursor-display' : state?.settings.selectedSourceId}
              onChange={event => void chooseSource(event.target.value)}
              className="max-w-64 rounded-xl border border-white/10 bg-[#08121a] px-3 py-2 text-xs text-white/60 outline-none"
              title="重新选择画面"
            >
              <option value="cursor-display">鼠标所在屏幕</option>
              {sources.map(source => <option key={source.id} value={source.id}>{source.kind === 'window' ? '窗口' : source.kind === 'screen' ? '屏幕' : '内置画面'} · {source.name}</option>)}
            </select>
            <button onClick={() => void refresh()} disabled={Boolean(busy)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 hover:text-white disabled:opacity-40"><RefreshCw size={13} />刷新</button>
          </div>
        </section>
      </main>
    </div>
  );
};
