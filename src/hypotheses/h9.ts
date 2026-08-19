export interface PairableItem {
  id: string;
  target_kanji: string;
  target_reading_id: number;
  item_type: "yomi" | "kakitori" | string;
}

export interface H9Pair {
  recognition_item_id: string;
  production_item_id: string;
  target_kanji: string;
  target_reading_id: number;
}

export interface ItemResult {
  item_id: string;
  is_correct: boolean;
}

export function pairH9Items(items: readonly PairableItem[]): H9Pair[] {
  const recognition = items.filter(({ item_type }) => item_type === "yomi").sort((a, b) => a.id.localeCompare(b.id));
  const production = items.filter(({ item_type }) => item_type === "kakitori").sort((a, b) => a.id.localeCompare(b.id));
  const usedProduction = new Set<string>();
  const pairs: H9Pair[] = [];

  for (const readItem of recognition) {
    const writeItem = production.find(
      (item) =>
        !usedProduction.has(item.id) &&
        item.target_kanji === readItem.target_kanji &&
        item.target_reading_id === readItem.target_reading_id,
    );
    if (!writeItem) continue;
    usedProduction.add(writeItem.id);
    pairs.push({
      recognition_item_id: readItem.id,
      production_item_id: writeItem.id,
      target_kanji: readItem.target_kanji,
      target_reading_id: readItem.target_reading_id,
    });
  }
  return pairs;
}

export function h9Evidence(pair: H9Pair, results: readonly ItemResult[]) {
  const recognition = results.find(({ item_id }) => item_id === pair.recognition_item_id);
  const production = results.find(({ item_id }) => item_id === pair.production_item_id);
  if (!recognition || !production || recognition.is_correct === production.is_correct) return null;
  return {
    hypothesis: "H9" as const,
    target_kanji: pair.target_kanji,
    target_reading_id: pair.target_reading_id,
    recognition_correct: recognition.is_correct,
    production_correct: production.is_correct,
    item_ids: [pair.recognition_item_id, pair.production_item_id] as const,
  };
}

