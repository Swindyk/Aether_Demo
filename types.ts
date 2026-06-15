export enum Persona {
  BALANCED = 'BALANCED',
  POWER = 'POWER',
  STORY = 'STORY',
  NEWBIE = 'NEWBIE',
  COLLECTOR = 'COLLECTOR',
}

export type SceneId = 'gear' | 'roster' | 'story' | 'explore' | 'unknown';
export type AgentSource = 'live' | 'cache' | 'error';
export type GameId = 'genshin' | 'starrail';
export type AnalysisMode = 'instant' | 'deep';
export type RetrievalSource = 'account' | 'local' | 'community' | 'web' | 'model';
export type AgentSkillPhase = 'observe' | 'context' | 'knowledge' | 'reason' | 'answer' | 'guard';
export type CaptureMode = 'cursor-display' | 'manual-screen' | 'manual-window' | 'demo';
export type AssistantState = 'idle' | 'capturing' | 'analyzing' | 'ready' | 'error';
export interface AssistantStatus {
  state: AssistantState;
  message: string;
  shortcutReady?: boolean;
  latestRunId?: string;
  updatedAt?: number;
}
export type ScreenContextKind = 'game' | 'web' | 'document' | 'chat' | 'system' | 'desktop' | 'other';

export interface PersonaProfile {
  id: Persona;
  name: string;
  tagline: string;
  focus: string[];
}

export interface SceneMeta {
  id: Exclude<SceneId, 'unknown'>;
  name: string;
  hint: string;
}

export interface DesktopSource {
  id: string;
  name: string;
  kind: 'demo' | 'screen' | 'window';
  scene: SceneId;
  thumbnail: string;
  displayId?: string;
}

export interface AppSettings {
  experienceVersion?: number;
  persona: Persona;
  selectedSourceId: string;
  selectedSourceName?: string;
  selectedScene: SceneId;
  captureMode?: CaptureMode;
  captureDisplayId?: number;
  shortcutReady?: boolean;
}

export interface FollowScreenOptions {
  continuous?: boolean;
}

export interface FollowScreenResult {
  settings: AppSettings;
  sourceName: string;
  kind: 'screen' | 'window';
}

export interface KnowledgePartitionStat {
  game: string;
  count: number;
  tiers: Record<string, number>;
}

export interface KnowledgeTierStat {
  tier: string;
  count: number;
}

export interface KnowledgeSyncStatus {
  state?: string;
  reason?: string;
  runtimeVersionBefore?: string;
  runtimeVersion?: string;
  bundledVersion?: string;
  runtimeHash?: string;
  bundledHash?: string;
  runtimePath?: string;
  bundledPath?: string;
  corpusDir?: string;
  corpusEntries?: number;
  syncedAt?: string;
  importedFrom?: string;
  updated?: boolean;
}

export interface RuntimeStatus {
  providerName?: string;
  model: string;
  fastVisionModel?: string;
  tokenConfigured: boolean;
  apiBaseUrl?: string;
  apiWire?: string;
  tavilyConfigured?: boolean;
  knowledgeVersion: string;
  knowledgeBuiltInVersion?: string;
  knowledgeUpdatedAt?: string;
  knowledgeEntries: number;
  knowledgeRuntimePath?: string;
  knowledgeBundledPath?: string;
  knowledgeCorpusDir?: string;
  knowledgePartitions?: KnowledgePartitionStat[];
  knowledgeSourceTiers?: KnowledgeTierStat[];
  knowledgeSync?: KnowledgeSyncStatus;
  ragStrategy?: string;
  embeddingEnabled?: boolean;
  accountCount?: number;
  latestRunAt?: number;
  dataDir: string;
}

export interface AppState {
  settings: AppSettings;
  runtime: RuntimeStatus;
  latestRun?: AgentRunResult;
  currentConversation?: AgentConversation;
  assistantStatus?: AssistantStatus;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  agentRun?: AgentRunResult;
}

export type AgentTraceKind = 'observe' | 'reason' | 'skill' | 'memory' | 'schedule' | 'rule' | 'respond';

export interface AgentTraceStep {
  id: string;
  kind: AgentTraceKind;
  title: string;
  detail: string;
  durationMs: number;
  status: 'queued' | 'running' | 'done';
}

export interface AgentSkillRun {
  id: string;
  name: string;
  displayName?: string;
  phase?: AgentSkillPhase;
  toolName?: string;
  intent: string;
  triggerReason?: string;
  inputSummary?: string;
  outputSummary?: string;
  latencyMs: number;
  confidence: number;
  status: 'ready' | 'running' | 'skipped' | 'done';
  output: string;
  error?: string;
}

export interface AgentRuleCheck {
  id: string;
  name: string;
  priority: 'P0' | 'P1' | 'P2';
  verdict: 'pass' | 'warn' | 'block';
  detail: string;
}

export interface AgentMemoryFact {
  id: string;
  scope: 'profile' | 'account' | 'scene' | 'session';
  label: string;
  value: string;
  confidence: number;
  updatedAt: number;
  source: string;
}

export interface AgentScheduleItem {
  id: string;
  title: string;
  cadence: string;
  owner: string;
  nextRun: string;
  status: 'queued' | 'running' | 'done' | 'paused';
}

export interface AgentObservation {
  contextKind: ScreenContextKind;
  app: string;
  game?: string;
  scene: SceneId;
  summary: string;
  facts: string[];
  ocrText: string[];
  confidence: number;
  selectedCharacter?: string;
  visibleRoster?: string[];
  activeTeamCandidates?: string[];
  stats?: Record<string, number | string>;
}

export interface KnowledgeHit {
  id: string;
  game: string;
  title: string;
  content: string;
  score: number;
  topic?: string;
  character?: string;
  scene?: SceneId | string;
  sourceUrl?: string;
  sourceTitle?: string;
  author?: string;
  version?: string;
  updatedAt?: number;
  sourceType?: RetrievalSource;
  sourceTier?: 'curated' | 'preferred' | 'fallback' | 'local' | 'community';
  semanticScore?: number;
  embeddingScore?: number;
}

export interface AgentCitation {
  id: string;
  title: string;
  url: string;
  author: string;
  version: string;
  updatedAt: number;
  sourceType: RetrievalSource;
  sourceTier?: 'curated' | 'preferred' | 'fallback' | 'local' | 'community';
}

export interface FilteredSource {
  url: string;
  title: string;
  reason: string;
}

export interface GameAccount {
  id: string;
  game: GameId;
  uid: string;
  label: string;
  nickname?: string;
  active: boolean;
  characterCount: number;
  syncedAt?: number;
  error?: string;
}

export interface AccountCharacter {
  id: string;
  accountId: string;
  game: GameId;
  characterId: string;
  name: string;
  level: number;
  rank: number;
  equipmentSummary: string;
  properties: Record<string, number | string>;
  source: 'enka' | 'vision';
  confidence: number;
  observedAt: number;
}

export interface AccountContext {
  account?: GameAccount;
  characters: AccountCharacter[];
  summary: string;
  visibleRosterMatched?: string[];
  ownedCandidates?: string[];
}

export interface PlayerTeamSuggestion {
  title: string;
  members: string[];
  reason: string;
}

export interface PlayerAnswer {
  conclusion: string;
  currentTeam: string;
  betterTeams: PlayerTeamSuggestion[];
  buildAdvice: string[];
  basis: string;
  sourcesUsed: string[];
  text: string;
}

export interface KnowledgeSearchResult {
  query: string;
  hits: KnowledgeHit[];
  citations: AgentCitation[];
  filteredSources: FilteredSource[];
  retrievalSource: RetrievalSource[];
  tavilyRequestIds: string[];
  fromCache: boolean;
}

export interface AgentError {
  stage: string;
  message: string;
  attempt: number;
  timestamp: number;
}

export interface AgentMetrics {
  latencyMs: number;
  modelLatencyMs: number;
  localLatencyMs: number;
  memoryWrites: number;
  cacheHit: boolean;
  retries: number;
}

export interface AgentRunResult {
  id: string;
  createdAt: number;
  query: string;
  conversationId?: string;
  accountKey?: string;
  mode?: 'chat' | 'scan' | 'background';
  scene: SceneId;
  persona: Persona;
  answer: string;
  playerAnswer?: PlayerAnswer;
  summary: string;
  model: string;
  requestId: string;
  source: AgentSource;
  inputSourceName: string;
  observation: AgentObservation;
  actions: string[];
  knowledge: KnowledgeHit[];
  citations: AgentCitation[];
  filteredSources: FilteredSource[];
  retrievalSource: RetrievalSource[];
  accountContextUsed?: AccountContext;
  analysisMode: AnalysisMode;
  tavilyRequestIds: string[];
  trace: AgentTraceStep[];
  skills: AgentSkillRun[];
  rules: AgentRuleCheck[];
  memory: AgentMemoryFact[];
  schedule: AgentScheduleItem[];
  errors: AgentError[];
  metrics: AgentMetrics;
}

export interface AgentRunInput {
  query: string;
  persona: Persona;
  scene?: SceneId;
  mode: 'chat' | 'scan' | 'background';
  includeVision?: boolean;
  analysisMode?: AnalysisMode;
  conversationId?: string;
  accountKey?: string;
  reuseLastObservation?: boolean;
  parentRunId?: string;
}

export interface AgentConversationMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  runId?: string;
}

export interface AgentConversation {
  id: string;
  accountKey: string;
  title: string;
  game?: string;
  scene: SceneId;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastRunId?: string;
  lastObservation?: AgentObservation;
  lastKnowledge: KnowledgeHit[];
  lastRetrievalSource: RetrievalSource[];
  filteredSources: FilteredSource[];
  lastRunSnapshot?: AgentRunResult;
  messages: AgentConversationMessage[];
}

export interface HealthResult {
  ok: boolean;
  model: string;
  requestId: string;
  latencyMs: number;
  message: string;
}

export interface AetherDesktopApi {
  getState: () => Promise<AppState>;
  listSources: () => Promise<DesktopSource[]>;
  followScreen: (options?: FollowScreenOptions) => Promise<FollowScreenResult>;
  selectSource: (source: Pick<DesktopSource, 'id' | 'name' | 'kind' | 'scene'>) => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  runAgent: (input: AgentRunInput) => Promise<AgentRunResult>;
  getLatestRun: () => Promise<AgentRunResult | undefined>;
  getRun: (runId: string) => Promise<AgentRunResult | undefined>;
  getRuns: (limit?: number) => Promise<AgentRunResult[]>;
  getMemory: (persona: Persona) => Promise<AgentMemoryFact[]>;
  getConversations: (input?: { accountKey?: string; limit?: number; includeAll?: boolean }) => Promise<AgentConversation[]>;
  getConversation: (input?: { accountKey?: string; conversationId?: string }) => Promise<AgentConversation | undefined>;
  selectConversation: (input: { accountKey?: string; conversationId: string }) => Promise<AgentConversation>;
  openConversation: (input: { accountKey?: string; conversationId: string }) => Promise<{ conversation: AgentConversation; run?: AgentRunResult }>;
  askConversation: (input: { conversationId?: string; accountKey?: string; query: string; persona?: Persona; scene?: SceneId; parentRunId?: string; analysisMode?: AnalysisMode }) => Promise<AgentRunResult>;
  newConversationFromScan: () => Promise<AgentRunResult | undefined>;
  checkHealth: () => Promise<HealthResult>;
  warmup: (persona: Persona) => Promise<AgentRunResult[]>;
  reloadKnowledge: () => Promise<RuntimeStatus>;
  importKnowledge: () => Promise<RuntimeStatus>;
  listAccounts: () => Promise<GameAccount[]>;
  connectAccount: (input: { game: GameId; uid: string; label?: string }) => Promise<GameAccount>;
  syncAccount: (accountId: string) => Promise<GameAccount>;
  removeAccount: (accountId: string) => Promise<void>;
  getAccountContext: (game?: GameId) => Promise<AccountContext>;
  searchKnowledge: (input: { query: string; game?: GameId; scene?: SceneId; selectedCharacter?: string; visibleRoster?: string[]; activeTeamCandidates?: string[]; allowWeb?: boolean }) => Promise<KnowledgeSearchResult>;
  quickScan: () => Promise<AgentRunResult | undefined>;
  showLatest: () => Promise<void>;
  getAssistantStatus: () => Promise<AssistantStatus>;
  openControl: () => Promise<void>;
  openAgentOps: () => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
  onRunComplete: (callback: (run: AgentRunResult) => void) => () => void;
  onShowLatest: (callback: (run?: AgentRunResult) => void) => () => void;
  onConversationSelected: (callback: (conversation: AgentConversation) => void) => () => void;
  onConversationOpened: (callback: (payload: { conversation: AgentConversation; run?: AgentRunResult }) => void) => () => void;
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
  onWarmupProgress: (callback: (progress: { current: number; total: number; name: string }) => void) => () => void;
  onAssistantStatusChanged: (callback: (status: AssistantStatus) => void) => () => void;
}

declare global {
  interface Window {
    aether?: AetherDesktopApi;
  }
}
