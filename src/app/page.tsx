"use client";

import type { ChangeEvent } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import ErrorAlert from "../components/error-alert";
import { SkeletonCard } from "../components/skeleton-loader";

type MemoFinding = {
  id: string;
  risk: "Low" | "Medium" | "High";
  category: string;
  evidence: string;
  recommendation: string;
};

type MemoPayload = {
  narrative: string[];
  summary: string[];
  findings: MemoFinding[];
  overallRiskScore?: number;
};

type SavedFinding = MemoFinding;

type SecurityEvent = {
  id: string;
  outcome: "allowed" | "blocked" | "fallback" | "error";
  reason: string;
  contractTitle: string;
  createdAt: string;
  blockedTerms?: string[];
};

const REPORT_LOGO = `
<svg fill="none" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M14.5 13.5V5.41a1 1 0 0 0-.3-.7L9.8.29A1 1 0 0 0 9.08 0H1.5v13.5A2.5 2.5 0 0 0 4 16h8a2.5 2.5 0 0 0 2.5-2.5m-1.5 0v-7H8v-5H3v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1M9.5 5V2.12L12.38 5zM5.13 5h-.62v1.25h2.12V5zm-.62 3h7.12v1.25H4.5zm.62 3h-.62v1.25h7.12V11z" clip-rule="evenodd" fill="#0f766e" fill-rule="evenodd"/>
</svg>`;

const SAMPLE_MEMO: MemoPayload = {
  narrative: [
    "[SAMPLE] This is placeholder analysis. Upload a contract and click 'Run analysis' to generate an actual memo. This demo shows the investigator-style format with liability, indemnity, and data privacy risks highlighted.",
  ],
  summary: [
    "[PLACEHOLDER] Liability exposure examples from sample data.",
    "[PLACEHOLDER] Indemnity structure review from sample data.",
    "[PLACEHOLDER] Data privacy timeline from sample data.",
  ],
  findings: [
    {
      id: "S-01",
      risk: "High",
      category: "Liability",
      evidence: "[SAMPLE ONLY] This is demo text. Real analysis will extract from your contract.",
      recommendation: "[SAMPLE ONLY] Upload a contract to see real recommendations.",
    },
    {
      id: "S-02",
      risk: "Medium",
      category: "Indemnity",
      evidence: "[SAMPLE ONLY] Demo finding for illustration purposes.",
      recommendation: "[SAMPLE ONLY] Real findings will be generated from your document.",
    },
  ],
  overallRiskScore: undefined,
};

const REVIEW_AREAS = [
  {
    label: "Liability",
    description:
      "Limits financial and legal exposure if something goes wrong under the agreement.",
  },
  {
    label: "Indemnity",
    description:
      "Defines who must defend and cover losses when third-party claims are made.",
  },
  {
    label: "Privacy",
    description:
      "Explains how personal or sensitive data is collected, used, shared, and protected.",
  },
  {
    label: "Termination",
    description:
      "Sets when and how either party can end the contract and what happens afterward.",
  },
  {
    label: "IP",
    description:
      "Clarifies ownership and usage rights for intellectual property, including deliverables.",
  },
  {
    label: "Venue",
    description:
      "Specifies which location and legal forum governs disputes and enforcement.",
  },
] as const;

const SAMPLE_CONTRACTS = [
  {
    title: "Service Agreement Sample",
    text: "SERVICE AGREEMENT\n\nThis Service Agreement ('Agreement') is entered into as of the date of acceptance by Client, between Service Provider ('Provider') and the Client entity identified in the online account ('Client').\n\n1. SERVICES: Provider shall provide cloud hosting services including server infrastructure, uptime monitoring, and technical support.\n\n2. LIABILITY: Provider's total liability shall not exceed the fees paid in the preceding 12 months. Provider is not liable for indirect, incidental, or consequential damages.\n\n3. TERM: This Agreement shall commence on the Effective Date and continue for one (1) year unless terminated earlier in accordance with this Agreement.\n\n4. TERMINATION: Either party may terminate for convenience with 30 days' written notice. Upon termination, Client's data will be retained for 30 days before deletion.\n\n5. INDEMNITY: Client shall indemnify Provider against claims that Client's content infringes third-party intellectual property rights.\n\n6. DATA PROTECTION: Provider shall maintain reasonable security measures consistent with industry standards to protect Client data.",
  },
  {
    title: "NDA Sample",
    text: "NON-DISCLOSURE AGREEMENT\n\nThis Non-Disclosure Agreement is entered into between Disclosing Party and Receiving Party.\n\n1. DEFINITION: Confidential Information means all non-public information disclosed by Disclosing Party in any form or medium.\n\n2. OBLIGATIONS: Receiving Party shall: (a) maintain confidentiality using reasonable care; (b) limit access to employees with a need to know; (c) not use the information except for the stated purpose.\n\n3. EXCEPTIONS: Confidential Information does not include information that: (a) was publicly available at disclosure; (b) becomes public through no breach; (c) is independently developed; (d) is rightfully received from a third party.\n\n4. TERM: This Agreement shall survive for three (3) years from disclosure.\n\n5. REMEDIES: Receiving Party acknowledges that breach may cause irreparable harm for which monetary damages are inadequate, and agrees that Disclosing Party shall be entitled to equitable relief.",
  },
];


function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFilename(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9\- _]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "contract-report";
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function riskLabel(score?: number) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return "Risk not scored";
  }

  const numericScore = Number(score);
  if (numericScore >= 6.5) {
    return "High risk";
  }
  if (numericScore >= 3.5) {
    return "Moderate risk";
  }
  return "Lower risk";
}

function narrativeSeverityClass(score?: number) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return "narrative-unscored";
  }

  const numericScore = Number(score);
  if (numericScore >= 6.5) {
    return "narrative-high";
  }
  if (numericScore >= 3.5) {
    return "narrative-moderate";
  }
  return "narrative-lower";
}

function highlightRiskTerms(value: string) {
  return escapeHtml(value)
    .replace(/\bhigh risk\b/gi, '<span class="risk-pill risk-pill-high">$&</span>')
    .replace(/\bmoderate risk\b/gi, '<span class="risk-pill risk-pill-medium">$&</span>')
    .replace(/\bmedium risk\b/gi, '<span class="risk-pill risk-pill-medium">$&</span>')
    .replace(/\blower risk\b/gi, '<span class="risk-pill risk-pill-low">$&</span>')
    .replace(/\blow risk\b/gi, '<span class="risk-pill risk-pill-low">$&</span>');
}

function buildReportHtml(input: {
  contractTitle: string;
  contractText: string;
  memo: MemoPayload;
  fallback: boolean;
}) {
  const generatedAt = formatDateTime(new Date());
  const title = input.contractTitle.trim() || "Contract Review";
  const riskScore =
    input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null
      ? "-"
      : Number(input.memo.overallRiskScore).toFixed(1);
  const narrativeToneClass = narrativeSeverityClass(input.memo.overallRiskScore);
  const overallRiskScore = Number(input.memo.overallRiskScore);
  const overallRiskPercent =
    input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null || Number.isNaN(overallRiskScore)
      ? 0
      : Math.min(100, Math.max(0, (overallRiskScore / 10) * 100));
  const overallRiskMarkerClass =
    input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null || Number.isNaN(overallRiskScore)
      ? "bg-[#6a5f55]"
      : overallRiskScore >= 6.5
        ? "bg-[#dc2626]"
        : overallRiskScore >= 3.5
          ? "bg-[#d97706]"
          : "bg-[#059669]";
  const overallRiskToneClass =
    input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null || Number.isNaN(overallRiskScore)
      ? "badge"
      : overallRiskScore >= 6.5
        ? "badge badge-high"
        : overallRiskScore >= 3.5
          ? "badge badge-medium"
          : "badge badge-low";
  const narrative = input.memo.narrative
    .map((item) => `<p>${highlightRiskTerms(item)}</p>`)
    .join("");

  const summary = input.memo.summary
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const findings = input.memo.findings
    .map(
      (item) => {
        const riskIcon = 
          item.risk === "High"
            ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.3 18 16H2L10 2.3Z" /><path d="M10 7v4.2" /><path d="M10 13.8h.01" /></svg>'
            : item.risk === "Medium"
              ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8v4.5" /><path d="M10 13.8h.01" /></svg>'
              : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.2" /><path d="m6.6 10.3 2.1 2.1L13.5 7.8" /></svg>';
        return `
        <article class="finding">
          <div class="finding-head">
            <div class="finding-title-wrap">
              <span class="finding-icon icon-${item.risk.toLowerCase()}">${riskIcon}</span>
              <div>
                <span class="finding-id">${escapeHtml(item.id)}</span>
                <h3>${escapeHtml(item.category)}</h3>
              </div>
            </div>
            <span class="badge badge-${item.risk.toLowerCase()}">${escapeHtml(item.risk)}</span>
          </div>
          <div class="risk-meter" aria-label="${escapeHtml(item.risk)} risk level">
            <div class="risk-meter-track">
              <div class="risk-meter-fill risk-meter-fill-${item.risk.toLowerCase()}" style="width:${item.risk === "High" ? "100%" : item.risk === "Medium" ? "66%" : "33%"}"></div>
            </div>
          </div>
          <p class="label">Evidence</p>
          <p>${escapeHtml(item.evidence)}</p>
          <p class="label">Recommendation</p>
          <p>${escapeHtml(item.recommendation)}</p>
        </article>
      `;
      }
    )
    .join("");

  const contractText = input.contractText.trim().length > 0
    ? `<pre>${escapeHtml(input.contractText)}</pre>`
    : `<p class="empty">No contract text was included in the analysis input.</p>`;

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - GeminEYE Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script>
      (function () {
        try {
          var storedTheme = window.localStorage.getItem('gemineye-theme');
          var theme = storedTheme === 'light' || storedTheme === 'dark'
            ? storedTheme
            : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.colorScheme = theme;
        } catch (error) {
          document.documentElement.dataset.theme = 'light';
          document.documentElement.style.colorScheme = 'light';
        }
      })();
    </script>
    <style>
      :root {
        --background: #f4efe8;
        --foreground: #1c1a18;
        --ink: #1c1a18;
        --muted: #6a5f55;
        --panel: #fffdf9;
        --panel-strong: #efe7dc;
        --line: #e1d6c8;
        --accent: #0f766e;
        --accent-strong: #0b5d56;
        --signal: #b45309;
      }

      html[data-theme="dark"] {
        --background: #0f1418;
        --foreground: #f4efe8;
        --ink: #f8f3ec;
        --muted: #b6aa9e;
        --panel: #151d22;
        --panel-strong: #1d2830;
        --line: #31404a;
        --accent: #2aa198;
        --accent-strong: #4bc7bd;
        --signal: #f59e0b;
      }

      html[data-theme="dark"] body {
        background:
          radial-gradient(circle at top left, rgba(42, 161, 152, 0.22), transparent 32%),
          radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 30%),
          linear-gradient(180deg, #0f1418 0%, #0b1014 100%);
      }

      html[data-theme="dark"] .hero {
        background:
          radial-gradient(circle at top left, rgba(42, 161, 152, 0.22), transparent 36%),
          radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 32%),
          linear-gradient(135deg, rgba(21, 29, 34, 0.96) 0%, rgba(13, 18, 22, 0.98) 100%);
      }

      html[data-theme="dark"] .meta-card,
      html[data-theme="dark"] .section,
      html[data-theme="dark"] .finding,
      html[data-theme="dark"] .contract-text {
        background: var(--panel);
      }

      html[data-theme="dark"] .finding {
        background: #10161b;
      }

      html[data-theme="dark"] .brand-mark {
        background: rgba(17, 24, 29, 0.92);
      }

      html[data-theme="dark"] .toggle-button {
        background: rgba(21, 29, 34, 0.96);
      }

      html[data-theme="dark"] .badge-high {
        color: #fecaca;
        background: rgba(127, 29, 29, 0.28);
        border-color: rgba(220, 38, 38, 0.35);
      }

      html[data-theme="dark"] .badge-medium {
        color: #fde68a;
        background: rgba(146, 64, 14, 0.28);
        border-color: rgba(245, 158, 11, 0.35);
      }

      html[data-theme="dark"] .badge-low {
        color: #a7f3d0;
        background: rgba(4, 120, 87, 0.28);
        border-color: rgba(16, 185, 129, 0.35);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--background);
        color: var(--foreground);
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }

      .page {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 24px 48px;
        position: relative;
      }

      .theme-toggle {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 20;
      }

      .toggle-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 14px;
        background: rgba(255, 253, 249, 0.96);
        color: var(--ink);
        box-shadow: 0 14px 28px rgba(40, 31, 22, 0.16);
        cursor: pointer;
        font: inherit;
      }

      .toggle-button:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      .toggle-button .icon {
        font-size: 14px;
        line-height: 1;
      }

      .toggle-button .label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .hero {
        background: radial-gradient(circle at top left, rgba(180, 83, 9, 0.12), transparent 45%),
          radial-gradient(circle at top right, rgba(15, 118, 110, 0.16), transparent 50%),
          linear-gradient(135deg, #f8f3ec 0%, #f4efe8 100%);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: 0 30px 70px rgba(40, 31, 22, 0.12);
        padding: 28px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--muted);
        margin-bottom: 18px;
      }

      .brand-mark {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        background: rgba(255, 253, 249, 0.92);
        border: 1px solid var(--line);
        border-radius: 14px;
        box-shadow: 0 12px 24px rgba(40, 31, 22, 0.08);
      }

      .brand-mark svg {
        width: 22px;
        height: 22px;
      }

      h1, h2, h3 {
        font-family: "Cormorant Garamond", Georgia, serif;
        margin: 0;
      }

      h1 {
        font-size: 42px;
        line-height: 1;
        margin-bottom: 10px;
      }

      .subtitle {
        color: var(--muted);
        font-size: 16px;
        line-height: 1.7;
        max-width: 72ch;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 24px;
      }

      .meta-card, .section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 18px 40px rgba(40, 31, 22, 0.06);
      }

      .meta-card {
        padding: 16px;
      }

      .meta-card .label, .section .label {
        display: block;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }

      .meta-card .value {
        font-size: 18px;
        line-height: 1.4;
        color: var(--ink);
      }

      .section {
        margin-top: 18px;
        padding: 22px;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 16px;
      }

      .section-header p {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 12px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .badge-high { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
      .badge-medium { color: #92400e; background: #fffbeb; border-color: #fde68a; }
      .badge-low { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }

      .overall-risk-scale {
        display: grid;
        gap: 10px;
        margin-top: 16px;
        position: relative;
      }

      .overall-risk-track {
        position: relative;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--panel-strong);
      }

      .overall-risk-segment {
        position: absolute;
        top: 0;
        bottom: 0;
      }

      .overall-risk-segment.low {
        left: 0;
        width: 35%;
        background: linear-gradient(90deg, rgba(52, 211, 153, 0.95), rgba(5, 150, 105, 0.95));
      }

      .overall-risk-segment.medium {
        left: 35%;
        width: 30%;
        background: linear-gradient(90deg, rgba(251, 191, 36, 0.95), rgba(217, 119, 6, 0.95));
      }

      .overall-risk-segment.high {
        left: 65%;
        width: 35%;
        background: linear-gradient(90deg, rgba(248, 113, 113, 0.95), rgba(220, 38, 38, 0.95));
      }

      .overall-risk-ticks {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .overall-risk-ticks span {
        position: absolute;
        top: 0;
        height: 12px;
        width: 1px;
        background: rgba(255, 255, 255, 0.45);
      }

      .overall-risk-marker-dot {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        transform: translate(-50%, -50%);
        border: 2px solid #fff;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.16);
      }

      .overall-risk-scorechip {
        position: absolute;
        top: 0;
        transform: translate(-50%, 0);
        padding: 4px 8px;
        background: rgba(255, 253, 249, 0.94);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        white-space: nowrap;
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
      }

      .overall-risk-labels {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .section-body p, .section-body li {
        color: var(--foreground);
        line-height: 1.7;
      }

      .section-body.narrative p {
        color: var(--foreground);
      }

      .risk-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        margin: 0 0.15rem;
        padding: 0.16rem 0.55rem;
        border-radius: 999px;
        font-size: 0.92em;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: #ffffff;
        border: 1px solid transparent;
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.14);
        white-space: nowrap;
      }

      .risk-pill-high {
        background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        border-color: #991b1b;
      }

      .risk-pill-medium {
        background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
        border-color: #c2410c;
      }

      .risk-pill-low {
        background: linear-gradient(135deg, #34d399 0%, #059669 100%);
        border-color: #047857;
      }

      html[data-theme="dark"] .risk-pill-high {
        background: linear-gradient(135deg, #ff6b6b 0%, #dc2626 100%);
        border-color: #ef4444;
      }

      html[data-theme="dark"] .risk-pill-medium {
        background: linear-gradient(135deg, #fdba74 0%, #f97316 100%);
        border-color: #fb923c;
      }

      html[data-theme="dark"] .risk-pill-low {
        background: linear-gradient(135deg, #6ee7b7 0%, #10b981 100%);
        border-color: #34d399;
      }

      .section-body ul {
        margin: 0;
        padding-left: 20px;
      }

      .findings {
        display: grid;
        gap: 14px;
      }

      .finding {
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px;
        background: #fff;
      }

      .finding-title-wrap {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .finding-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid transparent;
        font-size: 16px;
        font-weight: 800;
        flex-shrink: 0;
      }

      .finding-icon.icon-high { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
      .finding-icon.icon-medium { color: #92400e; background: #fffbeb; border-color: #fde68a; }
      .finding-icon.icon-low { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }

      .finding-id {
        display: inline-block;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 4px;
      }

      .finding-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 10px;
      }

      .finding-head h3 {
        font-size: 28px;
        margin: 0;
      }

      .risk-meter {
        margin: 8px 0 12px;
      }

      .risk-meter-track {
        position: relative;
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--panel-strong);
      }

      .risk-meter-fill {
        height: 100%;
        border-radius: 999px;
      }

      .risk-meter-fill-high {
        background: linear-gradient(90deg, #f87171, #dc2626);
      }

      .risk-meter-fill-medium {
        background: linear-gradient(90deg, #fbbf24, #d97706);
      }

      .risk-meter-fill-low {
        background: linear-gradient(90deg, #34d399, #059669);
      }

      .finding h3 {
        font-size: 28px;
        margin-bottom: 8px;
      }

      .finding .label {
        margin-top: 10px;
        margin-bottom: 6px;
      }

      .finding p {
        margin: 0;
        color: var(--foreground);
        line-height: 1.7;
      }

      .contract-text {
        white-space: pre-wrap;
        word-break: break-word;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
        max-height: 720px;
        overflow: auto;
      }

      .empty {
        color: var(--muted);
        font-style: italic;
      }

      .footer {
        margin-top: 18px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
      }

      @media print {
        body { background: #fff; }
        .page { max-width: none; padding: 0; }
        .hero, .meta-card, .section, .finding, .contract-text { box-shadow: none; }
      }

      @media (max-width: 900px) {
        .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        h1 { font-size: 34px; }
      }

      @media (max-width: 640px) {
        .page { padding: 20px 14px 34px; }
        .hero, .section { padding: 18px; border-radius: 22px; }
        .meta-grid { grid-template-columns: 1fr; }
        .section-header { flex-direction: column; }
        .finding h3 { font-size: 24px; }
      }
    </style>
  </head>
  <body>
    <div class="theme-toggle">
      <button class="toggle-button" type="button" id="themeToggle" aria-label="Toggle report theme">
        <span class="icon" id="themeToggleIcon" aria-hidden="true">☾</span>
        <span class="label" id="themeToggleLabel">Dark mode</span>
      </button>
    </div>
    <main class="page">
      <section class="hero">
        <div class="brand">
          <div class="brand-mark">${REPORT_LOGO}</div>
          <div>
            <div style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:var(--muted);">GeminEYE report</div>
            <div style="font-size:15px; color:var(--ink); font-weight:600;">AI contract risk review</div>
          </div>
        </div>
        <h1>${escapeHtml(title)}</h1>
        <div class="subtitle">${escapeHtml(
          input.fallback
            ? "This report captures the Gemini response from the fallback analysis mode. Review it as a working draft and verify the contract text before relying on it."
            : "This report captures the Gemini response for the analyzed contract, formatted in the same editorial style as the app and ready to share or print."
        )}</div>

        <div class="meta-grid">
          <div class="meta-card">
            <span class="label">Generated</span>
            <div class="value">${escapeHtml(generatedAt)}</div>
          </div>
          <div class="meta-card">
            <span class="label">Risk score</span>
            <div class="value">${riskScore} / 10</div>
          </div>
          <div class="meta-card">
            <span class="label">Risk label</span>
            <div class="value">${escapeHtml(riskLabel(input.memo.overallRiskScore))}</div>
          </div>
          <div class="meta-card">
            <span class="label">Contract title</span>
            <div class="value">${escapeHtml(title)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Overall risk scale</h2>
            <p>Score trend from lower to high risk across the memo.</p>
          </div>
          <span class="${overallRiskToneClass}">${escapeHtml(riskLabel(input.memo.overallRiskScore))}</span>
        </div>
        <div class="overall-risk-scale">
          <div class="overall-risk-track" aria-label="Overall risk scale">
            <div class="overall-risk-segment low"></div>
            <div class="overall-risk-segment medium"></div>
            <div class="overall-risk-segment high"></div>
            <div class="overall-risk-ticks">
              ${Array.from({ length: 11 })
                .map((_, i) => `<span style="left:${i * 10}%;"></span>`)
                .join("")}
            </div>
            ${input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null || Number.isNaN(overallRiskScore)
              ? ""
              : `<div class="overall-risk-marker-dot ${overallRiskMarkerClass}" style="left:${overallRiskPercent}%" aria-hidden="true"></div>`}
          </div>
          <div class="overall-risk-labels">
            <span>Lower</span>
            <span>Moderate</span>
            <span>High</span>
          </div>
          <div style="position:relative; height:24px;">
            ${input.memo.overallRiskScore === undefined || input.memo.overallRiskScore === null || Number.isNaN(overallRiskScore)
              ? ""
              : `<div class="overall-risk-scorechip" style="left:${overallRiskPercent}%;">${overallRiskScore.toFixed(1)} / 10</div>`}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Narrative</h2>
            <p>Gemini's high-level explanation of the contract review.</p>
          </div>
          <span class="badge">${escapeHtml(riskLabel(input.memo.overallRiskScore))}</span>
        </div>
        <div class="section-body narrative ${narrativeToneClass}">${narrative || '<p class="empty">No narrative was returned.</p>'}</div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Summary</h2>
            <p>Condensed takeaways pulled from the Gemini reply.</p>
          </div>
        </div>
        <div class="section-body">
          <ul>${summary || '<li class="empty">No summary items were returned.</li>'}</ul>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Findings</h2>
            <p>Detailed risk items, evidence, and recommendations.</p>
          </div>
        </div>
        <div class="findings">${findings || '<p class="empty">No findings were returned.</p>'}</div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Contract text appendix</h2>
            <p>The full contract text used for analysis. Kept in the report so you can share context without pasting it into the body above.</p>
          </div>
        </div>
        <div class="contract-text">${contractText}</div>
      </section>

      <div class="footer">
        GeminEYE is provided for informational support only and does not replace legal advice. This report should be reviewed by a qualified professional before use in business or legal decisions.
      </div>
    </main>
    <script>
      (function () {
        var button = document.getElementById('themeToggle');
        var label = document.getElementById('themeToggleLabel');
        var icon = document.getElementById('themeToggleIcon');

        function sync(theme) {
          var isDark = theme === 'dark';
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.colorScheme = theme;
          if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
          if (icon) icon.textContent = isDark ? '☀' : '☾';
          if (button) button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        }

        button && button.addEventListener('click', function () {
          var current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
          var next = current === 'dark' ? 'light' : 'dark';
          try {
            window.localStorage.setItem('gemineye-theme', next);
          } catch (error) {}
          sync(next);
        });

        sync(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
      })();
    </script>
  </body>
</html>`;
}

export default function Home() {
  const [contractTitle, setContractTitle] = useState("");
  const [contractText, setContractText] = useState("");
  const [memo, setMemo] = useState<MemoPayload>(SAMPLE_MEMO);
  const [analyzedContractTitle, setAnalyzedContractTitle] = useState("");
  const [hasAnalysisResult, setHasAnalysisResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "unknown" | "configured" | "missing">("unknown");
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [activeReviewArea, setActiveReviewArea] = useState<string | null>(null);
  const reviewAreasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Keyboard shortcuts: Ctrl+Enter to analyze, Esc to clear
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runAnalysis();
      } else if (event.key === "Escape") {
        setActiveReviewArea(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadApiStatus() {
      if (active) {
        setApiStatus("checking");
      }

      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Status check failed.");
        }

        const data = (await response.json()) as { configured?: boolean };
        if (active) {
          setApiStatus(data.configured ? "configured" : "missing");
        }
      } catch {
        if (active) {
          setApiStatus("unknown");
        }
      }
    }

    loadApiStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeReviewArea) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!reviewAreasRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !reviewAreasRef.current.contains(target)) {
        setActiveReviewArea(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeReviewArea]);

  const riskScoreLabel = useMemo(() => {
    if (memo.overallRiskScore === undefined || memo.overallRiskScore === null) {
      return "Risk -";
    }
    const score = Number(memo.overallRiskScore);
    if (isNaN(score)) {
      return "Risk -";
    }
    return `Risk ${score.toFixed(1)} / 10`;
  }, [memo.overallRiskScore]);

  const riskScoreTone = useMemo(() => {
    const score = Number(memo.overallRiskScore);
    if (memo.overallRiskScore === undefined || memo.overallRiskScore === null || isNaN(score)) {
      return "border-line bg-panel-strong text-muted";
    }
    if (score >= 6.5) {
      return "border-red-200 bg-red-50 text-red-700";
    }
    if (score >= 3.5) {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }, [memo.overallRiskScore]);

  const riskTone = (risk: MemoFinding["risk"]) => {
    if (risk === "High") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    if (risk === "Medium") {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  };

  const riskFillTone = (risk: MemoFinding["risk"]) => {
    if (risk === "High") {
      return "bg-red-500";
    }
    if (risk === "Medium") {
      return "bg-amber-500";
    }
    return "bg-emerald-500";
  };

  const riskFillWidth = (risk: MemoFinding["risk"]) => {
    if (risk === "High") {
      return "100%";
    }
    if (risk === "Medium") {
      return "66%";
    }
    return "33%";
  };

  const overallRiskMeta = (() => {
    const score = Number(memo.overallRiskScore);
    if (memo.overallRiskScore === undefined || memo.overallRiskScore === null || Number.isNaN(score)) {
      return {
        tone: "border-line bg-panel-strong text-muted",
        fill: "bg-line",
        percent: 0,
      };
    }

    if (score >= 6.5) {
      return {
        tone: "border-red-200 bg-red-50 text-red-700",
        fill: "bg-red-500",
        percent: Math.min(100, Math.max(0, (score / 10) * 100)),
      };
    }

    if (score >= 3.5) {
      return {
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        fill: "bg-amber-500",
        percent: Math.min(100, Math.max(0, (score / 10) * 100)),
      };
    }

    return {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      fill: "bg-emerald-500",
      percent: Math.min(100, Math.max(0, (score / 10) * 100)),
    };
  })();

  function RiskIcon({ risk }: { risk: MemoFinding["risk"] }) {
    const tone = riskTone(risk);
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

  const resetAll = () => {
    setContractTitle("");
    setContractText("");
    setMemo(SAMPLE_MEMO);
    setAnalyzedContractTitle("");
    setHasAnalysisResult(false);
    setError(null);
    setFileStatus(null);
    setIsExtracting(false);
    setIsFallback(false);
    setActiveReviewArea(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetAnalysis = () => {
    setHasAnalysisResult(false);
    setAnalyzedContractTitle("");
    setError(null);
    setIsFallback(false);
    setActiveReviewArea(null);
  };

  const runAnalysis = async () => {
    if (!contractTitle.trim()) {
      setError("Enter a contract title.");
      return;
    }

    if (!contractText.trim()) {
      setError("Paste contract text to analyze.");
      return;
    }

    setIsLoading(true);
    setError(null);
    let securityEventLogged = false;

    try {
      // Check cache first (sessionStorage)
      const cacheKey = `analysis_${contractTitle}_${contractText.substring(0, 100).replace(/[^a-z0-9]/gi, "")}`;
      const cached = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
      if (cached) {
        const data = JSON.parse(cached) as {
          memo?: MemoPayload;
          fallback?: boolean;
          error?: string;
          contractTitle?: string;
        };
        if (data.memo) {
          const resolvedMemo = data.memo;
          const resolvedContractTitle = (data.contractTitle?.trim() || contractTitle.trim() || "Contract Review");
          const resolvedFallback = data.fallback || false;

          setMemo(resolvedMemo);
          setAnalyzedContractTitle(resolvedContractTitle);
          setIsFallback(resolvedFallback);
          if (data.error) setError(data.error);

          const generatedReportHtml = buildReportHtml({
            contractTitle: resolvedContractTitle,
            contractText,
            memo: resolvedMemo,
            fallback: resolvedFallback,
          });

          // Re-add cached analyses back to the dashboard when the report is opened again.
          if (!resolvedFallback) {
            saveReportToStorage({
              id: `${Date.now()}`,
              title: resolvedContractTitle,
              score:
                resolvedMemo.overallRiskScore === undefined || resolvedMemo.overallRiskScore === null
                  ? null
                  : Number(resolvedMemo.overallRiskScore),
              label: riskLabel(resolvedMemo.overallRiskScore),
              createdAt: new Date().toISOString(),
              findings: resolvedMemo.findings,
              html: generatedReportHtml,
            });
          }

          saveSecurityEvent({
            outcome: resolvedFallback ? "fallback" : "allowed",
            reason: data.error ? data.error : "cached-analysis",
            contractTitle: resolvedContractTitle,
          });
          securityEventLogged = true;

          setHasAnalysisResult(true);
          return;
        }
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractTitle,
          text: contractText,
        }),
      });

      if (!response.ok) {
        let message = `Analysis failed (${response.status}).`;
        let blockedTerms: string[] = [];
        try {
          const errorData = (await response.json()) as { error?: string };
          blockedTerms = (errorData as { blockedTerms?: string[] })?.blockedTerms ?? [];
          if (errorData?.error) {
            message = errorData.error;
          }
        } catch {
          try {
            const fallbackText = await response.text();
            if (fallbackText.trim()) {
              message = fallbackText.trim();
            }
          } catch {
            // Keep the default status-based message.
          }
        }

        const lowerMessage = message.toLowerCase();
        const blockedOutcome: SecurityEvent["outcome"] =
          lowerMessage.includes("moderation") || lowerMessage.includes("blocked") || lowerMessage.includes("rate limit")
            ? "blocked"
            : "error";

        saveSecurityEvent({
          outcome: blockedOutcome,
          reason: message,
          contractTitle,
          blockedTerms,
        });
        securityEventLogged = true;

        throw new Error(message);
      }

      const data = (await response.json()) as {
        memo?: MemoPayload;
        configured?: boolean;
        fallback?: boolean;
        error?: string;
        contractTitle?: string;
      };
      
      // Cache the result
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
          // Storage quota exceeded, silently fail
        }
      }

      if (data.memo) {
        setMemo(data.memo);
      }
      if (data.contractTitle) {
        setAnalyzedContractTitle(data.contractTitle);
      }

      const resolvedMemo = data.memo ?? memo;
      const resolvedContractTitle = (data.contractTitle?.trim() || contractTitle.trim() || "Contract Review");
      const resolvedFallback = typeof data.fallback === "boolean" ? data.fallback : isFallback;

      const generatedReportHtml = buildReportHtml({
        contractTitle: resolvedContractTitle,
        contractText,
        memo: resolvedMemo,
        fallback: resolvedFallback,
      });

      // Do not persist fallback/demo reports to the dashboard storage
      if (!resolvedFallback) {
        saveReportToStorage({
          id: `${Date.now()}`,
          title: resolvedContractTitle,
          score:
            resolvedMemo.overallRiskScore === undefined || resolvedMemo.overallRiskScore === null
              ? null
              : Number(resolvedMemo.overallRiskScore),
          label: riskLabel(resolvedMemo.overallRiskScore),
          createdAt: new Date().toISOString(),
          findings: resolvedMemo.findings,
          html: generatedReportHtml,
        });
      }

      saveSecurityEvent({
        outcome: resolvedFallback ? "fallback" : "allowed",
        reason: data.error ? data.error : "analysis-complete",
        contractTitle: resolvedContractTitle,
      });
      securityEventLogged = true;

      setHasAnalysisResult(true);
      if (typeof data.configured === "boolean") {
        setApiStatus(data.configured ? "configured" : "missing");
      }
      if (typeof data.fallback === "boolean") {
        setIsFallback(data.fallback);
      }
      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      if (!securityEventLogged) {
        saveSecurityEvent({
          outcome: "error",
          reason: err instanceof Error ? err.message : "Analysis failed.",
          contractTitle: contractTitle.trim() || "Untitled contract",
        });
      }
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  };

  function saveReportToStorage(report: {
    id: string;
    title: string;
    score?: number | null;
    label: string;
    createdAt: string;
    findings: SavedFinding[];
    html: string;
  }) {
    try {
      const key = "gemineye_reports";
      const raw = localStorage.getItem(key) || "[]";
      const arr = JSON.parse(raw) as Array<any>;
      arr.unshift(report);
      // keep most recent 200 reports
      const trimmed = arr.slice(0, 200);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch (e) {
      // ignore storage errors
      // (localStorage may be disabled in some private modes)
      // eslint-disable-next-line no-console
      console.warn("Failed to save report to storage", e);
    }
  }

  function saveSecurityEvent(event: Omit<SecurityEvent, "id" | "createdAt">) {
    try {
      const key = "gemineye_security_events";
      const raw = localStorage.getItem(key) || "[]";
      const arr = JSON.parse(raw) as Array<SecurityEvent>;
      arr.unshift({
        ...event,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 500)));
    } catch {
      // ignore storage errors
    }
  }

  const downloadReport = () => {
    if (isFallback) {
      setError("Demo fallback reports cannot be downloaded or saved to the dashboard.");
      return;
    }
    const reportContractTitle = analyzedContractTitle.trim() || contractTitle.trim() || "Contract Review";
    const reportHtml = buildReportHtml({
      contractTitle: reportContractTitle,
      contractText,
      memo,
      fallback: isFallback,
    });
    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (previewWindow) {
      previewWindow.opener = null;
    }

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(reportContractTitle)}-gemineye-report.html`;
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // File size validation
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 10MB.`);
      return;
    }

    setFileStatus("Extracting text...");
    setError(null);
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? "File extraction failed.");
        }
        throw new Error("File extraction failed.");
      }

      const data = (await response.json()) as { text?: string; title?: string };
      setContractText(data.text ?? "");
      if (data.title) {
        setContractTitle(data.title);
      }
      setFileStatus("Text extracted.");
    } catch (err) {
      setFileStatus(null);
      setError(err instanceof Error ? err.message : "File extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  };

  const loadSampleContract = (sample: typeof SAMPLE_CONTRACTS[0]) => {
    setContractTitle(sample.title);
    setContractText(sample.text);
    setFileStatus(null);
    setError(null);
  };

  const downloadReportAsJson = () => {
    if (isFallback) {
      setError("Demo fallback reports cannot be downloaded.");
      return;
    }
    const json = JSON.stringify({
      title: analyzedContractTitle || contractTitle,
      generatedAt: new Date().toISOString(),
      memo,
    }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(analyzedContractTitle || contractTitle).replace(/[^a-z0-9]/gi, "")}-analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const checkApiConnection = async () => {
    setApiStatus("checking");
    try {
      const response = await fetch("/api/status", { method: "GET" });
      if (response.ok) {
        setApiStatus("configured");
      } else {
        setApiStatus("missing");
      }
    } catch {
      setApiStatus("unknown");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
        <section className="paper-hero rounded-3xl border border-line p-5 sm:p-8 md:p-10 soft-shadow rise-in">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-5">
              <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-muted">
                <span className="text-xl leading-none">🕵️⚖️</span>
                <span>
                  GeminEYE
                </span>
              </h2>
              <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
                Review contracts with confidence.
              </h1>
              <p className="max-w-xl text-base text-muted">
                Upload a PDF or DOCX, or paste contract text directly. GeminEYE turns dense agreements into a clear, evidence-backed risk memo by extracting key clauses, scoring the overall picture, and surfacing issues across liability, indemnity, privacy, termination, intellectual property, and venue.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={runAnalysis}
                  disabled={isLoading || hasAnalysisResult}
                  aria-disabled={isLoading || hasAnalysisResult}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    hasAnalysisResult
                      ? "analysis-done-button border border-line bg-panel text-muted"
                      : "btn-inverse button-pop"
                  }`}
                >
                  {isLoading ? "Reviewing..." : hasAnalysisResult ? "Review complete" : "Start review"}
                </button>
                {hasAnalysisResult ? (
                  <>
                    <button
                      onClick={resetAnalysis}
                      className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
                    >
                      Review again
                    </button>
                    {isFallback ? (
                      <span className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink opacity-50 pointer-events-none">
                        Export report
                      </span>
                    ) : (
                      <a
                        href="/dashboard"
                        className="rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
                      >
                        Export report
                      </a>
                    )}
                    <details className="group relative">
                      <summary className="list-none rounded-full border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent cursor-pointer">
                        Advanced
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 w-44 rounded-2xl border border-line bg-white p-2 shadow-lg">
                        {isFallback ? (
                          <span className="block rounded-xl px-3 py-2 text-xs font-semibold text-muted opacity-50">
                            Export JSON
                          </span>
                        ) : (
                          <button
                            onClick={downloadReportAsJson}
                            className="block w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-panel hover:text-accent"
                          >
                            Export JSON
                          </button>
                        )}
                      </div>
                    </details>
                  </>
                ) : null}
                <button
                  onClick={resetAll}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                >
                  Clear all
                </button>
              </div>
              <p className="text-[10px] text-muted italic">
                💡 Keyboard shortcuts: <code className="bg-panel px-1">Esc</code> to close tooltips.
              </p>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                  Common review areas
                </span>
                <p className="text-[11px] text-muted">
                  Hover or tap a label to see what it means.
                </p>
                <div ref={reviewAreasRef} className="grid grid-cols-1 gap-3 text-xs text-muted sm:grid-cols-2 md:grid-cols-3">
                  {REVIEW_AREAS.map((area) => (
                    <div key={area.label} className="relative">
                      <button
                        type="button"
                        onMouseEnter={() => setActiveReviewArea(area.label)}
                        onMouseLeave={() => setActiveReviewArea((current) => (current === area.label ? null : current))}
                        onFocus={() => setActiveReviewArea(area.label)}
                        onBlur={() => setActiveReviewArea((current) => (current === area.label ? null : current))}
                        onClick={() =>
                          setActiveReviewArea((current) => (current === area.label ? null : area.label))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setActiveReviewArea(null);
                          }
                        }}
                        aria-describedby={`review-area-tip-${area.label.toLowerCase()}`}
                        aria-expanded={activeReviewArea === area.label}
                        className="w-full rounded-full border border-line bg-white px-3 py-1 text-center uppercase tracking-[0.2em] transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {area.label}
                      </button>
                      <div
                        id={`review-area-tip-${area.label.toLowerCase()}`}
                        role="tooltip"
                        className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-[min(13rem,calc(100vw-2rem))] max-w-52 -translate-x-1/2 rounded-xl border border-line bg-panel p-2 text-left text-[11px] normal-case tracking-normal text-ink shadow-lg transition duration-150 ${
                          activeReviewArea === area.label
                            ? "visible translate-y-0 opacity-100"
                            : "invisible -translate-y-1 opacity-0"
                        }`}
                      >
                        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-line bg-panel" />
                        {area.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-muted">
                  Contract intake
                </h2>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted">
                      Gemini status
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        apiStatus === "checking"
                          ? "border-line bg-panel text-muted"
                          : apiStatus === "unknown"
                          ? "border-line bg-panel text-muted"
                          : apiStatus === "configured"
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : "border-stone-200 bg-stone-50 text-stone-700"
                      }`}
                    >
                      {apiStatus === "checking"
                        ? "Checking"
                        : apiStatus === "unknown"
                        ? "Not checked"
                        : apiStatus === "configured"
                        ? "Configured"
                        : "Missing"}
                    </span>
                  </div>
                  <button
                    onClick={checkApiConnection}
                    disabled={apiStatus === "checking"}
                    className="text-[10px] font-medium text-accent transition hover:text-accent/80 disabled:text-muted"
                  >
                    Check
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                  <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                    Contract title<span className="text-signal">*</span>
                  </span>
                  <input
                    value={contractTitle}
                    onChange={(event) => setContractTitle(event.target.value)}
                    placeholder="Enter a contract title"
                    required
                    className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                  Upload a PDF, DOCX, or TXT
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="rounded-xl border border-dashed border-line bg-panel-strong p-3 text-sm text-muted"
                  />
                  <span className="text-[10px] text-muted italic">Files over 5MB may take longer to process. Max size is 10MB.</span>
                </label>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">Or try an example:</span>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_CONTRACTS.map((sample) => (
                      <button
                        key={sample.title}
                        type="button"
                        onClick={() => loadSampleContract(sample)}
                        className="sample-contract-button rounded-lg border px-3 py-1.5 text-xs font-medium transition"
                      >
                        {sample.title}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                  Paste contract text
                  <textarea
                    rows={7}
                    placeholder="Paste contract language or a specific clause..."
                    value={contractText}
                    onChange={(event) => setContractText(event.target.value)}
                    className="rounded-xl border border-line bg-white p-3 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </label>
                <ErrorAlert message={error || ""} />
                {fileStatus ? (
                  <div className="rounded-xl border border-signal bg-white px-3 py-2 text-xs text-signal">
                    {fileStatus}
                  </div>
                ) : null}
                <div className="rounded-xl border border-line bg-white px-3 py-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Text extraction</span>
                    <span>{isExtracting ? "Extracting" : "Ready"}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel-strong">
                    <div
                      className={`h-full rounded-full bg-accent transition-all duration-500 ${
                        isExtracting ? "w-3/4" : "w-1/6"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <details className="group flex flex-col rounded-3xl border border-line bg-panel p-6" open>
            <summary className="cursor-pointer list-none text-base font-semibold text-ink">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="text-xs text-muted group-open:hidden">▶</span>
                  <span aria-hidden="true" className="hidden text-xs text-muted group-open:inline">▼</span>
                  Extracted preview
                </span>
                <span className="text-xs text-muted">
                  {contractText.length.toLocaleString()} chars
                </span>
              </div>
            </summary>
            <Suspense fallback={<SkeletonCard />}>
              <pre className="mt-4 flex-1 overflow-x-auto overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-2xl border border-line bg-white p-4 text-xs text-muted">
                {contractText.trim().length > 0
                  ? contractText
                  : "Upload a contract to preview extracted text."}
              </pre>
            </Suspense>
          </details>

          <div className="rounded-3xl border border-line bg-panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                  GeminEYE memo
                </p>
                <h2 className="text-base font-semibold text-ink">
                  Investigator memo
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskScoreTone}`}>
                  {riskScoreLabel}
                </span>
                {hasAnalysisResult ? (
                  <button
                    onClick={downloadReport}
                    disabled={isFallback}
                    aria-disabled={isFallback}
                    className={`rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent ${
                      isFallback ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    Download report
                  </button>
                ) : null}
                {isFallback ? (
                  <button
                    disabled
                    aria-disabled
                    className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink opacity-50 pointer-events-none"
                  >
                    View Dashboard
                  </button>
                ) : (
                  <a
                    href="/dashboard"
                    className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent"
                  >
                    View Dashboard
                  </a>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Overall risk scale</span>
                  <p className="mt-1 text-xs text-muted">Lower to high risk across the memo.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${overallRiskMeta.tone}`}>
                  {riskScoreLabel}
                </span>
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
                    className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${overallRiskMeta.fill}`}
                    style={{ left: `${overallRiskMeta.percent}%` }}
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
                    style={{ left: `${overallRiskMeta.percent}%` }}
                  >
                    {riskScoreLabel.replace(/^Risk\s*/, "")}
                  </div>
                </div>
              </div>
            </div>
            {isFallback ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                <div>Demo fallback: this memo is sample text shown because live analysis failed.</div>
                <div className="mt-1 font-normal text-[11px] normal-case text-amber-900">This demo report cannot be saved to the dashboard or downloaded.</div>
              </div>
            ) : null}
            <div className="mt-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Contract title
              </span>
              <p className="mt-1 text-sm font-medium">
                {analyzedContractTitle || "Add a contract title to display it here."}
              </p>
            </div>
            <div className="mt-4 grid gap-4 text-sm text-muted">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                  Narrative
                </h3>
                <div className="mt-2 grid gap-2 text-sm">
                  {memo.narrative.map((item, index) => (
                    <p key={`${item}-${index}`}>{item}</p>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                  Summary
                </h3>
                <ul className="mt-2 grid gap-2 text-sm">
                  {memo.summary.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                  Findings
                </h3>
                {memo.findings.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <RiskIcon risk={item.risk} />
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                            {item.id}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-ink">
                            {item.category}
                          </div>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${riskTone(item.risk)}`}>
                        {item.risk}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-panel-strong">
                        <div
                          className={`h-full rounded-full ${riskFillTone(item.risk)}`}
                          style={{ width: riskFillWidth(item.risk) }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted">
                        <span>Lower</span>
                        <span>Moderate</span>
                        <span>High</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {item.evidence}
                    </p>
                    <p className="mt-2 text-xs text-ink">
                      {item.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <p className="px-1 text-center text-[11px] leading-5 text-muted wrap-break-word">
          GeminEYE provides informational contract review support only and does not provide legal advice.
          It should not be used as a substitute for a qualified attorney or formal legal review.
        </p>
      </main>
    </div>
  );
}
