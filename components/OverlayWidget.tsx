import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  ScanEye,
  X,
  Send,
  Activity,
  Sparkles,
  LayoutGrid,
  Users,
  BookOpen,
  Map,
  ChevronRight,
} from 'lucide-react';
import { generateGameAdvice } from '../services/geminiService';
import { ChatMessage, OverlayState, Persona, SceneId } from '../types';
import {
  MOCK_GAME_CONTEXT,
  PERSONA_PROFILES,
  SCENE_LIST,
  SCENE_IMAGE,
  GEAR_FEEDBACK,
  ROSTER_FEEDBACK,
  STORY_FEEDBACK,
  EXPLORE_FEEDBACK,
} from '../constants';

interface OverlayWidgetProps {
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onScanStart: () => void;
  onOpenDashboard: () => void;
  persona: Persona;
  activeScene: SceneId;
  setActiveScene: (scene: SceneId) => void;
}

const SCENE_ICONS: Record<SceneId, React.ComponentType<{ size?: number; className?: string }>> = {
  gear: ScanEye,
  roster: Users,
  story: BookOpen,
  explore: Map,
};

const SCENE_STYLES: Record<SceneId, { border: string; accent: string; glow: string }> = {
  gear: {
    border: 'border-yellow-400/40',
    accent: 'text-yellow-200 bg-yellow-500/10 border-yellow-400/30',
    glow: 'shadow-[0_0_35px_rgba(250,204,21,0.15)]',
  },
  roster: {
    border: 'border-aether-400/40',
    accent: 'text-aether-200 bg-aether-500/10 border-aether-400/30',
    glow: 'shadow-[0_0_35px_rgba(20,184,166,0.18)]',
  },
  story: {
    border: 'border-purple-400/40',
    accent: 'text-purple-200 bg-purple-500/10 border-purple-400/30',
    glow: 'shadow-[0_0_35px_rgba(168,85,247,0.2)]',
  },
  explore: {
    border: 'border-sky-400/40',
    accent: 'text-sky-200 bg-sky-500/10 border-sky-400/30',
    glow: 'shadow-[0_0_35px_rgba(56,189,248,0.2)]',
  },
};

export const OverlayWidget: React.FC<OverlayWidgetProps> = ({
  chatHistory,
  setChatHistory,
  onScanStart,
  onOpenDashboard,
  persona,
  activeScene,
  setActiveScene,
}) => {
  const [state, setState] = useState<OverlayState>(OverlayState.COLLAPSED);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showScenePanel, setShowScenePanel] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const personaProfile = PERSONA_PROFILES.find(profile => profile.id === persona) ?? PERSONA_PROFILES[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, state]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setChatHistory(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const responseText = await generateGameAdvice(input, JSON.stringify(MOCK_GAME_CONTEXT));

    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now(),
    };

    setChatHistory(prev => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const nextScene = (current: SceneId) => {
    const order = SCENE_LIST.map(scene => scene.id);
    const index = order.indexOf(current);
    return order[(index + 1) % order.length];
  };

  const handleScan = async () => {
    onScanStart();
    setState(OverlayState.COLLAPSED);
    await new Promise(resolve => setTimeout(resolve, 1600));
    setActiveScene(prev => nextScene(prev));
    setShowScenePanel(true);
    setState(OverlayState.SCAN_RESULT);
  };

  const openScene = (sceneId: SceneId) => {
    setActiveScene(sceneId);
    setShowScenePanel(true);
  };

  const closeFeedback = () => {
    setShowScenePanel(false);
    if (state === OverlayState.SCAN_RESULT) {
      setState(OverlayState.COLLAPSED);
    }
  };

  const renderSceneContent = () => {
    if (activeScene === 'gear') {
      return (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-aether-300">装备反馈</p>
              <h3 className="text-lg font-semibold text-white">{GEAR_FEEDBACK.title}</h3>
              <p className="text-xs text-white/60">主词条：{GEAR_FEEDBACK.mainStat} {GEAR_FEEDBACK.mainValue}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/50">综合评分</p>
              <div className="text-2xl font-bold text-yellow-300">{GEAR_FEEDBACK.grade}</div>
              <div className="text-xs text-white/40">{GEAR_FEEDBACK.score} / 100</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-[92%] bg-gradient-to-r from-yellow-300 to-aether-400" />
          </div>
          <div className="space-y-2">
            {GEAR_FEEDBACK.highlight.map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-aether-400" />
                {item}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
            {GEAR_FEEDBACK.fit}
          </div>
          <div className="flex flex-wrap gap-2">
            {GEAR_FEEDBACK.actions.map(action => (
              <span key={action} className="rounded-full border border-aether-400/40 bg-aether-500/10 px-3 py-1 text-xs text-aether-200">
                {action}
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (activeScene === 'roster') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-aether-300">配队反馈</p>
              <h3 className="text-lg font-semibold text-white">{ROSTER_FEEDBACK.title}</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/50">阵容评分</p>
              <div className="text-2xl font-bold text-aether-300">{ROSTER_FEEDBACK.score}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/60">上半</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROSTER_FEEDBACK.topTeam.map(member => (
                  <span key={member} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                    {member}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/60">下半</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROSTER_FEEDBACK.bottomTeam.map(member => (
                  <span key={member} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                    {member}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm text-white/70">
            {ROSTER_FEEDBACK.buffs.map(buff => (
              <div key={buff} className="flex items-center gap-2">
                <ChevronRight size={14} className="text-aether-300" />
                {buff}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
            需要注意：{ROSTER_FEEDBACK.gaps.join('；')}
          </div>
          <div className="flex flex-wrap gap-2">
            {ROSTER_FEEDBACK.actions.map(action => (
              <span key={action} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                {action}
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (activeScene === 'story') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-aether-300">剧情反馈</p>
              <h3 className="text-lg font-semibold text-white">{STORY_FEEDBACK.title}</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              {STORY_FEEDBACK.safe}
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
            {STORY_FEEDBACK.recap}
          </div>
          <div>
            <p className="text-xs text-white/60 mb-2">已解锁关键词</p>
            <div className="flex flex-wrap gap-2">
              {STORY_FEEDBACK.keywords.map(keyword => (
                <span key={keyword} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-aether-500/30 bg-aether-500/10 p-3 text-sm text-aether-200">
            {STORY_FEEDBACK.next}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-aether-300">探索反馈</p>
            <h3 className="text-lg font-semibold text-white">{EXPLORE_FEEDBACK.title}</h3>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">目标距离</p>
            <div className="text-2xl font-bold text-sky-300">{EXPLORE_FEEDBACK.target}</div>
          </div>
        </div>
        <div className="h-28 rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%),radial-gradient(circle_at_70%_80%,_rgba(14,116,144,0.25),_transparent_60%)]" />
        <div className="space-y-2 text-sm text-white/70">
          {EXPLORE_FEEDBACK.route.map(step => (
            <div key={step} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              {step}
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
          {EXPLORE_FEEDBACK.markers.join(' · ')}
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPLORE_FEEDBACK.actions.map(action => (
            <span key={action} className="rounded-full border border-sky-300/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              {action}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const activeSceneMeta = SCENE_LIST.find(scene => scene.id === activeScene);
  const shouldShowFeedback = showScenePanel || state === OverlayState.SCAN_RESULT;

  if (state === OverlayState.CHAT) {
    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 w-[450px] h-[520px] z-50 flex flex-col">
        <div className="flex-1 bg-black/80 backdrop-blur-xl border border-aether-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-white/5">
            <div className="flex items-center gap-2 text-aether-400">
              <Sparkles size={16} />
              <span className="font-mono text-sm font-bold tracking-wide">以太连接</span>
            </div>
            <button onClick={() => setState(OverlayState.COLLAPSED)} className="text-white/50 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-aether-600 text-white rounded-br-none'
                      : 'bg-white/10 text-gray-200 rounded-bl-none border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1">
                  <span className="w-1.5 h-1.5 bg-aether-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-aether-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-1.5 h-1.5 bg-aether-400 rounded-full animate-bounce delay-150"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white/5 border-t border-white/10">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="输入需求，例如：推荐上半阵容"
                className="w-full bg-black/50 border border-white/20 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-aether-500/50 transition-colors"
              />
              <button
                onClick={handleSendMessage}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-aether-600 hover:bg-aether-500 rounded-lg text-white transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['推荐上半阵容', '解释双爆配平', '今日行动清单'].map(item => (
                <button
                  key={item}
                  onClick={() => setInput(item)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:border-aether-400/50"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-black/80 backdrop-blur-md border border-aether-500/30 rounded-full p-2 pr-6 shadow-[0_0_20px_rgba(20,184,166,0.15)] flex items-center gap-4 transition-all hover:bg-black/90 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-aether-900 to-aether-600 flex items-center justify-center animate-pulse-fast">
              <Bot size={20} className="text-white" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aether-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-aether-500"></span>
            </span>
          </div>

          <div
            className="flex flex-col cursor-pointer"
            onClick={() => {
              setState(OverlayState.CHAT);
              setShowScenePanel(false);
            }}
          >
            <span className="text-xs font-mono text-aether-400 uppercase tracking-wider">以太系统</span>
            <span className="text-sm font-semibold text-white group-hover:text-aether-100">{personaProfile.tagline}</span>
          </div>

          <div className="h-6 w-[1px] bg-white/10 mx-1" />

          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              className="p-2 hover:bg-white/10 rounded-full text-aether-400 transition-colors"
              title="视觉扫描"
            >
              <ScanEye size={18} />
            </button>
            <button
              onClick={() => setShowScenePanel(prev => !prev)}
              className="p-2 hover:bg-white/10 rounded-full text-aether-400 transition-colors"
              title="场景反馈"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={onOpenDashboard}
              className="p-2 hover:bg-white/10 rounded-full text-aether-400 transition-colors"
              title="账号仪表盘"
            >
              <Activity size={18} />
            </button>
          </div>
        </div>

        {showScenePanel && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl">
            {SCENE_LIST.map(scene => {
              const Icon = SCENE_ICONS[scene.id];
              const isActive = scene.id === activeScene;
              return (
                <button
                  key={scene.id}
                  onClick={() => openScene(scene.id)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs transition ${
                    isActive
                      ? 'border-aether-400/70 bg-aether-500/15 text-aether-100'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-aether-400/40'
                  }`}
                >
                  <Icon size={16} className="text-aether-300" />
                  <div>
                    <div className="text-sm font-semibold">{scene.name}</div>
                    <div className="text-[11px] text-white/50">{scene.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {shouldShowFeedback && (
        <div className="fixed top-1/2 right-8 -translate-y-1/2 z-50 w-[360px]">
          {state === OverlayState.SCAN_RESULT && activeSceneMeta && (
            <div className={`mb-3 rounded-xl border px-4 py-2 text-sm ${SCENE_STYLES[activeScene].accent}`}>
              识别完成：{activeSceneMeta.name} · 置信度 98%
            </div>
          )}
          <div
            className={`relative rounded-2xl border bg-black/90 p-5 backdrop-blur-xl ${SCENE_STYLES[activeScene].border} ${SCENE_STYLES[activeScene].glow}`}
          >
            <button
              onClick={closeFeedback}
              className="absolute right-3 top-3 text-white/40 hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <div
                className="h-20 w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${SCENE_IMAGE[activeScene]})` }}
              />
              {activeSceneMeta && (
                <div className="flex items-center justify-between px-3 py-2 text-xs text-white/60">
                  <span>{activeSceneMeta.name}</span>
                  <span>{activeSceneMeta.hint}</span>
                </div>
              )}
            </div>
            {renderSceneContent()}
          </div>
        </div>
      )}
    </>
  );
};
