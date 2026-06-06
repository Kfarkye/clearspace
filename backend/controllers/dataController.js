import * as spannerDAL from '../services/db.js';

export const listConversations = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const conversations = await spannerDAL.getConversations(req.userId, { limit, offset });
    res.json({ conversations });
  } catch (err) { next(err); }
};

export const createConversation = async (req, res, next) => {
  try {
    const { chatMode, initialTitle } = req.body;
    if (!chatMode || !['operator', 'standard'].includes(chatMode)) {
      return res.status(400).json({ error: 'chatMode must be "operator" or "standard".' });
    }
    const conversationId = await spannerDAL.createConversation(req.userId, chatMode, initialTitle);
    res.status(201).json({ conversationId });
  } catch (err) { next(err); }
};

export const getConversation = async (req, res, next) => {
  try {
    const result = await spannerDAL.getConversation(req.userId, req.params.id);
    if (!result) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(result);
  } catch (err) { next(err); }
};

export const deleteConversation = async (req, res, next) => {
  try {
    await spannerDAL.deleteConversation(req.userId, req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

export const updateConversation = async (req, res, next) => {
  try {
    const { title, isPinned } = req.body;

    if (title !== undefined) {
      await spannerDAL.updateConversationTitle(req.userId, req.params.id, title);
    }
    if (isPinned !== undefined) {
      await spannerDAL.pinConversation(req.userId, req.params.id, !!isPinned);
    }
    if (title === undefined && isPinned === undefined) {
      return res.status(400).json({ error: 'title or isPinned is required.' });
    }

    res.json({ updated: true });
  } catch (err) { next(err); }
};

export const appendMessage = async (req, res, next) => {
  try {
    const { role, content, hasImage } = req.body;
    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required.' });
    }
    const messageId = await spannerDAL.appendMessage(req.userId, req.params.id, {
      role,
      content,
      hasImage: hasImage || false,
    });
    res.status(201).json({ messageId });
  } catch (err) { next(err); }
};

export const getPreferences = async (req, res, next) => {
  try {
    const prefs = await spannerDAL.getUserPreferences(req.userId);
    res.json({ preferences: prefs || { chatMode: 'operator', thinkingMode: 'fast', theme: 'light' } });
  } catch (err) { next(err); }
};

export const updatePreferences = async (req, res, next) => {
  try {
    const { chatMode, thinkingMode, theme } = req.body;
    await spannerDAL.upsertUserPreferences(req.userId, { chatMode, thinkingMode, theme });
    res.json({ updated: true });
  } catch (err) { next(err); }
};

export const listArtifacts = async (req, res, next) => {
  try {
    const type = req.query.type || undefined;
    const limit = parseInt(req.query.limit) || 20;
    const artifacts = await spannerDAL.getArtifacts(req.userId, { type, limit });
    res.json({ artifacts });
  } catch (err) { next(err); }
};

export const saveArtifact = async (req, res, next) => {
  try {
    const { conversationId, type, title, url, metadata } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required.' });
    const artifactId = await spannerDAL.saveArtifact(req.userId, {
      conversationId,
      type,
      title,
      url,
      metadata,
    });
    res.status(201).json({ artifactId });
  } catch (err) { next(err); }
};
