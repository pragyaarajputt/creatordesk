import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { acceptInvites } from "@/lib/data/settings";
import { requireUserId } from "@/lib/tenancy";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

/**
 * Login always lands here. Returning (and newly invited) users go straight to the dashboard;
 * new users create a workspace first. Because a new user never visits the app pages before
 * their workspace exists, the client router can't cache a stale "/deals -> /onboarding" redirect.
 */
export default function OnboardingPage() {
  return (
    <main className="hero-wash mx-auto grid w-full max-w-md flex-1 content-center gap-6 px-4 py-12">
      <div className="grid gap-1">
        <p className="eyebrow">One minute</p>
        <h1 className="display text-5xl">
          Set up your <em>workspace.</em>
        </h1>
        <p className="text-sm text-muted-foreground">You can add invoice details (GSTIN, PAN, UPI) later.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your account…</p>}>
        <OnboardingGate />
      </Suspense>
    </main>
  );
}

async function OnboardingGate() {
  const userId = await requireUserId();
  // Someone invited by email gets their access the first time they sign in.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user) await acceptInvites(userId, user.email);
  const existing = await prisma.member.findFirst({ where: { userId }, select: { id: true } });
  if (existing) redirect("/dashboard");
  return <OnboardingForm />;
}
