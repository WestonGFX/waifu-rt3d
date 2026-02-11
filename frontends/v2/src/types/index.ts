export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  status: MessageStatus;
  requestText?: string;
  clientMessageId?: string;
  serverMessageId?: number;
}

export interface Character {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url?: string;
  voice_id?: string;
  tts_provider?: string;
  personality_traits?: string[];
  live2d_model?: string;
  model_type?: string;
}

export interface MemoryGraphNode {
  id: string;
  label: string;
  role: 'user' | 'assistant' | 'memory';
  x: number;
  y: number;
  score?: number;
}

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'sequence' | 'retrieval';
}

export type MemoryGraphMode = 'rag' | 'session';

export interface MemoryGraphPayload {
  mode: MemoryGraphMode;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  stats: {
    sessionMessages: number;
    memoryHits: number;
    ragAvailable: boolean;
  };
}

export type VoiceSource = 'idle' | 'mic' | 'tts' | 'mixed';

export interface VoiceLevelSample {
  level: number;
  source: VoiceSource;
  timestamp: number;
}

export interface AppConfig {
  llm?: {
    temperature?: number;
    [key: string]: unknown;
  };
  tts?: {
    tts_pitch?: number;
    [key: string]: unknown;
  };
  ui?: {
    speech_auto?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HudSettings {
  voicePitch: number;
  creativity: number;
  speechAuto: boolean;
}

export interface ChatResponse {
  ok: boolean;
  reply: string;
  audio: string | null;
  session_id: number;
  emotion?: string;
  intensity?: number;
  gesture?: string | null;
  status?: 'ok' | 'error';
  client_message_id?: string;
  user_message_id?: number;
  assistant_message_id?: number;
  memory_hits?: Array<{
    text: string;
    role: string;
    score: number;
    session_id?: number;
    timestamp?: number;
  }>;
}
