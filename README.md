# GeminEYE 🕵️‍♂️📄

**AI-powered contract risk analyzer with voice intake, open-source model fallback, and automated alerts.** Upload PDFs, DOCX files, paste contract text, or transcribe audio via Speechmatics. GeminEYE extracts clauses, scores risk, and delivers structured investigator-style memos with evidence-backed findings. AI/ML API is tried first, Featherless open-source models are tried next, Gemini is the final fallback, and high-risk scores can trigger Resend email alerts.

Built for legal teams, compliance officers, and contract negotiators who need fast, structured contract analysis powered by AI/ML API, Featherless open-source models, Gemini fallback, Speechmatics transcription, and Resend alerts.

## Highlights

- **Multi-format intake** - PDF, DOCX, TXT, paste raw text, or transcribe audio
- **Structured memo output** - Narrative, summary, and granular findings with recommendations
- **Risk scoring** - Overall risk score on a 0–10 scale
- **Speechmatics voice intake** - Batch transcription for uploaded audio files
- **Resend alerts** - Email escalation when risk scores exceed your threshold
- **Provider failover** - AI/ML API primary, Featherless open-source fallback/helper, Gemini final fallback
- **Guardrails and governance** - Prompt-injection detection, moderation, redaction, and rate limiting
- **Security audit trail** - Local event log for allowed, blocked, fallback, and error outcomes

## AI Agent Olympics Hackathon (May 13-20, 2026)

The AI Agent Olympics Hackathon runs during Milan AI Week and focuses on enterprise-grade autonomous agents.

**Prize tracks targeted (excluding Kraken):** Vultr, Google Gemini, Featherless, Speechmatics. We are not targeting the Kraken trading track.

### Track alignment

- **Intelligent Reasoning** - structured, evidence-backed risk memos and scoring.
- **Agentic Workflows** - automated guardrails, alerting, and audit logs.
- **Enterprise Utility** - real contract review workflows for ops, legal, and procurement.
- **Multimodal Intelligence** - PDF/DOCX ingestion plus Speechmatics audio transcription.

### Featherless challenge fit

- **Domain-specialized:** contract-risk review for liability, indemnity, privacy, termination, IP, and venue.
- **Async-first workflow:** Speechmatics batch jobs, background-style provider failover, local audit trails, and Resend event alerts for high-risk scores.
- **Open-source ready:** MIT license, reproducible prompts, provider priority, and environment-only secrets.
- **Production-shaped:** typed API routes, guarded inputs, provider attempts, HTML/JSON exports, dashboard auditability, and deployable Next.js runtime.

Deployment is planned for Vultr at the end of the build cycle.

## Hackathon Disclosure

This project is a domain-specialized contract-risk agent with provider-swappable inference. It tries AI/ML API first, then Featherless open-source models through an OpenAI-compatible API, then direct Gemini. Speechmatics handles async audio transcription, Resend handles event-driven risk alerts, and every report export records the provider/model/intake/alert trail for hackathon judging.

## Legal Disclaimer

GeminEYE is provided for informational and educational purposes only. It does not provide legal advice, legal representation, or a substitute for a qualified attorney or formal legal review. Any output should be reviewed independently before being relied on for business or legal decisions.

---

## 🌐 Live Demo

**[🔗 View Live](https://gemineye-v1.up.railway.app)**

---

## 🚀 Quick Start

### Local Development

```bash
# Clone and install
git clone https://github.com/monsiu/gemineye.git
cd gemineye
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your AI/ML API key

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 How It Works

### 1. **Contract Intake**
Upload a file (PDF, DOCX, TXT), paste contract language directly in the text area, or transcribe audio using Speechmatics.

### 2. **Text Extraction**
GeminEYE extracts and cleans text from documents, removing extra whitespace and normalizing formatting.

### 3. **AI Analysis**
The contract is routed through the provider chain: AI/ML API first, Featherless open-source models second, and direct Gemini last. The first provider that returns valid memo JSON is used. The model:
- Identifies high-risk clauses
- Categorizes findings (liability, indemnity, data privacy, etc.)
- Scores overall risk (0–10)
- Provides evidence quotes and recommendations

### 4. **Structured Memo**
Results are formatted as an investigator-style memo:
- **Narrative** - Plain-language reasoning
- **Summary** - Key findings at a glance
- **Findings** - Granular risk items with evidence and recommendations
- **Risk Score** - Overall exposure rating

### 5. **Risk Alerts**
If the overall risk score exceeds your threshold, Resend sends an email alert to the configured recipients.

### 6. **Provider Trail**
The UI, dashboard, JSON export, HTML report, and Resend email include AI/ML API, Featherless, Gemini, Speechmatics, and Resend status chips so judges can see exactly which route handled the run.

---

## 🔧 Setup

### Prerequisites
- Node.js 20.9+
- npm or yarn
- AI/ML API account with Gemini access
- Gemini API Key (optional, for direct Gemini linking) refer to [#hackathon-disclosure](https://github.com/monsiu/GeminEYE#hackathon-disclosure) above.
- Optional: Featherless, Speechmatics, and Resend API keys for open models, transcription, and alerting.

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# AI/ML API
AI_ML_API_KEY=your_api_key_here
AI_ML_API_MODEL=google/gemini-3-1-pro-preview
AI_ML_API_BASE_URL=https://api.aimlapi.com
AI_ML_API_COMPLETIONS_URL=
AI_ML_API_AUTH_HEADER=Authorization
AI_ML_API_AUTH_SCHEME=Bearer
AI_ML_API_MAX_TOKENS=4096
AI_PROVIDER_PRIORITY=aiml,featherless,gemini

# Gemini fallback (optional)
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MAX_OUTPUT_TOKENS=2048

# Featherless open-source fallback/helper
FEATHERLESS_API_KEY=your_featherless_key_here
FEATHERLESS_MODEL=your_featherless_model_id
FEATHERLESS_FALLBACK_MODELS=
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_MAX_TOKENS=4096
FEATHERLESS_APP_URL=http://localhost:3000
FEATHERLESS_APP_TITLE=GeminEYE

# Speechmatics (optional)
SPEECHMATICS_API_KEY=your_speechmatics_key_here
SPEECHMATICS_BASE_URL=https://eu1.asr.api.speechmatics.com/v2
SPEECHMATICS_LANGUAGE=en
SPEECHMATICS_OPERATING_POINT=enhanced
SPEECHMATICS_DIARIZATION=none

# Resend alerts (optional)
RESEND_API_KEY=your_resend_key_here
RESEND_FROM="GeminEYE Alerts <alerts@yourdomain.com>"
RESEND_TO=you@example.com,ops@example.com
RESEND_RISK_THRESHOLD=7.5
```

### Provider Swap

Provider priority is: **AI/ML API -> Featherless -> Gemini** by default. The API records every provider attempt and only returns the demo fallback after all configured providers fail. You can override the order with `AI_PROVIDER_PRIORITY=aiml,featherless,gemini`.

To use **AI/ML API**:
- Keep `AI_ML_API_BASE_URL=https://api.aimlapi.com`
- Keep `AI_ML_API_MODEL=google/gemini-3-1-pro-preview`

To use **Featherless** (open-source models):
- Set `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`, and `FEATHERLESS_BASE_URL`
- Optionally set `FEATHERLESS_FALLBACK_MODELS` as a comma-separated list for backup open-source model IDs
- Move `featherless` earlier in `AI_PROVIDER_PRIORITY` only if you want it to run before AI/ML API

To use **direct Gemini API** instead:
- Set `GEMINI_API_KEY`
- Optionally set `GEMINI_MODEL` and `GEMINI_MAX_OUTPUT_TOKENS`
- Keep it last in `AI_PROVIDER_PRIORITY` when you want AI/ML API and Featherless tried first

For the hackathon submission, this lets you clearly disclose which provider is active while keeping the app provider-agnostic.

#### Getting API Keys

1. **Gemini**
   - Create a Google Cloud project
   - Enable Generative Language API
   - Create an API key from Credentials
   
2. **AI/ML API**
   - Sign up at [aimlapi.com](https://aimlapi.com)
   - Go to dashboard → Generate API Key
   - Set model to `google/gemini-3-1-pro-preview`


3. **Featherless (optional open-source models)**
  - Create an account at [featherless.ai](https://featherless.ai)
  - Generate an API key and choose a model from the catalog

4. **Speechmatics (optional transcription)**
  - Create an account at [speechmatics.com](https://speechmatics.com)
  - Generate an API key from the Speechmatics portal

5. **Resend (optional alerts)**
  - Create an account at [resend.com](https://resend.com)
  - Create an API key and verify your sending domain

### Development

```bash
npm run dev       # Start dev server
npm run build     # Build for production
npm run start     # Run production build
npm run lint      # Check code quality
```

---

## 📡 API Endpoints

### `POST /api/extract`
Extract and clean text from uploaded files.

**Request:**
```bash
curl -X POST http://localhost:3000/api/extract \
  -F "file=@contract.pdf"
```

**Response:**
```json
{
  "title": "contract",
  "text": "Cleaned contract text..."
}
```

**Supported formats:** PDF, DOCX, TXT, MD  
**Max file size:** 10 MB

---

### `POST /api/transcribe`
Transcribe an audio file using Speechmatics.

**Request:**
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -F "file=@meeting.wav"
```

**Response:**
```json
{
  "jobId": "a1b2c3d4e5",
  "status": "completed",
  "text": "Transcribed audio text..."
}
```

**Supported formats:** WAV, MP3, M4A, OGG, FLAC  
**Max file size:** 25 MB

---

### `POST /api/analyze`
Analyze contract text and generate structured memo.

**Request:**
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "contractTitle": "MSA - Acme Corp",
    "text": "Contract language here..."
  }'
```

**Response:**
```json
{
  "contractTitle": "MSA - Acme Corp",
  "memo": {
    "narrative": ["Plain language reasoning..."],
    "summary": ["Key finding 1...", "Key finding 2..."],
    "findings": [
      {
        "id": "R-01",
        "risk": "High",
        "category": "Liability",
        "evidence": "Section 9.2 caps only indirect damages...",
        "recommendation": "Align direct damages under cap..."
      }
    ],
    "overallRiskScore": 7.8
  },
  "fallback": false,
  "keyLoaded": true,
  "provider": "featherless",
  "providerLabel": "Featherless open-source",
  "providerModel": "your_featherless_model_id",
  "providerPriority": ["aiml", "featherless", "gemini"],
  "attempts": [
    { "provider": "aiml", "label": "AI/ML API Gemini", "ok": false, "model": "google/gemini-3-1-pro-preview" },
    { "provider": "featherless", "label": "Featherless open-source", "ok": true, "model": "your_featherless_model_id" }
  ],
  "alert": {
    "provider": "resend",
    "status": "sent",
    "threshold": 7.5,
    "score": 8.2,
    "recipients": 1
  },
  "error": null
}
```

---

## 🏗 Architecture

### Tech Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js API Routes (Node.js runtime)
- **LLM:** AI/ML API primary, Featherless open-source fallback/helper, Gemini final fallback
- **Speech-to-Text:** Speechmatics batch transcription API
- **Alerts:** Resend email API with threshold-based escalation
- **PDF/DOCX Parsing:** pdfjs-dist, mammoth
- **Styling:** CSS custom properties + Tailwind design tokens

### File Structure
```
gemineye/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts          # AI analysis endpoint
│   │   │   ├── extract/route.ts          # Document extraction
│   │   │   └── transcribe/route.ts       # Speechmatics transcription
│   │   ├── globals.css                   # Design system & theme
│   │   ├── layout.tsx                    # Root layout
│   │   └── page.tsx                      # Main UI component
│   └── ...
├── public/                               # Static assets
├── .env.local                            # Environment variables
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

---

## 🎨 Design & UX

- **Investigator-style aesthetic** — Paper-inspired hero with soft shadows and editorial typography
- **Structured intake panel** — Upload, paste, or select contract title in one place
- **Live extraction feedback** — Progress indicator during file processing
- **Risk visualization** — Color-coded categories for quick scanning
- **Responsive layout** — Desktop-first, fully responsive design

---

## 🔒 Security & Secrets Management

This project uses environment variables for API keys. **Never commit `.env.local` with real credentials.**

### Guidelines

- **`.env.local`** - Local file with your real API keys (listed in `.gitignore`, not committed)
- **`.env.local.example`** - Template with placeholder values, safe to commit
- **Copy and fill**: `cp .env.local.example .env.local` and add your actual keys

### Pre-commit Secret Check

Before pushing code, run the secret-scan helper to catch accidental credential commits:

```bash
npm run check-secrets
```

Or manually:

```bash
node scripts/check-secrets.js
```

This scans staged files for common API key patterns and warns you before commit.

### Data Handling

- Contract text is sent to AI/ML API first, Featherless second, or Gemini last depending on configured provider availability
- Speechmatics audio is sent to Speechmatics for transcription
- Resend alerts only include summary highlights (not full contract text)
- No data is permanently stored on the server
- Analyze in fallback mode (sample data) if you prefer to avoid external API calls
- Always review AI recommendations—they complement but don't replace legal review

---

## Troubleshooting

### "AI/ML API returned invalid JSON format"
- ✅ Verify `AI_ML_API_KEY` and `AI_ML_API_MODEL` are in `.env.local`
- ✅ Check model ID matches AI/ML API catalog (`google/gemini-3-1-pro-preview`)
- ✅ Restart `npm run dev` after env changes

### Featherless is skipped or not visible
- Confirm `FEATHERLESS_API_KEY` and `FEATHERLESS_MODEL` are set
- Keep `FEATHERLESS_BASE_URL=https://api.featherless.ai/v1`
- Check the dashboard/report provider trail; Featherless runs after AI/ML API by default and before Gemini
- Use `FEATHERLESS_FALLBACK_MODELS=model_a,model_b` to try backup open-source models

### PDF extraction fails
- ✅ Ensure file is valid and under 10 MB
- ✅ Try a different PDF to isolate the issue
- ✅ Check browser console (F12) for details

### Speechmatics transcription fails
- ✅ Confirm `SPEECHMATICS_API_KEY` is set and valid
- ✅ Ensure the audio file is under 25 MB
- ✅ Try WAV or MP3 if a format is rejected

### Resend alert not sent
- ✅ Confirm `RESEND_API_KEY`, `RESEND_FROM`, and `RESEND_TO` are set
- ✅ Ensure the risk score exceeds `RESEND_RISK_THRESHOLD`
- ✅ Verify the sending domain is verified in Resend

### Risk score not displaying
- ✅ Ensure model returns `overallRiskScore` as a number
- ✅ Check server logs for parsing errors
- ✅ Verify response includes all required memo fields

### "Ensure that the `standardFontDataUrl` API parameter is provided"
- ⚠️ This is a PDF.js warning—does not affect extraction
- Safe to ignore; extraction still works normally

---

## 📊 Risk Categories

GeminEYE analyzes contracts across these dimensions:

| Category | Focus |
|----------|-------|
| **Liability** | Caps, scope, exclusions, direct vs. indirect |
| **Indemnity** | Reciprocal protection, scope, third-party claims |
| **Data Privacy** | Breach notification, GDPR/CCPA, data handling |
| **Termination** | Notice periods, termination for convenience, payment obligations |
| **IP** | Ownership, licensing, work-for-hire, background IP |
| **Venue** | Governing law, jurisdiction, dispute resolution |

---

## 📦 Dependencies

Key packages:
- `next` — React framework
- `react` — UI library
- `typescript` — Type safety
- `tailwindcss` — Styling (v4)
- `pdfjs-dist` — PDF text extraction
- `mammoth` — DOCX text extraction

See `package.json` for the complete list.

---

## 📝 License

MIT License. See LICENSE for details.

---

## 🤝 Contributing

Contributions welcome! Fork the repo, create a feature branch, and submit a PR.

```bash
git checkout -b feature/your-feature
git add .
git commit -m "Add your feature"
git push origin feature/your-feature
```

---

## 📧 Support & Links

| Link | URL |
|------|-----|
| **Live Demo** | [🔗 gemineye-v1.up.railway.app](https://gemineye-v1.up.railway.app) |
| **GitHub Repo** | [🔗 github.com/monsiu/gemineye](https://github.com/monsiu/gemineye) |
| **Issues & Feedback** | [🔗 GitHub Issues](https://github.com/monsiu/GeminEYE/issues) |
| **API Documentation** | [🔗 docs.aimlapi.com](https://docs.aimlapi.com) |
| **Gemini Docs** | [🔗 ai.google.dev](https://ai.google.dev) |
| **Featherless Docs** | [🔗 featherless.ai/docs](https://featherless.ai/docs/overview) |
| **Speechmatics Docs** | [🔗 docs.speechmatics.com](https://docs.speechmatics.com/) |
| **Resend Docs** | [🔗 resend.com/docs](https://resend.com/docs) |

---
