// ============================================================================
// Persistence Types — Shared between frontend services and components
// ============================================================================

import type { ChatMode, ThinkingMode } from '../hooks/useChat';

/** Summary of a conversation for the sidebar list. */
export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  chatMode: ChatMode;
  messageCount: number;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Full conversation detail with messages. */
export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: PersistedMessage[];
}

/** A single persisted message. */
export interface PersistedMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  hasImage: boolean;
  createdAt: string;
}

/** User preferences stored in Spanner. */
export interface UserPreferences {
  chatMode: ChatMode;
  thinkingMode: ThinkingMode;
  theme: 'light' | 'dark';
  updatedAt?: string;
}

/** Artifact record. */
export interface ArtifactSummary {
  artifactId: string;
  type: 'deploy' | 'document' | 'analysis' | 'scoreboard';
  title: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
  conversationId: string | null;
  createdAt: string;
}

/** Payload for saving a new artifact. */
export interface ArtifactPayload {
  conversationId?: string;
  type: string;
  title: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/** 
 * Advanced Asset Ledger (Spanner) Representation. 
 * Mirrored from backend/lib/assets/assetSchema.ts 
 */
export interface AssetSource {
  sourceId: string;
  sourceType: string;
  title?: string;
  url?: string;
  publisher?: string;
  accessedAt: string;
}

export interface AssetRender {
  renderId: string;
  renderType: string;
  status: string;
  url?: string;
}

export interface SpannerAsset {
  assetId: string;
  type: string;
  status: string;
  title: string;
  summary?: string;
  ownerUserId?: string;
  sourceSessionId?: string;
  schemaVersion: string;
  payloadHash: string;
  payload: {
    html?: string;
    text?: string;
    [key: string]: any;
  };
  tags: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  sources?: AssetSource[];
  renders?: AssetRender[];
}
