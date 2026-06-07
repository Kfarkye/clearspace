import { deployHtml } from '../services/cloudStorageService.js';
import * as spannerDAL from '../services/db.js';
import { z } from 'zod';

/**
 * @typedef {Object} CompilePayload
 * @property {string} state - The state for the licensing guide.
 * @property {string} profession - The profession for the licensing guide.
 * @property {string} [title] - Optional override title.
 */

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

    const payload = licensingGuideSchema.parse(rawPayload);

    const compilerResponse = await fetch('http://127.0.0.1:5002/compile/licensing_guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!compilerResponse.ok) {
      const errorText = await compilerResponse.text().catch(() => 'Unable to read error text');
      const error = new Error(`Python Compiler failed (${compilerResponse.status}): ${errorText}`);
      error.status = compilerResponse.status === 400 ? 400 : 502; 
      throw error;
    }

    const html = await compilerResponse.text();

    if (!html.trim()) {
      throw new Error('Python Compiler returned empty HTML content.');
    }

    const title = payload.title || `${payload.state} ${payload.profession} Guide`;
    const { url } = await deployHtml(html, title);

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

    return res.status(200).json({
      success: true,
      url: url,
      message: 'Licensing guide compiled and deployed successfully.'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Payload validation failed.',
        errors: error.errors
      });
    }
    
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    
    return res.status(status).json({
      success: false,
      message: message
    });
  }
};
