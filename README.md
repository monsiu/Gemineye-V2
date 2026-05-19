# GeminEYE 🕵️‍♂️📄

**AI-powered contract risk analyzer.** Upload PDFs, DOCX files, or paste contract text. GeminEYE extracts clauses, scores risk, and delivers structured investigator-style memos with evidence-backed findings and negotiation-ready recommendations.

Built for legal teams, compliance officers, and contract negotiators who need intelligent contract analysis powered by Gemini 3.1 Pro Preview.

## Hackathon Tracks Covered

GeminEYE now maps directly to three of the hackathon tracks:

- **Track 1: Agent Security & AI Governance** - prompt-injection detection, moderation guardrails, redaction, rate limiting, and a local audit trail of blocked and allowed analysis events.
- **Track 2: AI Agents with Google AI Studio** - Gemini-powered contract analysis, long-context document processing, structured memo generation, and investigator-style reasoning for enterprise workflows.
- **Track 4: Data & Intelligence** - contract/document intelligence over uploaded files, extracted findings, dashboard analytics, and structured risk insights that turn unstructured text into actionable intelligence.

The project is primarily positioned for **Track 1** with strong **Track 2** and **Track 4** fit because it combines Gemini reasoning, document intelligence, and a trust layer that logs and surfaces security outcomes.

The demo also includes a visible blocked-rate metric and an exportable security audit trail, which makes the guardrail impact easy to show  .

## Hackathon Disclosure

This project uses **Gemini 3.1 Pro Preview via a proxy (AI/ML API)**. While the underlying model is Gemini, requests are routed through the proxy rather than directly to the Gemini API.

This approach was taken due to access and billing limitations encountered with the direct Gemini integration during development. No model behavior or functionality is altered-only the request routing layer differs.

The system is designed to be provider-agnostic. To switch to a direct Google Gemini setup, update the environment variables and the base URL in the analysis endpoint.

## Legal Disclaimer

GeminEYE is provided for informational and educational purposes only. It does not provide legal advice, legal representation, or a substitute for a qualified attorney or formal legal review. Any output should be reviewed independently before being relied on for business or legal decisions.

---

## 🎯 Features

- **Multi-format intake** - PDF, DOCX, TXT, or paste raw contract text
- **Intelligent extraction** - Automatically pull contract language and structure
- **Risk categorization** - Liability, indemnity, data privacy, termination, IP, venue
- **Structured memo output** - Narrative, summary, and granular findings with recommendations
- **Risk scoring** - Overall risk score on a 0–10 scale
- **Real-time analysis** - Powered by Gemini 3.1 Pro Preview via AI/ML API
- **Guardrails and governance** - Prompt-injection detection, moderation, redaction, and rate limiting
- **Security audit trail** - Local event log for allowed, blocked, fallback, and error outcomes
- **Fallback support** - Sample memos when API is unavailable

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
Upload a file (PDF, DOCX, TXT) or paste contract language directly in the text area.

### 2. **Text Extraction**
GeminEYE extracts and cleans text from documents, removing extra whitespace and normalizing formatting.

### 3. **AI Analysis**
The contract is sent to Gemini 3.1 Pro Preview via AI/ML API. The model:
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

---

## 🔧 Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- AI/ML API account with Gemini access
- Gemini API Key (optional, for direct Gemini linking) refer to [#hackathon-disclosure](https://github.com/monsiu/GeminEYE#hackathon-disclosure) above.

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
AI_ML_API_AUTH_HEADER=Authorization
AI_ML_API_AUTH_SCHEME=Bearer

# Gemini fallback (optional)
GEMINI_API_KEY=your_gemini_key_here
```

### Provider Swap

To use **AI/ML API**:
- Keep `AI_ML_API_BASE_URL=https://api.aimlapi.com`
- Keep `AI_ML_API_MODEL=google/gemini-3-1-pro-preview`

To use **direct Gemini API** instead:
- Point the base URL to the Gemini endpoint
- Replace the auth header and model settings to match Google’s Gemini API requirements
- Keep the same analysis UI and memo format so the demo behavior stays the same

For the hackathon submission, this lets you clearly disclose that the current build uses AI/ML API while still showing the underlying Gemini model choice.

#### Getting API Keys

1. **AI/ML API**
   - Sign up at [aimlapi.com](https://aimlapi.com)
   - Go to dashboard → Generate API Key
   - Set model to `google/gemini-3-1-pro-preview`

2. **Gemini (optional fallback)**
   - Create a Google Cloud project
   - Enable Generative Language API
   - Create an API key from Credentials

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
  "error": null
}
```

---

## 🏗 Architecture

### Tech Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js API Routes (Node.js runtime)
- **LLM:** Gemini 3.1 Pro Preview via AI/ML API
- **PDF/DOCX Parsing:** pdfjs-dist, mammoth
- **Styling:** CSS custom properties + Tailwind design tokens

### File Structure
```
gemineye/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts          # AI analysis endpoint
│   │   │   └── extract/route.ts          # Document extraction
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

---

## Bugs & Troubleshooting

### "AI/ML API returned invalid JSON format"
- ✅ Verify `AI_ML_API_KEY` and `AI_ML_API_MODEL` are in `.env.local`
- ✅ Check model ID matches AI/ML API catalog (`google/gemini-3-1-pro-preview`)
- ✅ Restart `npm run dev` after env changes

### PDF extraction fails
- ✅ Ensure file is valid and under 10 MB
- ✅ Try a different PDF to isolate the issue
- ✅ Check browser console (F12) for details

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

## 🔐 Security & Privacy

- Contract text is sent to AI/ML API and Gemini for processing
- No data is permanently stored on the server
- Analyze in fallback mode (sample data) if you prefer to avoid external API calls
- Always review AI recommendations—they complement but don't replace legal review

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

MIT License — See LICENSE for details.

---

## Open Source

This project is released under the MIT License. You may copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, provided you include the original copyright and license notice in any substantial portions of the software.

For the full license text, see the `LICENSE` file.

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
| **Live Demo** | [🔗 gemineye-production.up.railway.app](https://gemineye-production.up.railway.app) |
| **GitHub Repo** | [🔗 github.com/monsiu/gemineye](https://github.com/monsiu/gemineye) |
| **Issues & Feedback** | [🔗 GitHub Issues](https://github.com/monsiu/GeminEYE/issues) |
| **API Documentation** | [🔗 docs.aimlapi.com](https://docs.aimlapi.com) |
| **Gemini Docs** | [🔗 ai.google.dev](https://ai.google.dev) |

---
