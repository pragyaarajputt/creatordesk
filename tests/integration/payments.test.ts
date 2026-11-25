import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDeal, getDeal, NotFoundError } from "@/lib/data/deals";
import {
  deletePayment,
  getInvoice,
  InvoiceRuleError,
  issueInvoice,
  listInvoices,
  logReminder,
  recordPayment,
  voidInvoice,
} from "@/lib/data/invoices";
import { makeOwner, resetDb, sampleDeal } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const gst = { kind: "TAX_INVOICE" as const, gstRateBps: 1800, tdsRateBps: 1000 };
const day = (iso: string) => new Date(`${iso}T06:00:00Z`);

async function invoiced(amountPaise?: number) {
  const owner = await makeOwner("owner@example.com");
  const deal = await createDeal(owner, sampleDeal({ amount: 2500000, paymentTermsDays: 30 }));
  const invoice = await issueInvoice(owner, deal.id, { ...gst, amountPaise, issueDate: day("2026-11-01") });
  return { owner, deal, invoice };
}

describe("payments", () => {
  it("moves an invoice from issued to partly paid to paid, and the deal to Paid", async () => {
    const { owner, deal, invoice } = await invoiced();
    expect(invoice.totalPaise).toBe(2950000);

    await recordPayment(owner, invoice.id, { amountPaise: 1000000, tdsPaise: 0, receivedAt: day("2026-11-20"), method: "UPI" });
    let inv = await getInvoice(owner, invoice.id);
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(inv.outstandingPaise).toBe(1950000);

    // Brand pays the rest minus 10% TDS on ₹25,000.
    await recordPayment(owner, invoice.id, { amountPaise: 1700000, tdsPaise: 250000, receivedAt: day("2026-11-28"), method: "BANK_TRANSFER" });
    inv = await getInvoice(owner, invoice.id);
    expect(inv.status).toBe("PAID");
    expect(inv.outstandingPaise).toBe(0);
    expect((await getDeal(owner, deal.id)).stage).toBe("PAID");
  });

  it("refuses to record more than is outstanding", async () => {
    const { owner, invoice } = await invoiced();
    await expect(
      recordPayment(owner, invoice.id, { amountPaise: 3000000, tdsPaise: 0, receivedAt: day("2026-11-20"), method: "UPI" }),
    ).rejects.toBeInstanceOf(InvoiceRuleError);
  });

  it("reopens the invoice and deal when a payment is deleted", async () => {
    const { owner, deal, invoice } = await invoiced();
    const payment = await recordPayment(owner, invoice.id, { amountPaise: 2950000, tdsPaise: 0, receivedAt: day("2026-11-20"), method: "UPI" });
    expect((await getDeal(owner, deal.id)).stage).toBe("PAID");
    await deletePayment(owner, payment.id);
    expect((await getInvoice(owner, invoice.id)).status).toBe("ISSUED");
    expect((await getDeal(owner, deal.id)).stage).toBe("INVOICED");
  });

  it("keeps payments private to their workspace", async () => {
    const { invoice } = await invoiced();
    const stranger = await makeOwner("stranger@example.com");
    await expect(getInvoice(stranger, invoice.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordPayment(stranger, invoice.id, { amountPaise: 100, tdsPaise: 0, receivedAt: day("2026-11-20"), method: "UPI" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("advance and balance invoices", () => {
  it("invoices what's left of the fee and stops at the full amount", async () => {
    const { owner, deal, invoice } = await invoiced(1250000); // 50% advance
    expect(invoice.subtotalPaise).toBe(1250000);
    const balance = await issueInvoice(owner, deal.id, gst);
    expect(balance.subtotalPaise).toBe(1250000);
    await expect(issueInvoice(owner, deal.id, gst)).rejects.toThrow(/fully invoiced/);
  });

  it("won't invoice more than the remaining fee", async () => {
    const { owner, deal } = await invoiced(2000000);
    await expect(issueInvoice(owner, deal.id, { ...gst, amountPaise: 600000 })).rejects.toThrow(/more than the fee/);
  });

  it("requires a GSTIN for a tax invoice but not for a bill of supply", async () => {
    const owner = await makeOwner("nogst@example.com");
    await prisma.workspace.update({ where: { id: owner.workspaceId }, data: { gstin: null } });
    const deal = await createDeal(owner, sampleDeal());
    await expect(issueInvoice(owner, deal.id, gst)).rejects.toThrow(/GSTIN/);
    const bos = await issueInvoice(owner, deal.id, { kind: "BILL_OF_SUPPLY", gstRateBps: 1800, tdsRateBps: 0 });
    expect(bos.totalPaise).toBe(2500000);
  });
});

describe("voiding", () => {
  it("keeps the number, drops out of outstanding, and frees the fee for a new invoice", async () => {
    const { owner, deal, invoice } = await invoiced();
    await voidInvoice(owner, invoice.id, "Wrong GST rate");
    const voided = await getInvoice(owner, invoice.id);
    expect(voided).toMatchObject({ status: "VOID", number: invoice.number, outstandingPaise: 0 });
    expect((await getDeal(owner, deal.id)).stage).toBe("POSTED");

    const replacement = await issueInvoice(owner, deal.id, gst);
    expect(replacement.seq).toBe(invoice.seq + 1);
  });

  it("won't void an invoice that has payments", async () => {
    const { owner, invoice } = await invoiced();
    await recordPayment(owner, invoice.id, { amountPaise: 100000, tdsPaise: 0, receivedAt: day("2026-11-20"), method: "UPI" });
    await expect(voidInvoice(owner, invoice.id, "Oops")).rejects.toThrow(/Remove the payments/);
  });
});

describe("listing and reminders", () => {
  it("filters overdue invoices and counts days overdue", async () => {
    const { owner, invoice } = await invoiced(); // due 1 Dec 2026
    const now = day("2026-12-10");
    const overdue = await listInvoices(owner, "overdue", now);
    expect(overdue.map((i) => i.id)).toEqual([invoice.id]);
    expect(overdue[0].overdueDays).toBe(9);
    expect(await listInvoices(owner, "paid", now)).toHaveLength(0);
  });

  it("logs a reminder once per kind and channel", async () => {
    const { owner, invoice } = await invoiced();
    const a = await logReminder(owner, invoice.id, "POLITE", "WHATSAPP");
    const b = await logReminder(owner, invoice.id, "POLITE", "WHATSAPP");
    await logReminder(owner, invoice.id, "POLITE", "EMAIL");
    expect(a.id).toBe(b.id);
    expect(await prisma.reminder.count({ where: { invoiceId: invoice.id } })).toBe(2);
  });
});
