import * as spannerDAL from '../services/db.js';
import { z } from 'zod';

// --- Shared Validators & Helpers ---
const userIdSchema = z.string().min(1);
const idParamSchema = z.object({
  id: z.string().min(1).max(128)
});

function requireUserId(req) {
  const result = userIdSchema.safeParse(req.userId);
  if (!result.success) {
    const error = new Error('Unauthorized.');
    error.status = 401;
    throw error;
  }
  return result.data;
}

function handleZodError(res, err) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: err.issues?.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message
    })) || []
  });
}

// --- Schemas ---
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const createConversationSchema = z.object({
  chatMode: z.enum(['operator', 'standard'], {
    errorMap: () => ({ message: 'chatMode must be "operator" or "standard".' })
  }),
  initialTitle: z.string().max(255).optional()
});

const updateConversationSchema = z.object({
  title: z.string().max(255).optional(),
  isPinned: z.boolean().optional()
}).refine(data => data.title !== undefined || data.isPinned !== undefined, {
  message: 'title or isPinned is required.'
});

const appendMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1).max(100000),
  hasImage: z.boolean().default(false)
});

const updatePreferencesSchema = z.object({
  chatMode: z.string().max(50).optional(),
  thinkingMode: z.string().max(50).optional(),
  theme: z.string().max(50).optional()
});

const listArtifactsSchema = z.object({
  type: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const saveArtifactSchema = z.object({
  conversationId: z.string().max(128).optional(),
  type: z.enum([
    'licensing_guide',
    'workspace_doc',
    'data_table',
    'scoreboard',
    'betting_analysis',
    'email_list',
    'email_detail'
  ]),
  title: z.string().max(255).optional(),
  url: z.string().url().optional().or(z.literal('')),
  metadata: z.record(z.unknown()).optional()
});

// --- Controllers ---

export const listConversations = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { limit, offset } = paginationSchema.parse(req.query);
    const conversations = await spannerDAL.getConversations(userId, { limit, offset });
    return res.json({ conversations });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const createConversation = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { chatMode, initialTitle } = createConversationSchema.parse(req.body);
    const conversationId = await spannerDAL.createConversation(userId, chatMode, initialTitle);
    return res.status(201).json({ conversationId });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const result = await spannerDAL.getConversation(userId, id);
    if (!result) return res.status(404).json({ error: 'Conversation not found.' });
    return res.json(result);
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const deleteConversation = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { id } = idParamSchema.parse(req.params);
    await spannerDAL.deleteConversation(userId, id);
    return res.json({ deleted: true });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const updateConversation = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const { title, isPinned } = updateConversationSchema.parse(req.body);

    if (title !== undefined) {
      await spannerDAL.updateConversationTitle(userId, id, title);
    }
    if (isPinned !== undefined) {
      await spannerDAL.pinConversation(userId, id, isPinned);
    }

    return res.json({ updated: true });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const appendMessage = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const { role, content, hasImage } = appendMessageSchema.parse(req.body);
    
    const messageId = await spannerDAL.appendMessage(userId, id, {
      role,
      content,
      hasImage
    });
    return res.status(201).json({ messageId });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const getPreferences = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const prefs = await spannerDAL.getUserPreferences(userId);
    return res.json({ preferences: prefs || { chatMode: 'operator', thinkingMode: 'fast', theme: 'light' } });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const updatePreferences = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { chatMode, thinkingMode, theme } = updatePreferencesSchema.parse(req.body);
    await spannerDAL.upsertUserPreferences(userId, { chatMode, thinkingMode, theme });
    return res.json({ updated: true });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const listArtifacts = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { type, limit } = listArtifactsSchema.parse(req.query);
    const artifacts = await spannerDAL.getArtifacts(userId, { type, limit });
    return res.json({ artifacts });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};

export const saveArtifact = async (req, res, next) => {
  try {
    const userId = requireUserId(req);
    const { conversationId, type, title, url, metadata } = saveArtifactSchema.parse(req.body);
    
    const artifactId = await spannerDAL.saveArtifact(userId, {
      conversationId,
      type,
      title,
      url,
      metadata
    });
    return res.status(201).json({ artifactId });
  } catch (err) { 
    if (err instanceof z.ZodError) return handleZodError(res, err);
    next(err); 
  }
};
