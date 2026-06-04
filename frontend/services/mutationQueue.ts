// ============================================================================
// Mutation Queue — Resilient persistence layer for chat messages
//
// Solves: Silent data loss from fire-and-forget saves.
// Strategy: Optimistic UI → queue mutation → retry with exponential backoff.
//
// If the network drops or the tab closes before a save completes,
// mutations persist in IndexedDB and retry on the next session.
//
// Each message in the queue tracks:
//   - id: unique mutation ID
//   - attempts: number of retries so far
//   - status: 'pending' | 'inflight' | 'failed'
//   - conversationId, role, content, hasImage, createdAt
// ============================================================================

const DB_NAME = 'clearspace_mutations';
const STORE_NAME = 'pending_messages';
const DB_VERSION = 1;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

export interface QueuedMutation {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  hasImage: boolean;
  attempts: number;
  status: 'pending' | 'inflight' | 'failed';
  createdAt: number;
  /** The React message ID this mutation corresponds to (for UI status tracking). */
  messageId: string;
}

// ---------------------------------------------------------------------------
// IndexedDB Helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_conversation', 'conversationId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readwrite');
    txn.objectStore(STORE_NAME).put(mutation);
    txn.oncomplete = () => { db.close(); resolve(); };
    txn.onerror = () => { db.close(); reject(txn.error); };
  });
}

async function removeMutation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readwrite');
    txn.objectStore(STORE_NAME).delete(id);
    txn.oncomplete = () => { db.close(); resolve(); };
    txn.onerror = () => { db.close(); reject(txn.error); };
  });
}

async function getAllPending(): Promise<QueuedMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readonly');
    const request = txn.objectStore(STORE_NAME).index('by_status').getAll('pending');
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function getFailedForConversation(conversationId: string): Promise<QueuedMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readonly');
    const index = txn.objectStore(STORE_NAME).index('by_conversation');
    const request = index.getAll(conversationId);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as QueuedMutation[]).filter(m => m.status === 'failed'));
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

// ---------------------------------------------------------------------------
// Queue Operations
// ---------------------------------------------------------------------------

/** Enqueues a message save. Returns immediately. */
export async function enqueue(
  messageId: string,
  conversationId: string,
  message: { role: string; content: string; hasImage?: boolean },
): Promise<void> {
  const mutation: QueuedMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    messageId,
    conversationId,
    role: message.role,
    content: message.content,
    hasImage: message.hasImage || false,
    attempts: 0,
    status: 'pending',
    createdAt: Date.now(),
  };

  await putMutation(mutation);
}

/**
 * Processes the pending queue. Called after each send cycle
 * and on page load to retry any mutations from a previous session.
 *
 * Returns a set of messageIds that permanently failed (for UI flagging).
 */
export async function flush(
  saveFn: (conversationId: string, msg: { role: string; content: string; hasImage?: boolean }) => Promise<string>,
): Promise<Set<string>> {
  const failedMessageIds = new Set<string>();
  let pending: QueuedMutation[];

  try {
    pending = await getAllPending();
  } catch {
    // IndexedDB not available (incognito, etc.) — degrade silently
    return failedMessageIds;
  }

  for (const mutation of pending) {
    // Mark as inflight
    mutation.status = 'inflight';
    mutation.attempts += 1;
    await putMutation(mutation);

    try {
      await saveFn(mutation.conversationId, {
        role: mutation.role,
        content: mutation.content,
        hasImage: mutation.hasImage,
      });
      // Success — remove from queue
      await removeMutation(mutation.id);
    } catch (e: any) {
      if (e.message === 'AUTH_REQUIRED') {
        // User signed out — reset to pending, don't count as attempt
        mutation.status = 'pending';
        mutation.attempts -= 1;
        await putMutation(mutation);
        continue;
      }

      if (mutation.attempts >= MAX_RETRIES) {
        // Permanent failure — mark and stop retrying
        mutation.status = 'failed';
        await putMutation(mutation);
        failedMessageIds.add(mutation.messageId);
      } else {
        // Transient failure — back to pending with backoff
        mutation.status = 'pending';
        await putMutation(mutation);

        // Exponential backoff before next attempt
        const delay = BASE_DELAY_MS * Math.pow(2, mutation.attempts - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  return failedMessageIds;
}

/**
 * Retries all permanently failed mutations for a conversation.
 * Resets their attempt count and status to 'pending'.
 */
export async function retryFailed(conversationId: string): Promise<void> {
  try {
    const failed = await getFailedForConversation(conversationId);
    for (const mutation of failed) {
      mutation.status = 'pending';
      mutation.attempts = 0;
      await putMutation(mutation);
    }
  } catch {
    // IndexedDB not available
  }
}

/**
 * Clears all mutations for a conversation (e.g., on delete).
 */
export async function clearConversation(conversationId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readwrite');
    const store = txn.objectStore(STORE_NAME);
    const index = store.index('by_conversation');
    const request = index.openCursor(conversationId);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    txn.oncomplete = () => { db.close(); resolve(); };
    txn.onerror = () => { db.close(); reject(txn.error); };
  });
}

/** Returns the count of failed mutations (for a badge indicator). */
export async function getFailedCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction(STORE_NAME, 'readonly');
      const request = txn.objectStore(STORE_NAME).index('by_status').count('failed');
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch {
    return 0;
  }
}
