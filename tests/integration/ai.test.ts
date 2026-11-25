import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BriefResult } from "@/lib/ai/extract-brief";

// Gemini is faked here; its real accuracy is measured separately by `npm run eval`.
const extractBrief = vi.fn<(brief: string, today: string) => Promise<BriefResult>>();
vi.mock("@/lib/ai/extract-brief", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/extract-brief")>()),
  extractBrief,
}));

const { prisma } = await import("@/lib/db");
const { DAILY_AI_LIMIT, readBrief, setAiEnabled } = await import("@/lib/data/ai");
const { createDeal, getDeal } = await import("@/lib/data/deals");
const { ForbiddenError } = await import("@/lib/roles");
const { addMember, makeOwner, resetDb, sampleDeal } = await import("./helpers");

const BRIEF = "Hi from Glow Co: 1 reel for ₹25,000, payment 30 days, lifetime usage.";
const fakeResult = { extraction: {}, flags: [{ code: "PERPETUAL_USAGE" }], model: "fake-model", attempts: 1 } as unknown as BriefResult;

beforeEach(async () => {
  await resetDb();
  extractBrief.mockReset().mockResolvedValue(fakeResult);
});
afterAll(() => prisma.$disconnect());

describe("reading a brief with AI", () => {
  it("is off until an owner turns it on, and only owners can", async () => {
    const owner = await makeOwner("owner@example.com");
    const manager = await addMember(owner, "m@example.com", "MANAGER");
    await expect(readBrief(owner, BRIEF)).rejects.toThrow(/turned off/);
    await expect(setAiEnabled(manager, true)).rejects.toBeInstanceOf(ForbiddenError);
    await setAiEnabled(owner, true);
    await expect(readBrief(manager, BRIEF)).resolves.toMatchObject({ model: "fake-model" });
    expect(extractBrief).toHaveBeenCalledTimes(1);
  });

  it("doesn't let viewers use it", async () => {
    const owner = await makeOwner("owner@example.com");
    await setAiEnabled(owner, true);
    const viewer = await addMember(owner, "v@example.com", "VIEWER");
    await expect(readBrief(viewer, BRIEF)).rejects.toBeInstanceOf(ForbiddenError);
    expect(extractBrief).not.toHaveBeenCalled();
  });

  it("logs usage without storing the brief's text", async () => {
    const owner = await makeOwner("owner@example.com");
    await setAiEnabled(owner, true);
    await readBrief(owner, BRIEF);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { workspaceId: owner.workspaceId, action: "ai.brief" } });
    expect(log.after).toMatchObject({ model: "fake-model", chars: BRIEF.length, flags: ["PERPETUAL_USAGE"] });
    expect(JSON.stringify(log)).not.toContain("Glow Co");
  });

  it("enforces the daily limit per workspace", async () => {
    const owner = await makeOwner("owner@example.com");
    await setAiEnabled(owner, true);
    const now = new Date();
    await prisma.auditLog.createMany({
      data: Array.from({ length: DAILY_AI_LIMIT }, () => ({
        workspaceId: owner.workspaceId,
        actorId: owner.userId,
        action: "ai.brief",
        entity: "Workspace",
        entityId: owner.workspaceId,
        createdAt: now,
      })),
    });
    await expect(readBrief(owner, BRIEF, now)).rejects.toThrow(/today's/);
    const other = await makeOwner("other@example.com");
    await setAiEnabled(other, true);
    await expect(readBrief(other, BRIEF, now)).resolves.toBeTruthy();
  });

  it("rejects briefs that are too short or too long before calling the AI", async () => {
    const owner = await makeOwner("owner@example.com");
    await setAiEnabled(owner, true);
    await expect(readBrief(owner, "hi")).rejects.toThrow(/too short/);
    await expect(readBrief(owner, "x".repeat(7000))).rejects.toThrow(/too long/);
    expect(extractBrief).not.toHaveBeenCalled();
  });
});

describe("creating a deal from a brief", () => {
  it("creates the deliverables and saves the brand contact", async () => {
    const owner = await makeOwner("owner@example.com");
    const deal = await createDeal(
      owner,
      sampleDeal({
        deliverablesJson: [
          { platform: "INSTAGRAM", format: "REEL", dueDate: "2026-12-05" },
          { platform: "INSTAGRAM", format: "STORY", dueDate: null },
        ],
        contactName: "Riya",
        contactEmail: "riya@glowco.example",
        contactPhone: "9876543210",
      }),
    );
    const full = await getDeal(owner, deal.id);
    expect(full.deliverables.map((d) => d.format).sort()).toEqual(["REEL", "STORY"]);
    expect(full.brand).toMatchObject({ contactName: "Riya", contactEmail: "riya@glowco.example", contactPhone: "9876543210" });
  });

  it("never overwrites contact details a brand already has", async () => {
    const owner = await makeOwner("owner@example.com");
    const first = await createDeal(owner, sampleDeal({ contactEmail: "old@glowco.example" }));
    await createDeal(owner, sampleDeal({ contactEmail: "new@glowco.example", contactName: "Riya" }));
    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: first.brandId } });
    expect(brand).toMatchObject({ contactEmail: "old@glowco.example", contactName: "Riya" });
  });
});
