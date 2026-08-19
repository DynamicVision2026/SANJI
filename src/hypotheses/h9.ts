export interface H9AggregateObservation {
  recognitionAttempts: number;
  recognitionCorrect: number;
  productionAttempts: number;
  productionCorrect: number;
}

export interface H9Thresholds {
  minimumObservationsPerSide: number;
  accuracyGapThreshold: number;
}

export interface H9AggregateEvidence {
  hypothesis: "H9";
  recognitionAccuracy: number;
  productionAccuracy: number;
  gap: number;
}

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Evaluate one closed aggregate window; individual result pairs are never H9 evidence. */
export function evaluateH9Aggregate(
  observation: H9AggregateObservation,
  thresholds: H9Thresholds,
): H9AggregateEvidence | null {
  const counts = [
    observation.recognitionAttempts,
    observation.recognitionCorrect,
    observation.productionAttempts,
    observation.productionCorrect,
  ];
  if (!counts.every(validCount)) throw new Error("H9 observation counts must be non-negative integers");
  if (observation.recognitionCorrect > observation.recognitionAttempts
      || observation.productionCorrect > observation.productionAttempts) {
    throw new Error("H9 correct counts cannot exceed attempts");
  }
  if (!Number.isInteger(thresholds.minimumObservationsPerSide)
      || thresholds.minimumObservationsPerSide < 3) {
    throw new Error("H9 minimum observations must be an integer of at least 3");
  }
  if (!Number.isFinite(thresholds.accuracyGapThreshold)
      || thresholds.accuracyGapThreshold < 0
      || thresholds.accuracyGapThreshold > 1) {
    throw new Error("H9 accuracy gap threshold must be a fraction in [0, 1]");
  }
  if (observation.recognitionAttempts < thresholds.minimumObservationsPerSide
      || observation.productionAttempts < thresholds.minimumObservationsPerSide) return null;

  const recognitionAccuracy = observation.recognitionCorrect / observation.recognitionAttempts;
  const productionAccuracy = observation.productionCorrect / observation.productionAttempts;
  const gap = recognitionAccuracy - productionAccuracy;
  if (gap < thresholds.accuracyGapThreshold) return null;
  return { hypothesis: "H9", recognitionAccuracy, productionAccuracy, gap };
}
