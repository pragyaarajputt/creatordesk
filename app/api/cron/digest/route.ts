import { timingSafeEqual } from "node:crypto";
import { emailSender, runDailyDigest } from "@/lib/data/digest";
import { pruneRateLimits } from "@/lib/security/rate-limit";

/**
 * Daily summary email. Called once a morning by a scheduler with "Authorization: Bearer <CRON_SECRET>":
 * Vercel Cron sends a GET (see vercel.json); the GitHub Actions workflow sends a POST.
 * Safe to call twice: each workspace gets at most one email per day.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // A short secret is guessable; refuse to run with one.
  if (!secret || secret.length < 32) return new Response("CRON_SECRET must be at least 32 characters", { status: 503 });
  if (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const { send, mode } = emailSender();
  const result = await runDailyDigest(new Date(), send, appUrl);
  const prunedRateLimits = await pruneRateLimits();
  return Response.json({ mode, ...result, prunedRateLimits }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
