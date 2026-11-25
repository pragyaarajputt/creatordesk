# CreatorDesk

Track every brand collab from pitch to payment, and get paid on time. Built for Indian creators and talent managers.

**Live:** https://creatordesk-gray.vercel.app (pilot: sign-in is being set up, so the landing page and waitlist are open for now)

**Status:** MVP feature-complete and tested.

## Features

| Area | What it does |
|---|---|
| **Deals** | Pipeline from Pitched to Paid (plus Lost and Cancelled). Paid, barter and hybrid deals, usage rights, payment terms. |
| **Deliverables** | Reels, stories and posts per deal, with due dates and status. The dashboard shows the next 7 days. |
| **Invoices** | GST tax invoice or bill of supply, plus PDF download. CGST + SGST within a state, IGST across states. Amount in words. Advance and balance invoices. Void keeps the number. |
| **Payments** | Record full or partial payments with the TDS the brand deducted. Status and deal stage update automatically. |
| **Reminders** | Overdue detection with polite, firm and final messages. Opens a pre-filled WhatsApp or email; you press send. Reminder history is kept. |
| **Daily digest** | Morning email of overdue invoices and upcoming deliverables, at most once per workspace per day. |
| **Dashboard** | Received this month and this financial year, overdue, average days to get paid, 6-month chart, top brands, and a tax summary with a CSV for your CA. |
| **Agency mode** | Multiple creators per workspace, deals assigned to creators, pipeline filtered by creator. |
| **Team** | Owner, manager and viewer roles. Invite by email; access is granted at first sign-in. |
| **Privacy** | Export all data (JSON), delete the workspace, audit log of every change, privacy and terms pages. |
| **AI brief reader** | Paste a brand's DM, email or brief (English or Hinglish). AI fills the deal (brand, fee, deliverables, dates, usage, payment terms, contact) and flags risky terms: lifetime usage, paid ads, long exclusivity, 60+ day payment, performance-only pay, unlimited revisions, content ownership. Off by default; nothing saves until you review. |
| **Sign-in** | Google, email magic link (Resend), and a passwordless email login for local development only. |

## Engineering decisions

| Decision | Why |
|---|---|
| **Money stored as integer paise** | No floating-point errors. Rates are stored in basis points (18% = `1800`). |
| **Every query scoped by `workspaceId`** | Integration tests prove one workspace can't read or change another's deals, invoices or payments. |
| **Gap-free invoice numbers** | An atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` on a counter row, inside the invoice transaction. Tested with 20 concurrent invoices: numbers 001–020, no gaps. A failed invoice rolls back its number, and voiding keeps it. |
| **Indian financial year in IST** | Numbering restarts on 1 April IST. The GST 16-character limit caps the prefix at 3 letters (`ABC/2026-27/9999`). |
| **Snapshots on invoices** | Supplier and brand details are copied onto the invoice at issue, so later edits never change an issued invoice. |
| **Idempotent side effects** | Reminders are unique per invoice, kind and channel. The digest is unique per workspace per day. Both are enforced by database constraints, not just application code. |
| **Audit log in the same transaction** | Every change records who made it, with before and after values. It can't drift from the data it describes. |
| **Safe CSV export** | Cells that start with `= + - @` are escaped so a spreadsheet can't run them as formulas. |
| **Security headers** | `X-Frame-Options`, `nosniff`, HSTS, a strict referrer policy, a permissions policy, and the `X-Powered-By` header removed. |
| **Forms keep input on error** | React 19 resets forms after a server action, so actions return the submitted values for the fields to refill. |

## AI design

| Decision | Why |
|---|---|
| **AI extracts facts, code judges risk** | Gemini only fills a fixed schema of facts. Red flags come from plain, tested rules (e.g. payment over 45 days). Up to three extra concerns the AI notices are shown separately and labelled "AI noticed". |
| **Structured output, validated twice** | A JSON Schema generated from the zod schema constrains Gemini's answer; the same zod schema then validates it, and the deal form validates it again before saving. |
| **Human in the loop** | AI only pre-fills the form. Nothing is saved until the user checks it and presses Create deal. |
| **Prompt-injection resistant** | The brief is wrapped and marked as untrusted. The eval includes three injection attempts ("ignore previous instructions…"); output is schema-limited, so the worst case is a wrong value the user can see and fix. |
| **Resilient on the free tier** | 3 attempts per model with backoff and jitter on overload, then a fallback model, all within a 45 s budget. A rate limit skips straight to the fallback. Unit-tested with a fake SDK. |
| **Privacy and cost controls** | Off by default per workspace (owners only). Only pasted text is sent. Audit log records model, size and flags, never the text. 30 reads per workspace per day. |
| **Measured, not assumed** | `npm run eval` runs 40 labelled briefs (English, Hinglish, formal POs, WhatsApp-style, injections) and reports field accuracy and red-flag precision/recall. Results are in `tests/evals/last-report.json`. |

## Stack

- **App:** Next.js 16 (App Router, Cache Components, Server Actions), React 19, TypeScript (strict)
- **UI:** Tailwind CSS 4, shadcn/ui
- **Database:** PostgreSQL, Prisma 7 (driver adapter)
- **Sign-in:** Auth.js v5 (JWT sessions)
- **Validation:** zod 4
- **PDF:** pdf-lib
- **AI:** Google Gemini (`@google/genai`), structured JSON output
- **Tests:** Vitest (unit, plus integration against real Postgres) and Playwright (end to end in Chrome, at phone width)
- **CI:** GitHub Actions (lint, type-check, tests, build, end to end), plus a scheduled daily-digest workflow

## Run locally

```bash
cp .env.example .env               # fill in DATABASE_URL, TEST_DATABASE_URL, AUTH_SECRET
npm install
npm run db:migrate                 # create tables in the dev database
npm run db:test:migrate            # create tables in the test database
npm run dev                        # http://localhost:3000. Use "Dev sign in" with any email.
```

| Script | What it does |
|---|---|
| `npm test` | Unit and integration tests |
| `npm run eval` | Live AI accuracy check on 40 labelled briefs (needs `GEMINI_API_KEY`, about 5 minutes on the free tier) |
| `npm run test:e2e` | Browser test of the full path from pitch to paid (stop `npm run dev` first) |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run db:deploy` | Apply migrations in production |

## Known limits

- **Agency deals can't be bulk-edited** yet.
- **No Instagram API.** Stats for media kits are entered by hand (Meta app review comes later).
- **Not tax advice.** GST and TDS amounts follow the rates the user picks. Have a CA review the invoice format once before going live.
