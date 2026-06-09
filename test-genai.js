const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-3.5-flash',
    contents: 'What is the current time in New York?',
    config: {
      tools: [{ functionDeclarations: [{ name: 'get_time', description: 'Get time', parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' } } } }] }]
    }
  });
  for await (const chunk of stream) {
    console.log(JSON.stringify(chunk.candidates[0].content.parts, null, 2));
  }
}
run();
