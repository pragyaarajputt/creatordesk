import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDeal } from "@/lib/data/deals";
import { issueInvoice } from "@/lib/data/invoices";
import { deleteMyAccount, exportWorkspace, getWorkspace, inviteMember, updateWorkspaceProfile } from "@/lib/data/settings";
import { ForbiddenError } from "@/lib/roles";
import { pruneRateLimits, rateLimit } from "@/lib/security/rate-limit";
import { addMember, makeOwner, resetDb, sampleDeal } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PAN = "PQRST6789K";
// A creator not registered for GST: their PAN is the identifier worth protecting.
// (A GSTIN embeds the holder's PAN by design and is public, so registered users' PAN is already public.)
const profile = { name: "Pragya", stateCode: "07", invoicePrefix: "PR", pan: PAN };

describe("PAN is encrypted at rest", () => {
  it("in the workspace, on invoices and out of the audit log, but readable by the owner", async () => {
    const owner = await makeOwner("owner@example.com");
    await prisma.workspace.update({ where: { id: owner.workspaceId }, data: { gstin: null } });
    await updateWorkspaceProfile(owner, profile);
    const deal = await createDeal(owner, sampleDeal());
    const invoice = await issueInvoice(owner, deal.id, { kind: "BILL_OF_SUPPLY", gstRateBps: 0, tdsRateBps: 0 });

    const raw = await prisma.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
    expect(raw.pan).toMatch(/^enc:v1:/);
    expect(JSON.stringify(invoice.supplier)).not.toContain(PAN);
    const audit = await prisma.auditLog.findMany({ where: { workspaceId: owner.workspaceId } });
    expect(JSON.stringify(audit)).not.toContain(PAN);

    expect((await getWorkspace(owner)).pan).toBe(PAN);
    const exported = await exportWorkspace(owner);
    expect(exported.workspace.pan).toBe(PAN);
    expect((exported.invoices[0].supplier as { pan: string }).pan).toBe(PAN);
  });
});

describe("rate limits", () => {
  it("allows up to the limit, then blocks, per key", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit("test", "1.2.3.4", 3, 60_000)).allowed);
    expect(results).toEqual([true, true, true, false]);
    expect((await rateLimit("test", "5.6.7.8", 3, 60_000)).allowed).toBe(true);
  });

  it("counts concurrent requests exactly", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit("burst", "same", 5, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("starts a new window once the old one expires, and prunes old counters", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("win", "ip", 2, 60_000);
    await prisma.rateLimitBucket.updateMany({ data: { resetAt: new Date(Date.now() - 1000) } });
    expect((await rateLimit("win", "ip", 2, 60_000)).allowed).toBe(true);
    await prisma.rateLimitBucket.updateMany({ data: { resetAt: new Date(Date.now() - 1000) } });
    expect(await pruneRateLimits()).toBe(1);
  });

  it("never stores the raw identifier", async () => {
    await rateLimit("signin-email", "riya@example.com", 5, 60_000);
    const keys = (await prisma.rateLimitBucket.findMany()).map((b) => b.key);
    expect(keys.join()).not.toContain("riya");
  });
});

describe("deleting your own account", () => {
  it("deletes workspaces you own alone, and your login", async () => {
    const owner = await makeOwner("solo@example.com");
    await createDeal(owner, sampleDeal());
    await expect(deleteMyAccount(owner.userId, "wrong@example.com")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteMyAccount(owner.userId, "SOLO@example.com")).resolves.toEqual({ deletedWorkspaces: 1 });
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(0);
    expect(await prisma.deal.count()).toBe(0);
  });

  it("won't orphan a team: the only owner must hand over first", async () => {
    const owner = await makeOwner("owner@example.com");
    const manager = await addMember(owner, "m@example.com", "MANAGER");
    await expect(deleteMyAccount(owner.userId, "owner@example.com")).rejects.toThrow(/someone else an owner/);
    // A manager can leave freely; the workspace stays.
    await deleteMyAccount(manager.userId, "m@example.com");
    expect(await prisma.workspace.count({ where: { id: owner.workspaceId } })).toBe(1);
  });

  it("keeps a shared workspace when another owner remains", async () => {
    const owner = await makeOwner("owner@example.com");
    await inviteMember(owner, "co@example.com", "OWNER");
    const co = await prisma.user.create({ data: { email: "co@example.com" } });
    await prisma.member.create({ data: { workspaceId: owner.workspaceId, userId: co.id, role: "OWNER" } });
    await expect(deleteMyAccount(owner.userId, "owner@example.com")).resolves.toEqual({ deletedWorkspaces: 0 });
    expect(await prisma.workspace.count({ where: { id: owner.workspaceId } })).toBe(1);
  });
});
