import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listBrands } from "@/lib/data/settings";
import { getWorkspaceContext } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="display text-4xl sm:text-5xl">Brands</h1>
        <p className="text-sm text-muted-foreground">Brands are added when you create a deal. Add GSTIN and contacts here for invoices and reminders.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading brands…</p>}>
        <BrandList />
      </Suspense>
    </div>
  );
}

async function BrandList() {
  const ctx = await getWorkspaceContext();
  const brands = await listBrands(ctx);
  if (brands.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">No brands yet. They appear when you add a deal.</p>;
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((b) => {
        const missing = [!b.contactPhone && !b.contactEmail && "contact", !b.stateCode && "state"].filter(Boolean);
        return (
          <li key={b.id}>
            <Link href={`/brands/${b.id}`} className="grid gap-1 rounded-xl border p-4 hover:bg-muted/40">
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">
                {b._count.deals} {b._count.deals === 1 ? "deal" : "deals"}
                {missing.length > 0 && ` · add ${missing.join(" and ")}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
