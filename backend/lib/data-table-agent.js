// ============================================================================
// Data Table Agent — Grounded 2-pass search + CPU computation pipeline
// Follows the established AtsChart agent pattern from aura-genai-source
// ============================================================================

import { GoogleGenAI, Type } from '@google/genai';

// ── Configuration & State ─────────────────────────────────────────────────
const ai = new GoogleGenAI({ vertexai: true });

// LRU Cache for resolved data
const tableCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours
const MAX_CACHE_SIZE = 50;

// Request coalescing map to prevent Thundering Herd on high concurrency
const pendingRequests = new Map();

// ── Structured extraction schema ──────────────────────────────────────────
const TABLE_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Contextual title describing the data.' },
    columns: {
      type: Type.ARRAY,
      description: 'Column headers for the table.',
      items: { type: Type.STRING }
    },
    rows: {
      type: Type.ARRAY,
      description: 'Table rows. Each row is an array of cell values matching the columns.',
      items: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    },
    source: { type: Type.STRING, description: 'The canonical source URL(s) the data was scraped from.' },
    footnote: { type: Type.STRING, description: 'Optional context note about the data.' }
  },
  required: ['title', 'columns', 'rows']
};

// ── Dynamic domain routing (Evergreen) ────────────────────────────────────
/**
 * Constructs targeted search parameters based on sport and current season.
 */
function buildSearchQuery(query) {
  const q = query.toLowerCase();
  
  // Extract user-specified year to avoid clashing with the dynamic current year
  const hasYear = /\b(?:19|20)\d{2}\b/.test(q);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  
  // Winter sports (NBA/NHL) span two calendar years. Shift to the new season in September.
  const isSecondHalf = month >= 8;
  const winterSeason = isSecondHalf 
    ? `${year}-${(year + 1).toString().slice(-2)}` 
    : `${year - 1}-${year.toString().slice(-2)}`;

  let keywords = '';

  // MLB / Baseball
  if (q.includes('mlb') || q.includes('baseball') || q.includes('runs') || q.includes('batting')) {
    keywords = hasYear ? 'MLB' : `MLB ${year} season`;
    return {
      domains: '(site:teamrankings.com OR site:covers.com OR site:espn.com)',
      keywords
    };
  }
  // NBA / Basketball
  if (q.includes('nba') || q.includes('basketball')) {
    keywords = hasYear ? 'NBA' : `NBA ${winterSeason} season`;
    return {
      domains: '(site:teamrankings.com OR site:basketball-reference.com OR site:espn.com)',
      keywords
    };
  }
  // NFL / Football
  if (q.includes('nfl') || q.includes('football')) {
    const nflYear = isSecondHalf ? year : year - 1; // NFL typically uses starting year identifiers
    keywords = hasYear ? 'NFL' : `NFL ${nflYear} season`;
    return {
      domains: '(site:teamrankings.com OR site:pro-football-reference.com OR site:espn.com)',
      keywords
    };
  }
  // NHL / Hockey
  if (q.includes('nhl') || q.includes('hockey')) {
    keywords = hasYear ? 'NHL' : `NHL ${winterSeason} season`;
    return {
      domains: '(site:teamrankings.com OR site:hockey-reference.com OR site:espn.com)',
      keywords
    };
  }
  
  // Fallback — general sports
  return {
    domains: '(site:teamrankings.com OR site:espn.com OR site:covers.com)',
    keywords: hasYear ? '' : `${year} season standings`,
  };
}

/**
 * Executes the 2-pass Gemini pipeline. Separated from the cache layer for clarity.
 * @param {string} userQuery
 * @param {string} searchQuery
 * @returns {Promise<Object>}
 */
async function executeTablePipeline(userQuery, searchQuery) {
  try {
    // ── Pass 1: Google Search grounding (schema OFF) ──────────────────
    console.log(`[DataTable Pass 1] Grounding: "${searchQuery}"`);
    const groundingResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchQuery,
      config: {
        systemInstruction: 'You are a high-precision data scraper. Retrieve the complete, untruncated data table from the provided sources based on the query. Output all rows as plain text. Do not skip or summarize any rows.',
        tools: [{ googleSearch: {} }],
        temperature: 0.0,
      },
    });

    const rawText = groundingResponse.text;
    if (!rawText) {
      return { error: 'Grounding pass returned no data.' };
    }

    // Safely capture and deduplicate ALL source URLs from grounding metadata
    const chunks = groundingResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const uniqueUrls = [...new Set(chunks.map(c => c.web?.uri).filter(Boolean))];
    const sourceUrls = uniqueUrls.join(', ') || '';

    // ── Pass 2: Structured extraction (schema ON) ─────────────────────
    console.log(`[DataTable Pass 2] Extracting structured table (sources: ${sourceUrls || 'none'})`);
    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract a clean data table from this grounded text payload. The user's original query was: "${userQuery}"\n\nData:\n${rawText}`,
      config: {
        systemInstruction: 'You are a quantitative table parser. Extract the data into the exact schema. Include ALL rows. Do not truncate. Preserve values and formatting precisely.',
        responseMimeType: 'application/json',
        responseSchema: TABLE_EXTRACTION_SCHEMA,
        temperature: 0.1,
      },
    });

    // Safety guard: Strip potential markdown wrapping that occasionally bypasses MIME types
    const rawTextResponse = extractionResponse.text || '';
    const cleanJsonText = rawTextResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJsonText);
    } catch (parseError) {
      console.error('[DataTable] JSON Parse Error:', parseError);
      return { error: 'Failed to format the data table correctly.' };
    }

    // Ensure source is appended if the extraction model missed it
    if (!parsedData.source && sourceUrls) {
      parsedData.source = sourceUrls;
    }

    return parsedData;

  } catch (error) {
    console.error('[DataTable] Pipeline execution failed:', error);
    return { error: 'An error occurred while fetching the data table.' };
  }
}

/**
 * Grounded data table engine following the 2-pass pattern.
 * Safely scales via request coalescing and strict LRU cache limits.
 *
 * @param {string} userQuery — Natural language table request
 * @returns {Promise<Object>} React-ready DataTableArtifact payload
 */
export async function fetchDataTable(userQuery) {
  // ── Input Validation ────────────────────────────────────────────────────
  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    return { error: 'No query provided.' };
  }
  
  if (userQuery.length > 250) {
    return { error: 'Query is too long. Please keep it under 250 characters.' };
  }

  const cacheKey = userQuery.toLowerCase().trim();
  const now = Date.now();
  
  // ── Cache Layer ─────────────────────────────────────────────────────────
  if (tableCache.has(cacheKey)) {
    const entry = tableCache.get(cacheKey);
    if (now - entry.timestamp < CACHE_TTL_MS) {
      console.log(`[DataTable] Cache hit: "${cacheKey}"`);
      // Update insertion order to maintain LRU behavior
      tableCache.delete(cacheKey);
      tableCache.set(cacheKey, entry);
      return entry.data;
    }
    // Prune expired entry proactively
    tableCache.delete(cacheKey); 
  }

  // ── Request Coalescing (Thundering Herd Protection) ─────────────────────
  if (pendingRequests.has(cacheKey)) {
    console.log(`[DataTable] Request coalesced: "${cacheKey}"`);
    return pendingRequests.get(cacheKey);
  }

  const { domains, keywords } = buildSearchQuery(userQuery);
  const searchQuery = `${domains} ${keywords} ${userQuery}`.replace(/\s+/g, ' ').trim();

  // Create the promise and store it in pending requests
  const requestPromise = executeTablePipeline(userQuery, searchQuery)
    .then((result) => {
      // Only cache successful payloads (those with title/columns/rows, not error objects)
      if (result && !result.error) {
        // Enforce cache size limit — evict oldest entry
        if (tableCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = tableCache.keys().next().value;
          if (oldestKey) tableCache.delete(oldestKey);
        }
        tableCache.set(cacheKey, { timestamp: Date.now(), data: result });
      }
      return result;
    })
    .finally(() => {
      // Always clean up the pending request, success or fail
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
