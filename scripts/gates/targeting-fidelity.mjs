#!/usr/bin/env node
/**
 * §15.6 Targeting Fidelity Gate — STUB (new in 2.2).
 *
 * Full check (when generation exists, Weeks 3/7, §18): against fixture students
 * with deliberately distinct error profiles, generate worksheets and assert:
 *   - targeting fidelity >= 80% (items map to that student's weak points)
 *   - cross-student divergence below the cohort threshold (default 20%)
 *   - every relaxation event appears in worksheets.relaxation_events and is
 *     reflected in the persisted fidelity figure
 *
 * Rationale (§1.1 / §15.6): personalization at scale is the reason the product
 * exists. Without this gate, targeting degrades silently through corpus reuse
 * and relaxation fallbacks until worksheets are effectively generic.
 */
import { stubGate } from "./_common.mjs";

stubGate(
  "Targeting Fidelity Gate",
  "§15.6",
  "worksheets silently degrading toward generic content (fidelity < 80%, or hidden relaxation)",
  "generation pipeline Weeks 3/7 (§18)",
);
