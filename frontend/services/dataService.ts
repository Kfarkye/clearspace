// ============================================================================
// Data Service — Typed client for /api/data/* persistence endpoints
//
// All requests include credentials (httpOnly session cookie) for auth.
// Errors are thrown as Error instances for the caller to handle.
// ============================================================================

import type {
  ConversationSummary,
  ConversationDetail,
  UserPreferences,
  ArtifactSummary,
  ArtifactPayload,
} from '../types/persistence';
import type { ChatMode } from '../hooks/useChat';

const BASE = '/api/data';

/** Shared fetch wrapper with JSON parsing and error handling. */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    // Non-authenticated requests get 401 — swallow silently (user not signed in)
    if (res.status === 401) {
      throw new Error('AUTH_REQUIRED');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Lists conversations, most recent first. */
export async function listConversations(limit = 20, offset = 0): Promise<ConversationSummary[]> {
  const result = await apiFetch<{ conversations: ConversationSummary[] }>(
    `/conversations?limit=${limit}&offset=${offset}`
  );
  return result.conversations;
}

/** Creates a new conversation. Returns the ID. */
export async function createConversation(chatMode: ChatMode, initialTitle?: string): Promise<string> {
  const result = await apiFetch<{ conversationId: string }>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ chatMode, initialTitle }),
  });
  return result.conversationId;
}

/** Loads a full conversation with all messages. */
export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  try {
    return await apiFetch<ConversationDetail>(`/conversations/${conversationId}`);
  } catch (e: any) {
    if (e.message?.includes('404') || e.message?.includes('not found')) return null;
    throw e;
  }
}

/** Soft-deletes a conversation. */
export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch(`/conversations/${conversationId}`, { method: 'DELETE' });
}

/** Updates a conversation's title. */
export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  await apiFetch(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

/** Pins or unpins a conversation. */
export async function pinConversation(conversationId: string, isPinned: boolean): Promise<void> {
  await apiFetch(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPinned }),
  });
}

/** Appends a message to a conversation. Returns the message ID. */
export async function appendMessage(
  conversationId: string,
  message: { role: string; content: string; hasImage?: boolean }
): Promise<string> {
  const result = await apiFetch<{ messageId: string }>(
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(message),
    }
  );
  return result.messageId;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** Gets user preferences. Returns defaults if none saved. */
export async function getPreferences(): Promise<UserPreferences> {
  const result = await apiFetch<{ preferences: UserPreferences }>('/preferences');
  return result.preferences;
}

/** Updates user preferences (partial — only send changed fields). */
export async function updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  await apiFetch('/preferences', {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  });
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/** Lists artifacts, optionally filtered by type. */
export async function listArtifacts(
  options: { type?: string; limit?: number } = {}
): Promise<ArtifactSummary[]> {
  const params = new URLSearchParams();
  if (options.type) params.set('type', options.type);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const result = await apiFetch<{ artifacts: ArtifactSummary[] }>(`/artifacts${qs}`);
  return result.artifacts;
}

/** Saves an artifact record. Returns the artifact ID. */
export async function saveArtifact(artifact: ArtifactPayload): Promise<string> {
  const result = await apiFetch<{ artifactId: string }>('/artifacts', {
    method: 'POST',
    body: JSON.stringify(artifact),
  });
  return result.artifactId;
}

// ---------------------------------------------------------------------------
// Auth Check Helper
// ---------------------------------------------------------------------------

/** Returns true if the user has an active session (can persist data). */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.authenticated === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Spanner Asset Ledger
// ---------------------------------------------------------------------------

import type { SpannerAsset } from '../types/persistence';

/** Lists full artifacts from the Spanner Asset Ledger. */
export async function listAssets(limit: number = 50): Promise<SpannerAsset[]> {
  const res = await fetch(`/api/assets?limit=${limit}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
