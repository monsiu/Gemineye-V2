import { NextResponse } from "next/server";
import guard from "@/lib/ai-guardrails";
import { callFeatherlessApi as callFeatherlessAdapter } from "@/lib/featherless-adapter";

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

type AnalysisComparison = {
  providers: Array<{
    provider: ProviderName;
    label: string;
    model: string;
    score: number | null;
    narrative: string[];
    summary: string[];
    findings: GeminiMemo["findings"];
  }>;
  consolidatedScore: number | null;
  mergedNarrative: string[];
  mergedSummary: string[];
  mergedFindings: GeminiMemo["findings"];
  agreementFlags: Array<{
    flag: string;
    category: string;
    risk: "Low" | "Medium" | "High";
    providers: ProviderName[];
    labels: string[];
    findings: GeminiMemo["findings"];
  }>;
  missedClauses: Array<{
    provider: ProviderName;
    label: string;
    clauses: GeminiMemo["findings"];
  }>;
  featherlessGapClauses: GeminiMemo["findings"];
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

function providerLabel(provider: ProviderName) {
  if (provider === "aiml") return "Gemini";
  if (provider === "featherless") return "Featherless parallel pass";
  return "Gemini direct";
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

function averageScore(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function consolidateMemoScore(memo: GeminiMemo, scores: Array<number | null | undefined>) {
  const numericScores = scores.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const consolidatedScore = averageScore(numericScores);

  if (consolidatedScore === null) {
    return memo;
  }

  return {
    ...memo,
    overallRiskScore: consolidatedScore,
  };
}

function normalizeFindingKey(finding: GeminiMemo["findings"][number]) {
  return [finding.category, finding.risk, finding.evidence, finding.recommendation]
    .map((part) => part.trim().toLowerCase())
    .join("::");
}

function normalizeFindingPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalFindingArea(value: string) {
  const normalized = normalizeFindingPart(value);

  if (/\b(liability|limitation|damages?|cap|consequential|incidental|indirect)\b/.test(normalized)) {
    return "liability";
  }
  if (/\b(indemnity|indemnification|indemnify|defend|hold harmless|third party claim)\b/.test(normalized)) {
    return "indemnity";
  }
  if (/\b(data|privacy|security|breach|personal information|confidential information|gdpr|ccpa|processor)\b/.test(normalized)) {
    return "privacy";
  }
  if (/\b(termination|terminate|expiry|renewal|notice|survival|convenience|cause)\b/.test(normalized)) {
    return "termination";
  }
  if (/\b(ip|intellectual property|ownership|license|deliverables?|work product|infringement)\b/.test(normalized)) {
    return "intellectual-property";
  }
  if (/\b(governing law|venue|jurisdiction|forum|dispute|arbitration|court)\b/.test(normalized)) {
    return "governing-law";
  }
  if (/\b(payment|fees?|invoice|tax|late|interest|refund)\b/.test(normalized)) {
    return "payment";
  }
  if (/\b(confidential|nda|non disclosure|secrecy)\b/.test(normalized)) {
    return "confidentiality";
  }
  if (/\b(warranty|representations?|disclaimer|as is)\b/.test(normalized)) {
    return "warranty";
  }
  if (/\b(assignment|assign|change of control|subcontract)\b/.test(normalized)) {
    return "assignment";
  }
  if (/\b(force majeure|act of god|unavoidable|excusable delay)\b/.test(normalized)) {
    return "force-majeure";
  }

  return normalized || "general";
}

function displayFindingArea(area: string, fallback: string) {
  const labels: Record<string, string> = {
    liability: "Liability",
    indemnity: "Indemnity",
    privacy: "Privacy",
    termination: "Termination",
    "intellectual-property": "IP",
    "governing-law": "Governing law",
    payment: "Payment",
    confidentiality: "Confidentiality",
    warranty: "Warranty",
    assignment: "Assignment",
    "force-majeure": "Force majeure",
    general: fallback,
  };

  return labels[area] ?? fallback;
}

function riskRank(risk: "Low" | "Medium" | "High") {
  if (risk === "High") return 3;
  if (risk === "Medium") return 2;
  return 1;
}

function highestRisk(findings: GeminiMemo["findings"]) {
  return findings.reduce<"Low" | "Medium" | "High">(
    (highest, finding) => (riskRank(finding.risk) > riskRank(highest) ? finding.risk : highest),
    "Low"
  );
}

const FINDING_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "shall",
  "will",
  "may",
  "must",
  "into",
  "only",
  "any",
  "all",
  "its",
  "their",
  "under",
  "section",
  "clause",
  "agreement",
  "contract",
]);

function tokenizeFindingText(value: string) {
  return normalizeFindingPart(value)
    .split(" ")
    .filter((token) => token.length > 2 && !FINDING_STOP_WORDS.has(token));
}

function tokenOverlapScore(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const aSet = new Set(a);
  const bSet = new Set(b);
  const intersection = Array.from(aSet).filter((token) => bSet.has(token));
  return intersection.length / Math.min(aSet.size, bSet.size);
}

function findingFlagKey(finding: GeminiMemo["findings"][number]) {
  return canonicalFindingArea(`${finding.category} ${finding.evidence} ${finding.recommendation}`);
}

function findingsReferToSameClause(
  left: GeminiMemo["findings"][number],
  right: GeminiMemo["findings"][number]
) {
  if (normalizeFindingKey(left) === normalizeFindingKey(right)) {
    return true;
  }

  const sameArea =
    canonicalFindingArea(`${left.category} ${left.evidence} ${left.recommendation}`) ===
    canonicalFindingArea(`${right.category} ${right.evidence} ${right.recommendation}`);
  if (!sameArea) {
    return false;
  }

  const leftEvidence = tokenizeFindingText(left.evidence);
  const rightEvidence = tokenizeFindingText(right.evidence);
  const leftRecommendation = tokenizeFindingText(left.recommendation);
  const rightRecommendation = tokenizeFindingText(right.recommendation);
  const evidenceOverlap = tokenOverlapScore(leftEvidence, rightEvidence);
  const recommendationOverlap = tokenOverlapScore(leftRecommendation, rightRecommendation);

  return evidenceOverlap >= 0.35 || recommendationOverlap >= 0.45;
}

function mergeUniqueStrings(values: string[][]) {
  return Array.from(new Set(values.flatMap((items) => items.map((item) => item.trim())).filter(Boolean)));
}

function mergeUniqueFindings(findings: GeminiMemo["findings"][]) {
  const merged: GeminiMemo["findings"] = [];

  for (const list of findings) {
    for (const finding of list) {
      if (merged.some((existing) => findingsReferToSameClause(existing, finding))) {
        continue;
      }
      merged.push(finding);
    }
  }

  return merged;
}

function formatFlagLabel(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) {
    return alphabet[index];
  }

  return `A${index - alphabet.length + 1}`;
}

function buildAgreementFlags(
  providers: AnalysisComparison["providers"]
): AnalysisComparison["agreementFlags"] {
  const grouped = new Map<
    string,
    {
      area: string;
      category: string;
      entries: Array<{
        provider: ProviderName;
        label: string;
        finding: GeminiMemo["findings"][number];
      }>;
    }
  >();

  for (const provider of providers) {
    for (const finding of provider.findings) {
      const key = findingFlagKey(finding);
      const existing = grouped.get(key);
      const entry = { provider: provider.provider, label: provider.label, finding };

      if (!existing) {
        grouped.set(key, {
          area: key,
          category: finding.category,
          entries: [entry],
        });
        continue;
      }

      if (!existing.entries.some((candidate) => candidate.provider === provider.provider)) {
        existing.entries.push(entry);
      }
    }
  }

  return Array.from(grouped.values())
    .filter((group) => new Set(group.entries.map((entry) => entry.provider)).size > 1)
    .map((group, index) => ({
      flag: formatFlagLabel(index),
      category: displayFindingArea(group.area, group.category),
      risk: highestRisk(group.entries.map((entry) => entry.finding)),
      providers: Array.from(new Set(group.entries.map((entry) => entry.provider))),
      labels: Array.from(new Set(group.entries.map((entry) => entry.label))),
      findings: group.entries.map((entry) => entry.finding),
    }));
}

function buildAnalysisComparison(results: AiResult[]) {
  const providers = results.map((result) => ({
    provider: result.provider,
    label: result.providerLabel,
    model: result.model,
    score: toNumber(result.memo.overallRiskScore),
    narrative: result.memo.narrative,
    summary: result.memo.summary,
    findings: result.memo.findings,
  }));

  const consolidatedScore = averageScore(
    providers.map((provider) => provider.score).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );

  const mergedNarrative = mergeUniqueStrings(providers.map((provider) => provider.narrative));
  const mergedSummary = mergeUniqueStrings(providers.map((provider) => provider.summary));
  const mergedFindings = mergeUniqueFindings(providers.map((provider) => provider.findings));

  const agreementFlags = buildAgreementFlags(providers);

  const missedClauses = providers.length > 1
    ? providers.map((provider) => {
        const otherFindings = providers
          .filter((candidate) => candidate.provider !== provider.provider)
          .flatMap((candidate) => candidate.findings);

        const clauses = provider.findings.filter(
          (finding) => !otherFindings.some((other) => findingsReferToSameClause(other, finding))
        );

        return {
          provider: provider.provider,
          label: provider.label,
          clauses,
        };
      })
    : [];
  const featherlessGapClauses =
    missedClauses.find((provider) => provider.provider === "featherless")?.clauses ?? [];

  return {
    providers,
    consolidatedScore,
    mergedNarrative,
    mergedSummary,
    mergedFindings,
    agreementFlags,
    missedClauses,
    featherlessGapClauses,
  } satisfies AnalysisComparison;
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
      <h2 style="margin: 0 0 8px;">GeminEYE-V2 risk alert</h2>
      <p style="margin: 0 0 16px;">Contract <strong>${safeTitle}</strong> scored <strong>${input.score.toFixed(1)} / 10</strong> (${riskLabel}).</p>
      <p style="margin: 0 0 16px;">Alert threshold: ${input.threshold.toFixed(1)} / 10</p>
      <p style="margin: 0 0 16px;">Analysis provider: <strong>${safeProvider}</strong>${safeModel ? ` (${safeModel})` : ""}</p>
      <h3 style="margin: 16px 0 8px;">Summary highlights</h3>
      ${summaryList}
      <h3 style="margin: 16px 0 8px;">Top findings</h3>
      ${findingList}
      <p style="margin-top: 16px; font-size: 12px; color: #6a5f55;">This alert was generated by GeminEYE-V2 with Gemini + Featherless running in parallel, consolidated scoring, Speechmatics intake, and Resend alerting. Review the full report in the dashboard for details.</p>
    </div>
  `;

  const text = `GeminEYE-V2 risk alert\n\nContract: ${input.contractTitle}\nScore: ${input.score.toFixed(1)} / 10 (${riskLabel})\nThreshold: ${input.threshold.toFixed(1)} / 10\nProvider: ${input.providerLabel || "configured AI provider"}${input.model ? ` (${input.model})` : ""}\nStack: Gemini + Featherless parallel analysis with consolidated scoring, Speechmatics intake, Resend alerts\n\nSummary:\n${summaryItems.join("\n")}\n\nTop findings:\n${findingItems.map((item) => `${item.category} (${item.risk}) - ${item.recommendation}`).join("\n")}`;

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
        subject: `GeminEYE-V2 risk alert: ${subjectTitle} (${score.toFixed(1)} / 10)`,
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
        error: `Gemini error (${response.status}).`,
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
        error: "Gemini returned empty content.",
      };
    }

    const memo = extractMemoFromRaw(rawText);
    if (!memo) {
      return {
        ok: false,
        provider: "aiml",
        providerLabel: providerLabel("aiml"),
        model,
        error: "Gemini returned invalid JSON shape.",
      };
    }

    return { ok: true, memo, provider: "aiml", providerLabel: providerLabel("aiml"), model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed.";
    return {
      ok: false,
      provider: "aiml",
      providerLabel: providerLabel("aiml"),
      model,
      error: message,
    };
  }
}

// Featherless API calls are delegated to the adapter to keep this route testable
async function callFeatherlessApi(prompt: PromptBundle): Promise<AiCallResult | null> {
  const result = await callFeatherlessAdapter(prompt);
  if (!result) return null;
  if (result.ok) {
    const memo = extractMemoFromRaw(result.raw ?? "");
    if (!memo) {
      return {
        ok: false,
        provider: "featherless",
        providerLabel: providerLabel("featherless"),
        model: result.model,
        error: "Featherless returned empty or invalid JSON output.",
      };
    }
    return { ok: true, memo, provider: "featherless", providerLabel: providerLabel("featherless"), model: result.model };
  }

  return {
    ok: false,
    provider: "featherless",
    providerLabel: providerLabel("featherless"),
    model: result.model,
    error: result.error ?? "Featherless API request failed.",
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
        error: `Gemini error (${response.status}).`,
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
    const message = error instanceof Error ? error.message : "Gemini request failed.";
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
Use category names from this set where possible: Liability, Indemnity, Privacy, Termination, IP, Governing law, Payment, Confidentiality, Warranty, Assignment, Force majeure.
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
  const parallelProviders = providerPriority.includes("aiml") && providerPriority.includes("featherless");

  if (parallelProviders) {
    const [aimlResult, featherlessResult] = await Promise.all([callAiMlApi(prompt), callFeatherlessApi(prompt)]);
    const parallelResults = [aimlResult, featherlessResult].filter(Boolean) as AiCallResult[];

    for (const result of parallelResults) {
      attempts.push({
        provider: result.provider,
        label: result.providerLabel,
        ok: result.ok,
        model: result.model,
        error: result.ok ? undefined : result.error,
      });
    }

    const successfulResults = parallelResults.filter((result): result is AiResult & { ok: true } => result.ok);
    if (successfulResults.length > 0) {
      const primaryResult = aimlResult?.ok ? aimlResult : featherlessResult?.ok ? featherlessResult : successfulResults[0];
      const analysisComparison = buildAnalysisComparison(successfulResults);
      const consolidatedMemo = consolidateMemoScore(
        {
          ...primaryResult.memo,
          narrative: analysisComparison.mergedNarrative,
          summary: analysisComparison.mergedSummary,
          findings: analysisComparison.mergedFindings,
          overallRiskScore: analysisComparison.consolidatedScore ?? primaryResult.memo.overallRiskScore,
        },
        successfulResults.map((result) => result.memo.overallRiskScore)
      );
      const combinedProviderLabel =
        successfulResults.length > 1
          ? "Gemini + Featherless consolidated"
          : primaryResult.providerLabel;
      const combinedProviderModel =
        successfulResults.length > 1
          ? [aimlResult?.ok ? aimlResult.model : null, featherlessResult?.ok ? featherlessResult.model : null]
              .filter(Boolean)
              .join(" + ")
          : primaryResult.model;

      const alert = await sendResendAlert({
        memo: consolidatedMemo,
        contractTitle,
        fallback: false,
        providerLabel: combinedProviderLabel,
        model: combinedProviderModel,
      });

      return NextResponse.json({
        contractTitle,
        memo: consolidatedMemo,
        fallback: false,
        keyLoaded: true,
        provider: primaryResult.provider,
        providerLabel: combinedProviderLabel,
        providerModel: combinedProviderModel,
        providerPriority,
        attempts,
        analysisComparison,
        alert,
      });
    }
  }

  for (const provider of providerPriority) {
    if (parallelProviders && (provider === "aiml" || provider === "featherless")) {
      continue;
    }

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

    const analysisComparison = buildAnalysisComparison([result]);
    const consolidatedMemo = consolidateMemoScore(
      {
        ...result.memo,
        narrative: analysisComparison.mergedNarrative,
        summary: analysisComparison.mergedSummary,
        findings: analysisComparison.mergedFindings,
        overallRiskScore: analysisComparison.consolidatedScore ?? result.memo.overallRiskScore,
      },
      [result.memo.overallRiskScore]
    );

    const alert = await sendResendAlert({
      memo: consolidatedMemo,
      contractTitle,
      fallback: false,
      providerLabel: result.providerLabel,
      model: result.model,
    });

    return NextResponse.json({
      contractTitle,
      memo: consolidatedMemo,
      fallback: false,
      keyLoaded: true,
      provider: result.provider,
      providerLabel: result.providerLabel,
      providerModel: result.model,
      providerPriority,
      attempts,
      analysisComparison,
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
        analysisComparison: null,
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
    analysisComparison: null,
    alert,
  });
}
