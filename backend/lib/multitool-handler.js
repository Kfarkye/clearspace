import { GoogleGenAI } from '@google/genai';

const aiClient = new GoogleGenAI({});

/**
 * Checks the internal inventory system for a given product ID.
 */
function get_internal_inventory(productId) {
  const inventory_db = {
    "QX-PRO-99": "In stock: 45 units available in Warehouse A.",
    "QX-LITE-10": "Out of stock. Restock expected in 2 weeks."
  };
  return inventory_db[productId] || `Product ID '${productId}' not found in inventory.`;
}

const get_internal_inventory_declaration = {
  name: "get_internal_inventory",
  description: "Checks the internal inventory system for a given product ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      productId: {
        type: "STRING",
        description: "The unique identifier for the product (e.g., 'QX-PRO-99')."
      }
    },
    required: ["productId"]
  }
};

export async function executeMultiToolQuery(prompt) {
  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.0,
        tools: [
          { googleSearch: {} },
          { functionDeclarations: [get_internal_inventory_declaration] }
        ]
      }
    });

    // Handle manual function calling loop if the model requests it
    let currentResponse = response;
    let finalSynthesizedText = "";
    
    // In @google/genai Node SDK, automatic function calling might not work exactly like Python.
    // So we handle the tool calls manually if needed.
    if (currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
      const calls = currentResponse.functionCalls;
      const functionResponses = [];
      
      for (const call of calls) {
        if (call.name === 'get_internal_inventory') {
          const result = get_internal_inventory(call.args.productId);
          functionResponses.push({
            name: call.name,
            response: { result }
          });
        }
      }
      
      // Send back the function responses
      const followUpResponse = await aiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { role: "user", parts: [{ text: prompt }] },
          { role: "model", parts: currentResponse.candidates[0].content.parts },
          { role: "user", parts: functionResponses.map(fr => ({ functionResponse: fr })) }
        ],
        config: { temperature: 0.0 }
      });
      
      currentResponse = followUpResponse;
    }
    
    finalSynthesizedText = currentResponse.text;
    
    const metadata = currentResponse.candidates?.[0]?.groundingMetadata;
    const webQueries = metadata?.webSearchQueries || [];
    const citedSources = metadata?.groundingChunks?.map(chunk => chunk.web).filter(Boolean) || [];

    return {
      text: finalSynthesizedText,
      webQueries,
      citedSources
    };
  } catch (error) {
    console.error("Multi-tool execution failed:", error);
    throw error;
  }
}

export function mountMultiToolRoute(app) {
  app.post('/api/multitool', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt parameter" });
      }
      const result = await executeMultiToolQuery(prompt);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
