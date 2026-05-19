import { NextResponse } from "next/server";
import guard from "@/lib/ai-guardrails";

type AnalyzePayload = {
  text?: string;
  contractTitle?: string;
};

type ProviderName = "aiml" | "featherless" | "gemini";

type PromptBundle = {
  system: string;
  user: string;
  combined: string;
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
  provider: ProviderName;
  providerLabel: string;
  model: string;
};

type AiCallResult =
  | (AiResult & { ok: true })
  | {
      ok: false;
      provider: ProviderName;
      providerLabel: string;
      model?: string;
      error: string;
    };

type ProviderAttempt = {
  provider: ProviderName;
  label: string;
  ok: boolean;
  model?: string;
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
const DEFAULT_PROVIDER_PRIORITY: ProviderName[] = ["aiml", "featherless", "gemini"];

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

function resolvePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseCsv(value?: string) {
  return (value ?? "")
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function providerLabel(provider: ProviderName) {
  if (provider === "aiml") return "AI/ML API Gemini";
  if (provider === "featherless") return "Featherless open-source";
  return "Gemini API";
}

function resolveProviderPriority() {
  const configured = parseCsv(process.env.AI_PROVIDER_PRIORITY)
    .map((entry) => entry.toLowerCase())
    .filter((entry): entry is ProviderName =>
      entry === "aiml" || entry === "featherless" || entry === "gemini"
    );

  return Array.from(new Set([...configured, ...DEFAULT_PROVIDER_PRIORITY]));
}

function buildOpenAiMessages(prompt: PromptBundle) {
  return [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
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
  providerLabel?: string;
  model?: string;
}) {
  const safeTitle = escapeHtml(input.contractTitle || "Contract review");
  const riskLabel = formatRiskLabel(input.score);
  const safeProvider = escapeHtml(input.providerLabel || "configured AI provider");
  const safeModel = input.model ? escapeHtml(input.model) : "";
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
      <p style="margin: 0 0 16px;">Analysis provider: <strong>${safeProvider}</strong>${safeModel ? ` (${safeModel})` : ""}</p>
      <h3 style="margin: 16px 0 8px;">Summary highlights</h3>
      ${summaryList}
      <h3 style="margin: 16px 0 8px;">Top findings</h3>
      ${findingList}
      <p style="margin-top: 16px; font-size: 12px; color: #6a5f55;">This alert was generated by GeminEYE with AI/ML API, Featherless, Gemini, Speechmatics intake, and Resend alerting support available in the stack. Review the full report in the dashboard for details.</p>
    </div>
  `;

  const text = `GeminEYE risk alert\n\nContract: ${input.contractTitle}\nScore: ${input.score.toFixed(1)} / 10 (${riskLabel})\nThreshold: ${input.threshold.toFixed(1)} / 10\nProvider: ${input.providerLabel || "configured AI provider"}${input.model ? ` (${input.model})` : ""}\nStack: AI/ML API primary, Featherless open-source fallback/helper, Gemini final fallback, Speechmatics intake, Resend alerts\n\nSummary:\n${summaryItems.join("\n")}\n\nTop findings:\n${findingItems.map((item) => `${item.category} (${item.risk}) - ${item.recommendation}`).join("\n")}`;

  return { html, text };
}

async function sendResendAlert(input: {
  memo: GeminiMemo;
  contractTitle: string;
  fallback: boolean;
  providerLabel?: string;
  model?: string;
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
    providerLabel: input.providerLabel,
    model: input.model,
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

async function callAiMlApi(prompt: PromptBundle): Promise<AiCallResult | null> {
  const apiKey = process.env.AI_ML_API_KEY?.trim();
  const model = process.env.AI_ML_API_MODEL?.trim();
  const directUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const baseUrl = normalizeBaseUrl(process.env.AI_ML_API_BASE_URL?.trim());
  const headerName = process.env.AI_ML_API_AUTH_HEADER?.trim();
  const authScheme = process.env.AI_ML_API_AUTH_SCHEME?.trim();
  const maxTokens = resolvePositiveInteger(process.env.AI_ML_API_MAX_TOKENS, 4096);

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
        messages: buildOpenAiMessages(prompt),
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        provider: "aiml",
        providerLabel: providerLabel("aiml"),
        model,
        error: `AI/ML API error (${response.status}).`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    const rawText = extractOpenAiText(data);
    if (!rawText) {
      return {
        ok: false,
        provider: "aiml",
        providerLabel: providerLabel("aiml"),
        model,
        error: "AI/ML API returned empty content.",
      };
    }

    const memo = extractMemoFromRaw(rawText);
    if (!memo) {
      return {
        ok: false,
        provider: "aiml",
        providerLabel: providerLabel("aiml"),
        model,
        error: "AI/ML API returned invalid JSON shape.",
      };
    }

    return { ok: true, memo, provider: "aiml", providerLabel: providerLabel("aiml"), model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI/ML API request failed.";
    return {
      ok: false,
      provider: "aiml",
      providerLabel: providerLabel("aiml"),
      model,
      error: message,
    };
  }
}

async function callFeatherlessApi(prompt: PromptBundle): Promise<AiCallResult | null> {
  const apiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const primaryModel = process.env.FEATHERLESS_MODEL?.trim();
  const fallbackModels = parseCsv(process.env.FEATHERLESS_FALLBACK_MODELS);
  const models = uniqueValues([primaryModel ?? "", ...fallbackModels]);
  const baseUrl = normalizeBaseUrl(process.env.FEATHERLESS_BASE_URL?.trim()) || "https://api.featherless.ai/v1";
  const maxTokens = resolvePositiveInteger(process.env.FEATHERLESS_MAX_TOKENS, 4096);

  if (!apiKey || models.length === 0) {
    return null;
  }

  const completionsUrl = buildCompletionsUrl(baseUrl);
  const appUrl = process.env.FEATHERLESS_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const appTitle = process.env.FEATHERLESS_APP_TITLE?.trim() || "GeminEYE";
  const failures: string[] = [];

  for (const model of models) {
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
          messages: buildOpenAiMessages(prompt),
          temperature: 0.15,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        failures.push(`${model}: Featherless API error (${response.status}).`);
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>;
      };
      const rawText = extractOpenAiText(data);
      if (!rawText) {
        failures.push(`${model}: Featherless API returned empty content.`);
        continue;
      }

      const memo = extractMemoFromRaw(rawText);
      if (!memo) {
        failures.push(`${model}: Featherless API returned invalid JSON shape.`);
        continue;
      }

      return { ok: true, memo, provider: "featherless", providerLabel: providerLabel("featherless"), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Featherless API request failed.";
      failures.push(`${model}: ${message}`);
    }
  }

  return {
    ok: false,
    provider: "featherless",
    providerLabel: providerLabel("featherless"),
    model: models.join(", "),
    error: failures.join(" | ") || "Featherless API request failed.",
  };
}

async function callGeminiApi(prompt: PromptBundle, strictModeration: boolean): Promise<AiCallResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const maxOutputTokens = resolvePositiveInteger(process.env.GEMINI_MAX_OUTPUT_TOKENS, 2048);

  if (!apiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt.combined }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens,
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
      return {
        ok: false,
        provider: "gemini",
        providerLabel: providerLabel("gemini"),
        model,
        error: `Gemini API error (${response.status}).`,
      };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = extractGeminiText(data);
    const memo = rawText ? extractMemoFromRaw(rawText) : null;
    if (!memo) {
      return {
        ok: false,
        provider: "gemini",
        providerLabel: providerLabel("gemini"),
        model,
        error: "Gemini returned empty or invalid JSON output.",
      };
    }

    return { ok: true, memo, provider: "gemini", providerLabel: providerLabel("gemini"), model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini API request failed.";
    return {
      ok: false,
      provider: "gemini",
      providerLabel: providerLabel("gemini"),
      model,
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

  const userPrompt = `Return JSON only with this exact shape:
{
  "narrative": ["short paragraph 1", "short paragraph 2"],
  "summary": ["..."],
  "findings": [
    {"id":"R-01","risk":"Low|Medium|High","category":"...","evidence":"...","recommendation":"..."}
  ],
  "overallRiskScore": 0-10
}
Write the narrative as brief, plain-language reasoning (no step-by-step chain-of-thought).
Focus on liability, indemnity, termination, data privacy, IP, and governing law.
Use concise evidence quotes from the contract when possible.
This is a domain-specialized contract-risk agent, not a general assistant.
Contract text:
"""
${redactedText}
"""`;

  const prompt: PromptBundle = {
    system: systemPrompt,
    user: userPrompt,
    combined: `${systemPrompt}\n${userPrompt}`,
  };

  const providerPriority = resolveProviderPriority();
  const attempts: ProviderAttempt[] = [];

  for (const provider of providerPriority) {
    const result =
      provider === "aiml"
        ? await callAiMlApi(prompt)
        : provider === "featherless"
          ? await callFeatherlessApi(prompt)
          : await callGeminiApi(prompt, strictModeration);

    if (!result) {
      continue;
    }

    attempts.push({
      provider,
      label: result.providerLabel,
      ok: result.ok,
      model: result.model,
      error: result.ok ? undefined : result.error,
    });

    if (!result.ok) {
      continue;
    }

    const alert = await sendResendAlert({
      memo: result.memo,
      contractTitle,
      fallback: false,
      providerLabel: result.providerLabel,
      model: result.model,
    });

    return NextResponse.json({
      contractTitle,
      memo: result.memo,
      fallback: false,
      keyLoaded: true,
      provider: result.provider,
      providerLabel: result.providerLabel,
      providerModel: result.model,
      providerPriority,
      attempts,
      alert,
    });
  }

  if (attempts.length === 0) {
    return NextResponse.json(
      {
        contractTitle,
        memo: DEFAULT_MEMO,
        fallback: true,
        keyLoaded: false,
        error: "No AI provider configured. Set AI_ML_API_KEY, FEATHERLESS_API_KEY, or GEMINI_API_KEY.",
        providerPriority,
        attempts,
      },
      { status: 500 }
    );
  }

  const error = attempts
    .filter((attempt) => !attempt.ok)
    .map((attempt) => `${attempt.label}${attempt.model ? ` (${attempt.model})` : ""}: ${attempt.error}`)
    .join(" | ");
  const alert = await sendResendAlert({
    memo: DEFAULT_MEMO,
    contractTitle,
    fallback: true,
  });

  return NextResponse.json({
    contractTitle,
    memo: DEFAULT_MEMO,
    fallback: true,
    keyLoaded: true,
    error: error || "All configured AI providers failed.",
    providerPriority,
    attempts,
    alert,
  });
}
