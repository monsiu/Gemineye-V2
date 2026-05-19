export function validateEnvironment() {
  const errors: string[] = [];

  // Check for at least one API provider
  const hasAiMlApi = process.env.NEXT_PUBLIC_AI_ML_API_KEY && process.env.NEXT_PUBLIC_AI_ML_API_MODEL;
  const hasGeminiApi = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!hasAiMlApi && !hasGeminiApi) {
    errors.push("No API provider configured. Set either GEMINI_API_KEY or AI_ML_API_KEY + AI_ML_API_MODEL.");
  }

  if (errors.length > 0) {
    console.warn(
      "Environment validation warnings:\n" +
      errors.map(e => `⚠ ${e}`).join("\n")
    );
  }

  return { isValid: errors.length === 0, errors };
}
