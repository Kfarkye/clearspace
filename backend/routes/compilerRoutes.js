import express from 'express';
import * as compilerController from '../controllers/compilerController.js';
import { createSessionMiddleware } from '@clearspace/auth';
import { sessionManager, PROXY_HEADER } from '../middleware/auth.js';
import * as spannerDAL from '../services/db.js';

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
    if (!userId) return res.status(401).json({ error: 'Sign in required for artifact compiler.' });
    await spannerDAL.ensureUser({ userId, email: req.userEmail });
    req.userId = userId;
    next();
  } catch (err) {
    console.error('[Compiler API] ensureUser failed:', err.message);
    next(err);
  }
});

router.post('/licensing_guide', compilerController.compileLicensingGuide);

export default router;
