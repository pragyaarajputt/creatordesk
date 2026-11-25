import { beforeAll, describe, expect, it } from "vitest";
import { decryptField, encryptField, hashIdentifier, isEncrypted, maskPan } from "@/lib/security/crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
});

describe("field encryption", () => {
  it("round-trips and never contains the plain value", () => {
    const enc = encryptField("ABCDE1234F");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("ABCDE1234F");
    expect(decryptField(enc)).toBe("ABCDE1234F");
  });

  it("uses a fresh IV, so the same PAN encrypts differently each time", () => {
    expect(encryptField("ABCDE1234F")).not.toBe(encryptField("ABCDE1234F"));
  });

  it("detects tampering", () => {
    const enc = encryptField("ABCDE1234F");
    const parts = enc.split(":");
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("passes through values stored before encryption, and nulls", () => {
    expect(decryptField("ABCDE1234F")).toBe("ABCDE1234F");
    expect(decryptField(null)).toBeNull();
  });

  it("refuses a key of the wrong size", () => {
    const saved = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptField("x")).toThrow(/32 bytes/);
    process.env.DATA_ENCRYPTION_KEY = saved;
  });
});

describe("masking and hashing", () => {
  it("masks a PAN for non-owners", () => {
    expect(maskPan("ABCDE1234F")).toBe("AB••••••4F");
    expect(maskPan(null)).toBe("");
  });
  it("hashes identifiers one-way and case-insensitively", () => {
    const h = hashIdentifier("Riya@Example.com");
    expect(h).toBe(hashIdentifier("riya@example.com"));
    expect(h).not.toContain("riya");
    expect(h).toHaveLength(32);
  });
});
