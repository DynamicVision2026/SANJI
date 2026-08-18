import { readFileSync } from "node:fs";

import kyoiku from "../src/curriculum/data/kanji_teach_grade.json";
import { generateCandidates, parseIds, parseStrokeCounts } from "../src/hypotheses/h8-candidates";

const [idsPath, strokesPath] = process.argv.slice(2);
if (!idsPath || !strokesPath) throw new Error("usage: generate-h8-candidates.ts IDS.txt Unihan_IRGSources.txt");

const allowed = new Set(kyoiku.map(({ kanji }) => kanji));
const candidates = generateCandidates(
  parseIds(readFileSync(idsPath, "utf8"), allowed),
  parseStrokeCounts(readFileSync(strokesPath, "utf8"), allowed),
);

console.log(JSON.stringify(candidates.slice(0, 200), null, 2));

