# Brief extractor: evaluation results

40 labelled briefs (`briefs.ts`), all invented. They cover English and Hinglish, WhatsApp-style messages, formal purchase orders, paid, barter and hybrid deals, relative dates, tricky contract terms, and 3 prompt-injection attempts. Model: `gemini-3.5-flash-lite` (free tier), temperature 0, structured JSON output. Run with `npm run eval`.

| Run | Answered | Field accuracy | Fully correct | Red-flag precision / recall | Notes |
|---|---|---|---|---|---|
| 1 | 12 / 40 | 98.3% | 9 / 12 | 88.2% / 100% | 28 briefs got no answer: Gemini overloaded (503) and the client had no retries yet |
| 2 | 28 / 40 | 98.3% (121 fields) | 26 / 28 | 90.9% / 95.2% | Retries with backoff added. 12 still got no answer (overload). |
| 3a | 24 / 40 | 100% | 24 / 24 | 100% / 100% | Prompt fixes below. Run stopped at the 15-minute test limit while retrying the rest. |
| 3b | 16 remaining | 100% (72 fields) | 16 / 16 | 100% / 100% | Same prompt and code as 3a; 3 succeeded on the automatic retry |
| **3a + 3b** | **40 / 40** | **100%** | **40 / 40** | **100% / 100%** | Final prompt |

## What changed between runs (and why)

- **Prompt:** perpetual *usage* rights are not *ownership*. In run 1, "rights in perpetuity" was wrongly read as an ownership transfer.
- **Prompt:** a bonus on top of a guaranteed fixed fee is not conditional pay. This was a regression introduced by an earlier prompt change, caught in run 2.
- **Prompt:** hybrid means a fixed fee plus products. Products plus commission only counts as barter.
- **Label corrected** (`barter-plus-commission`): commission on sales *is* pay that depends on sales, so CONDITIONAL_PAYMENT was added to the expected flags. The model was right and the label was wrong.
- **Field un-scored** (`whitelisting`): "boost for 1 month" is the ad period, not stated usage rights, so the label was ambiguous.

## Caveats

- 40 briefs is a small set, written by us. Real briefs will be messier, so keep adding real (anonymised) ones that the extractor gets wrong.
- The free tier is often overloaded. In the app, the client retries 3 times per model, then falls back to `gemini-3.1-flash-lite`, within 45 seconds. Users can always fill the form by hand.
