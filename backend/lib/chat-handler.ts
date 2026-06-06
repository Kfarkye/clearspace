// ============================================================================
// Chat Handler — Asset Ledger Integration Route
// Delegates core generation to the headless Intelligence Service and writes
// outcomes to Spanner via the Asset DAL.
// ============================================================================

import { randomUUID } from 'crypto';
import { generateAsset } from './intelligence-service.js';
import { _getDatabase } from '../services/db.js';
import { AssetDal } from './assets/assetDal.js';

// ── Configuration ─────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 4000;
const MAX_AGGREGATE_HISTORY_CHARS = 16000; // Protects Token Per Minute (TPM) limits

const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
  /act\s+as\s+(if\s+)?you\s+(are|were)\s+/i,
];

// ── Express Route Handler ──────────────────────────────────────────────────

function sanitizeChatInput(raw) {
  return typeof raw === 'string' ? raw.slice(0, MAX_MESSAGE_LENGTH).trim() : '';
}

export function mountChatRoute(app) {
  app.post('/api/chat', async (req, res) => {
    const abortController = new AbortController();
    req.on('close', () => {
      if (req.socket.destroyed || req.aborted) {
        abortController.abort();
      }
    });

    try {
      const { message: rawMessage, history: rawHistory, mode, workspaceToken } = req.body;
      const message = sanitizeChatInput(rawMessage);

      if (!message) return res.status(400).json({ error: 'Message required' });
      console.log(`[CHAT] Incoming query: "${message}"`);

      // Security: Block injection attempts
      if (BLOCKED_PATTERNS.some(p => p.test(message))) {
        console.warn(`[CHAT] Query flagged by content filter: "${message}"`);
        return res.status(400).json({
          artifacts: [{
            assetId: randomUUID(), type: 'SYSTEM_MESSAGE', status: 'FAILED',
            title: 'Content Filtered', payload: { error: 'Your message was flagged by our content filter.' },
          }],
        });
      }

      // Token Limitation via Context Size Pruning
      let currentChars = 0;
      const history = [];
      const historyArray = Array.isArray(rawHistory) ? rawHistory : [];

      for (let i = historyArray.length - 1; i >= 0; i--) {
        const h = historyArray[i];
        if (typeof h.content === 'string') {
          const contentSlice = h.content.slice(0, MAX_MESSAGE_LENGTH);
          if (currentChars + contentSlice.length > MAX_AGGREGATE_HISTORY_CHARS) break;

          currentChars += contentSlice.length;
          history.unshift({ role: h.role === 'model' ? 'model' : 'user', content: contentSlice });
        }
      }

      // 1. Execute Intent via Headless Intelligence Service
      console.log(`[CHAT] Executing generateAsset for query: "${message}" (mode: ${mode})...`);
      const generatedAssets = await generateAsset(message, history, abortController.signal, mode, workspaceToken || null);
      console.log(`[CHAT] generateAsset completed, returned ${generatedAssets.length} assets.`);

      if (abortController.signal.aborted) return;

      // 2. Persist to Asset Ledger via DAL
      const db = _getDatabase ? _getDatabase() : null;
      if (db && generatedAssets.length > 0) {
        const dal = new AssetDal(db);
        const persistPromises = generatedAssets.map(async (asset) => {
          try {
            await dal.createAsset(asset);
            console.log(`[LEDGER] Persisted asset ${asset.assetId} (${asset.type})`);
          } catch (e) {
            console.error(`[LEDGER] Failed to persist asset ${asset.assetId}:`, e.message);
            // Optionally set status to FAILED or append an error message
          }
        });
        await Promise.allSettled(persistPromises);
      } else {
        if (!db) console.warn('[LEDGER] Database not initialized. Assets will not be persisted.');
      }

      if (!res.headersSent && !abortController.signal.aborted) {
        // We emit the assets as the `artifacts` array to remain somewhat compatible with the UI
        // until the UI is fully updated to read `SpannerAsset` structure.
        res.json({ artifacts: generatedAssets });
      }

    } catch (e) {
      if (abortController.signal.aborted || e.message === 'Client Disconnected') {
        console.log('[CHAT] Request aborted by client disconnect.');
        return;
      }

      const isTimeout = e.message.includes('TIMEOUT_FAULT') || e.message === 'Engine Timeout';
      console.error('[CHAT] Route error (Hardened Boundary Caught):', e.message);

      if (!res.headersSent) {
        // Convert the backend exception into a graceful frontend diagnostic payload
        // We return 200 OK so the fetch client doesn't throw, allowing the UI to render the fault card.
        res.status(200).json({
          artifacts: [{
            assetId: randomUUID(), 
            type: 'WORKSPACE_DOC', 
            status: 'FAILED',
            title: isTimeout ? 'System Diagnostic: Timeout' : 'System Diagnostic: Fault',
            payload: {
              text: `\`\`\`diagnostic\n${JSON.stringify({
                root_cause: isTimeout 
                  ? "The upstream execution request exceeded the internal Service Level Agreement (SLA) threshold. " + e.message 
                  : "The execution pipeline encountered an unhandled backend exception: " + e.message,
                proposed_fix: isTimeout 
                  ? "Increase the internal timeout SLA threshold for the ResilientNetworkClient, or verify external network stability." 
                  : "Trace the error stack in the backend and fortify the execution boundary to gracefully handle this exception state.",
                risk_flag: "System Execution Interrupted",
                patch_code: "// System state preserved. Recommend investigating execution thresholds or checking logs."
              })}\n\`\`\``
            },
          }],
        });
      }
    }
  });
}
