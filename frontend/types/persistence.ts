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
