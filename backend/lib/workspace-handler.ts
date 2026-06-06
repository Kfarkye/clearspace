// ============================================================================
// Workspace Handler — Gmail, Calendar, Drive API integration
// Uses the user's OAuth token to call Google Workspace APIs server-side.
// ============================================================================

// ── MIME Helpers ─────────────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

interface MimeResult {
  textParts: string[];
  htmlParts: string[];
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
}

function parseMimeParts(part: any, result: MimeResult): void {
  if (!part) return;

  if (part.parts && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      parseMimeParts(subPart, result);
    }
    return;
  }

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

// ── Auth helper ──────────────────────────────────────────────────────────────

async function authedFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('WORKSPACE_AUTH_EXPIRED: Your Google Workspace session has expired. Please reconnect in Settings.');
  }
  return res;
}

// ── Gmail: List Emails ───────────────────────────────────────────────────────

export async function handleReadEmails(
  token: string,
  query?: string,
  maxResults?: number
) {
  const q = query || 'is:unread in:inbox';
  const max = Math.min(maxResults || 10, 20);

  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`;
  const listRes = await authedFetch(url, token);
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listData = await listRes.json();
  if (!listData.messages || listData.messages.length === 0) {
    return { emails: [], summary: 'No messages found matching your query.' };
  }

  // Fetch metadata for each message
  const emails = await Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      try {
        const msgRes = await authedFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          token
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
        };
      } catch {
        return null;
      }
    })
  );

  return {
    emails: emails.filter(Boolean),
    resultCount: listData.resultSizeEstimate || emails.length,
  };
}

// ── Gmail: Read Single Email ─────────────────────────────────────────────────

export async function handleReadEmailDetail(token: string, messageId: string) {
  const res = await authedFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    token
  );
  if (!res.ok) throw new Error(`Gmail read failed: ${res.status}`);

  const data = await res.json();
  const headers = data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const mimeResult: MimeResult = { textParts: [], htmlParts: [], attachments: [] };
  parseMimeParts(data.payload, mimeResult);

  let bodyText = mimeResult.textParts.join('\n\n');
  const bodyHtml = mimeResult.htmlParts.join('\n\n');
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

// ── Calendar: Today's Events ─────────────────────────────────────────────────

export async function handleReadCalendar(token: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true&orderBy=startTime`;
  const res = await authedFetch(url, token);
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);

  const data = await res.json();
  const events = (data.items || []).map((evt: any) => ({
    id: evt.id,
    title: evt.summary || 'Untitled Event',
    startTime: evt.start?.dateTime || evt.start?.date || '',
    endTime: evt.end?.dateTime || evt.end?.date || '',
    location: evt.location || '',
    attendees: (evt.attendees || []).map((a: any) => a.email),
    status: evt.status || 'confirmed',
  }));

  return {
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    eventCount: events.length,
    events,
  };
}

// ── Drive: Search Files ──────────────────────────────────────────────────────

export async function handleSearchDrive(
  token: string,
  query?: string,
  type?: string
) {
  let q = 'trashed = false';
  const mimeTypes: Record<string, string> = {
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation',
  };

  if (type && type !== 'all' && mimeTypes[type]) {
    q += ` and mimeType = '${mimeTypes[type]}'`;
  }

  if (query && query.trim()) {
    const escapedQuery = query.replace(/'/g, "\\'");
    q += ` and name contains '${escapedQuery}'`;
  }

  const queryParams = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '15',
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
  });

  const res = await authedFetch(
    `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
    token
  );
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`);

  const data = await res.json();
  const files = (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.mimeType,
    lastModified: f.modifiedTime,
    link: f.webViewLink,
  }));

  return {
    query: query || 'recent files',
    fileCount: files.length,
    files,
  };
}
