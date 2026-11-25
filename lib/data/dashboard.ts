import "server-only";
import { addDays } from "@/lib/fy";
import { prisma } from "@/lib/db";
import { summarise, type InvoiceRow } from "@/lib/analytics";
import type { WorkspaceContext } from "@/lib/roles";

type Ctx = Pick<WorkspaceContext, "workspaceId">;

async function invoiceRows(workspaceId: string, where: object = {}): Promise<InvoiceRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId, ...where },
    include: {
      payments: { select: { amountPaise: true, tdsPaise: true, receivedAt: true } },
      deal: { select: { brand: { select: { name: true } } } },
    },
  });
  return invoices.map((i) => ({ ...i, brandName: i.deal.brand.name }));
}

export async function getDashboard(ctx: Ctx, now = new Date()) {
  const [invoices, deals, upcoming] = await Promise.all([
    invoiceRows(ctx.workspaceId),
    prisma.deal.findMany({ where: { workspaceId: ctx.workspaceId }, select: { stage: true, amountPaise: true } }),
    prisma.deliverable.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: { not: "POSTED" },
        dueDate: { lte: addDays(now, 7) },
      },
      include: { deal: { select: { id: true, title: true, brand: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
  ]);
  return { summary: summarise(invoices, deals, now), upcoming };
}

/** Invoices of one financial year, for the CA's CSV. */
export async function taxRows(ctx: Ctx, financialYear: string) {
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId: ctx.workspaceId, financialYear },
    include: { payments: true, deal: { select: { title: true, brand: { select: { name: true, gstin: true } } } } },
    orderBy: { seq: "asc" },
  });
  return invoices;
}
