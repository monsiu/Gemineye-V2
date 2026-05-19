import { NextResponse } from "next/server";

function hasConfiguredProvider() {
  const aiMlApiKey = process.env.AI_ML_API_KEY?.trim();
  const aiMlApiModel = process.env.AI_ML_API_MODEL?.trim();
  const aiMlApiCompletionsUrl = process.env.AI_ML_API_COMPLETIONS_URL?.trim();
  const aiMlApiBaseUrl = process.env.AI_ML_API_BASE_URL?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

  const hasAiMlConfig = Boolean(aiMlApiKey && aiMlApiModel && (aiMlApiCompletionsUrl || aiMlApiBaseUrl));
  const hasGeminiConfig = Boolean(geminiApiKey);

  return hasAiMlConfig || hasGeminiConfig;
}

export function GET() {
  return NextResponse.json(
    { configured: hasConfiguredProvider() },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}