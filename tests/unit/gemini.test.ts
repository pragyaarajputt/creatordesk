// The Gemini client's retry and fallback behaviour, with the SDK replaced by a fake (no network).
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const { ApiError } = await import("@google/genai");
const { AiError, generateJson } = await import("@/lib/ai/gemini");

const ok = (data: unknown) => ({ text: JSON.stringify(data) });
const http = (status: number) => new ApiError({ message: `HTTP ${status}`, status });
const request = { system: "s", prompt: "p", jsonSchema: {}, budgetMs: 20_000 };

beforeEach(() => {
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "primary";
  process.env.GEMINI_FALLBACK_MODEL = "fallback";
});

describe("generateJson", () => {
  it("returns parsed JSON on the first try", async () => {
    generateContent.mockResolvedValueOnce(ok({ a: 1 }));
    await expect(generateJson(request)).resolves.toEqual({ data: { a: 1 }, model: "primary", attempts: 1 });
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ responseMimeType: "application/json", temperature: 0 });
  });

  it("retries the same model when it's overloaded (503)", async () => {
    generateContent.mockRejectedValueOnce(http(503)).mockResolvedValueOnce(ok({ a: 2 }));
    await expect(generateJson(request)).resolves.toEqual({ data: { a: 2 }, model: "primary", attempts: 2 });
  });

  it("switches to the fallback model straight away when rate-limited (429)", async () => {
    generateContent.mockRejectedValueOnce(http(429)).mockResolvedValueOnce(ok({ a: 3 }));
    const result = await generateJson(request);
    expect(result).toMatchObject({ model: "fallback", attempts: 2 });
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["primary", "fallback"]);
  });

  it("gives up with a friendly error after retries on both models", async () => {
    generateContent.mockRejectedValue(http(503));
    const error = await generateJson(request).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("unavailable");
    expect(error.message).not.toContain("503");
    expect(generateContent).toHaveBeenCalledTimes(6); // 3 attempts × 2 models
  }, 30_000);

  it("retries malformed JSON, and doesn't retry a bad request (400)", async () => {
    generateContent.mockResolvedValueOnce({ text: "not json" }).mockResolvedValueOnce(ok({ a: 4 }));
    await expect(generateJson(request)).resolves.toMatchObject({ data: { a: 4 }, attempts: 2 });

    generateContent.mockReset().mockRejectedValueOnce(http(400));
    await expect(generateJson(request)).rejects.toBeInstanceOf(ApiError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("respects the overall time budget", async () => {
    generateContent.mockRejectedValue(http(503));
    const started = Date.now();
    await expect(generateJson({ ...request, budgetMs: 1_500 })).rejects.toBeInstanceOf(AiError);
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
