import type { Metadata } from "next";
import { Suspense } from "react";
import { getWorkspace, listCreators, listTeam } from "@/lib/data/settings";
import { aiSettings, DAILY_AI_LIMIT } from "@/lib/data/ai";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, hasRole } from "@/lib/tenancy";
import { maskPan } from "@/lib/security/crypto";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AddCreatorForm,
  AiToggle,
  DeleteAccountForm,
  CancelInviteButton,
  DeleteWorkspaceForm,
  InviteForm,
  MemberControls,
  ProfileForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="display text-4xl sm:text-5xl">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading settings…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const ctx = await getWorkspaceContext();
  const isOwner = hasRole(ctx.role, "OWNER");
  const [ws, team, creators, ai, me] = await Promise.all([
    getWorkspace(ctx),
    listTeam(ctx),
    listCreators(ctx),
    aiSettings(ctx),
    prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true } }),
  ]);

  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-medium">Invoice details</h2>
          <p className="text-sm text-muted-foreground">Printed on every new invoice. Issued invoices keep the details they were issued with.</p>
        </div>
        <ProfileForm
          canEdit={isOwner}
          defaults={{
            name: ws.name,
            legalName: ws.legalName ?? "",
            gstin: ws.gstin ?? "",
            // Only owners see the full PAN.
            pan: isOwner ? (ws.pan ?? "") : maskPan(ws.pan),
            address: ws.address ?? "",
            stateCode: ws.stateCode ?? "",
            upiId: ws.upiId ?? "",
            invoicePrefix: ws.invoicePrefix,
          }}
        />
      </section>

      <Separator />

      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-medium">Team</h2>
          <p className="text-sm text-muted-foreground">Managers can edit deals and invoices. Viewers can only look.</p>
        </div>
        <ul className="grid gap-2">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="font-medium">{m.user.name ?? m.user.email}</span>
              <span className="text-muted-foreground">{m.user.email}</span>
              <span className="ml-auto">
                {isOwner ? (
                  <MemberControls memberId={m.id} role={m.role} isSelf={m.userId === ctx.userId} />
                ) : (
                  <span className="text-xs text-muted-foreground">{m.role.toLowerCase()}</span>
                )}
              </span>
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
              <span>{i.email}</span>
              <span className="text-muted-foreground">invited as {i.role.toLowerCase()}, not signed in yet</span>
              {isOwner && (
                <span className="ml-auto">
                  <CancelInviteButton inviteId={i.id} />
                </span>
              )}
            </li>
          ))}
        </ul>
        {isOwner && <InviteForm />}
      </section>

      {ai.configured && (
        <>
          <Separator />
          <section className="grid gap-3">
            <div className="grid gap-1">
              <h2 className="font-medium">AI assistant</h2>
              <p className="text-sm text-muted-foreground">
                When you paste a brand&apos;s brief on the New deal page, AI fills in the deal and flags risky terms like
                lifetime usage rights or 90-day payment.
              </p>
            </div>
            <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
              <li>Only the text you paste is sent to Google&apos;s Gemini API. Your invoices, payments and contacts are not.</li>
              <li>On Google&apos;s free tier, Google may use that text to improve its products. Don&apos;t paste anything confidential.</li>
              <li>Nothing is saved until you check the form and press Create deal. Up to {DAILY_AI_LIMIT} reads a day.</li>
            </ul>
            <AiToggle enabled={ai.aiEnabled} canEdit={isOwner} />
            {!isOwner && <p className="text-xs text-muted-foreground">Only owners can change this.</p>}
          </section>
        </>
      )}

      {(ws.type === "AGENCY" || creators.length > 1) && (
        <>
          <Separator />
          <section className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="font-medium">Creators</h2>
              <p className="text-sm text-muted-foreground">Assign deals to the creators you manage and filter the pipeline by creator.</p>
            </div>
            {creators.length > 0 && (
              <ul className="grid gap-1 text-sm">
                {creators.map((c) => (
                  <li key={c.id}>
                    {c.name} {c.handle && <span className="text-muted-foreground">· {c.handle}</span>}
                  </li>
                ))}
              </ul>
            )}
            {hasRole(ctx.role, "MANAGER") && <AddCreatorForm />}
          </section>
        </>
      )}

      <Separator />
      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-medium">Your account</h2>
          <p className="text-sm text-muted-foreground">Signed in as {me.email}.</p>
        </div>
        <DeleteAccountForm email={me.email} />
      </section>

      {isOwner && (
        <>
          <Separator />
          <section className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="font-medium">Your data</h2>
              <p className="text-sm text-muted-foreground">Download everything in this workspace, or delete it for good.</p>
            </div>
            <a href="/api/export" className={buttonVariants({ variant: "outline", size: "sm", className: "justify-self-start" })}>
              Download all data (JSON)
            </a>
            <DeleteWorkspaceForm name={ws.name} />
          </section>
        </>
      )}
    </div>
  );
}
