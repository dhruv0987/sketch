import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { GuessResult } from "../types";

// Lazy initialization to prevent crashes during module evaluation if env vars are missing
let ai: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!ai) {
    // This value is replaced at build time by vite.config.ts
    // It will be an empty string "" if missing, not undefined.
    const apiKey = process.env.API_KEY;
    
    if (!apiKey || apiKey === "" || apiKey === "undefined") {
      console.error("API_KEY is not defined in process.env");
      throw new Error("API Key missing");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

export const identifySketch = async (base64Image: string): Promise<GuessResult> => {
  try {
    const client = getAiClient();
    
    // Robustly remove data URL prefix
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    // Switch to 2.5-flash for reliable multimodal performance
    const model = "gemini-2.5-flash";
    
    const prompt = `
      I am playing a Pictionary-style game. I am drawing an object and you need to guess what it is.
      
      Look at this line drawing. It might be rough or incomplete.
      1. 'commentary': Provide a short spoken phrase guessing what the object is. 
         IMPORTANT: Do NOT describe the lines or shapes. ONLY ask if it is a specific object. 
         Example: "Is it a bicycle?", "Maybe a pair of glasses?".
      2. 'guesses': Provide a comprehensive list of up to 10 specific nouns that this drawing could represent.
         IMPORTANT: Include synonyms and related terms (e.g., if it looks like a 'bunny', also list 'rabbit' and 'hare').
         Focus on the most likely objects.
    `;

    const response = await client.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        temperature: 0.4,
        // Add safety settings to prevent blocking simple drawings
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            commentary: { type: Type.STRING },
            guesses: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          propertyOrdering: ["commentary", "guesses"]
        }
      }
    });

    let jsonText = response.text || "{}";
    
    // SANITIZATION: Sometimes the model returns markdown blocks even with JSON schema set
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(jsonText);

    return {
      commentary: parsed.commentary || "Thinking...",
      guesses: parsed.guesses || []
    };

  } catch (error: any) {
    console.error("Error identifying sketch:", error);
    
    // Specific error for API key issues
    if (error.message && error.message.includes("API Key missing")) {
        return {
            commentary: "Config Error: API_KEY missing in Settings!",
            guesses: []
        };
    }
    
    // Surface the actual error for debugging if possible
    // Common errors: 400 (Bad Request), 403 (Forbidden), 503 (Overloaded)
    let debugMsg = "I'm having trouble seeing...";
    if (error.message) {
        if (error.message.includes("429")) debugMsg = "Too many requests, slow down!";
        else if (error.message.includes("503")) debugMsg = "I'm a bit overloaded right now.";
        else if (error.message.includes("SAFETY")) debugMsg = "I can't look at that.";
    }

    return {
      commentary: debugMsg,
      guesses: []
    };
  }
};