import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDeal, getDeal } from "@/lib/data/deals";
import { issueInvoice } from "@/lib/data/invoices";
import { makeOwner, resetDb, sampleDeal } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const gst18 = { kind: "TAX_INVOICE" as const, gstRateBps: 1800, tdsRateBps: 1000 };

describe("invoice numbering", () => {
  it("gives 20 concurrent invoices unique, gap-free numbers", async () => {
    const owner = await makeOwner("owner@example.com");
    const deals = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createDeal(owner, sampleDeal({ title: `Deal ${i}` }))),
    );
    const issueDate = new Date("2026-11-25T06:00:00Z");

    const invoices = await Promise.all(deals.map((d) => issueInvoice(owner, d.id, { ...gst18, issueDate })));

    const seqs = invoices.map((i) => i.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(invoices.map((i) => i.number)).size).toBe(20);
    expect(invoices.map((i) => i.number)).toContain("CD/2026-27/020");
  });

  it("restarts numbering in a new financial year", async () => {
    const owner = await makeOwner("owner@example.com");
    const d1 = await createDeal(owner, sampleDeal());
    const d2 = await createDeal(owner, sampleDeal());
    const march = await issueInvoice(owner, d1.id, { ...gst18, issueDate: new Date("2027-03-31T06:00:00Z") });
    const april = await issueInvoice(owner, d2.id, { ...gst18, issueDate: new Date("2027-04-01T06:00:00Z") });
    expect(march.number).toBe("CD/2026-27/001");
    expect(april.number).toBe("CD/2027-28/001");
  });

  it("does not burn a number when issuing fails", async () => {
    const owner = await makeOwner("owner@example.com");
    const barter = await createDeal(owner, sampleDeal({ type: "BARTER", amount: 0, productValue: 500000 }));
    const paid = await createDeal(owner, sampleDeal());
    await expect(issueInvoice(owner, barter.id, gst18)).rejects.toThrow(/no fee/);
    const invoice = await issueInvoice(owner, paid.id, gst18);
    expect(invoice.seq).toBe(1);
  });

  it("numbers each workspace independently", async () => {
    const alice = await makeOwner("alice@example.com");
    const bob = await makeOwner("bob@example.com");
    const a = await issueInvoice(alice, (await createDeal(alice, sampleDeal())).id, gst18);
    const b = await issueInvoice(bob, (await createDeal(bob, sampleDeal())).id, gst18);
    expect(a.number).toBe(b.number);
    expect(a.workspaceId).not.toBe(b.workspaceId);
  });
});

describe("invoice contents", () => {
  it("charges IGST to a brand in another state and moves the deal to Invoiced", async () => {
    const owner = await makeOwner("owner@example.com", "07");
    const deal = await createDeal(owner, sampleDeal());
    await prisma.brand.update({ where: { id: deal.brandId }, data: { stateCode: "27" } });

    const invoice = await issueInvoice(owner, deal.id, gst18);
    expect(invoice).toMatchObject({ subtotalPaise: 2500000, igstPaise: 450000, cgstPaise: 0, totalPaise: 2950000 });
    expect((await getDeal(owner, deal.id)).stage).toBe("INVOICED");
  });
});
