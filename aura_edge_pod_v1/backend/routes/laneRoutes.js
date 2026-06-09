import { Router } from 'express';
import { GroundingPlane } from '../lib/lanes/grounding.js';
import { DeepResearchLane } from '../lib/lanes/research.js';
import { MediaLane } from '../lib/lanes/media.js';

export default function createLaneRouter(db, writeTrace) {
  const router = Router();
  const grounding = new GroundingPlane(db, writeTrace);
  const research = new DeepResearchLane(db, writeTrace);
  const media = new MediaLane(db, writeTrace);

  router.post('/grounding/resolve', async (req, res) => {
    try {
      const { query, isDurable, sourceUrls, routeId } = req.body;
      const result = isDurable ? await grounding.resolveDurable(query, routeId || 'route-auto-durable', sourceUrls?.[0]) : await grounding.resolveEphemeral(query, routeId || 'route-auto-ephemeral', sourceUrls || []);
      res.status(200).json(result);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/research/dispatch', async (req, res) => {
    try {
      const { query } = req.body;
      const userId = req.user?.id || 'anonymous-user';
      if (!query) return res.status(400).json({ error: 'Missing query' });
      const result = await research.dispatchDeepResearch(userId, query);
      res.status(202).json(result);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/media/resolve', async (req, res) => {
    try {
      const { intent, routeId } = req.body;
      if (!intent) return res.status(400).json({ error: 'Missing media search intent' });
      const result = await media.resolveMedia(intent, routeId || 'route-auto-media');
      // Media is not implemented; surface 501 so callers don't treat it as a hit.
      res.status(501).json(result);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  return router;
}
