import { GoogleGenAI, Type } from "@google/genai";
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
    
    // Remove the data URL prefix if present.
    // Note: The app now sends JPEG, so we check for both png and jpeg
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const model = "gemini-3-flash-preview";
    
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
              mimeType: "image/jpeg", // We are now sending optimized JPEGs
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

    return {
      commentary: "I'm having trouble seeing...",
      guesses: []
    };
  }
};