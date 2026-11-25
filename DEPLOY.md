# Deploying CreatorDesk (free tiers)

CreatorDesk is a standard Next.js Node server plus Postgres. Everything below has a free tier.
Each step needs an account that you create yourself.

## 1. Database: Neon (free)

1. Create a project at neon.tech, in region **AWS ap-south-1 (Mumbai)**, which is closest to Indian users.
2. Copy two connection strings:
   - the **pooled** one → `DATABASE_URL`
   - the **direct** one → `DATABASE_URL_UNPOOLED` (used for migrations)

## 2. Email: Resend (free)

1. Create an account at resend.com and **verify a domain** you own. Until a domain is verified, Resend only delivers to your own address.
2. Create an API key and set it as both `AUTH_RESEND_KEY` (sign-in links) and `RESEND_API_KEY` (daily digest).
3. Set `RESEND_FROM`, for example `CreatorDesk <hello@yourdomain.in>`.

## 3. Google sign-in (optional, free)

1. In Google Cloud Console, go to APIs & Services → Credentials → OAuth client ID (Web).
2. Add the authorised redirect URI `https://YOUR-APP/api/auth/callback/google`.
3. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

## 4. Hosting

**Recommended for the pilot: Render (free web service).** It runs the same `next start` server that the tests run against.

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run db:deploy && npm run build` |
| Start command | `npm start` |
| Node version | 24 (set environment variable `NODE_VERSION=24`) |

The free instance sleeps after about 15 minutes idle, so the first request after that takes around 30 seconds. That's acceptable for a pilot. Upgrade later if needed.

Other options:
- **Vercel:** works with no code changes, but the free Hobby plan is for non-commercial use only. Move to Pro before charging customers.
- **Cloudflare Workers (OpenNext):** possible, but not set up or tested yet. The app uses `pg` over TCP, so it would need Cloudflare Hyperdrive or the Neon serverless driver.

## 5. Environment variables (production)

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | From Neon |
| `AUTH_SECRET` | Run `npx auth secret` and paste the result |
| `AUTH_URL` | `https://YOUR-APP` |
| `AUTH_TRUST_HOST` | `true` (needed behind Render's proxy) |
| `AUTH_RESEND_KEY`, `RESEND_API_KEY`, `RESEND_FROM` | From Resend |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional |
| `CRON_SECRET` | A long random string |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Optional: AI brief reading. Free key from Google AI Studio. **Use a paid key before real customers** (free-tier inputs may be used by Google). |
| `APP_URL` | `https://YOUR-APP` |

Do **not** set `AUTH_DEV_LOGIN` in production. It is ignored in production builds anyway.

## 6. Daily digest

In the GitHub repo, go to Settings → Secrets and variables → Actions and add:
- `APP_URL`
- `CRON_SECRET`

The `Daily digest` workflow then calls the app every morning at 08:00 IST. You can also run it manually from the Actions tab.

## 7. After the first deploy

1. Sign in with your email, then fill in Settings → Invoice details.
2. Create a test deal and invoice, download the PDF, and check it with your CA once.
3. Turn on the Neon backup or branch-restore window that your plan allows.
