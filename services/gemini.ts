import { GoogleGenAI, Type } from "@google/genai";
import { GuessResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const identifySketch = async (base64Image: string): Promise<GuessResult> => {
  try {
    // Remove the data URL prefix if present to get just the base64 string
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const model = "gemini-2.5-flash";
    
    // Improved prompt for accuracy
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

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
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
          }
        }
      }
    });

    const jsonText = response.text || "{}";
    const parsed = JSON.parse(jsonText);

    return {
      commentary: parsed.commentary || "Thinking...",
      guesses: parsed.guesses || []
    };

  } catch (error) {
    console.error("Error identifying sketch:", error);
    return {
      commentary: "I'm having trouble seeing...",
      guesses: []
    };
  }
};