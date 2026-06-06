import express from 'express';
import { _getDatabase } from '../services/db.js';
import { AssetDal } from '../lib/assets/assetDal.js';

const router = express.Router();

// GET /api/assets/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const db = _getDatabase ? _getDatabase() : null;
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }
    
    const dal = new AssetDal(db);
    const asset = await dal.getAsset(id);
    
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    res.json(asset);
  } catch (error) {
    console.error(`[API] Failed to fetch asset ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
