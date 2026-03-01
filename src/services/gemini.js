import { GoogleGenerativeAI } from '@google/generative-ai';
import { CSV_TOOL_DECLARATIONS } from './csvTools';
import { YOUTUBE_TOOL_DECLARATIONS } from './youtubeTools';

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');

const MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.0-flash-exp-image-generation';

const SEARCH_TOOL = { googleSearch: {} };
const CODE_EXEC_TOOL = { codeExecution: {} };

export const CODE_KEYWORDS = /\b(plot|chart|graph|analyz|statistic|regression|correlat|histogram|visualiz|calculat|compute|run code|write code|execute|pandas|numpy|matplotlib|csv|data)\b/i;

let cachedPrompt = null;
let promptLoadedAt = 0;
const PROMPT_CACHE_MS = 30000;

async function loadSystemPrompt() {
  if (cachedPrompt && (Date.now() - promptLoadedAt) < PROMPT_CACHE_MS) return cachedPrompt;
  try {
    const res = await fetch('/prompt_chat.txt');
    cachedPrompt = res.ok ? (await res.text()).trim() : '';
    promptLoadedAt = Date.now();
  } catch {
    cachedPrompt = cachedPrompt || '';
  }
  return cachedPrompt;
}

function buildPersonalizedPrompt(basePrompt, firstName, lastName) {
  const nameCtx = (firstName || lastName)
    ? `\n\nYou are currently talking to ${firstName || ''} ${lastName || ''}. Address them by their first name "${firstName}" warmly in your first message and throughout the conversation.`
    : '';
  return basePrompt + nameCtx;
}

// ── Streaming chat (search or code execution) ────────────────────────────────

export const streamChat = async function* (history, newMessage, imageParts = [], useCodeExecution = false, firstName = '', lastName = '') {
  const basePrompt = await loadSystemPrompt();
  const systemInstruction = buildPersonalizedPrompt(basePrompt, firstName, lastName);
  const tools = useCodeExecution ? [CODE_EXEC_TOOL] : [SEARCH_TOOL];
  const model = genAI.getGenerativeModel({ model: MODEL, tools });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const parts = [
    { text: newMessage },
    ...imageParts.map((img) => ({
      inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
    })),
  ].filter((p) => p.text !== undefined || p.inlineData !== undefined);

  const result = await chat.sendMessageStream(parts);

  for await (const chunk of result.stream) {
    const chunkParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of chunkParts) {
      if (part.text) yield { type: 'text', text: part.text };
    }
  }

  const response = await result.response;
  const allParts = response.candidates?.[0]?.content?.parts || [];

  const hasCodeExecution = allParts.some(
    (p) => p.executableCode || p.codeExecutionResult || (p.inlineData && p.inlineData.mimeType?.startsWith('image/'))
  );

  if (hasCodeExecution) {
    const structuredParts = allParts
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.executableCode) return { type: 'code', language: p.executableCode.language || 'PYTHON', code: p.executableCode.code };
        if (p.codeExecutionResult) return { type: 'result', outcome: p.codeExecutionResult.outcome, output: p.codeExecutionResult.output };
        if (p.inlineData) return { type: 'image', mimeType: p.inlineData.mimeType, data: p.inlineData.data };
        return null;
      })
      .filter(Boolean);
    yield { type: 'fullResponse', parts: structuredParts };
  }

  const grounding = response.candidates?.[0]?.groundingMetadata;
  if (grounding) yield { type: 'grounding', data: grounding };
};

// ── Function-calling chat for CSV tools ───────────────────────────────────────

export const chatWithCsvTools = async (history, newMessage, csvHeaders, executeFn, firstName = '', lastName = '') => {
  const basePrompt = await loadSystemPrompt();
  const systemInstruction = buildPersonalizedPrompt(basePrompt, firstName, lastName);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: CSV_TOOL_DECLARATIONS }],
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const msgWithContext = csvHeaders?.length
    ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}`
    : newMessage;

  let response = (await chat.sendMessage(msgWithContext)).response;
  const charts = [];
  const toolCalls = [];

  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;

    const { name, args } = funcCall.functionCall;
    const toolResult = executeFn(name, args);
    toolCalls.push({ name, args, result: toolResult });
    if (toolResult?._chartType) charts.push(toolResult);

    response = (
      await chat.sendMessage([{ functionResponse: { name, response: { result: toolResult } } }])
    ).response;
  }

  return { text: response.text(), charts, toolCalls };
};

// ── Function-calling chat for YouTube tools ───────────────────────────────────

export const chatWithYoutubeTools = async (history, newMessage, videos, executeFn, imageParts = [], firstName = '', lastName = '') => {
  const basePrompt = await loadSystemPrompt();
  const systemInstruction = buildPersonalizedPrompt(basePrompt, firstName, lastName);

  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: YOUTUBE_TOOL_DECLARATIONS }],
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const videoList = videos.slice(0, 30).map((v, i) =>
    `${i + 1}. "${v.title}" (${Number(v.view_count).toLocaleString()} views, ${Number(v.like_count).toLocaleString()} likes)`
  ).join('\n');

  const jsonContext = `[YouTube Channel Data: ${videos.length} videos loaded]\nAvailable fields per video: ${Object.keys(videos[0] || {}).join(', ')}\n\nVideos:\n${videoList}`;

  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const msgWithContext = `${jsonContext}\n\n${newMessage}`;
  const msgParts = [
    { text: msgWithContext },
    ...imageParts.map((img) => ({ inlineData: { mimeType: img.mimeType || 'image/png', data: img.data } })),
  ];

  let response = (await chat.sendMessage(msgParts)).response;
  const charts = [];
  const toolCalls = [];

  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;

    const { name, args } = funcCall.functionCall;
    const toolResult = executeFn(name, args);
    toolCalls.push({ name, args, result: toolResult });
    if (toolResult?._chartType) charts.push(toolResult);

    const functionResponsePayload = toolResult?._needsGeneration
      ? { result: { status: 'Image generation initiated', prompt: args.prompt } }
      : { result: toolResult };

    response = (
      await chat.sendMessage([{ functionResponse: { name, response: functionResponsePayload } }])
    ).response;
  }

  return { text: response.text(), charts, toolCalls };
};

// ── Image generation via Gemini ───────────────────────────────────────────────

export const generateImageWithGemini = async (prompt, anchorImageParts = []) => {
  const models = [IMAGE_MODEL, 'gemini-2.5-flash'];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });

      const parts = [
        { text: `Generate an image based on this description: ${prompt}` },
        ...anchorImageParts.map((img) => ({
          inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
        })),
      ];

      const response = await model.generateContent(parts);
      const resultParts = response.response.candidates?.[0]?.content?.parts || [];

      for (const part of resultParts) {
        if (part.inlineData) {
          return {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
          };
        }
      }

      const textPart = resultParts.find(p => p.text);
      if (textPart) return { error: textPart.text };
    } catch (err) {
      console.warn(`Image generation with ${modelName} failed:`, err.message);
      continue;
    }
  }

  return { error: 'Image generation is not available. The model may not support image output. Try a different prompt or check your API key permissions.' };
};
