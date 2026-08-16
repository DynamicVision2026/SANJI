#!/usr/bin/env node
/**
 * §15.1 Specificity Gate — STUB.
 *
 * Full check (when report generation exists, Weeks 3–4 / 8, §18): for any two
 * students in the same branch and period, Jaccard similarity of
 * reports.content.specific_facts MUST be < 0.5, and specific_facts.length >= 5,
 * with at least one fixture whose error profile derives entirely from
 * manual_error_entries (§10.3).
 */
import { stubGate } from "./_common.mjs";

stubGate(
  "Specificity Gate",
  "§15.1",
  "parent reports degrading into generic, interchangeable prose (Jaccard >= 0.5)",
  "report fixtures — Weeks 3–4/8 (§18)",
);
