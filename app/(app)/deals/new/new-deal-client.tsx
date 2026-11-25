"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RedFlag } from "@/lib/ai/red-flags";
import type { DealDraft } from "@/lib/ai/to-deal-draft";
import { cn } from "@/lib/utils";
import { createDealAction } from "../actions";
import { readBriefAction } from "../ai-actions";
import { DealForm } from "../deal-form";

const SEVERITY_STYLE: Record<RedFlag["severity"], string> = {
  high: "border-destructive/50 bg-destructive/5",
  medium: "border-amber-500/50 bg-amber-500/5",
  low: "border-border bg-muted/40",
};
const pretty = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2 × Instagram reel (due 10 Dec)" instead of repeating identical rows. */
function groupDeliverables(list: DealDraft["deliverables"]): string[] {
  const counts = new Map<string, number>();
  for (const d of list) {
    const label = `${pretty(d.platform)} ${pretty(d.format).toLowerCase()}${d.dueDate ? ` (due ${dayFmt.format(new Date(`${d.dueDate}T00:00:00Z`))})` : ""}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
}

export function NewDealClient({
  creators,
  aiEnabled,
  isOwner,
}: {
  creators: { id: string; name: string }[];
  aiEnabled: boolean;
  isOwner: boolean;
}) {
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<DealDraft | null>(null);
  const [flags, setFlags] = useState<RedFlag[]>([]);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const [pending, startTransition] = useTransition();

  const read = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await readBriefAction(brief);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(result.draft);
      setFlags(result.flags);
      setVersion((v) => v + 1); // remount the form with the new values
    });

  const clear = () => {
    setDraft(null);
    setFlags([]);
    setVersion((v) => v + 1);
  };

  return (
    <div className="grid gap-6">
      {aiEnabled ? (
        <section aria-labelledby="brief-heading" className="grid max-w-2xl gap-3 rounded-xl border p-4">
          <div className="grid gap-1">
            <h2 id="brief-heading" className="font-medium">
              Paste a brief <Badge variant="secondary">AI</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              Paste the brand&apos;s DM, email or brief. AI fills the form below and points out risky terms. Check
              everything before you save.
            </p>
          </div>
          <Label htmlFor="brief" className="sr-only">
            Brand brief
          </Label>
          <Textarea
            id="brief"
            rows={5}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Hi! We're Glow Co. We'd love 1 reel + 2 stories by 5 Dec. Budget ₹25,000 + GST…"
            maxLength={6000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={read} disabled={pending || brief.trim().length < 20}>
              {pending ? "Reading…" : "Read brief"}
            </Button>
            {draft && (
              <Button type="button" variant="ghost" onClick={clear}>
                Clear AI values
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Sent to Google Gemini. Don&apos;t paste passwords or bank details.</span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      ) : isOwner ? (
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tip: turn on AI in{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>{" "}
          to fill this form by pasting a brand&apos;s brief.
        </p>
      ) : null}

      {draft && (
        <section aria-label="What the AI found" className="grid max-w-2xl gap-3">
          {flags.length === 0 ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">No red flags found in this brief. Still read the terms yourself.</p>
          ) : (
            <ul className="grid gap-2">
              {flags.map((f, i) => (
                <li key={`${f.code}-${i}`} className={cn("grid gap-1 rounded-lg border p-3 text-sm", SEVERITY_STYLE[f.severity])}>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {f.source === "ai" ? "AI noticed" : `${f.severity} risk`}
                  </span>
                  <span>{f.message}</span>
                  {f.evidence && <q className="text-xs text-muted-foreground">{f.evidence}</q>}
                </li>
              ))}
            </ul>
          )}
          {draft.deliverables.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">Deliverables to add: </span>
              {groupDeliverables(draft.deliverables).join(", ")}
            </p>
          )}
        </section>
      )}

      <DealForm
        key={version}
        action={createDealAction}
        submitLabel="Create deal"
        cancelHref="/deals"
        creators={creators}
        defaults={draft ? { ...draft.form, stage: "NEGOTIATING" } : undefined}
        hidden={
          draft
            ? {
                deliverablesJson: JSON.stringify(draft.deliverables),
                contactName: draft.contact.name,
                contactEmail: draft.contact.email,
                contactPhone: draft.contact.phone,
              }
            : undefined
        }
      />
    </div>
  );
}
