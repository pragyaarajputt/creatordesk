// Live accuracy check of the brief extractor against Gemini. Not part of `npm test` (needs the network and an API key).
// Run: npm run eval   (paced for the free tier, about 4 minutes for 40 briefs)
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { extractBrief } from "@/lib/ai/extract-brief";
import { BRIEF_CASES, EVAL_TODAY } from "./briefs";
import { scoreCase, summarise, type CaseScore } from "./score";

const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 4500);
const only = process.env.EVAL_ONLY?.split(",");

test("brief extraction accuracy", async () => {
  const cases = only ? BRIEF_CASES.filter((c) => only.includes(c.id)) : BRIEF_CASES;
  const scores: CaseScore[] = [];
  const models = new Map<string, number>();
  const errors: string[] = [];
  const latencies: number[] = [];
  const started = Date.now();

  const failed: typeof cases = [];
  const run = async (c: (typeof cases)[number], final: boolean) => {
    try {
      const t0 = Date.now();
      const { extraction, flags, model } = await extractBrief(c.brief, EVAL_TODAY);
      latencies.push(Date.now() - t0);
      models.set(model, (models.get(model) ?? 0) + 1);
      const s = scoreCase(c, extraction, flags.map((f) => f.code));
      scores.push(s);
      const ok = s.misses.length === 0 && !s.flagFalsePos.length && !s.flagFalseNeg.length;
      console.log(`${ok ? "OK  " : "MISS"} ${c.id} (${Date.now() - t0} ms)`);
      for (const m of s.misses) console.log(`      field  ${m}`);
      if (s.flagFalsePos.length) console.log(`      extra flags   ${s.flagFalsePos.join(", ")}`);
      if (s.flagFalseNeg.length) console.log(`      missed flags  ${s.flagFalseNeg.join(", ")}`);
    } catch (error) {
      // Overload/timeouts on the free tier: try once more at the end; only then count as an error.
      if (!final) failed.push(c);
      else errors.push(`${c.id}: ${(error as Error).message}`);
      console.log(`ERR  ${c.id} ${(error as Error).message} ${(error as { detail?: string }).detail ?? ""}`);
    }
  };

  for (const [i, c] of cases.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    await run(c, false);
  }
  if (failed.length) {
    console.log(`
Retrying ${failed.length} brief(s) that failed to get an answer, after a pause…`);
    await new Promise((r) => setTimeout(r, 30_000));
    for (const c of failed) {
      await new Promise((r) => setTimeout(r, DELAY_MS * 2));
      await run(c, true);
    }
  }

  latencies.sort((a, b) => a - b);
  const summary = {
    ...summarise(scores),
    errors: errors.length,
    retriedAfterOverload: failed.length,
    medianLatencyMs: latencies[Math.floor(latencies.length / 2)] ?? null,
    models: Object.fromEntries(models),
    seconds: Math.round((Date.now() - started) / 1000),
  };
  console.log("\nSUMMARY " + JSON.stringify(summary, null, 2));
  if (!only) {
    writeFileSync("tests/evals/last-report.json", JSON.stringify({ ranAt: new Date().toISOString(), summary, scores, errors }, null, 2));
  }

  expect(errors.length).toBeLessThanOrEqual(Math.ceil(cases.length * 0.1));
  expect(summary.fieldAccuracy).toBeGreaterThanOrEqual(85);
}, 2_400_000);
