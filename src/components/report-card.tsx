import { memo } from "react";

type ProviderName = "aiml" | "featherless" | "gemini";
type IntakeSource = "paste" | "document" | "speechmatics" | "sample";

type SavedFinding = {
  id: string;
  risk: "Low" | "Medium" | "High";
  category: string;
  evidence: string;
  recommendation: string;
};

type AnalysisComparison = {
  providers: Array<{
    provider: ProviderName;
    label: string;
    model: string;
    score: number | null;
    narrative: string[];
    summary: string[];
    findings: SavedFinding[];
  }>;
  consolidatedScore: number | null;
  mergedNarrative: string[];
  mergedSummary: string[];
  mergedFindings: SavedFinding[];
  agreementFlags?: Array<{
    flag: string;
    category: string;
    risk: "Low" | "Medium" | "High";
    providers: ProviderName[];
    labels: string[];
    findings: SavedFinding[];
  }>;
  missedClauses: Array<{
    provider: ProviderName;
    label: string;
    clauses: SavedFinding[];
  }>;
  featherlessGapClauses?: SavedFinding[];
};

type ProviderAttempt = {
  provider: ProviderName;
  label: string;
  ok: boolean;
  model?: string;
  error?: string;
};

type ProviderResultCard = {
  provider: ProviderName;
  label: string;
  model?: string;
  score: number | null;
  findingsCount: number;
  ok: boolean;
  error?: string;
};

type AlertStatus = {
  provider: "resend";
  status: "sent" | "skipped" | "error";
  threshold: number;
  score?: number;
  recipients?: number;
  reason?: string;
  id?: string;
};

type SavedReport = {
  id: string;
  title: string;
  score?: number | null;
  label: string;
  createdAt: string;
  findings?: SavedFinding[];
  html: string;
  provider?: ProviderName | null;
  providerLabel?: string | null;
  providerModel?: string | null;
  alertStatus?: AlertStatus | null;
  intakeSource?: IntakeSource;
  analysisComparison?: AnalysisComparison | null;
  providerAttempts?: ProviderAttempt[];
};

interface ReportCardProps {
  report: SavedReport;
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
  badgeClass: (label: string) => string;
}

function formatDateTimeLocal(iso?: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function riskFillTone(risk: "Low" | "Medium" | "High") {
  if (risk === "High") return "bg-red-500";
  if (risk === "Medium") return "bg-amber-500";
  return "bg-emerald-500";
}

function riskFillWidth(risk: "Low" | "Medium" | "High") {
  if (risk === "High") return "100%";
  if (risk === "Medium") return "66%";
  return "33%";
}

function scoreMeta(score?: number | null) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return {
      tone: "border-line bg-panel-strong text-muted",
      fill: "bg-line",
      percent: 0,
    };
  }

  const numeric = Number(score);
  if (numeric >= 6.5) {
    return {
      tone: "border-red-200 bg-red-50 text-red-700",
      fill: "bg-red-500",
      percent: Math.min(100, Math.max(0, (numeric / 10) * 100)),
    };
  }

  if (numeric >= 3.5) {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      fill: "bg-amber-500",
      percent: Math.min(100, Math.max(0, (numeric / 10) * 100)),
    };
  }

  return {
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    fill: "bg-emerald-500",
    percent: Math.min(100, Math.max(0, (numeric / 10) * 100)),
  };
}

function providerDisplayName(provider?: ProviderName | null) {
  if (provider === "aiml") return "Gemini";
  if (provider === "featherless") return "Featherless parallel pass";
  if (provider === "gemini") return "Gemini direct";
  return "Provider not recorded";
}

function normalizeProviderLabel(label?: string | null, provider?: ProviderName | null) {
  const fallback = providerDisplayName(provider);
  if (!label) return fallback;

  return label
    .replace(/Gemini\s*\(AI\/ML API\)/gi, "Gemini")
    .replace(/Gemini AI\/ML/gi, "Gemini")
    .replace(/AI\/ML API Gemini/gi, "Gemini")
    .replace(/Gemini API/gi, "Gemini direct");
}

function buildProviderResultCards(
  comparison?: AnalysisComparison | null,
  attempts?: ProviderAttempt[]
): ProviderResultCard[] {
  const successfulCards =
    comparison?.providers.map((provider) => ({
      provider: provider.provider,
      label: normalizeProviderLabel(provider.label, provider.provider),
      model: provider.model,
      score: provider.score,
      findingsCount: provider.findings.length,
      ok: true,
    })) ?? [];
  const successfulProviders = new Set(successfulCards.map((provider) => provider.provider));
  const failedCards = (attempts ?? [])
    .filter((attempt) => !successfulProviders.has(attempt.provider))
    .map((attempt) => ({
      provider: attempt.provider,
      label: normalizeProviderLabel(attempt.label, attempt.provider),
      model: attempt.model,
      score: null,
      findingsCount: 0,
      ok: attempt.ok,
      error: attempt.error,
    }));

  return [...successfulCards, ...failedCards];
}

function intakeSourceLabel(source?: IntakeSource) {
  if (source === "speechmatics") return "Speechmatics intake";
  if (source === "document") return "Document upload";
  if (source === "sample") return "Sample";
  return "Pasted text";
}

function alertStatusLabel(status?: AlertStatus | null) {
  if (!status) return "Resend not recorded";
  if (status.status === "sent") return "Resend sent";
  if (status.status === "error") return "Resend failed";
  return "Resend skipped";
}

function RiskIcon({ risk }: { risk: "Low" | "Medium" | "High" }) {
  const tone =
    risk === "High"
      ? "border-red-200 bg-red-50 text-red-700"
      : risk === "Medium"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${tone}`} aria-hidden="true">
      {risk === "High" ? (
        <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2.3 18 16H2L10 2.3Z" />
          <path d="M10 7v4.2" />
          <path d="M10 13.8h.01" />
        </svg>
      ) : risk === "Medium" ? (
        <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 5.8v4.5" />
          <path d="M10 13.8h.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.2" />
          <path d="m6.6 10.3 2.1 2.1L13.5 7.8" />
        </svg>
      )}
    </span>
  );
}

const ReportCard = memo(function ReportCard({ report, onDownload, onRemove, badgeClass }: ReportCardProps) {
  const overallMeta = scoreMeta(report.score ?? null);
  const providerResultCards = buildProviderResultCards(report.analysisComparison, report.providerAttempts);
  const agreementFlags = report.analysisComparison?.agreementFlags ?? [];
  const featherlessParticipated = Boolean(
    providerResultCards.some((provider) => provider.provider === "featherless" && provider.ok)
  );
  const featherlessGapClauses =
    report.analysisComparison?.featherlessGapClauses ??
    report.analysisComparison?.missedClauses.find((provider) => provider.provider === "featherless")?.clauses ??
    [];
  const noAgreementCopy = featherlessParticipated
    ? "Gemini and Featherless did not land on the same risk area in this pass."
    : "Featherless did not return a valid comparison result for this pass.";
  const noGapCopy = featherlessParticipated
    ? "Featherless checked the contract and did not surface an extra clause beyond Gemini."
    : "Featherless was not available for a parallel comparison on this pass.";

  return (
    <div className="rounded-3xl border border-line bg-panel p-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <h3 className="wrap-break-word font-serif text-xl font-bold text-ink sm:text-2xl">{report.title}</h3>
          <p className="wrap-break-word text-xs text-muted">{formatDateTimeLocal(report.createdAt)}</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            onClick={() => onDownload(report.id)}
            className="button-pop inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:border-accent-strong hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 dark:border-accent dark:bg-accent dark:hover:border-accent-strong dark:hover:bg-accent-strong sm:flex-none"
            title="Download report"
            aria-label={`Download ${report.title}`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M10 2a1 1 0 0 1 1 1v7.586l1.293-1.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L9 10.586V3a1 1 0 0 1 1-1Z" />
              <path d="M4 14a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
            </svg>
            <span>Download</span>
          </button>
          <button
            onClick={() => onRemove(report.id)}
            className="button-pop inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-signal bg-signal px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 dark:border-red-500 dark:bg-red-600 dark:text-white dark:hover:border-red-400 dark:hover:bg-red-500 sm:flex-none"
            title="Delete report"
            aria-label={`Delete ${report.title}`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M8.5 2a1 1 0 0 0-.8.4L7 3H4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2h-3l-.7-.6a1 1 0 0 0-.8-.4h-3Z" />
              <path d="M5 6a1 1 0 0 1 1 1v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7a1 1 0 1 1 2 0v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7a1 1 0 0 1 1-1Z" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(report.label)}`}>
          {report.label}
        </span>
        {report.score !== null && report.score !== undefined && (
          <span className="inline-flex rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink">
            {report.score.toFixed(1)} / 10
          </span>
        )}
        {report.findings && report.findings.length > 0 && (
          <span className="inline-flex rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink">
            {report.findings.length} findings
          </span>
        )}
        <span className="inline-flex rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink">
          {normalizeProviderLabel(report.providerLabel, report.provider)}
        </span>
        {report.providerModel ? (
          <span className="inline-flex max-w-full rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink wrap-break-word">
            {report.providerModel}
          </span>
        ) : null}
        <span className="inline-flex rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink">
          {intakeSourceLabel(report.intakeSource)}
        </span>
        <span className="inline-flex rounded-full bg-panel-strong px-3 py-1 text-xs font-semibold text-ink">
          {alertStatusLabel(report.alertStatus)}
        </span>
      </div>

      {report.score !== null && report.score !== undefined && (
        <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Overall risk scale</span>
              <p className="mt-1 text-xs text-muted">Score trend from lower to high risk.</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${overallMeta.tone}`}>{report.score.toFixed(1)} / 10</span>
          </div>
          <div className="mt-3">
            <div className="relative h-3 overflow-hidden rounded-full bg-panel-strong">
              <div className="absolute inset-y-0 left-0 w-[35%] bg-emerald-500/90" />
              <div className="absolute inset-y-0 left-[35%] w-[30%] bg-amber-500/90" />
              <div className="absolute inset-y-0 left-[65%] w-[35%] bg-red-500/90" />
              <div className="absolute inset-0">
                {Array.from({ length: 11 }).map((_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className="absolute top-0 h-3 w-px bg-white/45"
                    style={{ left: `${index * 10}%` }}
                  />
                ))}
              </div>
              <div
                className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${overallMeta.fill}`}
                style={{ left: `${overallMeta.percent}%` }}
                aria-hidden="true"
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted">
              <span>Lower</span>
              <span>Moderate</span>
              <span>High</span>
            </div>

            <div className="relative mt-2 h-6">
              <div
                className="absolute top-0 -translate-x-1/2 rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted shadow-sm"
                style={{ left: `${overallMeta.percent}%` }}
              >
                {report.score.toFixed(1)} / 10
              </div>
            </div>
          </div>
        </div>
      )}

      {providerResultCards.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Gemini + Featherless cross-check</h4>
              <p className="mt-1 text-xs text-muted">Agreement flags and clauses Featherless surfaced after Gemini.</p>
            </div>
            <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-muted">
              {report.analysisComparison?.consolidatedScore === null || report.analysisComparison?.consolidatedScore === undefined
                ? "No combined score"
                : `Combined ${report.analysisComparison.consolidatedScore.toFixed(1)} / 10`}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {providerResultCards.map((provider) => (
                <div key={`${report.id}-${provider.provider}-${provider.model ?? "model"}`} className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-ink">{provider.label}</strong>
                      <div className="mt-1 wrap-break-word">{provider.model || "Model not reported"}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      provider.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}>
                      {provider.ok ? (provider.score === null ? "No score" : `${provider.score.toFixed(1)} / 10`) : "Failed"}
                    </span>
                  </div>
                  <div className="mt-2">{provider.findingsCount} finding{provider.findingsCount === 1 ? "" : "s"} captured</div>
                  {provider.error ? <div className="mt-1 text-signal">{provider.error}</div> : null}
                </div>
              ))}
            </div>
            {agreementFlags.length > 0 ? (
              agreementFlags.slice(0, 3).map((flag) => (
                <div key={`${report.id}-flag-${flag.flag}`} className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted">
                  <strong className="text-ink">Flag {flag.flag}: {flag.category} ({flag.risk})</strong> - {flag.labels.join(" + ")} agreed.
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted">
                {noAgreementCopy}
              </div>
            )}
            {featherlessGapClauses.slice(0, 2).map((clause) => (
              <div key={`${report.id}-gap-${clause.id}`} className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted">
                <strong className="text-ink">Featherless found: {clause.category} ({clause.risk})</strong> - {clause.recommendation}
              </div>
            ))}
            {featherlessGapClauses.length === 0 ? (
              <div className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted">
                {noGapCopy}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {report.findings && report.findings.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm font-semibold text-ink">View findings</summary>
          <p className="mt-2 rounded-2xl border border-dashed border-line bg-panel-strong px-3 py-2 text-xs text-muted">
            These are the headline findings only. Download the report to read the full reasoning, clause-by-clause evidence, and recommended edits.
          </p>
          <ul className="mt-3 space-y-2">
            {report.findings.map((finding, index) => (
              <li key={`${finding.id}-${index}`} className="rounded-2xl border border-line bg-white p-3 text-xs text-muted wrap-break-word">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <RiskIcon risk={finding.risk} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{finding.id}</div>
                      <div className="mt-1 text-sm font-semibold text-ink">{finding.category}</div>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeClass(finding.risk)}`}>
                    {finding.risk}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel-strong">
                  <div
                    className={`h-full rounded-full ${riskFillTone(finding.risk)}`}
                    style={{ width: riskFillWidth(finding.risk) }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted">
                  <span>Lower</span>
                  <span>Moderate</span>
                  <span>High</span>
                </div>
                <p className="mt-3 text-muted"><strong>Evidence:</strong> {finding.evidence}</p>
                <p className="mt-2 text-ink"><strong>Recommendation:</strong> {finding.recommendation}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
});

export default ReportCard;
