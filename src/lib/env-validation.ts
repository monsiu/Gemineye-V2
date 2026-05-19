export function validateEnvironment() {
  const errors: string[] = [];

  const hasAiMlApi =
    process.env.AI_ML_API_KEY &&
    process.env.AI_ML_API_MODEL &&
    (process.env.AI_ML_API_BASE_URL || process.env.AI_ML_API_COMPLETIONS_URL);
  const hasFeatherlessApi =
    process.env.FEATHERLESS_API_KEY &&
    (process.env.FEATHERLESS_MODEL || process.env.FEATHERLESS_FALLBACK_MODELS);
  const hasGeminiApi = process.env.GEMINI_API_KEY;

  if (!hasAiMlApi && !hasFeatherlessApi && !hasGeminiApi) {
    errors.push(
      "No API provider configured. Set AI_ML_API_KEY + AI_ML_API_MODEL, FEATHERLESS_API_KEY + FEATHERLESS_MODEL, or GEMINI_API_KEY."
    );
  }

  if (errors.length > 0) {
    console.warn("Environment validation warnings:\n" + errors.map((error) => `- ${error}`).join("\n"));
  }

  return { isValid: errors.length === 0, errors };
}
