import { NextResponse } from "next/server";
import guard from "@/lib/ai-guardrails";

type AnalyzePayload = {
  text?: string;
  contractTitle?: string;
};

type GeminiMemo = {
  narrative: string[];
  summary: string[];
  findings: Array<{
    id: string;
    risk: "Low" | "Medium" | "High";
    category: string;
    evidence: string;
    recommendation: string;
  }>;
  overallRiskScore?: number;
};

type AiResult = {
  memo: GeminiMemo;
  fallback: boolean;
  keyLoaded: boolean;
  error?: string;
};

const DEFAULT_MEMO: GeminiMemo = {
  narrative: [
    "[DEMO FALLBACK] This is sample contract analysis shown because the live model request did not complete successfully. The biggest issues are liability scope and a one-sided indemnity, with a secondary concern around breach notification timing.",
  ],
  summary: [
    "[DEMO FALLBACK] Liability cap excludes direct damages.",
    "[DEMO FALLBACK] Indemnity is one-sided for vendor only.",
    "[DEMO FALLBACK] Data breach notice exceeds typical thresholds.",
  ],
  findings: [
    {
      id: "R-01",
      risk: "High",
      category: "Liability",
      evidence: "[DEMO FALLBACK] Section 9.2 caps only indirect damages.",
      recommendation: "[DEMO FALLBACK] Include direct damages under the cap.",
    },
  ],
  overallRiskScore: 7.8,
};

const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS ?? 60000);
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX ?? 6);
const rateStore = new Map<string, { first: number; count: number }>();

function isRateLimited(key: string) {
  const now = Date.now();
  const entry = rateStore.get(key);

  if (!entry) {
    rateStore.set(key, { first: now, count: 1 });
    return false;
  }

  if (now - entry.first > RATE_LIMIT_WINDOW_MS) {
    rateStore.set(key, { first: now, count: 1 });
    return false;
  }

  entry.count += 1;
  rateStore.set(key, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function normalizeBaseUrl(input?: string) {
  if (!input) {
    return null;
  }
  return input.replace(/\/$/, "");
}

function buildCompletionsUrl(baseUrl: string) {
  if (baseUrl.endsWith("/v1")) {
    return `${baseUrl}/chat/completions`;
  }
  return `${baseUrl}/v1/chat/completions`;
}

function buildAuthHeader(apiKey: string, headerName?: string, scheme?: string) {
  const name = headerName?.trim() || "Authorization";
  if (name.toLowerCase() === "authorization") {
    const authScheme = scheme?.trim() || "Bearer";
    return { [name]: `${authScheme} ${apiKey}` };
  }
  return { [name]: apiKey };
}

function extractOpenAiText(data: {
  choices?: Array<{ message?: { content?: string }; text?: string }>;
}) {
  const messageContent = data.choices?.[0]?.message?.content;
  if (messageContent) {
    return messageContent.trim();
  }
  return (data.choices?.[0]?.text ?? "").trim();
}

function extractGeminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

function extractMemoFromRaw(rawText: string): GeminiMemo | null {
  const parsed = guard.safeParseJsonLike(rawText);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate =
    "memo" in (parsed as Record<string, unknown>) &&
    typeof (parsed as Record<string, unknown>).memo === "object" &&
    (parsed as Record<string, unknown>).memo !== null
      ? (parsed as Record<string, unknown>).memo
      : parsed;

  const validation = guard.validateMemoSchema(candidate);
  if (!validation.valid) {
    return null;
  }

  return candidate as GeminiMemo;
}

async function callAiMlApi(prompt: string): Promise<AiResult | null> {
  const apiKey = process.env.AI_ML_API_KEY?.trim();
  const model = process.env.AI_ML_API_MODEL?.trim();
  const directUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const baseUrl = normalizeBaseUrl(process.env.AI_ML_API_BASE_URL?.trim());
  const headerName = process.env.AI_ML_API_AUTH_HEADER?.trim();
  const authScheme = process.env.AI_ML_API_AUTH_SCHEME?.trim();

  if (!apiKey || !model || (!directUrl && !baseUrl)) {
    return null;
  }

  const completionsUrl = directUrl || buildCompletionsUrl(baseUrl!);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(completionsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeader(apiKey, headerName, authScheme),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: true,
        error: `AI/ML API error (${response.status}).`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    const rawText = extractOpenAiText(data);
    if (!rawText) {
      return {
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: true,
        error: "AI/ML API returned empty content.",
      };
    }

    const memo = extractMemoFromRaw(rawText);
    if (!memo) {
      return {
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: true,
        error: "AI/ML API returned invalid JSON shape.",
      };
    }

    return { memo, fallback: false, keyLoaded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI/ML API request failed.";
    return {
      memo: DEFAULT_MEMO,
      fallback: true,
      keyLoaded: true,
      error: message,
    };
  }
}

export async function POST(request: Request) {
  let payload: AnalyzePayload = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const contractTitle = payload.contractTitle ?? "Untitled contract";
  const strictModeration = process.env.AI_HACKATHON_STRICT_MODERATION === "true";
  const text = payload.text?.trim() ?? "";

  if (!text) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "No contract text provided.",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "Rate limit exceeded. Try again later.",
      },
      { status: 429 }
    );
  }

  const compressedText = text.replace(/\s+/g, " ").trim();
  const inputCheck = guard.validateInputLength(compressedText);
  if (!inputCheck.ok) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: `Input validation failed: ${inputCheck.reason}`,
      },
      { status: 400 }
    );
  }

  const mod = await guard.runModeration(compressedText, strictModeration);
  if (!mod.allowed) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "Content blocked by moderation.",
        blockedTerms: mod.matchedTerms ?? [],
      },
      { status: 400 }
    );
  }

  const redactedText = guard.redactSensitive(compressedText);
  const systemPrompt =
    process.env.AI_SYSTEM_PROMPT?.trim() ||
    "You are an investigator-style contract risk analyst.";

  const prompt = `${systemPrompt}\nReturn JSON only with this exact shape:\n{\n  "narrative": ["short paragraph 1", "short paragraph 2"],\n  "summary": ["..."],\n  "findings": [\n    {"id":"R-01","risk":"Low|Medium|High","category":"...","evidence":"...","recommendation":"..."}\n  ],\n  "overallRiskScore": 0-10\n}\nWrite the narrative as brief, plain-language reasoning (no step-by-step chain-of-thought).\nFocus on liability, indemnity, termination, data privacy, IP, and governing law.\nUse concise evidence quotes.\nContract text:\n"""\n${redactedText}\n"""`;

  const aiMlResult = await callAiMlApi(prompt);
  if (aiMlResult) {
    return NextResponse.json({ contractTitle, ...aiMlResult });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "Missing AI_ML_API_KEY and GEMINI_API_KEY.",
      },
      { status: 500 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: strictModeration ? "BLOCK_LOW_AND_ABOVE" : "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: strictModeration ? "BLOCK_LOW_AND_ABOVE" : "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: strictModeration ? "BLOCK_LOW_AND_ABOVE" : "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: strictModeration ? "BLOCK_LOW_AND_ABOVE" : "BLOCK_MEDIUM_AND_ABOVE",
            },
          ],
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: true,
        error: `Gemini API error (${response.status}).`,
      });
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = extractGeminiText(data);
    const memo = rawText ? extractMemoFromRaw(rawText) : null;

    return NextResponse.json({
      contractTitle,
      memo: memo ?? DEFAULT_MEMO,
      fallback: memo === null,
      keyLoaded: true,
      error: memo === null ? "Gemini returned empty or invalid JSON output." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini API request failed.";
    return NextResponse.json({
      contractTitle,
      memo: DEFAULT_MEMO,
      fallback: true,
      keyLoaded: true,
      error: message,
    });
  }
}
