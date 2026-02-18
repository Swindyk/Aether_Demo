export enum AppMode {
  DEMO = 'DEMO',
  OVERLAY = 'OVERLAY',
  DASHBOARD = 'DASHBOARD',
}

export enum Persona {
  POWER = 'POWER',
  STORY = 'STORY',
  NEWBIE = 'NEWBIE',
  COLLECTOR = 'COLLECTOR',
}

export enum OverlayState {
  COLLAPSED = 'COLLAPSED',
  CHAT = 'CHAT',
  SCAN_RESULT = 'SCAN_RESULT',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}

export interface ArtifactStats {
  set: string;
  slot: string;
  mainStat: string;
  mainValue: string;
  subStats: string[];
  score: string; // SSS, S, A, B, F
  character: string; // Recommended character
}

export interface GameContext {
  name: string;
  character: string;
  party: string[];
  level: number;
  currentActivity: string; // e.g., "Abyss Floor 12"
}

export interface PersonaProfile {
  id: Persona;
  name: string;
  tagline: string;
  focus: string[];
}

export interface FeatureItem {
  title: string;
  description: string;
  tag: string;
}

export interface DemoStep {
  title: string;
  description: string;
}

export interface DemoSample {
  title: string;
  description: string;
  image: string;
  tag: string;
}

export type SceneId = 'gear' | 'roster' | 'story' | 'explore';

export interface SceneMeta {
  id: SceneId;
  name: string;
  hint: string;
}
