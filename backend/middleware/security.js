import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export function setupSecurity(app) {
  // Trust proxy for rate limiting behind load balancers/Cloud Run
  app.set('trust proxy', 1);

  // --- Security Hardening ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://a.espncdn.com", "https://*.espncdn.com", "https://lh3.googleusercontent.com"],
        connectSrc: ["'self'", "https://aiplatform.googleapis.com", "https://aiplatform.clients6.google.com", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com", "https://gmail.googleapis.com", "https://people.googleapis.com", "https://storage.googleapis.com", "wss://localhost:*", "ws://localhost:*"],
        frameSrc: ["'self'", "https://accounts.google.com"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // 🔒 HARDENED: HSTS forces HTTPS and prevents downgrade attacks
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));

  // CORS: allow Vite dev server, served frontend, and Cloud Run production origins
  const ALLOWED_ORIGINS = [
    'http://localhost:5175',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5173',
  ];
  // Add the Cloud Run APP_URL if set
  if (process.env.APP_URL) {
    ALLOWED_ORIGINS.push(process.env.APP_URL.replace(/\/$/, ''));
  }
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, server-to-server)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else if (origin.endsWith('.run.app')) {
        // Allow any Cloud Run origin (same project, different revisions)
        callback(null, true);
      } else {
        // Fail gracefully by omitting Access-Control headers rather than throwing 500s
        callback(null, false);
      }
    },
    credentials: true,
  }));

  // IMPORTANT: Vertex AI Studio Rate Limiting
  const proxyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many requests',
        message: 'You have exceed the request limit, please try again later.'
      },
  });
  app.use('/api-proxy', proxyLimiter);

  // 🔒 HARDENED: Stricter rate limit on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' },
  });
  app.use('/api/auth', authLimiter);
}
