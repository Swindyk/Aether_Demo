import React, { useEffect, useState } from 'react';
import { SceneId } from '../types';

interface ScannerOverlayProps {
  isActive: boolean;
  onScanComplete: () => void;
  activeScene: SceneId;
}

export const ScannerOverlay: React.FC<ScannerOverlayProps> = ({ isActive, onScanComplete, activeScene }) => {
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShowGrid(true);
      const timer = setTimeout(() => {
        setShowGrid(false);
        onScanComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isActive, onScanComplete]);

  if (!isActive && !showGrid) return null;

  const renderBoxes = () => {
    if (activeScene === 'gear') {
      return (
        <>
          <div className="absolute top-[16%] left-[6%] w-[30%] h-[70%] border-2 border-yellow-300/70 rounded-xl animate-pulse">
            <div className="absolute -top-6 left-0 bg-yellow-500/80 text-black text-[10px] px-2 py-1 font-mono">
              检测：武器列表
            </div>
          </div>
          <div className="absolute top-[18%] left-[60%] w-[30%] h-[45%] border-2 border-yellow-300/50 rounded-xl animate-pulse delay-150">
            <div className="absolute -top-6 left-0 bg-yellow-500/80 text-black text-[10px] px-2 py-1 font-mono">
              检测：属性面板
            </div>
          </div>
          <div className="absolute bottom-[12%] right-[8%] w-[20%] h-[10%] border-2 border-yellow-300/40 rounded-xl animate-pulse delay-300">
            <div className="absolute -top-6 left-0 bg-yellow-500/70 text-black text-[10px] px-2 py-1 font-mono">
              检测：操作区
            </div>
          </div>
        </>
      );
    }

    if (activeScene === 'roster') {
      return (
        <>
          <div className="absolute top-[12%] left-[6%] w-[40%] h-[76%] border-2 border-aether-400/70 rounded-xl animate-pulse">
            <div className="absolute -top-6 left-0 bg-aether-900/80 text-aether-100 text-[10px] px-2 py-1 font-mono">
              检测：角色列表
            </div>
          </div>
          <div className="absolute top-[18%] left-[52%] w-[40%] h-[20%] border-2 border-aether-400/50 rounded-xl animate-pulse delay-150">
            <div className="absolute -top-6 left-0 bg-aether-900/80 text-aether-100 text-[10px] px-2 py-1 font-mono">
              检测：增益信息
            </div>
          </div>
          <div className="absolute bottom-[12%] left-[52%] w-[40%] h-[22%] border-2 border-aether-400/50 rounded-xl animate-pulse delay-300">
            <div className="absolute -top-6 left-0 bg-aether-900/80 text-aether-100 text-[10px] px-2 py-1 font-mono">
              检测：上下半阵容
            </div>
          </div>
        </>
      );
    }

    if (activeScene === 'story') {
      return (
        <>
          <div className="absolute top-[14%] left-[8%] w-[30%] h-[70%] border-2 border-purple-300/60 rounded-xl animate-pulse">
            <div className="absolute -top-6 left-0 bg-purple-900/80 text-purple-100 text-[10px] px-2 py-1 font-mono">
              检测：战意效果
            </div>
          </div>
          <div className="absolute top-[18%] right-[6%] w-[46%] h-[48%] border-2 border-purple-300/60 rounded-xl animate-pulse delay-150">
            <div className="absolute -top-6 left-0 bg-purple-900/80 text-purple-100 text-[10px] px-2 py-1 font-mono">
              检测：剧情文本
            </div>
          </div>
          <div className="absolute bottom-[12%] right-[6%] w-[55%] h-[20%] border-2 border-purple-300/50 rounded-xl animate-pulse delay-300">
            <div className="absolute -top-6 left-0 bg-purple-900/80 text-purple-100 text-[10px] px-2 py-1 font-mono">
              检测：队伍配置
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="absolute top-[6%] left-[3%] w-[18%] h-[22%] border-2 border-sky-300/70 rounded-xl animate-pulse">
          <div className="absolute -top-6 left-0 bg-sky-900/80 text-sky-100 text-[10px] px-2 py-1 font-mono">
            检测：小地图
          </div>
        </div>
        <div className="absolute top-[22%] left-[3%] w-[24%] h-[18%] border-2 border-sky-300/60 rounded-xl animate-pulse delay-150">
          <div className="absolute -top-6 left-0 bg-sky-900/80 text-sky-100 text-[10px] px-2 py-1 font-mono">
            检测：任务列表
          </div>
        </div>
        <div className="absolute top-[30%] left-[42%] w-[16%] h-[20%] border-2 border-sky-300/60 rounded-xl animate-pulse delay-200">
          <div className="absolute -top-6 left-0 bg-sky-900/80 text-sky-100 text-[10px] px-2 py-1 font-mono">
            检测：目标点
          </div>
        </div>
        <div className="absolute top-[20%] right-[2%] w-[12%] h-[36%] border-2 border-sky-300/50 rounded-xl animate-pulse delay-300">
          <div className="absolute -top-6 left-0 bg-sky-900/80 text-sky-100 text-[10px] px-2 py-1 font-mono">
            检测：队伍状态
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      <div className="absolute inset-0 bg-aether-950/20 backdrop-blur-[1px]" />
      <div className="absolute w-full h-1 bg-aether-400/80 shadow-[0_0_15px_rgba(45,212,191,0.8)] animate-scan-line" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(45,212,191,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {renderBoxes()}

      <div className="absolute top-10 right-10 flex flex-col items-end text-aether-400 font-mono text-sm">
        <span>视觉模块：已激活</span>
        <span>场景识别中...</span>
      </div>
    </div>
  );
};
