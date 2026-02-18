import React, { useState, useEffect } from 'react';
import { AppMode, ChatMessage, Persona, SceneId } from './types';
import { INITIAL_CHAT_MESSAGE, SCENE_IMAGE } from './constants';
import { OverlayWidget } from './components/OverlayWidget';
import { ScannerOverlay } from './components/ScannerOverlay';
import { Dashboard } from './components/Dashboard';
import { DemoLanding } from './components/DemoLanding';

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<AppMode>(AppMode.DEMO);
  const [returnMode, setReturnMode] = useState<AppMode>(AppMode.DEMO);
  const [persona, setPersona] = useState<Persona>(Persona.POWER);
  const [activeScene, setActiveScene] = useState<SceneId>('gear');
  const [isScanning, setIsScanning] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'system',
      text: INITIAL_CHAT_MESSAGE,
      timestamp: Date.now(),
    },
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'q') {
        if (!isScanning && appMode === AppMode.OVERLAY) handleStartScan();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScanning, appMode]);

  const handleStartScan = () => {
    setIsScanning(true);
  };

  const handleScanComplete = () => {
    setIsScanning(false);
  };

  const openDashboard = () => {
    setReturnMode(appMode);
    setAppMode(AppMode.DASHBOARD);
  };

  if (appMode === AppMode.DEMO) {
    return (
      <DemoLanding
        persona={persona}
        onPersonaChange={setPersona}
        onEnterOverlay={() => setAppMode(AppMode.OVERLAY)}
        onOpenDashboard={openDashboard}
      />
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none font-sans">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${SCENE_IMAGE[activeScene]})`,
          filter: appMode === AppMode.DASHBOARD ? 'blur(10px) brightness(0.3)' : 'none',
          transition: 'filter 0.5s ease-in-out',
        }}
      >
        <div className="absolute bottom-10 right-10 flex gap-4 opacity-80">
          <div className="w-16 h-16 rounded-full border-2 border-white/50 bg-black/40 flex items-center justify-center text-white font-bold">
            战技
          </div>
          <div className="w-20 h-20 rounded-full border-2 border-aether-400 bg-black/40 flex items-center justify-center text-aether-400 font-bold shadow-[0_0_15px_rgba(45,212,191,0.5)]">
            爆发
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 h-2 w-96 bg-gray-800 rounded-full overflow-hidden border border-white/20">
          <div className="h-full w-[85%] bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
        </div>
      </div>

      <ScannerOverlay isActive={isScanning} onScanComplete={handleScanComplete} activeScene={activeScene} />

      {appMode === AppMode.OVERLAY && (
        <OverlayWidget
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onScanStart={handleStartScan}
          onOpenDashboard={openDashboard}
          persona={persona}
          activeScene={activeScene}
          setActiveScene={setActiveScene}
        />
      )}

      {appMode === AppMode.DASHBOARD && (
        <Dashboard onClose={() => setAppMode(returnMode)} persona={persona} />
      )}

      <div className="absolute bottom-2 left-2 text-[10px] text-white/30 font-mono pointer-events-none z-10">
        以太系统 版本 0.9.1 测试 | 状态：在线 | 延迟：12ms
      </div>
    </div>
  );
};

export default App;

