import { deployHtml } from '../services/cloudStorageService.js';
import * as spannerDAL from '../services/db.js';
import { z } from 'zod';

/**
 * @typedef {Object} CompilePayload
 * @property {string} state - The state for the licensing guide.
 * @property {string} profession - The profession for the licensing guide.
 * @property {string} [title] - Optional override title.
 */

// Define a strict schema matching the frontend tool declaration.
// .strict() ensures any unexpected keys are rejected, preventing template injection.
// .max() limits prevent DoS via massive payload strings.
const licensingGuideSchema = z.object({
  title: z.string().max(200),
  state: z.string().max(100),
  profession: z.string().max(100),
  last_verified: z.string().max(50),
  overview: z.string().max(3000),
  stats: z.array(z.object({
    label: z.string().max(100),
    value: z.string().max(100)
  })).max(10),
  paths: z.array(z.object({
    name: z.string().max(200),
    description: z.string().max(1500),
    badge: z.string().max(100).optional(),
    steps: z.array(z.object({
      title: z.string().max(200),
      description: z.string().max(2000),
      estimated_time: z.string().max(100).optional(),
      estimated_cost: z.string().max(100).optional()
    })).max(20)
  })).max(10),
  official_sources: z.array(z.object({
    name: z.string().max(200),
    type: z.string().max(100),
    url: z.string().url().max(1000)
  })).max(15),
  cta: z.object({
    title: z.string().max(200),
    description: z.string().max(1000),
    url: z.string().url().max(1000),
    button_text: z.string().max(100)
  })
}).strict();

/**
 * Express controller to compile and deploy a licensing guide via the Python Compiler.
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const compileLicensingGuide = async (req, res, next) => {
  try {
    const rawPayload = req.body;

    // 1. Validate payload structure to prevent downstream crashes and corrupted DB entries
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      const error = new Error('Invalid payload: Expected a JSON object.');
      error.status = 400;
      throw error;
    }

    if (!rawPayload.state || !rawPayload.profession) {
      const error = new Error('Missing required payload fields: "state" and "profession".');
      error.status = 400;
      throw error;
    }

    // Sanitize with Zod
    const payload = licensingGuideSchema.parse(rawPayload);

    // 2. Forward the payload to the internal Python Compiler service with a 15s timeout
    const compilerResponse = await fetch('http://127.0.0.1:5002/compile/licensing_guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!compilerResponse.ok) {
      const errorText = await compilerResponse.text().catch(() => 'Unable to read error text');
      const error = new Error(`Python Compiler failed (${compilerResponse.status}): ${errorText}`);
      error.status = compilerResponse.status === 400 ? 400 : 502; // Map Bad Gateway for internal failure
      throw error;
    }

    // 3. Receive the raw compiled HTML string
    const html = await compilerResponse.text();

    if (!html.trim()) {
      throw new Error('Python Compiler returned empty HTML content.');
    }

    // 4. Deploy to Cloud Storage
    const title = payload.title || `${payload.state} ${payload.profession} Guide`;
    const { url } = await deployHtml(html, title);

    // 5. Save the artifact record in the database if user is authenticated
    if (req.userId) {
      await spannerDAL.saveArtifact(req.userId, {
        title: title,
        url: url,
        type: 'licensing_guide',
        metadata: { 
          state: payload.state, 
          profession: payload.profession 
        }
      });
    }

    // 6. Return the URL to the frontend
    res.json({ url });
  } catch (err) {
    console.error('[Compiler Controller] Failed:', err.message);
    
    // Catch fetch timeout explicitly to provide a clean 504 Gateway Timeout error
    if (err.name === 'TimeoutError') {
      err.status = 504;
      err.message = 'Internal compiler service timed out.';
    }

    next(err);
  }
};
