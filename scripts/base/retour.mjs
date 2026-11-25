// Le retour arrière (supabase/retours/0009-0006.sql) rend-il l'état de 0005 ?
//   node scripts/base/retour.mjs supabase/migrations supabase/retours/0009-0006.sql
import { PGlite } from "./pglite.mjs";
import { readFileSync, readdirSync } from "node:fs";
const [dm, retour] = process.argv.slice(2);
const fs = readdirSync(dm).filter((f) => f.endsWith(".sql")).sort();
const db = new PGlite();
let ko = 0;
const vrai = (c, n, d = "") => { console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : d}`); if (!c) ko++; };
for (const f of fs.filter((f) => f < "0006")) await db.exec(readFileSync(`${dm}/${f}`, "utf8"));
await db.query(`insert into utilisateur (id, pseudo) values ('u_0000000000000000000000000000000a','A'), ('u_0000000000000000000000000000000b','B')`);
await db.query(`insert into performance (utilisateur_id, mode, cle, version_contenu, jour, graine, regle, valeur) values ('u_0000000000000000000000000000000a','daily','k','v',1,1,'sang',3)`);
await db.query(`insert into demande_ami (de_id, a_id, cree_le) values ('u_0000000000000000000000000000000a','u_0000000000000000000000000000000b', now() - interval '1 h'), ('u_0000000000000000000000000000000b','u_0000000000000000000000000000000a', now())`);
const avant = (await db.query(`select (select string_agg(id, ',' order by id) from utilisateur) u, (select string_agg(id::text, ',') from performance) p, (select count(*) from demande_ami) d`)).rows[0];
for (const f of fs.filter((f) => f >= "0006")) await db.exec(readFileSync(`${dm}/${f}`, "utf8"));
await db.query(`select performance_pose($1)`, [JSON.stringify({ utilisateur_id: "00000000-0000-0000-0000-00000000000b", mode: "daily", cle: "k2", version_contenu: "v", jour: 2, graine: 1, regle: "azur", valeur: 9 })]);
try { await db.exec(readFileSync(retour, "utf8")); vrai(true, "retour arrière exécuté"); }
catch (e) { vrai(false, "retour arrière exécuté", e.message); process.exit(1); }
const apres = (await db.query(`select (select string_agg(id, ',' order by id) from utilisateur) u, (select count(*) from demande_ami) d`)).rows[0];
vrai(apres.u === avant.u, "identifiants u_<hex> restaurés à l'identique", apres.u);
vrai(Number(apres.d) === Number(avant.d), "demande croisée archivée restaurée");
const p = (await db.query(`select id, utilisateur_id from performance order by id`)).rows;
vrai(p.length === 2 && String(p[0].id) === avant.p, "ancien numéro de performance restauré, la neuve en reçoit un", JSON.stringify(p));
const t = (await db.query(`select table_name from information_schema.tables where table_schema='public' order by 1`)).rows.map((r) => r.table_name).join(",");
vrai(t === "amitie,demande_ami,lien_plateforme,performance,utilisateur", "schéma de 0005 exactement", t);
// et la chaîne repart : on peut réappliquer 0006→0009
try { for (const f of fs.filter((f) => f >= "0006")) await db.exec(readFileSync(`${dm}/${f}`, "utf8")); vrai(true, "0006→0009 réappliquées après le retour"); }
catch (e) { vrai(false, "0006→0009 réappliquées après le retour", e.message); }
process.exit(ko ? 1 : 0);
