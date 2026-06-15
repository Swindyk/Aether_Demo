import React, { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { AgentRunResult, AssistantStatus } from '../types';

const AVATAR_SRC = './brand/aether-avatar.png';

const sourceLabel = {
  live: '实时结果',
  cache: '缓存回放',
  error: '失败',
} as const;

const firstLine = (value?: string) => String(value || '')
  .split(/\r?\n|。|；/)
  .map(item => item.trim())
  .find(Boolean) || '';

const evidenceTags = (run?: AgentRunResult) => {
  if (!run) return [];
  return [
    run.observation?.confidence > 0 ? '看了截图' : '',
    run.accountContextUsed?.account ? '用了账号' : '',
    run.knowledge?.length ? '命中知识' : '',
    run.source === 'cache' ? '缓存回放' : '实时结果',
  ].filter(Boolean).slice(0, 4);
};

export const AnswerCard: React.FC = () => {
  const [status, setStatus] = useState<AssistantStatus>({ state: 'idle', message: '随时可以解读画面' });
  const [run, setRun] = useState<AgentRunResult>();

  useEffect(() => {
    window.aether?.getAssistantStatus().then(setStatus);
    window.aether?.getLatestRun().then(setRun);
    const removeStatus = window.aether?.onAssistantStatusChanged(setStatus);
    const removeRun = window.aether?.onRunComplete(setRun);
    return () => {
      removeStatus?.();
      removeRun?.();
    };
  }, []);

  useEffect(() => {
    if (status.state !== 'ready' && status.state !== 'error') return;
    const audio = new Audio('./audio/advice.mp3');
    audio.volume = 0.3;
    void audio.play().catch(() => undefined);
  }, [status.state, status.updatedAt]);

  const busy = status.state === 'capturing' || status.state === 'analyzing';
  const failed = status.state === 'error' || run?.source === 'error';
  const latestError = run?.errors?.length ? run.errors[run.errors.length - 1] : undefined;
  const failureMessage = latestError?.message || status.message || run?.summary || '这次没有完成分析。';
  const conclusion = run?.playerAnswer?.conclusion || firstLine(run?.answer) || firstLine(run?.summary) || run?.observation.summary;
  const cardActions = run?.playerAnswer?.buildAdvice?.length
    ? run.playerAnswer.buildAdvice
    : run?.actions || [];
  const tags = evidenceTags(run);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-2 text-white">
      <div className="h-full w-full overflow-hidden rounded-[24px] border border-aether-300/25 bg-[#071018] shadow-[0_18px_55px_rgba(0,0,0,0.52)]">
        <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={AVATAR_SRC} alt="" className="h-9 w-9 object-contain" />
            <div>
              <p className="text-sm font-semibold">以太刚刚看懂</p>
              <p className="text-[10px] text-white/40">Alt+Shift+Q 查看完整回答</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/50">
            {busy ? <LoaderCircle size={11} className="animate-spin text-aether-200" /> : failed ? <TriangleAlert size={11} className="text-red-300" /> : <CheckCircle2 size={11} className="text-aether-200" />}
            {busy ? '正在分析' : run ? sourceLabel[run.source] : '等待结果'}
          </span>
        </header>
        <main className="px-4 py-3">
          {busy ? (
            <p className="rounded-xl bg-aether-300/[0.06] px-3 py-3 text-sm text-aether-100">{status.message}</p>
          ) : failed ? (
            <p className="rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-3 text-sm leading-6 text-red-100/80">{failureMessage}</p>
          ) : run ? (
            <>
              <p className="line-clamp-2 text-base font-semibold leading-6 text-white/90">{conclusion}</p>
              <div className="mt-3 space-y-1.5">
                {cardActions.slice(0, 2).map((action, index) => (
                  <p key={`${action}-${index}`} className="flex gap-2 text-xs leading-5 text-white/55">
                    <span className="text-aether-200">{index + 1}</span>{action}
                  </p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="rounded-full border border-aether-300/20 bg-aether-300/[0.07] px-2 py-1 text-[10px] text-aether-100/80">{tag}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-white/45">{status.message}</p>
          )}
        </main>
      </div>
    </div>
  );
};
