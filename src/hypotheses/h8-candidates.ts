const IDS_OPERATORS = new Set([..."⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻"]);

export interface IdsRecord {
  kanji: string;
  components: string[];
}

export interface ConfusableCandidate {
  left: string;
  right: string;
  shared_components: string[];
  stroke_difference: number;
  decision: "pending";
  reviewer: null;
  reviewed_at: null;
}

export function parseIds(text: string, allowed: ReadonlySet<string>): IdsRecord[] {
  const records: IdsRecord[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const [, kanji, expression] = line.split("\t");
    if (!kanji || !expression || !allowed.has(kanji)) continue;
    const components = [...new Set([...expression].filter((char) => !IDS_OPERATORS.has(char) && char !== kanji && /\p{Script=Han}/u.test(char)))].sort();
    records.push({ kanji, components });
  }
  return records.sort((a, b) => a.kanji.localeCompare(b.kanji));
}

export function parseStrokeCounts(text: string, allowed: ReadonlySet<string>): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^U\+([0-9A-F]+)\tkTotalStrokes\t(\d+)/u);
    if (!match) continue;
    const kanji = String.fromCodePoint(Number.parseInt(match[1]!, 16));
    if (allowed.has(kanji)) result.set(kanji, Number(match[2]));
  }
  return result;
}

export function generateCandidates(ids: readonly IdsRecord[], strokes: ReadonlyMap<string, number>): ConfusableCandidate[] {
  const candidates: ConfusableCandidate[] = [];
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const left = ids[leftIndex]!;
      const right = ids[rightIndex]!;
      const leftStrokes = strokes.get(left.kanji);
      const rightStrokes = strokes.get(right.kanji);
      if (leftStrokes === undefined || rightStrokes === undefined) continue;
      const strokeDifference = Math.abs(leftStrokes - rightStrokes);
      if (strokeDifference > 1) continue;
      const shared = left.components.filter((component) => right.components.includes(component));
      if (shared.length === 0) continue;
      candidates.push({
        left: left.kanji,
        right: right.kanji,
        shared_components: shared,
        stroke_difference: strokeDifference,
        decision: "pending",
        reviewer: null,
        reviewed_at: null,
      });
    }
  }
  return candidates.sort(
    (a, b) =>
      b.shared_components.length - a.shared_components.length ||
      a.stroke_difference - b.stroke_difference ||
      `${a.left}${a.right}`.localeCompare(`${b.left}${b.right}`),
  );
}

