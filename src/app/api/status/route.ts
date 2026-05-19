import { NextResponse } from "next/server";

function hasConfiguredProvider() {
  const aiMlApiKey = process.env.AI_ML_API_KEY?.trim();
  const aiMlApiModel = process.env.AI_ML_API_MODEL?.trim();
  const aiMlApiCompletionsUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const aiMlApiBaseUrl = process.env.AI_ML_API_BASE_URL?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const featherlessApiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const featherlessModel = process.env.FEATHERLESS_MODEL?.trim();

  const hasAiMlConfig = Boolean(aiMlApiKey && aiMlApiModel && (aiMlApiCompletionsUrl || aiMlApiBaseUrl));
  const hasGeminiConfig = Boolean(geminiApiKey);
  const hasFeatherlessConfig = Boolean(featherlessApiKey && featherlessModel);

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
  const speechmaticsApiKey = process.env.SPEECHMATICS_API_KEY?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim();
  const resendTo = process.env.RESEND_TO?.trim();

  const hasAiMlConfig = Boolean(aiMlApiKey && aiMlApiModel && (aiMlApiCompletionsUrl || aiMlApiBaseUrl));
  const hasGeminiConfig = Boolean(geminiApiKey);
  const hasFeatherlessConfig = Boolean(featherlessApiKey && featherlessModel);
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
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}