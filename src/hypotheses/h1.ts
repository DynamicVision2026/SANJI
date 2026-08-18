export interface WeightedEvidenceRow {
  kanji: string;
  weight: number;
  evidenceId?: string;
}

export interface StateRecommendation {
  hypothesis: "H1";
  from_status: "undetected";
  to_status: "active";
  weighted_events: number;
  distinct_kanji: string[];
}

/**
 * Pure, recommendation-only H1 pilot. Rows are assumed to belong to one
 * student; production scoping and evidence accumulation are not integrated.
 */
export function recommendH1Activation(rows: readonly WeightedEvidenceRow[]): StateRecommendation | null {
  const weightedEvents = rows.reduce((sum, row) => {
    if (!Number.isFinite(row.weight) || row.weight < 0) throw new Error("weight must be finite and non-negative");
    return sum + row.weight;
  }, 0);
  const distinctKanji = [...new Set(rows.filter((row) => row.weight > 0).map((row) => row.kanji))].sort();
  return weightedEvents >= 3 && distinctKanji.length >= 2
    ? {
        hypothesis: "H1",
        from_status: "undetected",
        to_status: "active",
        weighted_events: weightedEvents,
        distinct_kanji: distinctKanji,
      }
    : null;
}
