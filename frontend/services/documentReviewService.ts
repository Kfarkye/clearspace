/**
 * Document Review Service — Structured AI Audit Pipeline
 * 
 * Forces a deterministic review pass on documents (resumes, reports, etc.)
 * using a dedicated Gemini call with JSON schema output.
 * 
 * Pattern: Workspace-Automation/geminiService.ts
 * - Structured output via responseMimeType + responseSchema
 * - Separate AI call per concern (audit vs. generation)
 * - Returns machine-readable improvements + enhanced HTML
 */

import { GoogleGenAI, Type } from '@google/genai';
import { MODEL_ID } from '../config/model';



interface DocumentImprovement {
  section: string;
  original: string;
  improved: string;
  reason: string;
}

interface ReviewResult {
  improvements: DocumentImprovement[];
  enhanced_html: string;
  summary: string;
}

/**
 * Runs a structured audit on document content.
 * Returns specific improvements + the full enhanced HTML.
 * 
 * @param content - Raw text or HTML content of the document
 * @param targetRole - Optional target role/company for tailoring (e.g., "Sr Recruiting at Host Healthcare")
 * @param documentType - Type hint: "resume", "report", "letter", etc.
 * @param apiKey - Gemini API key
 */
export async function reviewDocument(
  content: string,
  targetRole: string,
  documentType: string = 'resume',
  apiKey: string
): Promise<ReviewResult> {
  const ai = new GoogleGenAI({ apiKey, vertexai: true });
  const prompt = buildReviewPrompt(content, targetRole, documentType);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            improvements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  section: { type: Type.STRING },
                  original: { type: Type.STRING },
                  improved: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['section', 'original', 'improved', 'reason'],
              },
            },
            enhanced_html: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: ['improvements', 'enhanced_html', 'summary'],
        },
      },
    });

    const responseText = response.text;

    // Guard: empty or null response from the API
    if (!responseText) {
      console.warn('[ReviewService] Gemini returned an empty response.text.');
      return {
        improvements: [],
        enhanced_html: content,
        summary: 'Gemini review completed, but returned empty content. Original content preserved.',
      };
    }

    const parsed = JSON.parse(responseText);

    // Validate schema conformance — the model may return partial data
    if (
      !Array.isArray(parsed.improvements) ||
      typeof parsed.enhanced_html !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      console.warn('[ReviewService] Gemini response did not match expected schema. Falling back.');
      return {
        improvements: [],
        enhanced_html: content,
        summary: 'Gemini review completed, but output was malformed. Original content preserved.',
      };
    }

    return {
      improvements: parsed.improvements,
      enhanced_html: parsed.enhanced_html,
      summary: parsed.summary,
    };
  } catch (error) {
    console.error('[ReviewService] Error during document review:', error);
    return {
      improvements: [],
      enhanced_html: content,
      summary: `Document review failed: ${error instanceof Error ? error.message : String(error)}. Original content preserved.`,
    };
  }
}

function buildReviewPrompt(content: string, targetRole: string, documentType: string): string {
  const roleContext = targetRole
    ? `The candidate is applying for: ${targetRole}. Tailor the content to this specific role — adjust keywords, reorder bullet points to emphasize relevant experience, and strengthen phrasing to match what hiring managers for this role look for.`
    : 'Improve the document for general professional quality.';

  return `You are an expert ${documentType} reviewer and editor. Perform a thorough audit of the following ${documentType} and return structured improvements.

${roleContext}

AUDIT CHECKLIST:
1. CONTENT: Identify weak or generic bullet points. Replace with specific, quantified achievements.
2. KEYWORDS: Ensure role-relevant keywords are present (ATS optimization).
3. GRAMMAR: Fix any grammatical errors, awkward phrasing, or passive voice.
4. STRUCTURE: Improve section ordering and hierarchy for maximum impact.
5. FORMATTING: Ensure consistent formatting (dates, titles, bullet style).
6. GAPS: Flag missing sections that a ${documentType} for this role should have.

For each improvement you make, document it in the improvements array with:
- section: Which section of the ${documentType} (e.g., "Professional Summary", "Aya Healthcare Experience")
- original: The exact original text you changed
- improved: Your improved version
- reason: Why this change makes the ${documentType} stronger

Then produce the full enhanced HTML in enhanced_html. The HTML should be:
- Self-contained with inline CSS
- Clean, professional formatting suitable for print
- Using a modern, readable font stack

Finally, write a brief summary of the key changes made.

DOCUMENT CONTENT:
${content}`;
}
