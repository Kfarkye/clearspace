import { FunctionDeclaration, Type } from '@google/genai';
import { ApiClient } from '../services/apiClient';
import { espnService } from '../services/espnService';
import * as gmail from '../services/gmail';
import * as drive from '../services/driveService';
import { reviewDocument } from '../services/documentReviewService';
import { API_ENDPOINTS } from '../config/apiEndpoints';
import { MODEL_ID } from '../constants';
import * as dataService from '../services/dataService';

// --- Workspace: List/Read/Calendar/Tasks ---

export const workspaceTool: FunctionDeclaration = {
  name: 'get_workspace_context',
  description: 'Fetches the user\'s PERSONAL Google Workspace data: emails, calendar events, and tasks. Supports custom email queries and pagination. CRITICAL: ONLY use this tool when the user EXPLICITLY asks about "my emails", "my calendar", "my schedule", "my tasks", or "my documents". DO NOT use this tool to answer general knowledge questions, follow-up questions about public topics (licenses, regulations, sports, etc.), or to investigate vague terms like "slowdowns", "hiccups", or "status" unless the user specifically references their personal workspace.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fetch_emails: { type: Type.BOOLEAN, description: 'Set to true to fetch emails.' },
      email_query: { type: Type.STRING, description: 'Optional Gmail search query (e.g., "from:boss@company.com", "subject:invoice", "in:inbox"). Default is "is:unread in:inbox". Use "in:inbox" for all recent emails including read ones.' },
      max_results: { type: Type.NUMBER, description: 'Number of emails to return. Default is 5. Use 10-20 when user asks to "show more".' },
      page_token: { type: Type.STRING, description: 'Pagination token from a previous response to fetch the next page of results.' },
      fetch_calendar: { type: Type.BOOLEAN, description: 'Set to true to fetch today\'s calendar events.' },
      fetch_tasks: { type: Type.BOOLEAN, description: 'Set to true to fetch pending action items.' }
    },
    required: ['fetch_emails', 'fetch_calendar', 'fetch_tasks']
  }
};

// --- Email: Read Full ---

export const readEmailTool: FunctionDeclaration = {
  name: 'read_email',
  description: 'Reads a single email in full with deep MIME parsing. Returns the complete email body (plain text), all headers (From, To, CC, Subject, Date), and attachment metadata (filename, type, size). Use when the user asks to "read", "open", or "show" a specific email. Requires a message_id from a previous get_workspace_context call.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message_id: { type: Type.STRING, description: 'The Gmail message ID to read in full. Get this from the id field in a previous get_workspace_context email list response.' },
    },
    required: ['message_id']
  }
};

// --- Email: Download Attachment ---

export const downloadAttachmentTool: FunctionDeclaration = {
  name: 'download_attachment',
  description: 'Downloads an email attachment and returns its content. For text-based files (txt, html, csv), returns decoded text. For binary files (PDF, DOCX), returns base64-encoded data. Use after read_email reveals attachments. Requires message_id, attachment_id, filename, and mime_type from the attachments array in a previous read_email response.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message_id: { type: Type.STRING, description: 'The Gmail message ID containing the attachment.' },
      attachment_id: { type: Type.STRING, description: 'The attachment ID from the attachments array in a previous read_email response.' },
      filename: { type: Type.STRING, description: 'The filename of the attachment (e.g., "resume.pdf").' },
      mime_type: { type: Type.STRING, description: 'The MIME type of the attachment (e.g., "application/pdf", "text/html").' },
    },
    required: ['message_id', 'attachment_id', 'filename', 'mime_type']
  }
};

// --- Email: Send ---

export const sendEmailTool: FunctionDeclaration = {
  name: 'send_email',
  description: 'Sends an email via Gmail. Use when the user asks to "send an email", "email X", or "reply to X". Constructs and sends an RFC 2822 compliant message.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      to: { type: Type.STRING, description: 'Recipient email address (e.g., "john@example.com").' },
      subject: { type: Type.STRING, description: 'Email subject line.' },
      body: { type: Type.STRING, description: 'Plain text email body content.' },
    },
    required: ['to', 'subject', 'body']
  }
};

// --- Email: Draft ---

export const draftEmailTool: FunctionDeclaration = {
  name: 'create_draft',
  description: 'Creates a draft email in Gmail. Use when the user asks to "draft an email", "write a draft", or "prepare a reply". Supports reply threading via in_reply_to and thread_id from a previously read email.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      to: { type: Type.STRING, description: 'Recipient email address.' },
      subject: { type: Type.STRING, description: 'Email subject line.' },
      body: { type: Type.STRING, description: 'Plain text email body content.' },
      in_reply_to: { type: Type.STRING, description: 'Optional Message-ID header of the email being replied to (for threading).' },
      thread_id: { type: Type.STRING, description: 'Optional Gmail thread ID to attach the draft to an existing conversation.' },
    },
    required: ['to', 'subject', 'body']
  }
};

// --- Email: Trash/Untrash ---

export const trashEmailTool: FunctionDeclaration = {
  name: 'trash_email',
  description: 'Moves an email to Trash or restores it from Trash. Use when the user asks to "delete", "trash", "remove", or "untrash" an email.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message_id: { type: Type.STRING, description: 'The Gmail message ID to trash or untrash.' },
      action: { type: Type.STRING, description: '"trash" to move to trash, "untrash" to restore from trash. Default is "trash".' },
    },
    required: ['message_id']
  }
};

// --- Drive ---

export const listDriveFilesTool: FunctionDeclaration = {
  name: 'list_drive_files',
  description: 'Lists recent files from Google Drive. Can filter by type (docs, sheets, slides, media) and search by name. Use when the user asks to "find a doc", "show my files", "search drive", or references Google Docs/Sheets/Slides.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: {
        type: Type.STRING,
        description: 'Filter by file type: "all", "docs", "sheets", "slides", "media". Default is "all".'
      },
      name_query: {
        type: Type.STRING,
        description: 'Optional search string to filter files by name.'
      },
    },
    required: []
  }
};

export const exportDriveFileTool: FunctionDeclaration = {
  name: 'export_drive_file',
  description: 'Reads and exports the content of a Google Drive file. Returns plain text for Docs, CSV for Sheets, plain text for Slides. Use when the user asks to "read", "open", or "show" a specific Drive file. Requires file_id and mime_type from a previous list_drive_files call.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      file_id: {
        type: Type.STRING,
        description: 'The Google Drive file ID from a previous list_drive_files response.'
      },
      mime_type: {
        type: Type.STRING,
        description: 'The mimeType of the file from a previous list_drive_files response.'
      },
    },
    required: ['file_id', 'mime_type']
  }
};

export const createDriveDocTool: FunctionDeclaration = {
  name: 'create_drive_document',
  description: 'Creates a new Google Doc from HTML content and saves it to the user\'s Drive. Returns the document URL. Use when the user asks to "save to Drive", "create a doc", or approves content to be saved. Provide clean, well-formatted HTML.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title for the new Google Doc (e.g., "Resume - John Doe", "Meeting Notes").'
      },
      html_content: {
        type: Type.STRING,
        description: 'The HTML content to write to the document. Use proper HTML formatting: <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em>, <table>, etc.'
      },
    },
    required: ['title', 'html_content']
  }
};

// --- Deploy ---

export const deployHtmlTool: FunctionDeclaration = {
  name: 'deploy_html',
  description: 'Deploys HTML content as a live, publicly accessible webpage on Cloud Storage. Returns a permanent URL. Use when the user asks to "deploy", "publish", "host", or "make this live". Does NOT require workspace auth — uses server-side deployment.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'A short title for the page (used in URL slug and page title). e.g., "Calvin Fowler Resume", "Q3 Report".'
      },
      html_content: {
        type: Type.STRING,
        description: 'Complete HTML content to deploy. Should be a full, self-contained HTML document with inline styles. Use proper HTML: <h1>, <h2>, <p>, <ul>, <table>, <style>, etc.'
      },
    },
    required: ['title', 'html_content']
  }
};

/** Deploy HTML to Cloud Storage via backend endpoint */
async function deployHtml(title: string, htmlContent: string): Promise<{ url: string; objectName: string }> {
  const response = await fetch(API_ENDPOINTS.DEPLOY_HTML, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ html: htmlContent, title }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Deploy failed: ${response.status}`);
  }

  return response.json();
}

// --- Document Review ---

export const reviewDocumentTool: FunctionDeclaration = {
  name: 'review_document',
  description: 'Performs a structured audit on a document (resume, report, letter). Returns specific improvements with before/after text and a fully enhanced HTML version. Use when the user asks to "review", "audit", "improve", "enhance", or "polish" a document. ALWAYS use this tool before saving a document to Drive or deploying — never skip the review step.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      content: {
        type: Type.STRING,
        description: 'The full text or HTML content of the document to review. Pull this from your conversation history — from a previous read_email response, exported Drive file, or user-provided text.'
      },
      target_role: {
        type: Type.STRING,
        description: 'The target role or company the document is being tailored for (e.g., "Sr Recruiting at Host Healthcare"). If not specified, leave empty for general improvement.'
      },
      document_type: {
        type: Type.STRING,
        description: 'The type of document: "resume", "cover_letter", "report", "proposal", or "general". Default is "resume".'
      },
    },
    required: ['content']
  }
};

// --- Sports ---

export const sportsTool: FunctionDeclaration = {
  name: 'get_sports_data',
  description: 'Fetches live scores, schedules, odds, game details, and play-by-play from ESPN for any major sport. Use this for ANY sports-related query. Supported sports: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sport: {
        type: Type.STRING,
        description: 'The sport league key. Options: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb'
      },
      date: {
        type: Type.STRING,
        description: 'Optional date in YYYYMMDD format. Omit for today\'s games.'
      },
      event_id: {
        type: Type.STRING,
        description: 'Optional specific ESPN event ID for deep-dive detail with full odds, win probability, and play-by-play. Use when the user asks for a deeper look at a specific game. Get the ID from thread context or a previous scoreboard call.'
      },
      include_play_by_play: {
        type: Type.BOOLEAN,
        description: 'Set to true to include play-by-play data (game situation, recent plays, current batter/pitcher). Only works with event_id. Use for deep-dive game analysis.'
      },
      team: {
        type: Type.STRING,
        description: 'Optional team name the user is asking about (e.g., "Braves", "Yankees", "Lakers"). Extract from the user\'s message to scope results to that team\'s game only.'
      },
    },
    required: ['sport']
  }
};

export const worldCupTeamTool: FunctionDeclaration = {
  name: 'get_world_cup_team_profile',
  description: 'Fetches World Cup 2026 team profiles, kits, apparel, tactical analysis, and history from TheDrip.to via headless scrape. Use when a user asks about a national soccer/football team\'s World Cup profile, their jerseys/kits, or team history. DO NOT use for live match scores (use get_sports_data instead).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: 'The national team name, e.g., Brazil, France, United States'
      },
    },
    required: ['team']
  }
};

// --- Timeout Utility ---

const TOOL_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS)
    ),
  ]);
}

// --- Auth Guard ---

function requireAuth(token: string | null): asserts token is string {
  if (!token) {
    throw new Error("Workspace not connected. Click the Connect button to sign in with Google and access your emails, calendar, and tasks.");
  }
}

// --- Tool Call Dispatcher ---

export function useToolCalls(workspaceToken: string | null) {

  const dispatchToolCall = async (call: any): Promise<any> => {
    let toolResult: any = {};

    try {
      // === WORKSPACE: List emails, calendar, tasks ===
      if (call.name === 'get_workspace_context') {
        console.log("[Truth] Intercepted workspace tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const emailOptions = call.args?.fetch_emails ? {
          query: call.args?.email_query || undefined,
          maxResults: call.args?.max_results || 5,
          pageToken: call.args?.page_token || undefined,
        } : undefined;

        const [emailResult, schedule, tasks] = await withTimeout(
          Promise.all([
            emailOptions
              ? gmail.listMessages(workspaceToken, emailOptions)
              : { messages: [], nextPageToken: undefined },
            call.args?.fetch_calendar ? ApiClient.workspace.getTodaySchedule(workspaceToken) : [],
            call.args?.fetch_tasks ? ApiClient.workspace.getActionItems(workspaceToken) : [],
          ]),
          'Workspace API'
        );
        toolResult = {
          emails: emailResult.messages,
          nextPageToken: emailResult.nextPageToken || null,
          schedule,
          action_items: tasks,
        };

        // === READ EMAIL: Full MIME ===
      } else if (call.name === 'read_email') {
        console.log("[Truth] Intercepted read_email tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const messageId = call.args?.message_id;
        if (!messageId) {
          return { error: "message_id is required. Use get_workspace_context first to list emails and get their IDs." };
        }

        toolResult = await withTimeout(
          gmail.getMessage(workspaceToken, messageId),
          'Gmail Read'
        );

        // === DOWNLOAD ATTACHMENT ===
      } else if (call.name === 'download_attachment') {
        console.log("[Truth] Intercepted download_attachment tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const { message_id, attachment_id, filename, mime_type } = call.args || {};
        if (!message_id || !attachment_id || !filename || !mime_type) {
          return { error: "message_id, attachment_id, filename, and mime_type are all required. Get these from the attachments array in a previous read_email response." };
        }

        const result = await withTimeout(
          gmail.getAttachment(workspaceToken, message_id, attachment_id, filename, mime_type),
          'Gmail Attachment'
        );

        if (result.encoding === 'base64') {
          // Binary file — use Gemini to extract text content (PDF, DOCX, images)
          const isPdf = result.mimeType.toLowerCase().includes('pdf');
          const isImage = result.mimeType.toLowerCase().startsWith('image/');

          if (isPdf || isImage) {
            try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) throw new Error('API key not configured');

              const { GoogleGenAI } = await import('@google/genai');
              const ai = new GoogleGenAI({ apiKey, vertexai: true });

              // Convert Gmail's base64url to standard base64 for Gemini
              const standardBase64 = result.content
                .replace(/-/g, '+')
                .replace(/_/g, '/');

              const extractResponse = await ai.models.generateContent({
                model: MODEL_ID,
                contents: [{
                  role: 'user',
                  parts: [
                    { inlineData: { data: standardBase64, mimeType: result.mimeType } },
                    { text: 'Extract ALL text content from this document. Preserve the structure, headings, bullet points, dates, and formatting. Return the complete text content only, no commentary.' }
                  ]
                }],
              });

              const extractedText = extractResponse.text || '';
              toolResult = {
                filename: result.filename,
                mimeType: result.mimeType,
                size: result.size,
                encoding: 'text',
                content: extractedText,
                extraction_method: 'gemini_vision',
                note: `Text extracted from ${result.mimeType} via Gemini vision. Content is ready for review_document.`,
              };
            } catch (extractError) {
              console.error('[Truth] PDF extraction failed:', extractError);
              toolResult = {
                filename: result.filename,
                mimeType: result.mimeType,
                size: result.size,
                encoding: 'base64',
                error: `Failed to extract text: ${extractError instanceof Error ? extractError.message : extractError}`,
                note: 'PDF text extraction failed. Ask the user to share the content as plain text.',
              };
            }
          } else {
            // Other binary types — return metadata only
            toolResult = {
              filename: result.filename,
              mimeType: result.mimeType,
              size: result.size,
              encoding: 'base64',
              note: `This is a binary file (${result.mimeType}). Content cannot be extracted automatically.`,
            };
          }
        } else {
          toolResult = {
            filename: result.filename,
            mimeType: result.mimeType,
            size: result.size,
            encoding: 'text',
            content: result.content,
          };
        }

        // === SEND EMAIL ===
      } else if (call.name === 'send_email') {
        console.log("[Truth] Intercepted send_email tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const { to, subject, body } = call.args || {};
        if (!to || !subject || !body) {
          return { error: "to, subject, and body are all required to send an email." };
        }

        const result = await withTimeout(
          gmail.sendMessage(workspaceToken, to, subject, body),
          'Gmail Send'
        );
        toolResult = { success: true, messageId: result.id, threadId: result.threadId };

        // === CREATE DRAFT ===
      } else if (call.name === 'create_draft') {
        console.log("[Truth] Intercepted create_draft tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const { to, subject, body, in_reply_to, thread_id } = call.args || {};
        if (!to || !subject || !body) {
          return { error: "to, subject, and body are all required to create a draft." };
        }

        const result = await withTimeout(
          gmail.createDraft(workspaceToken, to, subject, body, {
            inReplyToMessageId: in_reply_to,
            threadId: thread_id,
          }),
          'Gmail Draft'
        );
        toolResult = { success: true, draftId: result.id, messageId: result.message?.id };

        // === TRASH / UNTRASH ===
      } else if (call.name === 'trash_email') {
        console.log("[Truth] Intercepted trash_email tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const messageId = call.args?.message_id;
        if (!messageId) {
          return { error: "message_id is required." };
        }

        const action = call.args?.action || 'trash';
        if (action === 'untrash') {
          await withTimeout(gmail.untrashMessage(workspaceToken, messageId), 'Gmail Untrash');
          toolResult = { success: true, action: 'untrashed', messageId };
        } else {
          await withTimeout(gmail.trashMessage(workspaceToken, messageId), 'Gmail Trash');
          toolResult = { success: true, action: 'trashed', messageId };
        }

        // === DRIVE: List Files ===
      } else if (call.name === 'list_drive_files') {
        console.log("[Truth] Intercepted drive tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const fileType = (call.args?.type || 'all') as drive.DocumentType;
        const nameQuery = call.args?.name_query || '';

        const files = await withTimeout(
          drive.getRecentDriveFiles(workspaceToken, fileType, nameQuery),
          'Drive List'
        );
        toolResult = { files, count: files.length };

        // === DRIVE: Export File ===
      } else if (call.name === 'export_drive_file') {
        console.log("[Truth] Intercepted drive export tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const fileId = call.args?.file_id;
        const mimeType = call.args?.mime_type;
        if (!fileId || !mimeType) {
          return { error: "file_id and mime_type are required. Use list_drive_files first to get file details." };
        }

        const content = await withTimeout(
          drive.exportDriveFile(workspaceToken, fileId, mimeType),
          'Drive Export'
        );
        toolResult = { file_id: fileId, content: content || '(empty or unsupported file format)' };

        // === DRIVE: Create Document ===
      } else if (call.name === 'create_drive_document') {
        console.log("[Truth] Intercepted drive create tool call:", call.name, call.args);
        requireAuth(workspaceToken);

        const title = call.args?.title;
        const htmlContent = call.args?.html_content;
        if (!title || !htmlContent) {
          return { error: "title and html_content are required to create a document." };
        }

        const result = await withTimeout(
          drive.createHtmlDocument(workspaceToken, title, htmlContent),
          'Drive Create'
        );
        toolResult = {
          success: true,
          document_id: result.id,
          document_url: `https://docs.google.com/document/d/${result.id}/edit`,
          title,
        };

        // Index artifact (non-blocking)
        dataService.saveArtifact({
          type: 'document',
          title,
          url: `https://docs.google.com/document/d/${result.id}/edit`,
          metadata: { documentId: result.id, source: 'drive' },
        }).catch(e => console.warn('[Artifact] Index failed:', e));

        // === DEPLOY HTML ===
      } else if (call.name === 'deploy_html') {
        console.log("[Truth] Intercepted deploy tool call:", call.name, call.args);

        const title = call.args?.title;
        const htmlContent = call.args?.html_content;
        if (!title || !htmlContent) {
          return { error: "title and html_content are required to deploy." };
        }

        const result = await withTimeout(
          deployHtml(title, htmlContent),
          'Deploy HTML'
        );
        toolResult = {
          success: true,
          url: result.url,
          object_name: result.objectName,
          title,
          message: `Deployed successfully. Live at: ${result.url}`,
        };

        // Index artifact (non-blocking)
        dataService.saveArtifact({
          type: 'deploy',
          title,
          url: result.url,
          metadata: { objectName: result.objectName, source: 'cloud_storage' },
        }).catch(e => console.warn('[Artifact] Index failed:', e));

        // === REVIEW DOCUMENT ===
      } else if (call.name === 'review_document') {
        console.log("[Truth] Intercepted review tool call:", call.name, call.args);

        const content = call.args?.content;
        if (!content) {
          return { error: "content is required. Pull it from the email or document you already read in this conversation." };
        }

        const apiKey = process.env.API_KEY || 'vertex-proxy';
        // apiKey value is irrelevant — vertexai:true routes through proxy shim
        // which replaces auth with real ADC credentials server-side

        const REVIEW_TIMEOUT_MS = 30000;
        const result = await Promise.race([
          reviewDocument(
            content,
            call.args?.target_role || '',
            call.args?.document_type || 'resume',
            apiKey
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Document review timed out after ${REVIEW_TIMEOUT_MS / 1000}s`)), REVIEW_TIMEOUT_MS)
          ),
        ]);
        toolResult = {
          summary: result.summary,
          improvements_count: result.improvements.length,
          improvements: result.improvements,
          enhanced_html: result.enhanced_html,
          _format_instruction: 'Present the improvements as a numbered list showing what was changed and why. Then render the enhanced HTML in a code block. Ask the user if they want to save to Drive or deploy.',
        };

        // === SPORTS ===
      } else if (call.name === 'get_sports_data') {
        console.log("[Truth] Intercepted sports tool call:", call.name, call.args);

        const sport = call.args?.sport || 'mlb';
        const date = call.args?.date;
        const eventId = call.args?.event_id;
        const includePlayByPlay = call.args?.include_play_by_play;
        const team = call.args?.team;

        if (eventId) {
          const fetches: Promise<any>[] = [
            espnService.getEventDetail(sport, eventId),
          ];
          if (includePlayByPlay) {
            fetches.push(espnService.getPlayByPlay(sport, eventId));
          }

          const results = await withTimeout(Promise.all(fetches), 'ESPN Event Detail');
          toolResult = {
            ...results[0],
            ...(results[1] ? { playByPlay: results[1] } : {}),
          };
        } else {
          const scoreboard = await withTimeout(
            espnService.getScoreboard(sport, date),
            'ESPN Scoreboard'
          );

          // Context Envelope: If the user mentioned a specific team,
          // filter the payload so the LLM ONLY sees that team's game.
          // Prevents hallucination pivots to unrelated matchups.
          if (team && scoreboard?.events) {
            const searchTeam = team.toLowerCase().trim();
            const filtered = scoreboard.events.filter((game: any) =>
              JSON.stringify(game).toLowerCase().includes(searchTeam)
            );
            toolResult = {
              ...scoreboard,
              events: filtered,
              _context_note: filtered.length === 0
                ? `No games found matching '${team}'. Tell the user their team is not playing today.`
                : `Filtered to ${filtered.length} game(s) matching '${team}'.`,
            };
          } else {
            toolResult = scoreboard;
          }
        }

      // === WORLD CUP TEAM PROFILE (Headless RAG via Jina) ===
      } else if (call.name === 'get_world_cup_team_profile') {
        console.log('[Truth] Intercepted WC team profile tool call:', call.args);
        const team = call.args?.team || '';
        const slug = team.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        const targetUrl = `https://thedrip.to/teams/${slug}/`;

        try {
          const response = await withTimeout(
            fetch(`https://r.jina.ai/${targetUrl}`).then(r => {
              if (!r.ok) throw new Error(`Team page not found (${r.status})`);
              return r.text();
            }),
            'TheDrip RAG'
          );

          toolResult = {
            id: `wc_${Date.now()}`,
            type: 'WORLD_CUP_PROFILE',
            resolution_state: 'RESOLVED',
            context_summary: `Fetched World Cup profile for ${team} from TheDrip.to`,
            data: { raw_content: response.substring(0, 15000), source_url: targetUrl },
            _format_instruction: `Synthesize the raw content into a world_cup_profile JSON artifact. Extract: team, nickname, manager, summary (2 sentences), tactical_outlook, the_drip (kit/apparel/culture details), world_cup_history, key_players (array), and source_url. Output as a \`\`\`world_cup_profile code block.`,
          };
        } catch (error: any) {
          toolResult = {
            id: `wc_err_${Date.now()}`,
            type: 'WORLD_CUP_PROFILE',
            resolution_state: 'ERROR',
            context_summary: `Profile data not available for ${team} on TheDrip yet.`,
            data: { error: error.message },
          };
        }

      } else {
        toolResult = { error: `Unknown tool: ${call.name}` };
      }
    } catch (e: any) {
      if (e.name === 'TimeoutError' || e.message?.includes('timed out')) {
        toolResult = { error: `The request timed out after ${TOOL_TIMEOUT_MS / 1000}s. Please try again.` };
      } else {
        toolResult = { error: `Tool execution failed: ${e instanceof Error ? e.message : e}` };
      }
    }

    // Payload Sanitizer: Strip reserved OpenAPI keywords ($ref, uid)
    // and heavy hypermedia links before returning to Gemini.
    // ESPN's API uses $ref internally, which Vertex AI interprets as
    // an OpenAPI schema reference, causing 400 INVALID_ARGUMENT crashes.
    try {
      toolResult = JSON.parse(
        JSON.stringify(toolResult, (key, value) => {
          if (key === '$ref' || key === 'uid' || key === 'links') return undefined;
          return value;
        })
      );
    } catch {
      // If sanitization fails, return the raw result — better than crashing
    }

    return toolResult;
  };

  return {
    dispatchToolCall,
    tools: [workspaceTool, readEmailTool, downloadAttachmentTool, sendEmailTool, draftEmailTool, trashEmailTool, listDriveFilesTool, exportDriveFileTool, createDriveDocTool, deployHtmlTool, reviewDocumentTool, sportsTool, worldCupTeamTool],
  };
}
