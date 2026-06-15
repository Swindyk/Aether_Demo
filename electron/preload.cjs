const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('aether', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  listSources: () => ipcRenderer.invoke('capture:list-sources'),
  followScreen: options => ipcRenderer.invoke('capture:follow-screen', options),
  selectSource: source => ipcRenderer.invoke('capture:select-source', source),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  runAgent: input => ipcRenderer.invoke('agent:run', input),
  getLatestRun: () => ipcRenderer.invoke('agent:latest'),
  getRun: runId => ipcRenderer.invoke('agent:get-run', runId),
  getRuns: limit => ipcRenderer.invoke('agent:runs', limit),
  getMemory: persona => ipcRenderer.invoke('agent:memory', persona),
  getConversations: input => ipcRenderer.invoke('conversation:list', input),
  getConversation: input => ipcRenderer.invoke('conversation:get', input),
  selectConversation: input => ipcRenderer.invoke('conversation:select', input),
  openConversation: input => ipcRenderer.invoke('conversation:open', input),
  askConversation: input => ipcRenderer.invoke('conversation:ask', input),
  newConversationFromScan: () => ipcRenderer.invoke('conversation:new-from-scan'),
  checkHealth: () => ipcRenderer.invoke('agent:health'),
  warmup: persona => ipcRenderer.invoke('agent:warmup', persona),
  reloadKnowledge: () => ipcRenderer.invoke('knowledge:reload'),
  importKnowledge: () => ipcRenderer.invoke('knowledge:import'),
  listAccounts: () => ipcRenderer.invoke('account:list'),
  connectAccount: input => ipcRenderer.invoke('account:connect', input),
  syncAccount: accountId => ipcRenderer.invoke('account:sync', accountId),
  removeAccount: accountId => ipcRenderer.invoke('account:remove', accountId),
  getAccountContext: game => ipcRenderer.invoke('account:context', game),
  searchKnowledge: input => ipcRenderer.invoke('knowledge:search', input),
  quickScan: () => ipcRenderer.invoke('assistant:quick-scan'),
  showLatest: () => ipcRenderer.invoke('assistant:show-latest'),
  getAssistantStatus: () => ipcRenderer.invoke('assistant:get-status'),
  openControl: () => ipcRenderer.invoke('window:open-control'),
  openAgentOps: () => ipcRenderer.invoke('window:open-agentops'),
  closeCurrentWindow: () => ipcRenderer.invoke('window:close-current'),
  onRunComplete: on('agent:run-complete'),
  onShowLatest: on('assistant:show-latest'),
  onConversationSelected: on('conversation:selected'),
  onConversationOpened: on('conversation:opened'),
  onSettingsChanged: on('settings:changed'),
  onWarmupProgress: on('warmup:progress'),
  onAssistantStatusChanged: on('assistant:status-changed'),
});
