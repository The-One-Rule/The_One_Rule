// 0006 doit REFUSER un identifiant hors format, et ne rien changer.
//   node scripts/base/refus-0006.mjs supabase/migrations
import { PGlite } from "./pglite.mjs";
import { readFileSync, readdirSync } from "node:fs";
const d = process.argv[2];
const fs = readdirSync(d).filter((f) => f.endsWith(".sql")).sort();
const db = new PGlite();
for (const f of fs.filter((f) => f < "0006")) await db.exec(readFileSync(`${d}/${f}`, "utf8"));
await db.query(`insert into utilisateur (id) values ('u_00000000000000000000000000000001'), ('compte-bizarre')`);
try {
  await db.exec(readFileSync(`${d}/0006_identifiants_uuid.sql`, "utf8"));
  console.log("✗ 0006 aurait dû refuser");
} catch (e) {
  console.log("✓ 0006 refuse :", e.message);
}
const t = await db.query(`select data_type from information_schema.columns where table_name='utilisateur' and column_name='id'`);
const p = await db.query(`select data_type from information_schema.columns where table_name='performance' and column_name='id'`);
console.log(t.rows[0].data_type === "text" && p.rows[0].data_type === "bigint" ? "✓ rien n'a changé (text, bigint)" : "✗ état partiel : " + JSON.stringify([t.rows, p.rows]));
