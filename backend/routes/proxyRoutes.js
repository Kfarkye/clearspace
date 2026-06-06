import express from 'express';
import * as proxyController from '../controllers/proxyController.js';

const router = express.Router();

router.get('/api/router/modes', proxyController.getRouterModes);
router.post('/api/router/classify', proxyController.classifyIntent);

router.get('/api-proxy/youtube', proxyController.youtubeProxy);
router.post('/api-proxy', express.json({limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb"}), proxyController.vertexProxy);
router.post('/api-proxy/deploy-html', express.json({limit: "7mb"}), proxyController.deployHtml);

export default router;
