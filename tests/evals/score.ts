// Scoring for the brief extractor. Pure functions, so they're unit-tested too.
import type { BriefExtraction } from "@/lib/ai/brief-schema";
import type { BriefCase } from "./briefs";

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : v);

/** Phone numbers match on their last 10 digits; text on case-insensitive equality or containment. */
export function fieldMatches(field: string, expected: unknown, actual: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined || actual === "";
  if (field === "contactPhone") {
    const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
    return digits(expected) === digits(actual);
  }
  if (typeof expected === "string") {
    const a = norm(actual);
    const e = norm(expected);
    return typeof a === "string" && (a === e || a.includes(e as string) || (e as string).includes(a));
  }
  return expected === actual;
}

type D = { platform: string; format: string; count: number; dueDate?: string | null };
/** Deliverables match as a set of platform+format+count (+ due date when the label has one). */
export function deliverablesMatch(expected: D[], actual: BriefExtraction["deliverables"]): boolean {
  if (expected.length !== actual.length) return false;
  const key = (d: D, withDate: boolean) => `${d.platform}|${d.format}|${d.count}${withDate ? `|${d.dueDate ?? null}` : ""}`;
  const remaining = actual.map((a) => ({ a, used: false }));
  return expected.every((e) => {
    const withDate = e.dueDate !== undefined;
    const hit = remaining.find((r) => !r.used && key(r.a, withDate) === key(e, withDate));
    if (hit) hit.used = true;
    return Boolean(hit);
  });
}

export interface CaseScore {
  id: string;
  fieldsChecked: number;
  fieldsCorrect: number;
  misses: string[];
  flagTruePos: number;
  flagFalsePos: string[];
  flagFalseNeg: string[];
}

export function scoreCase(c: BriefCase, got: BriefExtraction, gotFlags: string[]): CaseScore {
  const misses: string[] = [];
  let checked = 0;
  let correct = 0;
  for (const [field, expected] of Object.entries(c.expect)) {
    checked += 1;
    const actual = (got as Record<string, unknown>)[field];
    const ok =
      field === "deliverables"
        ? deliverablesMatch(expected as D[], got.deliverables)
        : fieldMatches(field, expected, actual);
    if (ok) correct += 1;
    else misses.push(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  const want = new Set(c.flags);
  const have = new Set(gotFlags.filter((f) => f !== "AI_NOTE"));
  return {
    id: c.id,
    fieldsChecked: checked,
    fieldsCorrect: correct,
    misses,
    flagTruePos: [...have].filter((f) => want.has(f)).length,
    flagFalsePos: [...have].filter((f) => !want.has(f)),
    flagFalseNeg: [...want].filter((f) => !have.has(f)),
  };
}

export function summarise(scores: CaseScore[]) {
  const fieldsChecked = scores.reduce((s, x) => s + x.fieldsChecked, 0);
  const fieldsCorrect = scores.reduce((s, x) => s + x.fieldsCorrect, 0);
  const tp = scores.reduce((s, x) => s + x.flagTruePos, 0);
  const fp = scores.reduce((s, x) => s + x.flagFalsePos.length, 0);
  const fn = scores.reduce((s, x) => s + x.flagFalseNeg.length, 0);
  const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 1000) / 10);
  return {
    cases: scores.length,
    perfectCases: scores.filter((s) => s.misses.length === 0 && s.flagFalsePos.length === 0 && s.flagFalseNeg.length === 0).length,
    fieldAccuracy: pct(fieldsCorrect, fieldsChecked),
    fieldsChecked,
    flagPrecision: pct(tp, tp + fp),
    flagRecall: pct(tp, tp + fn),
  };
}
