// ============================================================================
// Spanner Data Access Layer
// Handles connection pooling and CRUD operations for persistent data.
//
// Uses the @google-cloud/spanner client with ADC (same auth as Vertex proxy).
// All methods accept userId from the verified JWT session — never from the client.
//
// Design notes:
//   - Auth-only persistence (no anonymous users)
//   - ensureUser called on every request (upserts user + updates last_active_at)
//   - appendMessage uses a transaction for atomic message + conversation update
//   - All functions include error logging for operational visibility
// ============================================================================

import { Spanner } from '@google-cloud/spanner';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SPANNER_INSTANCE = process.env.SPANNER_INSTANCE || 'clearspace';
const SPANNER_DATABASE = process.env.SPANNER_DATABASE || 'clearspace-db';
const SPANNER_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT;

if (!SPANNER_PROJECT) {
  console.error('FATAL: GOOGLE_CLOUD_PROJECT must be set for Spanner.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Singleton Client
// ---------------------------------------------------------------------------

let spannerClient = null;
let database = null;

/**
 * Returns a Spanner Database handle (lazy-initialized singleton).
 * The underlying client manages a session pool automatically.
 */
function getDatabase() {
  if (!database) {
    spannerClient = new Spanner({ projectId: SPANNER_PROJECT });
    const instance = spannerClient.instance(SPANNER_INSTANCE);
    database = instance.database(SPANNER_DATABASE);
    console.log(`[Spanner] Connected to ${SPANNER_PROJECT}/${SPANNER_INSTANCE}/${SPANNER_DATABASE}`);
  }
  return database;
}

/** Generates a UUID v4 for primary keys. */
function uuid() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Ensures a user row exists. Called on every authenticated data request.
 * Uses a read-then-write transaction so it's safe to call repeatedly.
 * Also updates `last_active_at` on every call for engagement tracking.
 *
 * @param {{ userId: string, email?: string, displayName?: string, avatarUrl?: string }} user
 */
export async function ensureUser({ userId, email, displayName, avatarUrl }) {
  const db = getDatabase();
  try {
    await db.runTransactionAsync(async (txn) => {
      const [rows] = await txn.read('Users', {
        keys: [[userId]],
        columns: ['user_id'],
      });

      if (rows.length === 0) {
        // Insert new user + default preferences in one transaction
        txn.insert('Users', {
          user_id: userId,
          email: email || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
          created_at: Spanner.COMMIT_TIMESTAMP,
          updated_at: Spanner.COMMIT_TIMESTAMP,
          last_active_at: Spanner.COMMIT_TIMESTAMP,
        });
        txn.insert('UserPreferences', {
          user_id: userId,
          chat_mode: 'standard',
          thinking_mode: 'fast',
          theme: 'light',
          updated_at: Spanner.COMMIT_TIMESTAMP,
        });
        console.log(`[Spanner] New user created: ${userId}`);
      } else {
        // Update last-seen metadata
        txn.update('Users', {
          user_id: userId,
          email: email || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
          updated_at: Spanner.COMMIT_TIMESTAMP,
          last_active_at: Spanner.COMMIT_TIMESTAMP,
        });
      }
      await txn.commit();
    });
  } catch (err) {
    console.error(`[Spanner] ensureUser failed for ${userId}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * Reads user preferences.
 * @param {string} userId
 * @returns {Promise<{ chatMode: string, thinkingMode: string, theme: string } | null>}
 */
export async function getUserPreferences(userId) {
  const db = getDatabase();
  try {
    const query = {
      sql: `SELECT chat_mode, thinking_mode, theme, updated_at
            FROM UserPreferences
            WHERE user_id = @userId`,
      params: { userId },
    };
    const [rows] = await db.run(query);
    if (rows.length === 0) return null;

    const row = rows[0].toJSON();
    return {
      chatMode: row.chat_mode,
      thinkingMode: row.thinking_mode,
      theme: row.theme,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error(`[Spanner] getUserPreferences failed for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Updates user preferences (partial update — only provided fields are changed).
 * @param {string} userId
 * @param {{ chatMode?: string, thinkingMode?: string, theme?: string }} prefs
 */
export async function upsertUserPreferences(userId, prefs) {
  const db = getDatabase();
  try {
    const row = {
      user_id: userId,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    };
    if (prefs.chatMode !== undefined)     row.chat_mode = prefs.chatMode;
    if (prefs.thinkingMode !== undefined) row.thinking_mode = prefs.thinkingMode;
    if (prefs.theme !== undefined)        row.theme = prefs.theme;

    await db.table('UserPreferences').upsert(row);
  } catch (err) {
    console.error(`[Spanner] upsertUserPreferences failed for ${userId}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Creates a new conversation.
 * @param {string} userId
 * @param {string} chatMode - 'operator' | 'standard'
 * @param {string} [initialTitle] - Optional title (defaults to 'New Conversation' via DDL)
 * @returns {Promise<string>} conversationId
 */
export async function createConversation(userId, chatMode, initialTitle) {
  const db = getDatabase();
  const conversationId = uuid();

  try {
    await db.table('Conversations').insert({
      user_id: userId,
      conversation_id: conversationId,
      title: initialTitle || null,
      chat_mode: chatMode,
      message_count: 0,
      is_deleted: false,
      is_pinned: false,
      created_at: Spanner.COMMIT_TIMESTAMP,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    });
    return conversationId;
  } catch (err) {
    console.error(`[Spanner] createConversation failed for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Lists conversations for a user, most recent first.
 * Excludes soft-deleted conversations.
 *
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<Array<{ conversationId, title, chatMode, messageCount, createdAt, updatedAt }>>}
 */
export async function getConversations(userId, { limit = 20, offset = 0 } = {}) {
  const db = getDatabase();
  try {
    const query = {
      sql: `SELECT conversation_id, title, chat_mode, message_count, is_pinned, created_at, updated_at
            FROM Conversations
            WHERE user_id = @userId AND is_deleted = false
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT @limit OFFSET @offset`,
      params: { userId, limit, offset },
      types: { limit: { type: 'int64' }, offset: { type: 'int64' } },
    };
    const [rows] = await db.run(query);
    return rows.map(r => {
      const row = r.toJSON();
      return {
        conversationId: row.conversation_id,
        title: row.title,
        chatMode: row.chat_mode,
        messageCount: row.message_count,
        isPinned: row.is_pinned,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  } catch (err) {
    console.error(`[Spanner] getConversations failed for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Loads a full conversation with all its messages.
 * Returns conversation metadata + messages in chronological order.
 *
 * @param {string} userId
 * @param {string} conversationId
 * @returns {Promise<{ conversation: Object, messages: Array } | null>}
 */
export async function getConversation(userId, conversationId) {
  const db = getDatabase();
  try {
    // Fetch conversation metadata
    const [convRows] = await db.run({
      sql: `SELECT conversation_id, title, chat_mode, message_count, created_at, updated_at
            FROM Conversations
            WHERE user_id = @userId AND conversation_id = @conversationId AND is_deleted = false`,
      params: { userId, conversationId },
    });

    if (convRows.length === 0) return null;
    const conv = convRows[0].toJSON();

    // Fetch all messages in chronological order
    // Interleaving ensures this read is fast (data co-located with conversation)
    const [msgRows] = await db.run({
      sql: `SELECT message_id, role, content, has_image, created_at
            FROM Messages
            WHERE user_id = @userId AND conversation_id = @conversationId
            ORDER BY created_at ASC`,
      params: { userId, conversationId },
    });

    return {
      conversation: {
        conversationId: conv.conversation_id,
        title: conv.title,
        chatMode: conv.chat_mode,
        messageCount: conv.message_count,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      },
      messages: msgRows.map(r => {
        const msg = r.toJSON();
        return {
          id: msg.message_id,
          role: msg.role,
          content: msg.content,
          hasImage: msg.has_image,
          createdAt: msg.created_at,
        };
      }),
    };
  } catch (err) {
    console.error(`[Spanner] getConversation failed for ${userId}/${conversationId}:`, err.message);
    throw err;
  }
}

/**
 * Appends a message to a conversation and updates metadata.
 * Uses a transaction to atomically:
 *   1. Insert the message row
 *   2. Increment the conversation's message_count
 *   3. Update the conversation's updated_at
 *   4. Auto-generate title from first user message (if title is still default)
 *
 * @param {string} userId
 * @param {string} conversationId
 * @param {{ role: string, content: string, hasImage?: boolean }} message
 * @returns {Promise<string>} messageId
 */
export async function appendMessage(userId, conversationId, message) {
  const db = getDatabase();
  const messageId = uuid();

  try {
    await db.runTransactionAsync(async (txn) => {
      // Insert the message
      txn.insert('Messages', {
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        role: message.role,
        content: message.content,
        has_image: message.hasImage || false,
        created_at: Spanner.COMMIT_TIMESTAMP,
      });

      // Read current conversation state for conditional updates
      const [convRows] = await txn.read('Conversations', {
        keys: [[userId, conversationId]],
        columns: ['message_count', 'title'],
      });

      if (convRows.length > 0) {
        const conv = convRows[0].toJSON();
        const currentCount = conv.message_count || 0;

        const update = {
          user_id: userId,
          conversation_id: conversationId,
          message_count: currentCount + 1,
          updated_at: Spanner.COMMIT_TIMESTAMP,
        };

        // Auto-generate title from first user message if title is still the default
        if (
          (!conv.title || conv.title === 'New Conversation') &&
          message.role === 'user' &&
          message.content
        ) {
          update.title = message.content.slice(0, 100).trim();
        }

        txn.update('Conversations', update);
      }

      await txn.commit();
    });

    return messageId;
  } catch (err) {
    console.error(`[Spanner] appendMessage failed for ${userId}/${conversationId}:`, err.message);
    throw err;
  }
}

/**
 * Soft-deletes a conversation.
 * @param {string} userId
 * @param {string} conversationId
 */
export async function deleteConversation(userId, conversationId) {
  const db = getDatabase();
  try {
    await db.table('Conversations').update({
      user_id: userId,
      conversation_id: conversationId,
      is_deleted: true,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    });
  } catch (err) {
    console.error(`[Spanner] deleteConversation failed for ${userId}/${conversationId}:`, err.message);
    throw err;
  }
}

/**
 * Updates the title of a conversation.
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} title
 */
export async function updateConversationTitle(userId, conversationId, title) {
  const db = getDatabase();
  try {
    await db.table('Conversations').update({
      user_id: userId,
      conversation_id: conversationId,
      title,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    });
  } catch (err) {
    console.error(`[Spanner] updateConversationTitle failed for ${userId}/${conversationId}:`, err.message);
    throw err;
  }
}

/**
 * Pins or unpins a conversation.
 * @param {string} userId
 * @param {string} conversationId
 * @param {boolean} isPinned
 */
export async function pinConversation(userId, conversationId, isPinned) {
  const db = getDatabase();
  try {
    await db.table('Conversations').update({
      user_id: userId,
      conversation_id: conversationId,
      is_pinned: isPinned,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    });
  } catch (err) {
    console.error(`[Spanner] pinConversation failed for ${userId}/${conversationId}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/**
 * Saves an artifact record.
 *
 * @param {string} userId
 * @param {{ conversationId?: string, type: string, title: string, url?: string, metadata?: object }} artifact
 * @returns {Promise<string>} artifactId
 */
export async function saveArtifact(userId, artifact) {
  const db = getDatabase();
  const artifactId = uuid();

  try {
    await db.table('Artifacts').insert({
      user_id: userId,
      artifact_id: artifactId,
      conversation_id: artifact.conversationId || null,
      artifact_type: artifact.type,
      title: artifact.title || null,
      url: artifact.url || null,
      metadata: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
      created_at: Spanner.COMMIT_TIMESTAMP,
    });
    return artifactId;
  } catch (err) {
    console.error(`[Spanner] saveArtifact failed for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Lists artifacts for a user, optionally filtered by type.
 * Ordered by most recent first.
 *
 * @param {string} userId
 * @param {{ type?: string, limit?: number }} options
 * @returns {Promise<Array<{ artifactId, type, title, url, metadata, conversationId, createdAt }>>}
 */
export async function getArtifacts(userId, { type, limit = 20 } = {}) {
  const db = getDatabase();

  try {
    let sql = `SELECT artifact_id, artifact_type, title, url, metadata, conversation_id, created_at
               FROM Artifacts
               WHERE user_id = @userId`;
    const params = { userId };
    const types = {};

    if (type) {
      sql += ` AND artifact_type = @type`;
      params.type = type;
    }

    sql += ` ORDER BY created_at DESC LIMIT @limit`;
    params.limit = limit;
    types.limit = { type: 'int64' };

    const [rows] = await db.run({ sql, params, types });
    return rows.map(r => {
      const row = r.toJSON();
      return {
        artifactId: row.artifact_id,
        type: row.artifact_type,
        title: row.title,
        url: row.url,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
      };
    });
  } catch (err) {
    console.error(`[Spanner] getArtifacts failed for ${userId}:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cleanup / Shutdown
// ---------------------------------------------------------------------------

/**
 * Closes the Spanner client and releases the session pool.
 * Call on server shutdown for clean teardown.
 */
export async function closeSpanner() {
  if (database) {
    await database.close();
    database = null;
  }
  if (spannerClient) {
    spannerClient.close();
    spannerClient = null;
  }
  console.log('[Spanner] Connection closed.');
}
