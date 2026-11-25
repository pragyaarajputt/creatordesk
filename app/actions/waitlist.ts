"use server";

import { prisma } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { fieldErrors, formToObject, waitlistInputSchema } from "@/lib/validation";

export type WaitlistState = { ok?: boolean; errors?: Record<string, string>; values?: Record<string, string> };

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = waitlistInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formToObject(form) };
  const limited = await rateLimit("waitlist-ip", await clientIp(), LIMITS.waitlistPerIp.limit, LIMITS.waitlistPerIp.windowMs);
  if (!limited.allowed) return { errors: { email: "Too many sign-ups from your network. Try again later." }, values: formToObject(form) };
  const { email, handle, role, owed } = parsed.data;
  await prisma.waitlistEntry.upsert({
    where: { email },
    update: { handle, role, owedRupees: owed },
    create: { email, handle, role, owedRupees: owed },
  });
  return { ok: true };
}
