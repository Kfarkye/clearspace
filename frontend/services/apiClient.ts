
/**
 * Truth API Client (V2 Foundation)
 * 
 * This service establishes the architectural boundaries for replacing 
 * LLM-generated JSON schemas with live production data feeds.
 */

// --- Sports Data Interfaces ---
export interface LiveOdds {
  id: string;
  homeTeam: string;
  awayTeam: string;
  spread: number;
  overUnder: number;
  homeMoneyline: number;
  awayMoneyline: number;
}

export interface ConsensusSplit {
  betType: string;
  selectionHome: string;
  selectionAway: string;
  homeTickets: number;
  homeMoney: number;
  awayTickets: number;
  awayMoney: number;
  sharpSignal?: string;
}

export interface HistoricalXG {
  name: string;
  xG: number;
  Actual: number;
}

// --- Workspace Data Interfaces ---
export interface WorkspaceEmail {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  time: string;
  is_urgent: boolean;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface EmailFull {
  id: string;
  threadId: string;
  sender: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: EmailAttachment[];
  labels: string[];
}

export interface WorkspaceEvent {
  id: string;
  title: string;
  time: string;
  attendees: string[];
  is_next: boolean;
}

export interface WorkspaceTask {
  id: string;
  task: string;
  due: string;
  priority: string;
}

// --- MIME Parsing Helpers ---

/** Decode base64url-encoded body data from Gmail API */
function decodeBase64Url(data: string): string {
  try {
    // Gmail uses URL-safe base64: replace - with + and _ with /
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch {
    return '';
  }
}

/** Recursively extract text/plain, text/html parts and attachments from MIME tree */
function parseMimeParts(
  part: any,
  result: { textParts: string[]; htmlParts: string[]; attachments: EmailAttachment[] }
) {
  const mimeType = (part.mimeType || '').toLowerCase();

  // If this part has sub-parts (multipart/*), recurse
  if (part.parts && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      parseMimeParts(subPart, result);
    }
    return;
  }

  // Check if this is an attachment
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

  // Extract body data
  const bodyData = part.body?.data;
  if (!bodyData) return;

  const decoded = decodeBase64Url(bodyData);

  if (mimeType === 'text/plain') {
    result.textParts.push(decoded);
  } else if (mimeType === 'text/html') {
    result.htmlParts.push(decoded);
  }
}

// Auth header required by backend proxy middleware
const PROXY_HEADERS = {
  'X-App-Proxy': import.meta.env.VITE_PROXY_HEADER || '',
};

export const ApiClient = {
  sports: {
    /**
     * Fetches live scoreboard data from ESPN via our backend proxy.
     * @param sport - Sport key: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb
     * @param date - Optional date in YYYYMMDD format
     */
    getScoreboard: async (sport: string, date?: string): Promise<any> => {
      console.debug(`[API] Fetching ESPN scoreboard for ${sport}${date ? ` on ${date}` : ''}...`);
      try {
        const dateParam = date ? `?date=${date}` : '';
        const res = await fetch(`/api-proxy/espn/${sport.toLowerCase()}${dateParam}`, {
          headers: PROXY_HEADERS,
        });
        if (!res.ok) throw new Error(`ESPN proxy returned ${res.status}`);
        return await res.json();
      } catch (e) {
        console.error(`ESPN fetch error for ${sport}:`, e);
        return { sport: sport.toUpperCase(), count: 0, events: [], error: String(e) };
      }
    },
    getLiveOdds: async (gameId: string): Promise<LiveOdds | null> => {
      console.debug(`[API] Fetching live odds for ${gameId} via The Odds API...`);
      return null;
    },
    getConsensusSplits: async (gameId: string): Promise<ConsensusSplit[]> => {
      console.debug(`[API] Fetching consensus splits for ${gameId} via Action Network...`);
      return [];
    },
    getHistoricalXG: async (teamId: string): Promise<HistoricalXG[]> => {
      console.debug(`[API] Fetching historical xG for ${teamId} via FBref...`);
      return [];
    }
  },

  workspace: {
    /**
     * Fetches emails from the inbox.
     * Supports custom queries, pagination, and configurable maxResults.
     * Requires scope: https://www.googleapis.com/auth/gmail.readonly
     */
    getPriorityInbox: async (token: string, options?: { query?: string; maxResults?: number; pageToken?: string }): Promise<{ emails: WorkspaceEmail[]; nextPageToken?: string }> => {
      console.debug(`[API] Fetching inbox...`, options);
      try {
        const q = options?.query || 'is:unread in:inbox';
        const max = options?.maxResults || 5;
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`;
        if (options?.pageToken) {
          url += `&pageToken=${encodeURIComponent(options.pageToken)}`;
        }

        const listRes = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!listRes.ok) throw new Error("Failed to fetch emails");
        const listData = await listRes.json();
        
        if (!listData.messages) return { emails: [], nextPageToken: undefined };

        const emails = await Promise.all(listData.messages.map(async (msg: any) => {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const msgData = await msgRes.json();
          const headers = msgData.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
          
          return {
            id: msgData.id,
            sender: getHeader('From'),
            subject: getHeader('Subject'),
            snippet: msgData.snippet || '',
            time: getHeader('Date'),
            is_urgent: false
          };
        }));
        return { emails, nextPageToken: listData.nextPageToken };
      } catch (e) {
        console.error("Gmail error:", e);
        return { emails: [], nextPageToken: undefined };
      }
    },

    /**
     * Reads a single email in full — deep MIME parsing.
     * Returns full body (plain text preferred, HTML fallback), all headers, and attachment metadata.
     * Requires scope: https://www.googleapis.com/auth/gmail.readonly
     */
    readEmail: async (token: string, messageId: string): Promise<EmailFull | null> => {
      console.debug(`[API] Reading full email: ${messageId}`);
      try {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Gmail returned ${res.status}`);
        const data = await res.json();

        // Extract headers
        const headers = data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        // Parse MIME tree
        const mimeResult = { textParts: [] as string[], htmlParts: [] as string[], attachments: [] as EmailAttachment[] };
        parseMimeParts(data.payload, mimeResult);

        // Prefer plain text; fall back to HTML with tags stripped
        let bodyText = mimeResult.textParts.join('\n\n');
        let bodyHtml = mimeResult.htmlParts.join('\n\n');

        if (!bodyText && bodyHtml) {
          // Strip HTML tags for a clean text fallback
          bodyText = bodyHtml
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
          labels: data.labelIds || [],
        };
      } catch (e) {
        console.error("Gmail read error:", e);
        return null;
      }
    },

    /**
     * Fetches today's calendar events.
     * Requires scope: https://www.googleapis.com/auth/calendar.readonly
     */
    getTodaySchedule: async (token: string): Promise<WorkspaceEvent[]> => {
      console.debug(`[API] Fetching today's schedule...`);
      try {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true&orderBy=startTime`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch calendar");
        const data = await res.json();

        return (data.items || []).map((evt: any) => ({
          id: evt.id,
          title: evt.summary || 'Untitled Event',
          time: evt.start?.dateTime || evt.start?.date || '',
          attendees: (evt.attendees || []).map((a: any) => a.email),
          is_next: false
        }));
      } catch (e) {
        console.error("Calendar error:", e);
        return [];
      }
    },

    /**
     * Fetches pending tasks from Google Tasks.
     * Requires scope: https://www.googleapis.com/auth/tasks.readonly
     */
    getActionItems: async (token: string): Promise<WorkspaceTask[]> => {
      console.debug(`[API] Fetching action items...`);
      try {
        const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=5', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const data = await res.json();

        return (data.items || []).map((task: any) => ({
          id: task.id,
          task: task.title,
          due: task.due || '',
          priority: 'Normal'
        }));
      } catch (e) {
        console.error("Tasks error:", e);
        return [];
      }
    }
  },

  healthcare: {
    getJobMatches: async (specialty: string, location: string) => {
      console.debug(`[API] Fetching job matches for ${specialty} in ${location}...`);
      return [];
    },
    getComplianceStatus: async (clinicianId: string) => {
      console.debug(`[API] Fetching compliance status for clinician ${clinicianId}...`);
      return null;
    }
  }
};
