export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'sent' | 'failed';

export interface Character {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url?: string;
  voice_id?: string;
  tts_provider?: string;
  model_type?: string;
  model_vrm?: string;
  live2d_model?: string;
  background_url?: string;
  background_mode?: string;
  greeting_message?: string;
  llm_endpoint?: string;
  llm_model?: string;
  llm_temperature?: number;
  animation_profile?: {
    energy: number;
    confidence: number;
    nervousness: number;
    expressiveness: number;
    playfulness: number;
  };
  capability_profile?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  status: MessageStatus;
  serverMessageId?: number;
  emotion?: string;
  gesture?: string;
  audioUrl?: string;
  tokens?: number;
  tokensPerSecond?: number;
  latencyMs?: number;
  model?: string;
}

export interface Session {
  id: number;
  character_id: number;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatResponse {
  ok: boolean;
  reply: string;
  audio: string | null;
  session_id: number;
  emotion?: string;
  intensity?: number;
  gesture?: string | null;
  user_message_id?: number;
  assistant_message_id?: number;
  tokens_used?: number;
  tokens_per_second?: number;
  ttft_ms?: number;
  model?: string;
}

export interface AppConfig {
  [key: string]: unknown;
}

export interface VoiceEntry {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  installed?: boolean;
}

export interface TTSModel {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  size_mb: number;
  voice_id: string;
  sample_url: string;
  tags: string[];
  installed: boolean;
  installed_at?: string;
}

export interface TTSModelsResponse {
  models: TTSModel[];
  catalog_updated: string;
  total_installed_mb: number;
}

export interface DownloadProgress {
  model_id: string;
  status: 'downloading' | 'complete' | 'error' | 'idle';
  progress: number;
  bytes_done: number;
  bytes_total: number;
  file_index: number;
  file_count: number;
  error?: string;
}
