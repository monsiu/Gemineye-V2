import { NextResponse } from "next/server";

type ProviderName = "aiml" | "featherless" | "gemini";

const DEFAULT_PROVIDER_PRIORITY: ProviderName[] = ["aiml", "featherless", "gemini"];

function parseCsv(value?: string) {
  return (value ?? "")
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveProviderPriority() {
  const configured = parseCsv(process.env.AI_PROVIDER_PRIORITY)
    .map((entry) => entry.toLowerCase())
    .filter((entry): entry is ProviderName =>
      entry === "aiml" || entry === "featherless" || entry === "gemini"
    );

  return Array.from(new Set([...configured, ...DEFAULT_PROVIDER_PRIORITY]));
}

function hasConfiguredProvider() {
  const aiMlApiKey = process.env.AI_ML_API_KEY?.trim();
  const aiMlApiModel = process.env.AI_ML_API_MODEL?.trim();
  const aiMlApiCompletionsUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const aiMlApiBaseUrl = process.env.AI_ML_API_BASE_URL?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const featherlessApiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const featherlessModel = process.env.FEATHERLESS_MODEL?.trim();
  const featherlessFallbackModels = parseCsv(process.env.FEATHERLESS_FALLBACK_MODELS);

  const hasAiMlConfig = Boolean(aiMlApiKey && aiMlApiModel && (aiMlApiCompletionsUrl || aiMlApiBaseUrl));
  const hasGeminiConfig = Boolean(geminiApiKey);
  const hasFeatherlessConfig = Boolean(featherlessApiKey && (featherlessModel || featherlessFallbackModels.length > 0));

  return hasAiMlConfig || hasGeminiConfig || hasFeatherlessConfig;
}

export function GET() {
  const aiMlApiKey = process.env.AI_ML_API_KEY?.trim();
  const aiMlApiModel = process.env.AI_ML_API_MODEL?.trim();
  const aiMlApiCompletionsUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const aiMlApiBaseUrl = process.env.AI_ML_API_BASE_URL?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const featherlessApiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const featherlessModel = process.env.FEATHERLESS_MODEL?.trim();
  const featherlessFallbackModels = parseCsv(process.env.FEATHERLESS_FALLBACK_MODELS);
  const speechmaticsApiKey = process.env.SPEECHMATICS_API_KEY?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim();
  const resendTo = process.env.RESEND_TO?.trim();

  const hasAiMlConfig = Boolean(aiMlApiKey && aiMlApiModel && (aiMlApiCompletionsUrl || aiMlApiBaseUrl));
  const hasGeminiConfig = Boolean(geminiApiKey);
  const hasFeatherlessConfig = Boolean(featherlessApiKey && (featherlessModel || featherlessFallbackModels.length > 0));
  const hasSpeechmaticsConfig = Boolean(speechmaticsApiKey);
  const hasResendConfig = Boolean(resendApiKey && resendFrom && resendTo);

  const thresholdRaw = process.env.RESEND_RISK_THRESHOLD?.trim();
  const threshold = thresholdRaw && !Number.isNaN(Number(thresholdRaw)) ? Number(thresholdRaw) : undefined;

  return NextResponse.json(
    {
      configured: hasConfiguredProvider(),
      providers: {
        aiml: hasAiMlConfig,
        gemini: hasGeminiConfig,
        featherless: hasFeatherlessConfig,
      },
      providerPriority: resolveProviderPriority(),
      providerDetails: {
        aiml: {
          label: "Gemini",
          configured: hasAiMlConfig,
          model: aiMlApiModel || undefined,
        },
        featherless: {
          label: "Featherless parallel pass",
          configured: hasFeatherlessConfig,
          model: featherlessModel || featherlessFallbackModels[0] || undefined,
          fallbackModels: featherlessFallbackModels,
        },
        gemini: {
          label: "Gemini direct",
          configured: hasGeminiConfig,
          model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
        },
      },
      integrations: {
        speechmatics: hasSpeechmaticsConfig,
        resend: hasResendConfig,
      },
      alerting: {
        threshold,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
