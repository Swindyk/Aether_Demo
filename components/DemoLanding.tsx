import React from 'react';
import { DEMO_SAMPLES, DEMO_STEPS, P0_FEATURES, PERSONA_PROFILES } from '../constants';
import { Persona } from '../types';
import {
  ArrowRight,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
  LayoutGrid,
  ScanEye,
  MessageSquare,
  Settings,
} from 'lucide-react';

interface DemoLandingProps {
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
  onEnterOverlay: () => void;
  onOpenDashboard: () => void;
}

const MODULE_OVERVIEW = [
  {
    title: '概览',
    desc: '关键收益、今日节省时间与进度一屏掌握。',
    icon: LayoutGrid,
  },
  {
    title: '视觉评分',
    desc: '装备评分、保留建议与重点词条高亮。',
    icon: ScanEye,
  },
  {
    title: '战术助手',
    desc: '随问随答，直接给出配队与机制建议。',
    icon: MessageSquare,
  },
  {
    title: '系统设置',
    desc: '快捷键、透明度与自动检测随时调整。',
    icon: Settings,
  },
];

export const DemoLanding: React.FC<DemoLandingProps> = ({
  persona,
  onPersonaChange,
  onEnterOverlay,
  onOpenDashboard,
}) => {
  const activeProfile = PERSONA_PROFILES.find(profile => profile.id === persona) ?? PERSONA_PROFILES[0];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.2),_transparent_60%),radial-gradient(circle_at_20%_60%,_rgba(59,130,246,0.18),_transparent_55%),radial-gradient(circle_at_80%_80%,_rgba(14,116,144,0.25),_transparent_60%)]" />
      <div className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-aether-500/20 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />

      <header className="relative z-10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aether-500/20 text-aether-300">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-sm text-aether-300">以太 · 游戏内助手</p>
              <h1 className="text-lg font-semibold">功能介绍</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-green-400/30 bg-green-500/10 px-3 py-1 text-xs text-green-300">
              视觉引擎运行中
            </span>
            <button
              onClick={onOpenDashboard}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:border-aether-400/60 hover:text-white"
            >
              查看账号仪表盘
            </button>
            <button
              onClick={onEnterOverlay}
              className="rounded-full bg-aether-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-aether-400"
            >
              进入悬浮窗演示
            </button>
          </div>
        </nav>

        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pb-16 pt-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">开着游戏就能用</p>
            <h2 className="text-4xl font-semibold leading-tight">多个场景，多种反馈方式</h2>
            <p className="text-base text-white/70">
              装备界面看评分，配队界面看推荐，剧情界面看回顾，探索界面看路线。所有反馈都贴着画面出现，不需要切屏。
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">响应 ≤ 1 秒</div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">文字识别 ≤ 0.5 秒</div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">处理器占用 ≤ 2%</div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6">
            <div className="flex items-center gap-3 text-aether-300">
              <Users size={18} />
              <p className="text-sm">当前画像</p>
            </div>
            <h3 className="mt-4 text-2xl font-semibold">{activeProfile.name}</h3>
            <p className="mt-2 text-sm text-white/70">{activeProfile.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeProfile.focus.map(item => (
                <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {PERSONA_PROFILES.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => onPersonaChange(profile.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    persona === profile.id
                      ? 'border-aether-400/80 bg-aether-500/20 text-aether-100'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-aether-400/40'
                  }`}
                >
                  <div className="text-sm font-semibold">{profile.name}</div>
                  <div className="text-[11px] text-white/50">{profile.tagline}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-16 px-6 pb-20">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="mb-6 flex items-center gap-2 text-aether-300">
            <Layers size={18} />
            <h3 className="text-lg font-semibold">功能入口</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {MODULE_OVERVIEW.map(item => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <item.icon size={18} className="text-aether-300" />
                <h4 className="mt-3 text-base font-semibold">{item.title}</h4>
                <p className="mt-2 text-sm text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="mb-6 flex items-center gap-2 text-aether-300">
            <Layers size={18} />
            <h3 className="text-lg font-semibold">你可以直接体验</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {P0_FEATURES.map(feature => (
              <div key={feature.title} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="text-xs text-aether-300">{feature.tag}</div>
                <h4 className="mt-2 text-lg font-semibold">{feature.title}</h4>
                <p className="mt-2 text-sm text-white/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/0 to-black/40 p-8">
            <div className="mb-6 flex items-center gap-2 text-aether-300">
              <ArrowRight size={18} />
              <h3 className="text-lg font-semibold">上手步骤</h3>
            </div>
            <div className="space-y-4">
              {DEMO_STEPS.map((step, index) => (
                <div key={step.title} className="flex gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-aether-500/20 text-aether-200">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="text-base font-semibold">{step.title}</h4>
                    <p className="mt-1 text-sm text-white/60">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/40 p-8">
            <div className="mb-6 flex items-center gap-2 text-aether-300">
              <ShieldCheck size={18} />
              <h3 className="text-lg font-semibold">安心使用</h3>
            </div>
            <div className="space-y-3 text-sm text-white/70">
              <p>只用视觉与文字识别，不读内存、不抓包。</p>
              <p>数据默认本地保存，避免敏感信息外传。</p>
              <p>悬浮反馈可随时收起，不遮挡操作。</p>
            </div>
            <div className="mt-6 rounded-2xl border border-aether-500/30 bg-aether-500/10 p-4 text-sm text-aether-200">
              你看到的反馈都可以直接用于游戏操作。
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/40 p-8">
          <div className="mb-6 flex items-center gap-2 text-aether-300">
            <Sparkles size={18} />
            <h3 className="text-lg font-semibold">真实画面示例</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {DEMO_SAMPLES.map(sample => (
              <div
                key={sample.title}
                className="group relative h-52 overflow-hidden rounded-2xl border border-white/10"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${sample.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="relative z-10 flex h-full flex-col justify-end p-4">
                  <span className="inline-flex w-fit rounded-full bg-white/20 px-3 py-1 text-xs text-white">
                    {sample.tag}
                  </span>
                  <h4 className="mt-2 text-lg font-semibold">{sample.title}</h4>
                  <p className="text-sm text-white/70">{sample.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-aether-500/15 via-transparent to-transparent p-6">
          <div>
            <h3 className="text-lg font-semibold">现在就开始体验</h3>
            <p className="text-sm text-white/60">进入悬浮窗，切换四种场景查看反馈。</p>
          </div>
          <button
            onClick={onEnterOverlay}
            className="rounded-full bg-aether-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-aether-300"
          >
            进入悬浮窗演示
          </button>
        </section>
      </main>
    </div>
  );
};
