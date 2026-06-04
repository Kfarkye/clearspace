/**
 * Google Drive Service — Create, Export, List
 * 
 * HTML document creation, file export (Docs/Sheets/Slides),
 * and filtered file listing with search.
 * Uses token-passing pattern matching gmail.ts auth flow.
 */

// --- Types ---

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

export type DocumentType = 'all' | 'docs' | 'sheets' | 'slides' | 'media';

// --- Auth Error Handling ---

let _onAuthError: (() => void) | null = null;

/** Register a callback for auth errors (e.g., to trigger re-login) */
export function onDriveAuthError(callback: () => void) {
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
 * Create a Google Doc from HTML content.
 * Uses multipart upload to convert HTML → Google Docs format.
 */
export async function createHtmlDocument(token: string, title: string, htmlContent: string) {
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.document'
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/html\r\n\r\n' +
    htmlContent +
    close_delim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  await checkAuthError(res);
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Drive API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Export a Drive file to plain text (Docs/Slides) or CSV (Sheets).
 * Non-Workspace files are downloaded directly via alt=media.
 */
export async function exportDriveFile(token: string, fileId: string, mimeType: string): Promise<string> {
  let exportType = 'text/plain';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    exportType = 'text/csv';
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    exportType = 'text/plain';
  } else if (!mimeType.includes('google-apps')) {
    // Non-workspace files use direct download instead of export
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await checkAuthError(res);
    if (res.ok) return await res.text();
    return '';
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportType}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  });

  await checkAuthError(response);

  if (!response.ok) {
    console.error(`Export failed for ${fileId}`);
    return '';
  }
  return await response.text();
}

/**
 * List recent Drive files with optional type filter and name search.
 * Returns up to 20 files sorted by most recently modified.
 */
export async function getRecentDriveFiles(token: string, type: DocumentType = 'all', nameQuery: string = ''): Promise<DriveFile[]> {
  let q = 'trashed = false';
  const mimeTypes: Record<string, string> = {
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation'
  };

  if (type !== 'all') {
    if (type === 'media') {
      q += ` and (mimeType contains 'image/' or mimeType contains 'video/')`;
    } else if (mimeTypes[type]) {
      q += ` and mimeType = '${mimeTypes[type]}'`;
    }
  }

  if (nameQuery.trim() !== '') {
    const escapedQuery = nameQuery.replace(/'/g, "\\'");
    q += ` and name contains '${escapedQuery}'`;
  }

  const queryParams = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '20',
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)'
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  await checkAuthError(response);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Drive API error: ${response.status}`);
  }

  const data = await response.json();
  return data.files || [];
}
