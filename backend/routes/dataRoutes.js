import express from 'express';
import * as spannerDAL from '../services/db.js';
import * as dataController from '../controllers/dataController.js';
import { createSessionMiddleware } from '@clearspace/auth';
import { sessionManager, PROXY_HEADER } from '../middleware/auth.js';

const router = express.Router();

// Protected by session auth — requires signed-in user with req.userSub
const dataAuthMiddleware = createSessionMiddleware(sessionManager, {
  devProxyHeader: 'x-app-proxy',
  devProxyValue: PROXY_HEADER,
});
router.use(dataAuthMiddleware);

// Ensure user row exists on every authenticated data request
router.use(async (req, res, next) => {
  try {
    const userId = req.userSub;
    if (!userId) return res.status(401).json({ error: 'Sign in required for data persistence.' });
    await spannerDAL.ensureUser({ userId, email: req.userEmail });
    req.userId = userId;
    next();
  } catch (err) {
    console.error('[Data API] ensureUser failed:', err.message);
    next(err);
  }
});

// --- Conversations ---
router.get('/conversations', dataController.listConversations);
router.post('/conversations', dataController.createConversation);
router.get('/conversations/:id', dataController.getConversation);
router.delete('/conversations/:id', dataController.deleteConversation);
router.patch('/conversations/:id', dataController.updateConversation);
router.post('/conversations/:id/messages', dataController.appendMessage);

// --- Preferences ---
router.get('/preferences', dataController.getPreferences);
router.patch('/preferences', dataController.updatePreferences);

// --- Artifacts ---
router.get('/artifacts', dataController.listArtifacts);
router.post('/artifacts', dataController.saveArtifact);

export default router;
