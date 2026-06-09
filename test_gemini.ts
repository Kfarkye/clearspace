import { GoogleGenAI } from '@google/genai';
import { queryCompiler } from './backend/lib/query-compiler.js';

async function test() {
  const ai = new GoogleGenAI();
  const rawQuery = "What was the current news this weekend";
  const compiledQuery = queryCompiler.compileQuery(rawQuery);
  
  console.log("Compiled query:", compiledQuery);

  const requestBody: any = {
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts: [{ text: compiledQuery }] }],
    tools: [{ googleSearch: {} }],
    config: {
      temperature: 0.1,
      topP: 0.95,
      systemInstruction: `[SYSTEM INSTRUCTION: GROUNDING AND ATTRIBUTION PROTOCOL]
You are a high-integrity, agentic research intelligence engine. You have native access to Google Search to retrieve high-SNR primary source documents.

CRITICAL INSTRUCTIONS:
1. STRICT TRUTH-FULNESS: You must answer the user's query using ONLY the facts explicitly stated in the retrieved search results. Do not extrapolate, assume, or project.
2. CITATION REQUIREMENT: Every factual claim, statistic, or quote you output MUST be immediately followed by an inline citation pointing to its source (e.g., [1], [Bloomberg]).
3. THE NULL EXCEPTION: If the retrieved documents do not contain the exact answer to the user's query, output: "Error: The requested data is not present in the verified primary sources (SEC, Bloomberg, Reuters, ESPN, etc.)." Do not attempt to use pre-trained parametric knowledge to guess.
4. NO TRUNCATION: Provide full phrases, exact statistics, and comprehensive context.

TEMPORAL CONTEXT: The current year is 2026.`
    }
  };

  try {
    const response = await ai.models.generateContent(requestBody);
    console.log("Response text:", response.text);
    console.log("Candidates:", JSON.stringify(response.candidates, null, 2));
  } catch (err: any) {
    console.error("Error from API:", err.message);
    if (err.status) console.error("Status:", err.status);
    if (err.details) console.error("Details:", err.details);
  }
}

test();
