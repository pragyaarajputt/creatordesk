import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  moveDealStage,
  NotFoundError,
} from "@/lib/data/deals";
import { ForbiddenError } from "@/lib/roles";
import { addMember, makeOwner, resetDb, sampleDeal } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("workspace isolation", () => {
  it("never shows or changes another workspace's deals", async () => {
    const alice = await makeOwner("alice@example.com");
    const bob = await makeOwner("bob@example.com");
    const deal = await createDeal(alice, sampleDeal());

    expect(await listDeals(bob)).toHaveLength(0);
    await expect(getDeal(bob, deal.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveDealStage(bob, deal.id, "LOST")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteDeal(bob, deal.id)).rejects.toBeInstanceOf(NotFoundError);

    const unchanged = await getDeal(alice, deal.id);
    expect(unchanged.stage).toBe("AGREED");
  });

  it("keeps brands separate per workspace even with the same name", async () => {
    const alice = await makeOwner("alice@example.com");
    const bob = await makeOwner("bob@example.com");
    const a = await createDeal(alice, sampleDeal());
    const b = await createDeal(bob, sampleDeal());
    expect(a.brandId).not.toBe(b.brandId);
  });
});

describe("roles", () => {
  it("lets a viewer read but not write", async () => {
    const owner = await makeOwner("owner@example.com");
    const viewer = await addMember(owner, "viewer@example.com", "VIEWER");
    const deal = await createDeal(owner, sampleDeal());

    expect(await listDeals(viewer)).toHaveLength(1);
    await expect(createDeal(viewer, sampleDeal())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(moveDealStage(viewer, deal.id, "POSTED")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a manager write", async () => {
    const owner = await makeOwner("owner@example.com");
    const manager = await addMember(owner, "manager@example.com", "MANAGER");
    const deal = await createDeal(manager, sampleDeal());
    expect((await moveDealStage(manager, deal.id, "POSTED")).stage).toBe("POSTED");
  });
});

describe("audit log", () => {
  it("records who changed what", async () => {
    const owner = await makeOwner("owner@example.com");
    const deal = await createDeal(owner, sampleDeal());
    await moveDealStage(owner, deal.id, "POSTED");

    const logs = await prisma.auditLog.findMany({
      where: { workspaceId: owner.workspaceId, entityId: deal.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual(["deal.create", "deal.stage"]);
    expect(logs[1]).toMatchObject({ actorId: owner.userId, before: { stage: "AGREED" }, after: { stage: "POSTED" } });
  });
});
