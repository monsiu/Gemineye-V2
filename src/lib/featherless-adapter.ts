/* Featherless adapter - wrapper around Featherless API calls.
  Keeps a small, testable surface for Featherless integration.
  This file intentionally uses minimal typing to avoid circular type imports.
  Uses the global `fetch` available in Next.js server runtime (no node-fetch dependency).
*/

function normalizeBaseUrl(input?: string) {
  if (!input) return null;
  return input.replace(/\/$/, "");
}

function buildCompletionsUrl(baseUrl: string) {
  if (baseUrl.endsWith("/v1")) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
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

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as any;
    if (payload?.error) {
      return typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error);
    }
    if (payload?.message) {
      return typeof payload.message === "string" ? payload.message : JSON.stringify(payload.message);
    }
    if (payload) {
      return typeof payload === "string" ? payload : JSON.stringify(payload);
    }
    return null;
  }
  const text = await response.text().catch(() => "");
  return text.trim() || null;
}

export async function callFeatherlessApi(prompt: any): Promise<any | null> {
  const apiKey = process.env.FEATHERLESS_API_KEY?.trim();
  const primaryModel = process.env.FEATHERLESS_MODEL?.trim();
  const fallbackModels = parseCsv(process.env.FEATHERLESS_FALLBACK_MODELS);
  const models = uniqueValues([primaryModel ?? "", ...fallbackModels]);
  const baseUrl = normalizeBaseUrl(process.env.FEATHERLESS_BASE_URL?.trim()) || "https://api.featherless.ai/v1";
  const maxTokens = Number(process.env.FEATHERLESS_MAX_TOKENS ?? 4096);

  if (!apiKey || models.length === 0) return null;

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
        body: JSON.stringify({ model, messages: prompt && prompt.system ? [ { role: "system", content: prompt.system }, { role: "user", content: prompt.user } ] : [], temperature: 0.15, max_tokens: maxTokens }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const detail = payload ? ` ${payload}` : "";
        failures.push(`${model}: Featherless API error (${response.status}).${detail}`);
        continue;
      }

      const data = (await response.json()) as any;
      const rawText = (data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "").trim();
      if (!rawText) {
        failures.push(`${model}: Featherless API returned empty content.`);
        continue;
      }

      return { ok: true, raw: rawText, provider: "featherless", model };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${model}: ${message}`);
    }
  }

  return { ok: false, provider: "featherless", error: failures.join(" | "), model: models.join(", ") };
}

export function isFeatherlessConfigured() {
  return Boolean(process.env.FEATHERLESS_API_KEY && (process.env.FEATHERLESS_MODEL || process.env.FEATHERLESS_FALLBACK_MODELS));
}
