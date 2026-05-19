export type SavedReport = {
  id: string;
  title: string;
  score?: number | null;
  label: string;
  createdAt: string;
  findings?: Array<{
    id: string;
    risk: "Low" | "Medium" | "High";
    category: string;
    evidence: string;
    recommendation: string;
  }>;
  html: string;
};

export type SecurityEvent = {
  id: string;
  outcome: "allowed" | "blocked" | "fallback" | "error";
  reason: string;
  contractTitle: string;
  createdAt: string;
};

export interface DashboardStat {
  label: string;
  value: string;
  helper: string;
}

export function calculateSecurityStats(events: SecurityEvent[]): DashboardStat[] {
  const total = events.length;
  const blocked = events.filter((event) => event.outcome === "blocked").length;
  const allowed = events.filter((event) => event.outcome === "allowed").length;
  const fallbacks = events.filter((event) => event.outcome === "fallback").length;
  const blockedRate = total === 0 ? 0 : (blocked / total) * 100;

  return [
    { label: "Security events", value: total.toString(), helper: total === 1 ? "One logged analysis event" : "Logged analysis outcomes" },
    { label: "Blocked attempts", value: blocked.toString(), helper: blocked === 1 ? "One request stopped by guardrails" : "Requests stopped by guardrails" },
    { label: "Blocked rate", value: `${blockedRate.toFixed(0)}%`, helper: blockedRate === 0 ? "No blocked attempts yet" : "Share of requests stopped by guardrails" },
    { label: "Fallbacks", value: fallbacks.toString(), helper: fallbacks === 1 ? "One model fallback used" : "Model fallback responses" },
    { label: "Successful runs", value: allowed.toString(), helper: allowed === 1 ? "One completed analysis" : "Completed analyses" },
  ];
}

export function calculateDashboardStats(reports: SavedReport[]): DashboardStat[] {
  const total = reports.length;
  const highRisk = reports.filter((report) => (report.label || "").toLowerCase().includes("high")).length;
  const averageScore =
    reports.length === 0
      ? null
      : reports.reduce((sum, report) => sum + Number(report.score ?? 0), 0) / reports.length;

  return [
    { label: "Saved reports", value: total.toString(), helper: total === 1 ? "One report stored" : "Reports stored locally" },
    { label: "High risk", value: highRisk.toString(), helper: highRisk === 1 ? "Report flagged as high risk" : "Reports flagged as high risk" },
    { label: "Average score", value: averageScore === null ? "-" : `${averageScore.toFixed(1)} / 10`, helper: averageScore === null ? "No score yet" : "Across saved reports" },
  ];
}
