import { GoogleAuth } from 'google-auth-library';

const DEPLOY_BUCKET = process.env.DEPLOY_BUCKET || 'clearspace-artifacts';

export const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
  ],
});

export const deployHtml = async (html, title) => {
  if (!html || typeof html !== 'string') {
    throw new Error('html field is required and must be a string.');
  }

  if (html.length > 2 * 1024 * 1024) {
    throw new Error('HTML content exceeds 2MB limit.');
  }

  const cleanTitle = (title || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const timestamp = Date.now().toString(36);
  const objectName = `${cleanTitle}-${timestamp}.html`;

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse?.token;

  if (!accessToken) {
    throw new Error('Failed to obtain access token for Cloud Storage.');
  }

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${DEPLOY_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
    body: html,
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text().catch(() => '');
    throw new Error(`GCS upload failed (${uploadResponse.status}): ${errorBody}`);
  }

  const publicUrl = `https://storage.googleapis.com/${DEPLOY_BUCKET}/${encodeURIComponent(objectName)}`;
  
  console.log(`[Deploy] Artifact deployed: ${publicUrl}`);
  return { url: publicUrl, objectName };
};
