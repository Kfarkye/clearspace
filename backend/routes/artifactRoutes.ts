import express from 'express';
import { ArtifactRegistry } from '../lib/artifact-registry.js';

const router = express.Router();

// Initialize registry (singleton pattern maintained internally)
const registry = new ArtifactRegistry(
  process.env.GCP_PROJECT_ID || 'clearspace-dev',
  process.env.SPANNER_INSTANCE_ID || 'aura-core',
  process.env.SPANNER_DATABASE_ID || 'sports-ledger',
  process.env.GCS_BUCKET_NAME || 'clearspace-artifacts'
);

// GET /artifact/:id
router.get('/:id', async (req, res) => {
  try {
    const artifactId = req.params.id;
    if (!artifactId || !artifactId.startsWith('art_')) {
      return res.status(400).json({ error: 'Invalid Artifact ID format' });
    }

    const artifact = await registry.getArtifactStream(artifactId);
    
    if (!artifact?.stream) {
      return res.status(404).json({ error: 'Artifact Not Found' });
    }

    res.status(200);
    res.setHeader('Content-Type', artifact.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Use pipe() to bridge the stream, ensuring Node.js handles backpressure natively
    artifact.stream.pipe(res);

    // Ensure we destroy the underlying Spanner stream if the client abruptly disconnects
    req.on('close', () => {
      if (!res.writableEnded) {
         artifact.stream.destroy();
      }
    });

  } catch (error) {
    console.error('[AURA] Artifact Hydration Fault:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

export default router;
