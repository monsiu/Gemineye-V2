import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_AUDIO_SIZE_MB = 25;
const DEFAULT_BASE_URL = "https://eu1.asr.api.speechmatics.com/v2";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_POLL_TIMEOUT_MS = 45000;

function normalizeBaseUrl(input?: string) {
  if (!input) return DEFAULT_BASE_URL;
  return input.replace(/\/$/, "");
}

function resolveDiarization(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "speaker" || normalized === "channel") return normalized;
  if (normalized === "none") return "none";
  return "none";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJobStatus(params: {
  baseUrl: string;
  apiKey: string;
  jobId: string;
  timeoutMs: number;
  intervalMs: number;
}) {
  const started = Date.now();

  while (Date.now() - started < params.timeoutMs) {
    const statusResponse = await fetch(`${params.baseUrl}/jobs/${params.jobId}`, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      const payload = (await statusResponse.json().catch(() => null)) as { error?: string } | null;
      return {
        status: "error" as const,
        reason: payload?.error ?? `Speechmatics status error (${statusResponse.status}).`,
      };
    }

    const data = (await statusResponse.json().catch(() => null)) as { job?: { status?: string } } | null;
    const jobStatus = data?.job?.status;

    if (jobStatus === "done") {
      return { status: "done" as const };
    }

    if (jobStatus === "rejected" || jobStatus === "expired" || jobStatus === "deleted") {
      return { status: "error" as const, reason: `Speechmatics job ${jobStatus}.` };
    }

    await sleep(params.intervalMs);
  }

  return { status: "processing" as const };
}

export async function POST(request: Request) {
  const apiKey = process.env.SPEECHMATICS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Speechmatics API key missing." }, { status: 500 });
  }

  const baseUrl = normalizeBaseUrl(process.env.SPEECHMATICS_BASE_URL?.trim());
  const language = process.env.SPEECHMATICS_LANGUAGE?.trim() || "en";
  const operatingPoint = process.env.SPEECHMATICS_OPERATING_POINT?.trim() || "enhanced";
  const diarization = resolveDiarization(process.env.SPEECHMATICS_DIARIZATION);
  const timeoutMs = Number(process.env.SPEECHMATICS_POLL_TIMEOUT_MS ?? DEFAULT_POLL_TIMEOUT_MS);
  const intervalMs = Number(process.env.SPEECHMATICS_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio file uploaded." }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `Audio file too large. Max ${MAX_AUDIO_SIZE_MB} MB.` },
      { status: 400 }
    );
  }

  const config = {
    type: "transcription",
    transcription_config: {
      language,
      operating_point: operatingPoint,
      diarization,
    },
  };

  const createForm = new FormData();
  createForm.append("config", JSON.stringify(config));
  createForm.append("data_file", file, file.name || "audio");

  const createResponse = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: createForm,
  });

  if (!createResponse.ok) {
    const payload = (await createResponse.json().catch(() => null)) as { error?: string; detail?: string } | null;
    return NextResponse.json(
      { error: payload?.detail ?? payload?.error ?? `Speechmatics create job error (${createResponse.status}).` },
      { status: 500 }
    );
  }

  const createPayload = (await createResponse.json().catch(() => null)) as { id?: string } | null;
  const jobId = createPayload?.id;

  if (!jobId) {
    return NextResponse.json({ error: "Speechmatics job ID missing." }, { status: 500 });
  }

  const pollResult = await pollJobStatus({
    baseUrl,
    apiKey,
    jobId,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : DEFAULT_POLL_INTERVAL_MS,
  });

  if (pollResult.status === "processing") {
    return NextResponse.json(
      { jobId, status: "processing", error: "Transcription still processing. Try again shortly." },
      { status: 202 }
    );
  }

  if (pollResult.status === "error") {
    return NextResponse.json({ jobId, status: "error", error: pollResult.reason }, { status: 500 });
  }

  const transcriptResponse = await fetch(`${baseUrl}/jobs/${jobId}/transcript?format=txt`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!transcriptResponse.ok) {
    const payload = (await transcriptResponse.json().catch(() => null)) as { error?: string } | null;
    return NextResponse.json(
      { jobId, status: "error", error: payload?.error ?? `Speechmatics transcript error (${transcriptResponse.status}).` },
      { status: 500 }
    );
  }

  const transcriptText = (await transcriptResponse.text()).trim();

  if (!transcriptText) {
    return NextResponse.json(
      { jobId, status: "error", error: "Speechmatics returned an empty transcript." },
      { status: 500 }
    );
  }

  return NextResponse.json({ jobId, status: "completed", text: transcriptText });
}
