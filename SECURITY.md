# Security

## Who uses CreatorDesk

| User | Role | Can do |
|---|---|---|
| **Creator** (solo) | Owner | Everything in their workspace |
| **Talent manager / agency** | Owner | Everything, across the creators they manage |
| **Assistant / team member** | Manager | Edit deals, invoices and payments. Not invoice details, team or AI settings. |
| **Accountant / CA** | Viewer | Read only. Sees a masked PAN. |
| **Brands** | No account | Never log in. Their contact details and GSTIN are stored by the creator. |

## Data we hold and how sensitive it is

| Data | Sensitivity | Protection |
|---|---|---|
| PAN | **High** (government identifier) | Encrypted in the database (AES-256-GCM, fresh IV per value) in the workspace and in invoice snapshots. Masked for non-owners. Never written to the audit log. |
| Income, invoices, payments, TDS | High (financial) | Workspace isolation, roles, audit log |
| Brand contacts (names, phones, emails) | Medium (third-party personal data) | Workspace isolation; only sent to WhatsApp or email when the user clicks |
| GSTIN, UPI ID, addresses | Low to medium (GSTINs are public and must appear on invoices) | Workspace isolation |
| Pasted brand briefs (AI) | Medium | Sent to Google Gemini only when AI is on and the user clicks. Never stored or logged. |
| Email address, sign-in tokens | Medium | Auth.js; no passwords stored |

A GSTIN contains its holder's PAN (characters 3–12) by design. For GST-registered users the PAN is therefore already public, and the encryption mainly protects creators who aren't registered.

## Threats and controls

| Threat | Control | Where it's tested |
|---|---|---|
| **One customer reads another's data** (broken access control / IDOR) | Every query is filtered by the workspace taken from the server session, never from the request. The active-workspace cookie can only pick among the user's own memberships. | `tests/integration/tenancy.test.ts`, `payments.test.ts` |
| **Privilege escalation inside a team** | Roles checked on the server for every write. Owner-only: invoice details, team, AI, export, deletion. The last owner can't be removed or demoted. | `tenancy.test.ts`, `settings.test.ts` |
| **Account takeover through invites** | Invites are matched by email, so sign-in must prove the email: magic links prove it, and Google accounts must have `email_verified`. Automatic account linking is off. The passwordless dev login only works outside production. | `lib/auth.ts` |
| **Stolen or stale session** | JWT sessions last 7 days and refresh daily. Membership is re-checked on every request, so removal takes effect at once. A deleted user's token is rejected. Cookies are HttpOnly, SameSite=Lax, and Secure in production. | `lib/tenancy.ts` |
| **CSRF** | Server Actions check Origin against Host (built into Next.js). State changes only happen via Server Actions or POST with a secret. GET routes only read the caller's own data. | Next.js |
| **XSS** | React escapes all output. No `dangerouslySetInnerHTML` or `eval`. CSP blocks third-party scripts, plugins and framing. | `next.config.ts` |
| **Clickjacking** | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | Headers |
| **Injection** | Prisma parameterises all queries. The two raw SQL statements use tagged templates, which are also parameterised. zod validates every input, with length limits. | `lib/validation.ts`, `lib/schemas.ts` |
| **Spreadsheet formula injection** (CSV export) | Cells starting with `= + - @` are escaped | `app/api/reports/tax/route.ts` |
| **Abuse: email bombing, spam, cost** | Rate limits stored in Postgres, keyed on hashed values: 5 sign-in emails per address per hour, 20 per IP per hour, 10 waitlist sign-ups per IP per hour. AI: 6 per user per minute and 30 per workspace per day. | `security.test.ts`, `ai.test.ts` |
| **AI prompt injection** | The brief is marked as untrusted, output is limited to a fixed schema and validated, and a human reviews before saving. Risk rules are code, not AI. The eval includes injection cases. | `tests/evals` |
| **Scheduled-job abuse** | `POST /api/cron/digest` requires a bearer secret of at least 32 characters, compared in constant time. Repeated runs don't double-send. | `settings.test.ts` |
| **Duplicate or tampered invoices** | Gap-free numbering in a locked transaction; issued invoices keep a snapshot of their details; voiding keeps the number | `invoices.test.ts` |
| **Repudiation** ("who changed this?") | Audit log written in the same transaction as each change, with before and after values | `tenancy.test.ts` |
| **Vulnerable dependencies** | Dependabot runs weekly, and CI fails on critical advisories in shipped packages | `.github/` |
| **Information leakage** | Production errors are generic. AI errors log only the status and model. Security headers are set and `X-Powered-By` is removed. | Headers |

## Privacy (DPDP Act, 2023)

- **Access:** owners export all workspace data as JSON (Settings → Your data).
- **Erasure:** delete a workspace, or your own account. Deleting your account removes workspaces you own alone and refuses to orphan a shared one.
- **Minimisation:** no passwords, bank numbers or card data. Rate-limit keys are one-way hashes.
- **Third parties:** hosting and database (Render, Neon), email (Resend), AI only when switched on (Google Gemini), and Google sign-in.

## Operating it safely

- Keep `DATA_ENCRYPTION_KEY`, `AUTH_SECRET` and `CRON_SECRET` in the host's secret store only. **Back up `DATA_ENCRYPTION_KEY`:** without it, stored PANs can't be read.
- Use separate database roles: a migration role that owns the schema, and an app role with data access only.
- Turn on Neon's point-in-time restore. Check a restore once before launch.
- Switch to a paid Gemini key before real customers use AI. On the free tier, Google may use inputs to improve its products.
- Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app (Render: 1) so rate limits see the real client IP.

## Not done yet

- **Postgres row-level security** as a second layer under the application's workspace checks
- **Two-factor sign-in.** Magic links and Google cover most risk for now.
- **Per-request CSP nonces.** Partial prerendering prevents them, so inline scripts are allowed. Revisit when Next.js supports nonces with Cache Components.
- **Key rotation tooling** for `DATA_ENCRYPTION_KEY`. The `v1` prefix is in place for it.
- An external penetration test before handling large customer volumes

## Reporting a vulnerability

Please email the maintainer privately, not in a public issue. We aim to reply within 3 working days.
