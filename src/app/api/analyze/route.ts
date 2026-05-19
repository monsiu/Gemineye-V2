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

type RiskAlert = {
  provider: "resend";
  status: "sent" | "skipped" | "error";
  threshold: number;
  score?: number;
  recipients?: number;
  reason?: string;
  id?: string;
};

const DEFAULT_ALERT_THRESHOLD = 7.5;

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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRiskLabel(score: number | null) {
  if (score === null) {
    return "Risk not scored";
  }
  if (score >= 6.5) {
    return "High risk";
  }
  if (score >= 3.5) {
    return "Moderate risk";
  }
  return "Lower risk";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseRecipients(input?: string) {
  if (!input) return [];
  return input
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveAlertThreshold() {
  const parsed = toNumber(process.env.RESEND_RISK_THRESHOLD);
  return parsed ?? DEFAULT_ALERT_THRESHOLD;
}

function buildResendAlertContent(input: {
  contractTitle: string;
  score: number;
  threshold: number;
  memo: GeminiMemo;
}) {
  const safeTitle = escapeHtml(input.contractTitle || "Contract review");
  const riskLabel = formatRiskLabel(input.score);
  const summaryItems = input.memo.summary.slice(0, 4);
  const findingItems = input.memo.findings.slice(0, 3);

  const summaryList = summaryItems.length
    ? `<ul>${summaryItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>No summary items were returned.</p>";

  const findingList = findingItems.length
    ? `<ul>${findingItems
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.category)} (${escapeHtml(item.risk)})</strong> - ${escapeHtml(item.recommendation)}</li>`
      )
      .join("")}</ul>`
    : "<p>No findings were returned.</p>";

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1c1a18;">
      <h2 style="margin: 0 0 8px;">GeminEYE risk alert</h2>
      <p style="margin: 0 0 16px;">Contract <strong>${safeTitle}</strong> scored <strong>${input.score.toFixed(1)} / 10</strong> (${riskLabel}).</p>
      <p style="margin: 0 0 16px;">Alert threshold: ${input.threshold.toFixed(1)} / 10</p>
      <h3 style="margin: 16px 0 8px;">Summary highlights</h3>
      ${summaryList}
      <h3 style="margin: 16px 0 8px;">Top findings</h3>
      ${findingList}
      <p style="margin-top: 16px; font-size: 12px; color: #6a5f55;">This alert was generated by GeminEYE. Review the full report in the dashboard for details.</p>
    </div>
  `;

  const text = `GeminEYE risk alert\n\nContract: ${input.contractTitle}\nScore: ${input.score.toFixed(1)} / 10 (${riskLabel})\nThreshold: ${input.threshold.toFixed(1)} / 10\n\nSummary:\n${summaryItems.join("\n")}\n\nTop findings:\n${findingItems.map((item) => `${item.category} (${item.risk}) - ${item.recommendation}`).join("\n")}`;

  return { html, text };
}

async function sendResendAlert(input: {
  memo: GeminiMemo;
  contractTitle: string;
  fallback: boolean;
}): Promise<RiskAlert> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const toList = parseRecipients(process.env.RESEND_TO);
  const threshold = resolveAlertThreshold();
  const score = toNumber(input.memo.overallRiskScore);

  if (!apiKey || !from || toList.length === 0) {
    return {
      provider: "resend",
      status: "skipped",
      threshold,
      score: score ?? undefined,
      reason: "Resend not configured.",
    };
  }

  if (input.fallback) {
    return {
      provider: "resend",
      status: "skipped",
      threshold,
      score: score ?? undefined,
      reason: "Fallback analysis was used.",
    };
  }

  if (score === null) {
    return {
      provider: "resend",
      status: "skipped",
      threshold,
      reason: "Risk score unavailable.",
    };
  }

  if (score < threshold) {
    return {
      provider: "resend",
      status: "skipped",
      threshold,
      score,
      reason: `Score ${score.toFixed(1)} below threshold ${threshold.toFixed(1)}.`,
    };
  }

  const { html, text } = buildResendAlertContent({
    contractTitle: input.contractTitle,
    score,
    threshold,
    memo: input.memo,
  });

  try {
    const subjectTitle = input.contractTitle?.trim() || "Untitled contract";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toList.length === 1 ? toList[0] : toList,
        subject: `GeminEYE risk alert: ${subjectTitle} (${score.toFixed(1)} / 10)`,
        html,
        text,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

    if (!response.ok) {
      return {
        provider: "resend",
        status: "error",
        threshold,
        score,
        recipients: toList.length,
        reason: payload?.message ?? `Resend API error (${response.status}).`,
      };
    }

    return {
      provider: "resend",
      status: "sent",
      threshold,
      score,
      recipients: toList.length,
      id: payload?.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend API request failed.";
    return {
      provider: "resend",
      status: "error",
      threshold,
      score,
      recipients: toList.length,
      reason: message,
    };
  }
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

async function callFeatherlessApi(prompt: string): Promise<AiResult | null> {
  const apiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const model = process.env.FEATHERLESS_MODEL?.trim();
  const baseUrl = normalizeBaseUrl(process.env.FEATHERLESS_BASE_URL?.trim()) || "https://api.featherless.ai/v1";

  if (!apiKey || !model) {
    return null;
  }

  const completionsUrl = buildCompletionsUrl(baseUrl);
  const appUrl = process.env.FEATHERLESS_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const appTitle = process.env.FEATHERLESS_APP_TITLE?.trim() || "GeminEYE";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (appUrl) headers["HTTP-Referer"] = appUrl;
    if (appTitle) headers["X-Title"] = appTitle;

    const response = await fetch(completionsUrl, {
      method: "POST",
      headers,
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
        error: `Featherless API error (${response.status}).`,
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
        error: "Featherless API returned empty content.",
      };
    }

    const memo = extractMemoFromRaw(rawText);
    if (!memo) {
      return {
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: true,
        error: "Featherless API returned invalid JSON shape.",
      };
    }

    return { memo, fallback: false, keyLoaded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Featherless API request failed.";
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
    const alert = await sendResendAlert({
      memo: aiMlResult.memo,
      contractTitle,
      fallback: aiMlResult.fallback,
    });
    return NextResponse.json({ contractTitle, ...aiMlResult, provider: "aiml", alert });
  }

  const featherlessResult = await callFeatherlessApi(prompt);
  if (featherlessResult) {
    const alert = await sendResendAlert({
      memo: featherlessResult.memo,
      contractTitle,
      fallback: featherlessResult.fallback,
    });
    return NextResponse.json({ contractTitle, ...featherlessResult, provider: "featherless", alert });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "No AI provider configured. Set AI_ML_API_KEY, FEATHERLESS_API_KEY, or GEMINI_API_KEY.",
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
    const resolvedMemo = memo ?? DEFAULT_MEMO;
    const resolvedFallback = memo === null;
    const alert = await sendResendAlert({
      memo: resolvedMemo,
      contractTitle,
      fallback: resolvedFallback,
    });

    return NextResponse.json({
      contractTitle,
      memo: resolvedMemo,
      fallback: resolvedFallback,
      keyLoaded: true,
      error: memo === null ? "Gemini returned empty or invalid JSON output." : undefined,
      provider: "gemini",
      alert,
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
