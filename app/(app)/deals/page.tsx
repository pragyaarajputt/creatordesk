import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listDeals } from "@/lib/data/deals";
import { creatorsForDealForm } from "@/lib/data/creators-for-form";
import { formatINR } from "@/lib/money";
import { hasRole, getWorkspaceContext } from "@/lib/tenancy";
import { OPEN_STAGES, STAGE_LABEL } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StageSelect } from "./stage-select";

export const metadata: Metadata = { title: "Deals" };

export default function DealsPage({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="display text-4xl sm:text-5xl">Deals</h1>
        <Link href="/deals/new" className={buttonVariants()}>
          New deal
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading deals…</p>}>
        <Pipeline searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Pipeline({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getWorkspaceContext();
  const raw = (await searchParams).creator;
  const creators = await creatorsForDealForm(ctx);
  const creatorId = creators.find((c) => c.id === raw)?.id;
  const deals = await listDeals(ctx, { creatorId });
  const canEdit = hasRole(ctx.role, "MANAGER");

  if (deals.length === 0) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-8">
        <h2 className="font-medium">No deals yet</h2>
        <p className="text-sm text-muted-foreground">
          Add the brand collabs you&apos;re working on, including ones still in conversation.
        </p>
        <Link href="/deals/new" className={buttonVariants({ variant: "outline" })}>
          Add your first deal
        </Link>
      </div>
    );
  }

  const closed = deals.filter((d) => d.stage === "LOST" || d.stage === "CANCELLED");

  return (
    <div className="grid gap-8">
      {creators.length > 0 && (
        <nav aria-label="Filter by creator" className="flex flex-wrap gap-1 text-sm">
          {[{ id: "", name: "All creators" }, ...creators].map((c) => (
            <Link
              key={c.id || "all"}
              href={c.id ? `/deals?creator=${c.id}` : "/deals"}
              aria-current={(creatorId ?? "") === c.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${(creatorId ?? "") === c.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {/* Stacked on small screens (empty stages hidden), a horizontal board on large screens. */}
      <div className="grid gap-6 lg:flex lg:gap-3 lg:overflow-x-auto lg:pb-2">
        {OPEN_STAGES.map((stage) => {
          const inStage = deals.filter((d) => d.stage === stage);
          const total = inStage.reduce((sum, d) => sum + d.amountPaise, 0);
          return (
            <section
              key={stage}
              aria-label={STAGE_LABEL[stage]}
              className={`${inStage.length === 0 ? "hidden lg:grid" : "grid"} content-start gap-2 lg:w-60 lg:shrink-0`}
            >
              <header className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-medium">
                  {STAGE_LABEL[stage]} <span className="text-muted-foreground">{inStage.length}</span>
                </h2>
                {total > 0 && <span className="text-xs text-muted-foreground">{formatINR(total)}</span>}
              </header>
              {inStage.map((deal) => (
                <article key={deal.id} className="grid gap-2 rounded-lg border bg-card p-3">
                  <Link href={`/deals/${deal.id}`} className="grid gap-0.5 hover:underline">
                    <span className="text-sm font-medium">{deal.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {deal.brand.name}
                      {deal.creator && creators.length > 0 ? ` · ${deal.creator.name}` : ""}
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {deal.type !== "BARTER" && <span className="font-medium">{formatINR(deal.amountPaise)}</span>}
                    {deal.type !== "PAID" && <Badge variant="outline">{deal.type === "BARTER" ? "Barter" : "Hybrid"}</Badge>}
                    {deal._count.deliverables > 0 && (
                      <span className="text-muted-foreground">
                        {deal._count.deliverables} {deal._count.deliverables === 1 ? "deliverable" : "deliverables"}
                      </span>
                    )}
                  </div>
                  <StageSelect dealId={deal.id} stage={deal.stage} disabled={!canEdit} />
                </article>
              ))}
              {inStage.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nothing here</p>}
            </section>
          );
        })}
      </div>

      {closed.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Lost or cancelled ({closed.length})</h2>
          <ul className="grid gap-1 text-sm">
            {closed.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="hover:underline">
                  {d.title}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {d.brand.name} · {STAGE_LABEL[d.stage]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
