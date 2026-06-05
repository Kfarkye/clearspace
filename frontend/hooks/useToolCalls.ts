import { FunctionDeclaration, Type } from '@google/genai';
import { ApiClient } from '../services/apiClient';
import { allSportsTools, dispatchSportsTool, SPORTS_TOOL_NAMES } from '../services/sportsDispatcher';
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
      fetch_tasks: { type: Type.BOOLEAN, description: 'Set to true to fetch pending action items.' },
      // 🛡️ POISON PILL: Forces the LLM to explicitly evaluate domain before execution
      is_strictly_personal_data: {
        type: Type.BOOLEAN,
        description: 'CRITICAL DOMAIN GATE: You MUST set this to TRUE only if the user is asking about their personal emails, calendar, documents, or tasks. If the user is asking about sports (MLB, NBA, WNBA, NFL, NHL, MLS, scores, games, standings, Yankees, Braves, etc.), public knowledge, licenses, regulations, or any non-personal topic, you MUST set this to FALSE. Setting FALSE will block execution — use the correct domain tool instead.'
      }
    },
    required: ['fetch_emails', 'fetch_calendar', 'fetch_tasks', 'is_strictly_personal_data']
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

// ── Sports Tools ────────────────────────────────────────────────────────────
// All 9 sports tool declarations + dispatch logic are centralized in:
// frontend/services/sportsDispatcher.ts
// Tools: get_scoreboard, get_game_detail, get_play_by_play, get_live_odds,
//        get_win_probability, get_player_props, get_betting_trends,
//        generate_data_table, get_league_standings

// ── World Cup 2026 Tools (Spanner: world-cup-db) ────────────────────────────

export const worldCupTeamTool: FunctionDeclaration = {
  name: 'get_world_cup_team_profile',
  description: 'Fetches World Cup 2026 team profiles from our Spanner database (groups, FIFA ranking, confederation) AND TheDrip.to (kits, apparel, tactical analysis). Use when a user asks about a national soccer/football team\'s World Cup profile, their jerseys/kits, or team history. DO NOT use for live match scores (use get_scoreboard instead).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: 'The national team name or 3-letter code, e.g., "Brazil", "USA", "PAR"'
      },
    },
    required: ['team']
  }
};

export const worldCupGroupTool: FunctionDeclaration = {
  name: 'get_world_cup_group',
  description: 'Fetches a complete World Cup 2026 group snapshot from our Spanner database: all teams, matches, venues, odds, betting edges, and prediction market prices. Use when a user asks about a World Cup group, group standings, or "who is in Group D".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      group: {
        type: Type.STRING,
        description: 'The group letter, e.g., "D", "A", "H"'
      },
    },
    required: ['group']
  }
};

export const worldCupScheduleTool: FunctionDeclaration = {
  name: 'get_world_cup_schedule',
  description: 'Fetches World Cup 2026 match schedule from our Spanner database. Can filter by group, team, or stage. Use when a user asks "when does USA play", "World Cup schedule", or "Group D matches".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      group: {
        type: Type.STRING,
        description: 'Filter by group letter, e.g., "D"'
      },
      team: {
        type: Type.STRING,
        description: 'Filter by team code, e.g., "USA", "PAR", "AUS"'
      },
      stage: {
        type: Type.STRING,
        description: 'Filter by stage: "group", "round_of_32", "quarter", "semi", "final"'
      },
    },
  }
};

export const worldCupEdgesTool: FunctionDeclaration = {
  name: 'get_world_cup_edges',
  description: 'Fetches World Cup 2026 betting edges from our Spanner database — computed as the difference between sportsbook odds (DraftKings, FanDuel) and prediction markets (Kalshi, Polymarket). Use when a user asks about "World Cup betting value", "edges", or "where are the best bets".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: 'Filter edges by team code, e.g., "USA"'
      },
      minEdge: {
        type: Type.NUMBER,
        description: 'Minimum edge percentage to filter, e.g., 2.0'
      },
    },
  }
};

export const allWorldCupTools = [worldCupTeamTool, worldCupGroupTool, worldCupScheduleTool, worldCupEdgesTool];


export const youtubeSearchTool: FunctionDeclaration = {
  name: 'search_youtube',
  description: 'Searches YouTube for videos. Use when the user asks to play music, find a video, watch highlights, or any media request (e.g., "play Drake", "show me highlights", "find a tutorial"). Returns top video results with titles, thumbnails, and playback URLs.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The YouTube search query, e.g., "Drake God\'s Plan", "Braves highlights today", "React tutorial"'
      },
    },
    required: ['query']
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

        // 🧱 DETERMINISTIC BOUNCER: Physical trap — blocks context bleed at execution layer
        // P1 FIX: Regex restricted to unmistakable public sports entities only.
        // Generic words (game, score, standings) removed to prevent false positives
        // on personal queries like "kid's soccer game schedule" or "FICO credit score".
        const SPORTS_BLEED_PATTERN = /\b(mlb|nba|wnba|mls|nhl|nfl|epl|ucl|liga|cfb|cbb|yankees|braves|dodgers|mets|astros|padres|cubs|phillies|rangers|orioles|guardians|twins|royals|tigers|rays|red\s?sox|white\s?sox|mariners|athletics|angels|rockies|pirates|reds|brewers|cardinals|diamondbacks|giants|nationals|marlins|lakers|celtics|knicks|warriors|nuggets|heat|bucks|suns|mavericks|thunder|timberwolves|clippers|cavaliers|nets|hawks|bulls|pacers|raptors|pistons|magic|hornets|spurs|pelicans|kings|blazers|jazz|grizzlies|rockets|wizards|sportsbook|draftkings|fanduel|espn\s?gamecast)\b/i;
        const queryText = call.args?.email_query || '';
        const isPoisonPillFalse = call.args?.is_strictly_personal_data === false;
        const isSportsBleed = SPORTS_BLEED_PATTERN.test(queryText);

        if (isPoisonPillFalse || isSportsBleed) {
          console.warn(`[BOUNCER] 🛑 Intercepted Context Bleed: Blocked Workspace for non-personal query. PoisonPill=${call.args?.is_strictly_personal_data}, Query="${queryText}"`);
          // P1 FIX: Return flat error object — useChat.ts wraps in { functionResponse: { name, response } }
          // Returning a nested functionResponse here would cause double-wrapping and SDK validation failure.
          return {
            error: "CRITICAL ROUTING FAILURE: Domain violation. You attempted to search the user's private Workspace for public sports data. Pivot to 'get_scoreboard' for sports queries or Google Search for public knowledge immediately."
          };
        }

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

        // ── SPORTS TOOLS (delegated to sportsDispatcher.ts) ────────────
      } else if (SPORTS_TOOL_NAMES.has(call.name)) {
        toolResult = await dispatchSportsTool(call, withTimeout);

      // === WORLD CUP TEAM PROFILE (Spanner DB + TheDrip enrichment + Stats Aggregation) ===
      } else if (call.name === 'get_world_cup_team_profile') {
        console.log('[Truth] Intercepted WC team profile tool call:', call.args);
        const team = call.args?.team || '';
        const teamCode = team.toUpperCase().trim();
        const slug = team.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

        try {
          // 1. Query Spanner world-cup-db for structured data
          let dbData = null;
          try {
            const teamRes = await fetch(`/api/world-cup/teams/${teamCode}`);
            if (teamRes.ok) {
              dbData = await teamRes.json();
            } else {
              // Try name-based lookup via teams list
              const allRes = await fetch('/api/world-cup/teams');
              if (allRes.ok) {
                const { teams } = await allRes.json();
                dbData = teams.find((t: any) =>
                  t.name.toLowerCase().includes(slug.replace(/-/g, ' ')) ||
                  t.teamCode === teamCode
                );
              }
            }
          } catch { /* DB lookup is best-effort */ }

          const resolvedTeamCode = dbData?.teamCode || teamCode;

          // 2. Scrape TheDrip for profile content
          let dripContent = null;
          try {
            const targetUrl = `https://thedrip.to/teams/${slug}/`;
            const response = await withTimeout(
              fetch(`https://r.jina.ai/${targetUrl}`).then(r => {
                if (!r.ok) throw new Error(`Team page not found (${r.status})`);
                return r.text();
              }),
              'TheDrip RAG'
            );
            dripContent = { raw_content: response.substring(0, 15000), source_url: targetUrl };
          } catch { /* TheDrip scrape is best-effort */ }

          // 3. Fetch Power Ratings from Spanner
          let ratings = [];
          try {
            const ratingsRes = await fetch(`/api/world-cup/teams/${resolvedTeamCode}/power-ratings`);
            if (ratingsRes.ok) {
              const ratingsData = await ratingsRes.json();
              ratings = ratingsData.ratings || [];
            }
          } catch (e) { console.warn('Failed to fetch ratings:', e); }

          // 4. Fetch Team Trends from Spanner
          let trends = [];
          try {
            const trendsRes = await fetch(`/api/world-cup/teams/${resolvedTeamCode}/trends`);
            if (trendsRes.ok) {
              const trendsData = await trendsRes.json();
              trends = trendsData.trends || [];
            }
          } catch (e) { console.warn('Failed to fetch trends:', e); }

          // 5. Fetch Injury News from Spanner
          let injuries = [];
          try {
            const injuriesRes = await fetch(`/api/world-cup/teams/${resolvedTeamCode}/injuries`);
            if (injuriesRes.ok) {
              const injuriesData = await injuriesRes.json();
              injuries = injuriesData.injuries || [];
            }
          } catch (e) { console.warn('Failed to fetch injuries:', e); }

          // 6. Fetch Next Match's Lineup Projections from Spanner
          let lineupProjections = null;
          try {
            const matchesRes = await fetch(`/api/world-cup/matches?team=${resolvedTeamCode}`);
            if (matchesRes.ok) {
              const { matches } = await matchesRes.json();
              const nextMatch = matches?.find((m: any) => m.status === 'scheduled' || m.status === 'live' || m.status === 'in_progress') || matches?.[0];
              if (nextMatch) {
                const lineupsRes = await fetch(`/api/world-cup/matches/${nextMatch.matchId}/lineups`);
                if (lineupsRes.ok) {
                  const { lineups } = await lineupsRes.json();
                  const teamLineups = lineups?.filter((l: any) => l.team_code === resolvedTeamCode) || [];
                  const opponentCode = nextMatch.homeTeam?.code === resolvedTeamCode ? nextMatch.awayTeam?.code : nextMatch.homeTeam?.code;
                  lineupProjections = {
                    match_id: nextMatch.matchId,
                    opponent_code: opponentCode || 'TBD',
                    players: teamLineups.map((l: any) => ({
                      player_name: l.player_name,
                      position: l.position,
                      is_projected_starter: l.is_projected_starter,
                    })),
                  };
                }
              }
            }
          } catch (e) { console.warn('Failed to fetch lineups:', e); }

          toolResult = {
            id: `wc_${Date.now()}`,
            type: 'WORLD_CUP_PROFILE',
            resolution_state: 'RESOLVED',
            context_summary: `World Cup profile for ${team}${dbData ? ` (${dbData.flagEmoji} Group ${dbData.group}, FIFA #${dbData.fifaRanking})` : ''}`,
            data: {
              db_profile: dbData,
              drip_content: dripContent,
              power_ratings: ratings,
              trends: trends,
              injuries: injuries,
              lineup_projections: lineupProjections,
            },
            _format_instruction: `Synthesize the DB profile data, TheDrip content, power ratings, trends, injuries, and lineup projections into a world_cup_profile JSON artifact.
Extract and output ONLY the raw JSON object inside a \`\`\`world_cup_profile code block. Do NOT add conversational preamble.
The JSON object must match this schema:
{
  "team": "Spain",
  "nickname": "La Roja",
  "manager": "Luis de la Fuente",
  "summary": "Spain plays a possession-heavy style focusing on positional play and quick recoveries...",
  "tactical_outlook": "Builds from back via pivot players, using high pressing to choke opponents...",
  "the_drip": "Apparel details, kits description, and cultural highlights...",
  "world_cup_history": "Winners in 2010, constant force in international football...",
  "key_players": ["Rodri", "Pedri", "Lamine Yamal"],
  "source_url": "https://thedrip.to/teams/spain",
  "fifa_ranking": 8,
  "group_letter": "A",
  "confederation": "UEFA",
  "power_ratings": [ { "rating": 89.7, "source": "elo_market_sentiment", "updated_at": "2026-06-05..." } ],
  "trends": [ { "trend_type": "moneyline", "wins": 12, "losses": 3, "pushes": 2, "percentage": 0.7059, "source": "historical..." } ],
  "injuries": [ { "player_name": "Pedri", "position": "MF", "status": "Questionable", "description": "Thigh strain..." } ],
  "lineup_projections": {
    "match_id": "match-2026-no-1",
    "opponent_code": "CZE",
    "players": [ 
      { "player_name": "Rodri", "position": "MF", "is_projected_starter": true, "jersey_number": 16, "headshot_url": "https://i.pravatar.cc/150?u=rodri" } 
    ]
  },
  "player_props": [
    { "player": "Lamine Yamal", "market": "Shots on Target", "line": "O 1.5", "odds": "-135", "trend": "up", "headshot_url": "https://i.pravatar.cc/150?u=yamal" }
  ],
  "time_to_first_goal": {
    "average_minutes": 28,
    "bands": [
      { "label": "00:00 - 14:59", "odds": "+210" },
      { "label": "15:00 - 29:59", "odds": "+280" }
    ]
  }
}`,
          };
        } catch (error: any) {
          toolResult = {
            id: `wc_err_${Date.now()}`,
            type: 'WORLD_CUP_PROFILE',
            resolution_state: 'ERROR',
            context_summary: `Profile data not available for ${team}.`,
            data: { error: error.message },
          };
        }
        console.log('[Truth] Aggregated WC team profile result:', toolResult.context_summary);

      // === WORLD CUP GROUP SNAPSHOT (Spanner: world-cup-db) ===
      } else if (call.name === 'get_world_cup_group') {
        console.log('[Truth] Intercepted WC group tool call:', call.args);
        const group = (call.args?.group || 'D').toUpperCase().replace(/[^A-L]/g, '');

        try {
          const res = await withTimeout(
            fetch(`/api/world-cup/groups/${group}`).then(r => {
              if (!r.ok) throw new Error(`Group lookup failed (${r.status})`);
              return r.json();
            }),
            'WC Group Snapshot'
          );

          toolResult = {
            id: `wc_group_${Date.now()}`,
            type: 'WORLD_CUP_GROUP',
            resolution_state: 'RESOLVED',
            context_summary: `Group ${group}: ${res.teams?.length || 0} teams, ${res.matches?.length || 0} matches, ${res.edges?.length || 0} betting edges`,
            data: res,
            _format_instruction: `Present this World Cup Group ${group} data in a clear format. Show: 1) Team table with flag, name, FIFA ranking, confederation. 2) Match schedule with dates, teams, and venues. 3) Any betting edges or odds data. Use a scoreboard or structured format.`,
          };
        } catch (error: any) {
          toolResult = {
            id: `wc_group_err_${Date.now()}`,
            type: 'WORLD_CUP_GROUP',
            resolution_state: 'ERROR',
            context_summary: `Could not load Group ${group} data.`,
            data: { error: error.message },
          };
        }

      // === WORLD CUP SCHEDULE (Spanner: world-cup-db) ===
      } else if (call.name === 'get_world_cup_schedule') {
        console.log('[Truth] Intercepted WC schedule tool call:', call.args);
        const params = new URLSearchParams();
        if (call.args?.group) params.set('group', call.args.group.toUpperCase());
        if (call.args?.team) params.set('team', call.args.team.toUpperCase());
        if (call.args?.stage) params.set('stage', call.args.stage);

        try {
          const res = await withTimeout(
            fetch(`/api/world-cup/matches?${params.toString()}`).then(r => {
              if (!r.ok) throw new Error(`Schedule lookup failed (${r.status})`);
              return r.json();
            }),
            'WC Schedule'
          );

          toolResult = {
            id: `wc_sched_${Date.now()}`,
            type: 'WORLD_CUP_SCHEDULE',
            resolution_state: 'RESOLVED',
            context_summary: `Found ${res.matches?.length || 0} World Cup matches`,
            data: res,
            _format_instruction: `Present the World Cup 2026 schedule in a clean table format with date/time, home team vs away team (with flags), venue, and city. Sort chronologically.`,
          };
        } catch (error: any) {
          toolResult = {
            id: `wc_sched_err_${Date.now()}`,
            type: 'WORLD_CUP_SCHEDULE',
            resolution_state: 'ERROR',
            context_summary: `Could not load schedule.`,
            data: { error: error.message },
          };
        }

      // === WORLD CUP BETTING EDGES (Spanner: world-cup-db) ===
      } else if (call.name === 'get_world_cup_edges') {
        console.log('[Truth] Intercepted WC edges tool call:', call.args);
        const params = new URLSearchParams();
        if (call.args?.team) params.set('team', call.args.team.toUpperCase());
        if (call.args?.minEdge) params.set('minEdge', String(call.args.minEdge));

        try {
          const res = await withTimeout(
            fetch(`/api/world-cup/edges?${params.toString()}`).then(r => {
              if (!r.ok) throw new Error(`Edges lookup failed (${r.status})`);
              return r.json();
            }),
            'WC Edges'
          );

          toolResult = {
            id: `wc_edges_${Date.now()}`,
            type: 'WORLD_CUP_EDGES',
            resolution_state: 'RESOLVED',
            context_summary: `Found ${res.edges?.length || 0} betting edges${call.args?.team ? ` for ${call.args.team}` : ''}`,
            data: res,
            _format_instruction: `Present the betting edges in a clear analysis format. For each edge show: team, market type, sportsbook implied %, prediction market implied %, edge %, direction, and sources. Highlight the highest-value edges.`,
          };
        } catch (error: any) {
          toolResult = {
            id: `wc_edges_err_${Date.now()}`,
            type: 'WORLD_CUP_EDGES',
            resolution_state: 'ERROR',
            context_summary: `Could not load edges.`,
            data: { error: error.message },
          };
        }


      // === YOUTUBE SEARCH ===
      } else if (call.name === 'search_youtube') {
        console.log('[Truth] Intercepted YouTube search tool call:', call.args);
        const query = call.args?.query || '';

        try {
          const res = await withTimeout(
            fetch(`/api-proxy/youtube?q=${encodeURIComponent(query)}`).then(r => {
              if (!r.ok) throw new Error(`YouTube proxy returned ${r.status}`);
              return r.json();
            }),
            'YouTube Search'
          );

          const videos = Array.isArray(res) ? res : res?.videos || [];
          toolResult = {
            type: 'YOUTUBE_MEDIA',
            context_summary: `Top video results for "${query}"`,
            _format_instruction: `Output the results as a \`\`\`youtube_media JSON code block with { "videos": [...], "query": "${query}" }. Each video has: title, url, thumbnail, author, duration.`,
            data: { videos, query },
          };
        } catch (error: any) {
          toolResult = {
            type: 'YOUTUBE_MEDIA',
            context_summary: `YouTube search failed for "${query}"`,
            data: { error: error.message, query },
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

    // ── SYSTEM-LEVEL FALLBACK INTERCEPTOR ──────────────────────────────
    // If any tool returns empty/error data, inject a directive telling the
    // model to use Google Search instead of surfacing "no data" to the user.
    const isError = toolResult.error || toolResult.resolution_state === 'ERROR';
    const isEmpty = (
      (toolResult.data?.events && Array.isArray(toolResult.data.events) && toolResult.data.events.length === 0) ||
      (toolResult.data?.edges && Array.isArray(toolResult.data.edges) && toolResult.data.edges.length === 0) ||
      (toolResult.data?.matches && Array.isArray(toolResult.data.matches) && toolResult.data.matches.length === 0) ||
      (toolResult.data?.error)
    );

    if (isError || isEmpty) {
      toolResult._fallback_instruction = `CRITICAL: This tool returned ${isError ? 'an error' : 'empty data'}. Do NOT tell the user "no data available". Instead, IMMEDIATELY use Google Search to answer the user's original question with live web data. The user should see the answer, not the tool failure.`;
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
    tools: [workspaceTool, readEmailTool, downloadAttachmentTool, sendEmailTool, draftEmailTool, trashEmailTool, listDriveFilesTool, exportDriveFileTool, createDriveDocTool, deployHtmlTool, reviewDocumentTool, ...allSportsTools, ...allWorldCupTools, youtubeSearchTool],
  };
}
