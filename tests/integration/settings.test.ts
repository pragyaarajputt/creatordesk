import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDeal, listDeals, NotFoundError } from "@/lib/data/deals";
import { runDailyDigest, type DigestEmail } from "@/lib/data/digest";
import { issueInvoice, recordPayment } from "@/lib/data/invoices";
import {
  acceptInvites,
  addCreator,
  changeRole,
  deleteWorkspace,
  exportWorkspace,
  inviteMember,
  removeMember,
  updateBrand,
  updateWorkspaceProfile,
} from "@/lib/data/settings";
import { ForbiddenError } from "@/lib/roles";
import { addMember, makeOwner, resetDb, sampleDeal } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("team", () => {
  it("invites by email and grants access at first sign-in", async () => {
    const owner = await makeOwner("owner@example.com");
    expect(await inviteMember(owner, "new.manager@example.com", "MANAGER")).toEqual({ joined: false });

    const user = await prisma.user.create({ data: { email: "new.manager@example.com" } });
    expect(await acceptInvites(user.id, user.email)).toBe(1);
    const member = await prisma.member.findFirstOrThrow({ where: { userId: user.id } });
    expect(member).toMatchObject({ workspaceId: owner.workspaceId, role: "MANAGER" });
    expect(await acceptInvites(user.id, user.email)).toBe(0);
  });

  it("adds existing users straight away", async () => {
    const owner = await makeOwner("owner@example.com");
    await prisma.user.create({ data: { email: "existing@example.com" } });
    expect(await inviteMember(owner, "existing@example.com", "VIEWER")).toEqual({ joined: true });
  });

  it("only owners manage the team, and the last owner can't be removed or demoted", async () => {
    const owner = await makeOwner("owner@example.com");
    const manager = await addMember(owner, "m@example.com", "MANAGER");
    await expect(inviteMember(manager, "x@example.com", "VIEWER")).rejects.toBeInstanceOf(ForbiddenError);

    const ownerMember = await prisma.member.findFirstOrThrow({ where: { userId: owner.userId } });
    await expect(removeMember(owner, ownerMember.id)).rejects.toThrow(/at least one owner/);
    await expect(changeRole(owner, ownerMember.id, "VIEWER")).rejects.toThrow(/at least one owner/);
  });
});

describe("profile and brands", () => {
  it("lets only owners edit invoice details", async () => {
    const owner = await makeOwner("owner@example.com");
    const manager = await addMember(owner, "m@example.com", "MANAGER");
    const profile = { name: "Pragya", gstin: "07ABCDE1234F1Z5", stateCode: "07", invoicePrefix: "PR" };
    await expect(updateWorkspaceProfile(manager, profile)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await updateWorkspaceProfile(owner, profile)).invoicePrefix).toBe("PR");
  });

  it("refuses a brand rename that clashes with another brand", async () => {
    const owner = await makeOwner("owner@example.com");
    const a = await createDeal(owner, sampleDeal({ brandName: "Alpha" }));
    await createDeal(owner, sampleDeal({ brandName: "Beta" }));
    await expect(updateBrand(owner, a.brandId, { name: "Beta" })).rejects.toThrow(/already have a brand/);
  });
});

describe("agency creators", () => {
  it("assigns deals to creators within the workspace only", async () => {
    const agency = await makeOwner("agency@example.com");
    const other = await makeOwner("other@example.com");
    const riya = await addCreator(agency, { name: "Riya", platform: "INSTAGRAM" });
    const foreign = await addCreator(other, { name: "Not yours", platform: "INSTAGRAM" });

    await createDeal(agency, sampleDeal({ creatorId: riya.id }));
    await createDeal(agency, sampleDeal({ title: "Unassigned" }));
    await expect(createDeal(agency, sampleDeal({ creatorId: foreign.id }))).rejects.toBeInstanceOf(NotFoundError);
    expect(await listDeals(agency, { creatorId: riya.id })).toHaveLength(1);
  });
});

describe("daily digest", () => {
  it("emails each workspace with overdue money once per day", async () => {
    const owner = await makeOwner("owner@example.com");
    await makeOwner("quiet@example.com");
    const deal = await createDeal(owner, sampleDeal({ paymentTermsDays: 15 }));
    await issueInvoice(owner, deal.id, { kind: "TAX_INVOICE", gstRateBps: 1800, tdsRateBps: 0, issueDate: new Date("2026-11-01T06:00:00Z") });

    const sent: DigestEmail[] = [];
    const now = new Date("2026-11-25T03:00:00Z");
    const first = await runDailyDigest(now, async (e) => void sent.push(e), "https://app.test");
    const again = await runDailyDigest(now, async (e) => void sent.push(e), "https://app.test");

    expect(first).toMatchObject({ sent: 1, skippedNothingToSay: 1 });
    expect(again).toMatchObject({ sent: 0, skippedAlreadySent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    expect(sent[0].text).toContain("₹29,500");
    expect(sent[0].text).toContain("9 days overdue");
    expect(sent[0].text).toContain("firm reminder") // 9 days overdue: past the 7-day firm threshold;
  });
});

describe("export and deletion", () => {
  it("exports everything and then deletes the workspace completely", async () => {
    const owner = await makeOwner("owner@example.com");
    const deal = await createDeal(owner, sampleDeal());
    const inv = await issueInvoice(owner, deal.id, { kind: "TAX_INVOICE", gstRateBps: 1800, tdsRateBps: 0 });
    await recordPayment(owner, inv.id, { amountPaise: 100000, tdsPaise: 0, receivedAt: new Date(), method: "UPI" });

    const data = await exportWorkspace(owner);
    expect(data.deals).toHaveLength(1);
    expect(data.payments).toHaveLength(1);
    expect(data.members[0].email).toBe("owner@example.com");

    await expect(deleteWorkspace(owner, "wrong name")).rejects.toBeInstanceOf(ForbiddenError);
    await deleteWorkspace(owner, owner.workspaceName);
    expect(await prisma.workspace.count({ where: { id: owner.workspaceId } })).toBe(0);
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(1);
  });
});
