import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getGeminiResponse(prompt: string, history: { role: "user" | "model"; parts: { text: string }[] }[], lang: 'ar' | 'en' = 'ar') {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: lang === 'ar' ? `أنت "مساعد الصلاة" في تطبيق "صلاتي نور". 
      مهمتك هي مساعدة المستخدمين في كل ما يتعلق بالصلاة:
      1. الإجابة عن أوقات الصلاة (إذا توفرت في السياق).
      2. شرح كيفية الصلاة خطوة بخطوة.
      3. توضيح شروط الصلاة، أركانها، واجباتها، وسننها.
      4. الإجابة عن أحكام السهو والوضوء والطهارة.
      كن لطيفاً، ملهماً، واستخدم لغة عربية فصيحة وبسيطة. 
      استخدم التنسيق المناسب (Markdown) لجعل الإجابات سهلة القراءة.` : 
      `You are the "Prayer Assistant" in the "Salati Noor" app.
      Your mission is to help users with everything related to prayer:
      1. Answer prayer times (if provided in context).
      2. Explain how to pray step-by-step.
      3. Clarify prayer conditions, pillars, obligations, and sunnahs.
      4. Answer rulings on forgetfulness, wudu (ablution), and purity.
      Be kind, inspiring, and use clear, simple English.
      Use appropriate formatting (Markdown) to make answers easy to read.`,
    },
    history: history,
  });

  const result = await chat.sendMessage({ message: prompt });
  return result.text;
}
