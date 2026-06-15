import { AgentRunInput, AgentRunResult } from '../types';

export const runAetherAgent = async (input: AgentRunInput): Promise<AgentRunResult> => {
  if (!window.aether) {
    throw new Error('未连接 Electron 本地 Agent runtime，请使用 npm run dev 启动桌面版。');
  }
  return window.aether.runAgent(input);
};
