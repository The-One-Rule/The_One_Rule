// Le VRAI DepotSupabase contre un vrai PostgreSQL, via un faux PostgREST qui
// traduit `POST rpc/<fn>` en arguments nommés — ce que PostgREST fait. Attrape
// un nom ou un type d'argument qui ne correspondrait pas à la fonction SQL.
//   npx vite-node scripts/base/depot.ts .
import { PGlite } from "./pglite.mjs";
import { readFileSync, readdirSync } from "node:fs";
const RACINE = process.argv[2]!;
const { DepotSupabase, utilisateurNeuf } = await import(`${RACINE}/api/_depot.ts`);
const { agregatsVides } = await import(`${RACINE}/shared/compte.ts`);

const db = new PGlite();
const dm = `${RACINE}/supabase/migrations`;
for (const f of readdirSync(dm).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(`${dm}/${f}`, "utf8"));
const types = new Map<string, Map<string, string>>();
for (const r of (await db.query<{ f: string; args: string }>(`select p.proname f, pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows) {
  types.set(r.f, new Map(r.args.split(", ").filter(Boolean).map((a) => { const [n, ...t] = a.split(" "); return [n!, t.join(" ")]; })));
}

let ko = 0;
const vrai = (c: boolean, n: string, d = "") => { console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : d}`); if (!c) ko++; };

globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  const chemin = String(url).replace("https://base.test/rest/v1/", "");
  if (!chemin.startsWith("rpc/")) return new Response("non émulé : " + chemin, { status: 501 });
  const nom = chemin.slice(4);
  const sig = types.get(nom);
  if (!sig) return new Response(`fonction inconnue ${nom}`, { status: 404 });
  const args = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
  for (const k of Object.keys(args)) if (!sig.has(k)) return new Response(`argument inconnu ${nom}.${k}`, { status: 400 });
  const noms = Object.keys(args);
  const valeurs = noms.map((k) => {
    const v = args[k];
    const t = sig.get(k)!;
    return t === "jsonb" ? JSON.stringify(v) : v;
  });
  const appel = `select ${nom}(${noms.map((k, i) => `${k} := $${i + 1}::${sig.get(k)}`).join(", ")}) as r`;
  try {
    const r = await db.query<{ r: unknown }>(appel, valeurs);
    return new Response(JSON.stringify(r.rows[0]?.r ?? null), { status: 200 });
  } catch (e) {
    return new Response(String((e as Error).message), { status: 400 });
  }
}) as typeof fetch;

const d = new DepotSupabase("https://base.test", "cle");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ua = await d.cree(utilisateurNeuf(A, 0), { fournisseur: "google", idExterne: "a" });
vrai(ua.id === A && ua.revision === 0, "cree → compte_cree, ligne relue par litLigne", JSON.stringify(ua).slice(0, 120));
const ub = await d.cree(utilisateurNeuf(B, 0), { fournisseur: "google", idExterne: "b" });
const ua2 = await d.cree(utilisateurNeuf(B, 0), { fournisseur: "google", idExterne: "a" });
vrai(ua2.id === A, "même lien : le compte existant revient");

const ag = { ...agregatsVides(), carnet: { sang: { best: 16, cleared: true, pieges: 2, etoiles: [3, 3, 3, 2, 1] }, gaucher: { best: 3, cleared: false } } };
vrai(await d.majAgregats(A, 0, ag) === true, "majAgregats → agregats_ecrit (CAS ok)");
vrai(await d.majAgregats(A, 0, ag) === false, "majAgregats révision périmée → false");
const col = await d.collection(A);
vrai(col.cartes.length === 2 && col.cartes.find((c: { regle: string }) => c.regle === "sang")?.maitrisee === true, "collection → cartes projetées, maîtrise", JSON.stringify(col.cartes));
vrai(col.chapitres.length === 1 && col.chapitres[0].termine === true && col.chapitres[0].numero === 1, "collection → chapitre terminé", JSON.stringify(col.chapitres));

const perf = { utilisateurId: A, mode: "daily", cle: "daily|j:300", versionContenu: "v", jour: 300, graine: 7, regle: "sang", valeur: 22, valeur2: 9000, verdictBot: "humain", creeLe: 0 };
vrai(await d.posePerf(perf) === true, "posePerf → performance_pose (écrit)");
vrai(await d.posePerf({ ...perf, valeur: 10 }) === false, "posePerf moins bien → false");
const col2 = await d.collection(A);
vrai(col2.meilleurs[0]?.valeur === 22 && col2.statistique?.runsVerifies === 2 && col2.statistique?.joursClasses === 1, "record et statistique relus", JSON.stringify([col2.meilleurs, col2.statistique]));

vrai(await d.demandeAmi(A, B, 50, 20) === "demande", "demandeAmi → amitie_demande");
vrai(await d.accepteAmi(A, B, 50) === "inconnu", "accepteAmi de ce qu'on a envoyé → inconnu");
vrai(await d.accepteAmi(B, A, 50) === "lie", "accepteAmi de ce qu'on a reçu → lie");

const imp = await d.importeBoutique(A, "app-1", 400, ["bonbon"]);
vrai(imp.issue === "ok" && imp.pieces === 400 && imp.possedes.includes("bonbon"), "importeBoutique → boutique_importe (text[] passé)", JSON.stringify(imp));
const k = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ach = await d.acheteSkin(A, "neon", k);
vrai(ach.issue === "ok" && ach.pieces === 250 && ach.porte === "neon", "acheteSkin → boutique_achete", JSON.stringify(ach));
vrai((await d.acheteSkin(A, "neon", k)).rejoue === true, "acheteSkin rejoué → même achat");
vrai(await d.porteSkin(A, "bonbon") === true && (await d.boutique(A))?.porte === "bonbon", "porteSkin → boutique_porte, relu par boutique_etat");
vrai(await d.porteSkin(A, "craie") === false, "porteSkin non possédé → false");

await d.supprime(A);
const n = (await db.query<{ n: number }>(`select (select count(*) from performance where utilisateur_id=$1)::int + (select count(*) from lien_plateforme where utilisateur_id=$1)::int + (select count(*) from amitie where utilisateur_id=$1 or ami_id=$1)::int n`, [A])).rows[0]!.n;
vrai(n === 0, "supprime → compte_supprime : performances, liens, amitiés partis");
vrai((await d.boutique(A)) === null, "boutique d'un compte supprimé → null");
void ub;
console.log(ko ? `${ko} échec(s)` : "tout passe");
process.exit(ko ? 1 : 0);
