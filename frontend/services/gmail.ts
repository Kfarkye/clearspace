/**
 * Gmail Service — Full CRUD + Deep MIME
 * 
 * List, Read, Send, Draft, Trash, Untrash.
 * Uses token-passing pattern from clearspace auth flow.
 */

// --- Types ---

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  labelIds: string[];
  is_urgent: boolean;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface GmailMessageFull {
  id: string;
  threadId: string;
  sender: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: GmailAttachment[];
  labelIds: string[];
}

export interface GmailListResult {
  messages: GmailMessageMeta[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// --- MIME Helpers ---

/** Decode Gmail's base64url-encoded body data */
function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch {
    return '';
  }
}

/** Encode string to base64url for sending */
function encodeBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Recursively extract text/plain, text/html parts and attachments from MIME tree */
function parseMimeParts(
  part: any,
  result: { textParts: string[]; htmlParts: string[]; attachments: GmailAttachment[] }
) {
  if (!part) return;

  // Recurse into sub-parts (multipart/*)
  if (part.parts && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      parseMimeParts(subPart, result);
    }
    return;
  }

  // Attachment detection
  const filename = part.filename || '';
  if (filename && part.body?.attachmentId) {
    result.attachments.push({
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: part.body?.size || 0,
      attachmentId: part.body.attachmentId,
    });
    return;
  }

  // Body data extraction
  const bodyData = part.body?.data;
  if (!bodyData) return;

  const decoded = decodeBase64Url(bodyData);
  const mimeType = (part.mimeType || '').toLowerCase();

  if (mimeType === 'text/plain') {
    result.textParts.push(decoded);
  } else if (mimeType === 'text/html') {
    result.htmlParts.push(decoded);
  }
}

/** Strip HTML tags for clean text fallback */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Auth Error Helper ---

let _onAuthError: (() => void) | null = null;

/** Register a callback for auth errors (e.g., to trigger re-login) */
export function onGmailAuthError(callback: () => void) {
  _onAuthError = callback;
}

/** Check response for auth errors and throw with clear message */
async function checkAuthError(res: Response): Promise<void> {
  if (res.status === 401 || res.status === 403) {
    _onAuthError?.();
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Authentication error (${res.status}): ${errorData.error?.message || 'Please sign out and sign back in to refresh permissions.'}`
    );
  }
}

// --- API Methods ---

/**
 * List messages with optional query and pagination.
 * Returns metadata (headers + snippet), not full body.
 */
export async function listMessages(
  token: string,
  options?: { query?: string; maxResults?: number; pageToken?: string }
): Promise<GmailListResult> {
  const q = options?.query || 'is:unread in:inbox';
  const max = options?.maxResults || 5;

  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`;
  if (options?.pageToken) {
    url += `&pageToken=${encodeURIComponent(options.pageToken)}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await checkAuthError(res);
  if (!res.ok) throw new Error(`Failed to list messages: ${res.status}`);

  const data = await res.json();
  if (!data.messages) {
    return { messages: [], nextPageToken: data.nextPageToken, resultSizeEstimate: data.resultSizeEstimate };
  }

  // Fetch metadata for each message in chunks of 20
  const CHUNK_SIZE = 20;
  const detailedMessages: GmailMessageMeta[] = [];

  for (let i = 0; i < data.messages.length; i += CHUNK_SIZE) {
    const chunk = data.messages.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        return {
          id: msgData.id,
          threadId: msgData.threadId,
          sender: getHeader('From'),
          subject: getHeader('Subject'),
          snippet: msgData.snippet || '',
          date: getHeader('Date'),
          labelIds: msgData.labelIds || [],
          is_urgent: (msgData.labelIds || []).includes('IMPORTANT'),
        } as GmailMessageMeta;
      })
    );
    detailedMessages.push(...chunkResults);
  }

  return {
    messages: detailedMessages,
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate,
  };
}

/**
 * Read a single message in full with deep MIME parsing.
 * Returns complete body (text preferred, HTML fallback), headers, and attachments.
 */
export async function getMessage(
  token: string,
  messageId: string
): Promise<GmailMessageFull> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  await checkAuthError(res);
  if (!res.ok) throw new Error(`Failed to read message: ${res.status}`);

  const data = await res.json();
  const headers = data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  // Parse MIME tree
  const mimeResult = { textParts: [] as string[], htmlParts: [] as string[], attachments: [] as GmailAttachment[] };
  parseMimeParts(data.payload, mimeResult);

  let bodyText = mimeResult.textParts.join('\n\n');
  const bodyHtml = mimeResult.htmlParts.join('\n\n');

  // Fallback: strip HTML if no plain text part
  if (!bodyText && bodyHtml) {
    bodyText = stripHtml(bodyHtml);
  }

  return {
    id: data.id,
    threadId: data.threadId,
    sender: getHeader('From'),
    to: getHeader('To'),
    cc: getHeader('Cc'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    bodyText,
    bodyHtml,
    attachments: mimeResult.attachments,
    labelIds: data.labelIds || [],
  };
}

/**
 * Send an email. Constructs RFC 2822 message and sends via Gmail API.
 */
export async function sendMessage(
  token: string,
  to: string,
  subject: string,
  body: string
): Promise<any> {
  // Sanitize 'to' — trim whitespace, strip angle brackets if present
  const cleanTo = to.trim().replace(/^<|>$/g, '');
  console.log(`[Gmail] Sending email to: "${cleanTo}" | Subject: "${subject}"`);

  const message = [
    `To: ${cleanTo}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n'); // RFC 2822 requires CRLF

  const encoded = encodeBase64Url(message);
  console.log(`[Gmail] Encoded message length: ${encoded.length}`);

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  await checkAuthError(res);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('[Gmail] Send failed:', res.status, errorData);
    throw new Error(errorData.error?.message || `Failed to send email: ${res.status}`);
  }

  const result = await res.json();
  console.log('[Gmail] Send success:', result.id);
  return result;
}

/**
 * Create a draft. Supports reply threading via inReplyTo + threadId.
 */
export async function createDraft(
  token: string,
  to: string,
  subject: string,
  body: string,
  options?: { inReplyToMessageId?: string; threadId?: string }
): Promise<any> {
  const headerLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];

  if (options?.inReplyToMessageId) {
    headerLines.push(`In-Reply-To: ${options.inReplyToMessageId}`);
    headerLines.push(`References: ${options.inReplyToMessageId}`);
  }

  const message = [...headerLines, '', body].join('\n');

  const requestBody: any = {
    message: { raw: encodeBase64Url(message) },
  };
  if (options?.threadId) {
    requestBody.message.threadId = options.threadId;
  }

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  await checkAuthError(res);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create draft: ${res.status}`);
  }

  return res.json();
}

/**
 * Move a message to Trash.
 */
export async function trashMessage(
  token: string,
  messageId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  await checkAuthError(res);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to trash message: ${res.status}`);
  }
}

/**
 * Restore a message from Trash.
 */
export async function untrashMessage(
  token: string,
  messageId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/untrash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  await checkAuthError(res);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to untrash message: ${res.status}`);
  }
}

/**
 * Download and decode an email attachment.
 * Text-based formats are returned as decoded strings.
 * Binary formats (PDF, DOCX) are returned as base64 with metadata.
 */
export interface AttachmentResult {
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  encoding: 'text' | 'base64';
}

export async function getAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  filename: string,
  mimeType: string
): Promise<AttachmentResult> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  await checkAuthError(res);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to download attachment: ${res.status}`);
  }

  const data = await res.json();
  const rawBase64 = data.data || '';
  const sizeBytes = data.size || 0;

  // Text-based formats: decode to readable string
  const textTypes = [
    'text/plain', 'text/html', 'text/csv', 'text/markdown',
    'application/json', 'application/xml',
  ];
  const isText = textTypes.some(t => mimeType.toLowerCase().startsWith(t));

  if (isText) {
    return {
      filename,
      mimeType,
      size: sizeBytes,
      content: decodeBase64Url(rawBase64),
      encoding: 'text',
    };
  }

  // Binary formats (PDF, DOCX, images): return base64
  return {
    filename,
    mimeType,
    size: sizeBytes,
    content: rawBase64,
    encoding: 'base64',
  };
}

