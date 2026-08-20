#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const client = new pg.Client({ connectionString: DB_URL });

try {
  await client.connect();
  await client.query("drop schema public cascade; create schema public;");

  const migrations = readdirSync(join(ROOT, "db/migrations"))
    .filter((file) => file.endsWith(".sql") && file < "0014_item_target_reading_ids.sql")
    .sort();
  for (const file of migrations) {
    await client.query(readFileSync(join(ROOT, "db/migrations", file), "utf8"));
  }

  const readingId = (
    await client.query(
      `insert into kanji_reading_stage
         (kanji, reading_kana, reading_type, school_stage, elementary_grade, source_page)
       values ('一', 'いち', 'on', 'elementary', 1, 1)
       returning id`,
    )
  ).rows[0].id;
  const preservedItemId = (
    await client.query(
      "insert into items(item_type, target_kanji, target_reading_id) values ('yomi', '一', $1) returning id",
      [readingId],
    )
  ).rows[0].id;
  const nullItemId = (
    await client.query("insert into items(item_type, target_kanji) values ('yomi', '一') returning id")
  ).rows[0].id;

  await client.query(
    readFileSync(join(ROOT, "db/migrations/0014_item_target_reading_ids.sql"), "utf8"),
  );

  const column = (
    await client.query(
      `select data_type, udt_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'items'
          and column_name = 'target_reading_ids'`,
    )
  ).rows[0];
  if (column?.data_type !== "ARRAY" || column?.udt_name !== "_int8") {
    throw new Error(`target_reading_ids is not bigint[]: ${JSON.stringify(column)}`);
  }

  const rows = await client.query(
    "select id, target_reading_id, target_reading_ids from items where id = any($1::uuid[]) order by id",
    [[preservedItemId, nullItemId]],
  );
  const preserved = rows.rows.find((row) => row.id === preservedItemId);
  const untouchedNull = rows.rows.find((row) => row.id === nullItemId);
  if (
    preserved?.target_reading_ids?.length !== 1 ||
    preserved.target_reading_ids[0] !== preserved.target_reading_id
  ) {
    throw new Error(`singular value was not preserved: ${JSON.stringify(preserved)}`);
  }
  if (untouchedNull?.target_reading_ids !== null) {
    throw new Error(`NULL singular value must remain NULL: ${JSON.stringify(untouchedNull)}`);
  }

  console.log("item target-reading migration: PASS");
  console.log("  ✓ items.target_reading_ids is bigint[]");
  console.log("  ✓ existing singular reading ID preserved as one-element array");
  console.log("  ✓ existing NULL reading ID remains NULL");
} finally {
  await client.end();
}
