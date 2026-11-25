import type { Metadata } from "next";
import { Suspense } from "react";
import { creatorsForDealForm } from "@/lib/data/creators-for-form";
import { getWorkspaceContext } from "@/lib/tenancy";
import { aiSettings } from "@/lib/data/ai";
import { hasRole } from "@/lib/tenancy";
import { NewDealClient } from "./new-deal-client";

export const metadata: Metadata = { title: "New deal" };

export default function NewDealPage() {
  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl sm:text-5xl">New deal</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <NewDealForm />
      </Suspense>
    </div>
  );
}

async function NewDealForm() {
  const ctx = await getWorkspaceContext();
  const [creators, ai] = await Promise.all([creatorsForDealForm(ctx), aiSettings(ctx)]);
  return (
    <NewDealClient
      creators={creators}
      aiEnabled={ai.aiEnabled && ai.configured && hasRole(ctx.role, "MANAGER")}
      isOwner={hasRole(ctx.role, "OWNER") && ai.configured}
    />
  );
}
