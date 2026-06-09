import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client();

export async function requireIamIdentity(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHENTICATED: Missing IAM OIDC bearer token.' });

  const token = authHeader.split(' ')[1];
  const expectedAudience = process.env.WORKER_ENDPOINT || `https://${req.headers.host}${req.originalUrl}`;

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: expectedAudience });
    const serviceAccount = ticket.getPayload().email;
    const allowedSAs = [ process.env.TASK_SERVICE_ACCOUNT_EMAIL || 'aura-task-invoker-sa@aura-production-2026.iam.gserviceaccount.com' ];

    if (!allowedSAs.includes(serviceAccount)) return res.status(403).json({ error: 'PERMISSION_DENIED: IAM identity not authorized for this endpoint.' });
    req.serviceIdentity = serviceAccount;
    next();
  } catch (error) { return res.status(401).json({ error: 'UNAUTHENTICATED: Invalid service identity token.' }); }
}
