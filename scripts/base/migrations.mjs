// VALIDATION DES MIGRATIONS sur un vrai PostgreSQL 17 (PGlite, en WASM).
//
//   npm i --no-save @electric-sql/pglite@0.3
//   node scripts/base/migrations.mjs supabase/migrations
//
// Charge 0001→0005, pose des données « d'avant » (identifiants u_…, demandes
// croisées), applique 0006→0009, puis éprouve conversions, contraintes,
// idempotence et chaque fonction transactionnelle. Code 1 au premier échec
// compté. Voir docs/BASE-DE-DONNEES.md §9.
import { PGlite } from "./pglite.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dossier = process.argv[2];
const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".sql")).sort();
const lit = (f) => readFileSync(join(dossier, f), "utf8");
let ok = 0, ko = 0;
const vrai = (cond, nom, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom} ${detail}`); }
};
const leve = async (db, sql, params, nom, motif) => {
  try { await db.query(sql, params); vrai(false, nom, "(aucune erreur levée)"); }
  catch (e) { vrai(!motif || String(e.message).includes(motif), nom, String(e.message)); }
};
const un = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const hex = (n) => n.toString(16).padStart(32, "0");

const db = new PGlite();
const notices = [];
db.onNotice?.((n) => notices.push(n.message));

console.log("— 0001 à 0005, puis des données « d'avant »");
for (const f of fichiers.filter((f) => f < "0006")) await db.exec(lit(f));
const U = (i) => `u_${hex(i)}`;
for (let i = 1; i <= 5; i++) {
  await db.query(`insert into utilisateur (id, pseudo, apparence) values ($1, $2, $3)`,
    [U(i), `J${i}`, JSON.stringify(i === 1 ? { glyphe: 3, carte: "sang" } : { glyphe: 0 })]);
}
await db.query(`insert into lien_plateforme values ('google','g1',$1)`, [U(1)]);
await db.query(`insert into performance (utilisateur_id, mode, cle, version_contenu, jour, graine, regle, valeur, valeur2, verdict_bot)
  values ($1,'daily','k1','v',100,1,'sang',12,5000,'humain'), ($1,'daily','k2','v',101,1,'azur',20,4000,'humain'),
         ($2,'daily','k1','v',100,1,'sang',30,9000,'douteux')`, [U(1), U(2)]);
await db.query(`insert into amitie values ($1,$2),($2,$1)`, [U(1), U(2)]);
// demandes croisées 3↔4 (la plus récente : 4→3), et une simple 5→1
await db.query(`insert into demande_ami (de_id, a_id, cree_le) values ($1,$2, now() - interval '1 hour'), ($2,$1, now()), ($3,$4, now())`, [U(3), U(4), U(5), U(1)]);

console.log("— 0006 à 0009");
for (const f of fichiers.filter((f) => f >= "0006")) { try { await db.exec(lit(f)); } catch (e) { console.log(`ÉCHEC ${f} : ${e.message} | ${e.where ?? ""}`); process.exit(2); } }
const typeId = await un(db, `select data_type from information_schema.columns where table_name='utilisateur' and column_name='id'`);
vrai(typeId.data_type === "uuid", "utilisateur.id est un uuid");
const u1 = await un(db, `select id::text as id, carte_banniere_id from utilisateur where pseudo='J1'`);
vrai(u1.id === "00000000-0000-0000-0000-000000000001", "conversion u_<hex> → uuid sans perte", u1.id);
vrai(u1.carte_banniere_id !== null, "bannière dérivée de apparence.carte au rattrapage");
const lien = await un(db, `select utilisateur_id::text from lien_plateforme`);
vrai(lien.utilisateur_id === u1.id, "lien_plateforme suit la conversion");
const perfId = await un(db, `select count(distinct id) n, count(ancien_id) a from performance`);
vrai(Number(perfId.n) === 3 && Number(perfId.a) === 3, "performance : uuid neuf par ligne, ancien_id conservé");
const fk = await db.query(`select conname from pg_constraint where conname in ('amitie_ami_id_fkey','demande_ami_de_id_fkey','demande_ami_a_id_fkey')`);
vrai(fk.rows.length === 3, "noms de clés étrangères utilisés par PostgREST conservés");
const croisees = await db.query(`select de_id::text, a_id::text from demande_ami order by de_id`);
vrai(croisees.rows.length === 2 && !croisees.rows.some((r) => r.de_id.endsWith("4")), "croisée : la plus récente (4→3) archivée, l'autre gardée", JSON.stringify(croisees.rows));
const arch = await un(db, `select count(*) n from archive_demande_ami_0008`);
vrai(Number(arch.n) === 1, "archive de la demande retirée");
const stat = await un(db, `select runs_verifies, jours_classes from statistique where utilisateur_id = $1`, [u1.id]);
vrai(stat && stat.runs_verifies === 2 && stat.jours_classes === 2, "statistique rattrapée depuis performance");
const ms2 = await un(db, `select count(*) n from meilleur_score ms join utilisateur u on u.id=ms.utilisateur_id where u.pseudo='J2'`);
vrai(Number(ms2.n) === 0, "un run DOUTEUX ne devient pas un record");
const ms1 = await un(db, `select valeur from meilleur_score ms join utilisateur u on u.id=ms.utilisateur_id where u.pseudo='J1'`);
vrai(ms1.valeur === 20, "record du mode = meilleure performance humaine");
const offert = await un(db, `select count(*) n from skin_utilisateur where origine='offert'`);
vrai(Number(offert.n) === 5, "style par défaut offert à chaque compte existant");
const cat = await un(db, `select (select count(*) from regle) r, (select count(*) from carte) c, (select count(*) from chapitre) ch, (select count(*) from skin) s, (select count(*) from mode_jeu_regle) mr`);
vrai(Number(cat.r) === 16 && Number(cat.c) === 16 && Number(cat.ch) === 16 && Number(cat.s) === 5, "catalogue : 16 règles, 16 cartes, 16 chapitres, 5 styles");
vrai(Number(cat.mr) === 16 * 3 + 15 + 16, "mode_jeu_regle : daily/entraînement/pile 16, multi 15, parcours 16", cat.mr);
const valid = await db.query(`select conname, convalidated from pg_constraint where conname in ('performance_mode_fkey','performance_regle_fkey')`);
vrai(valid.rows.every((r) => r.convalidated), "clés étrangères mode/règle de performance validées");

console.log("— idempotence : tout rejouer");
try { for (const f of fichiers) await db.exec(lit(f)); vrai(true, "0001→0009 rejouées sans erreur"); }
catch (e) { vrai(false, "0001→0009 rejouées sans erreur", e.message); }
const cat2 = await un(db, `select (select count(*) from regle) r, (select count(*) from mode_jeu_regle) mr, (select count(*) from performance) p, (select count(*) from demande_ami) d`);
vrai(Number(cat2.r) === 16 && Number(cat2.mr) === Number(cat.mr) && Number(cat2.p) === 3 && Number(cat2.d) === 2, "rien de dupliqué ni de perdu au rejeu");

console.log("— contraintes");
await leve(db, `insert into utilisateur (id, pieces) values (gen_random_uuid(), -1)`, [], "pieces < 0 refusé", "utilisateur_pieces_positif");
await leve(db, `insert into amitie values ($1,$1)`, [u1.id], "auto-amitié refusée", "check");
await leve(db, `insert into demande_ami (de_id, a_id) select a_id, de_id from demande_ami limit 1`, [], "demande croisée en double refusée", "demande_ami_paire");
await leve(db, `update utilisateur set skin_porte_id = (select id from skin where code='craie') where id = $1`, [u1.id], "porter un style NON possédé refusé", "utilisateur_skin_porte_fkey");
await leve(db, `insert into progression_chapitre (utilisateur_id, chapitre_id, etoiles) select $1, id, '{4,0,0,0,0}' from chapitre limit 1`, [u1.id], "étoile > 3 refusée", "check");
await leve(db, `insert into progression_chapitre (utilisateur_id, chapitre_id, etoiles) select $1, id, '{1,1}' from chapitre limit 1`, [u1.id], "étoiles ≠ 5 cases refusées", "check");
await leve(db, `delete from regle where code='sang'`, [], "règle référencée : suppression refusée (restrict)", "foreign key");
await leve(db, `insert into mouvement_pieces (utilisateur_id, delta, motif, cle) values ($1, -5, 'achat', 'x')`, [u1.id], "débit sans achat refusé", "check");

console.log("— compte_cree");
const id9 = "11111111-1111-4111-8111-111111111111";
const c1 = await un(db, `select compte_cree($1,'NEUF','{"glyphe":1}','{}','discord','d9') r`, [id9]);
const c2 = await un(db, `select compte_cree(gen_random_uuid(),'AUTRE','{"glyphe":2}','{}','discord','d9') r`);
vrai(c1.r.id === id9 && c2.r.id === id9, "même lien deux fois → même compte, pas de second compte");
const n9 = await un(db, `select count(*) n from utilisateur where pseudo in ('NEUF','AUTRE')`);
vrai(Number(n9.n) === 1, "aucun compte orphelin");
await leve(db, `select compte_cree($1,'X','{}','{}',NULL,'d10')`, [id9], "lien invalide → TOUT annulé");
const n9b = await un(db, `select count(*) n from utilisateur where id = $1`, [id9]);
vrai(Number(n9b.n) === 1, "l'échec n'a laissé aucune trace");

console.log("— agregats_ecrit");
const cartes = JSON.stringify([{ regle: "sang", meilleur: 7, pieges: 2, runs: 3, maitrisee: false }, { regle: "inconnue", meilleur: 1 }]);
const chap = JSON.stringify([{ regle: "sang", etoiles: [3, 2, 0, 0, 0] }]);
const a1 = await un(db, `select agregats_ecrit($1, 0, '{"carnet":{}}', $2, $3) r`, [id9, cartes, chap]);
vrai(a1.r === true, "CAS à la bonne révision : écrit");
const a2 = await un(db, `select agregats_ecrit($1, 0, '{"carnet":{"x":1}}', '[]', '[]') r`, [id9]);
vrai(a2.r === false, "CAS à une révision périmée : refusé");
const cu = await un(db, `select meilleur, pieges, runs from carte_utilisateur where utilisateur_id = $1`, [id9]);
vrai(cu && cu.meilleur === 7 && cu.pieges === 2, "projection de carte écrite (code inconnu ignoré)");
await un(db, `select agregats_ecrit($1, 1, '{}', $2, $3)`, [id9, JSON.stringify([{ regle: "sang", meilleur: 3, pieges: 5, runs: 1, maitrisee: true }]), JSON.stringify([{ regle: "sang", etoiles: [1, 3, 0, 0, 2] }])]);
const cu2 = await un(db, `select meilleur, pieges, runs, maitrisee from carte_utilisateur where utilisateur_id = $1`, [id9]);
vrai(cu2.meilleur === 7 && cu2.pieges === 5 && cu2.runs === 3 && cu2.maitrisee, "projection monotone : maximum, jamais affectation");
const pc = await un(db, `select etoiles, termine, termine_le from progression_chapitre where utilisateur_id = $1`, [id9]);
vrai(JSON.stringify(pc.etoiles) === "[3,3,0,0,2]" && pc.termine && pc.termine_le, "étoiles au maximum case par case, boss battu → terminé", JSON.stringify(pc));
await leve(db, `select agregats_ecrit($1, 2, '{"apres":1}', $2, '[]')`, [id9, JSON.stringify([{ regle: "sang", meilleur: -4 }])], "projection invalide → agrégats NON écrits non plus");
const rev = await un(db, `select revision, agregats from utilisateur where id = $1`, [id9]);
vrai(rev.revision === 2 && !rev.agregats.apres, "révision et agrégats inchangés après l'échec");

console.log("— performance_pose");
const P = (valeur, valeur2, verdict = "humain", cle = "j1") => JSON.stringify({ utilisateur_id: id9, mode: "daily", cle, version_contenu: "v", jour: 200, graine: 5, regle: "sang", valeur, valeur2, verdict_bot: verdict });
vrai((await un(db, `select performance_pose($1) r`, [P(10, 5000)])).r === true, "première performance écrite");
vrai((await un(db, `select performance_pose($1) r`, [P(8, 1000)])).r === false, "moins bien : rien d'écrit");
vrai((await un(db, `select performance_pose($1) r`, [P(10, 4000)])).r === true, "égalité plus rapide : retenue");
const st9 = await un(db, `select runs_verifies, jours_classes from statistique where utilisateur_id = $1`, [id9]);
vrai(st9.runs_verifies === 3 && st9.jours_classes === 1, "statistique : 3 runs, 1 jour", JSON.stringify(st9));
const ms9 = await un(db, `select valeur, valeur2 from meilleur_score where utilisateur_id = $1`, [id9]);
vrai(ms9.valeur === 10 && ms9.valeur2 === 4000, "record suivi dans la même transaction");
await un(db, `select performance_pose($1)`, [P(5, 100, "humain", "j4")]);
const ms9c = await un(db, `select valeur from meilleur_score where utilisateur_id = $1`, [id9]);
vrai(ms9c.valeur === 10, "un autre jour MOINS bon ne fait pas reculer le record", ms9c.valeur);
await un(db, `select performance_pose($1)`, [P(50, 100, "douteux", "j2")]);
const ms9b = await un(db, `select valeur from meilleur_score where utilisateur_id = $1`, [id9]);
vrai(ms9b.valeur === 10, "un run douteux n'est pas promu record");
await leve(db, `select performance_pose($1)`, [JSON.stringify({ ...JSON.parse(P(99, 1, "humain", "j3")), regle: "pasUneRegle" })], "règle inconnue → refusée, statistique intacte", "foreign key");
const st9b = await un(db, `select runs_verifies from statistique where utilisateur_id = $1`, [id9]);
vrai(st9b.runs_verifies === 5, "statistique non comptée pour le run refusé", st9b.runs_verifies);

console.log("— amis");
const ids = (await db.query(`select id::text, pseudo from utilisateur where pseudo like 'J%' order by pseudo`)).rows.map((r) => r.id);
const [A, B, C, D, E] = ids;
vrai((await un(db, `select amitie_demande($1,$1,50,50) r`, [C])).r === "soi", "demande à soi : 'soi'");
vrai((await un(db, `select amitie_demande($1,$2,50,50) r`, [A, B])).r === "deja", "déjà amis : 'deja'");
vrai((await un(db, `select amitie_demande($1,$2,50,50) r`, [D, C])).r === "lie", "demande croisée (3→4 existe, 4 demande 3) : 'lie'");
const lie34 = await un(db, `select (select count(*) from amitie where utilisateur_id in ($1,$2)) a, (select count(*) from demande_ami where de_id in ($1,$2)) d`, [C, D]);
vrai(Number(lie34.a) === 2 && Number(lie34.d) === 0, "amitié dans les deux sens, demandes rangées");
vrai((await un(db, `select amitie_demande($1,$2,50,50) r`, [C, E])).r === "demande", "demande simple");
vrai((await un(db, `select amitie_demande($1,$2,50,50) r`, [C, E])).r === "demande", "redemander : idempotent");
vrai((await un(db, `select amitie_accepte($1,$2,50) r`, [C, E])).r === "inconnu", "accepter ce qu'on a ENVOYÉ : refusé");
vrai((await un(db, `select amitie_accepte($1,$2,1) r`, [E, C])).r === "plein", "plafond atteint (C a déjà 1 ami, max 1) : 'plein'");
vrai((await un(db, `select amitie_accepte($1,$2,50) r`, [E, C])).r === "lie", "accepter ce qu'on a reçu : 'lie'");
vrai((await un(db, `select amitie_demande($1,$2,50,1) r`, [B, D])).r === "demande" && (await un(db, `select amitie_demande($1,$2,50,1) r`, [B, E])).r === "plein", "plafond de demandes envoyées");

console.log("— boutique");
await db.query(`update utilisateur set pieces = 0 where id = $1`, [id9]);
const imp = await un(db, `select boutique_importe($1,'appareil-1',200,array['neon','inconnu']) r`, [id9]);
vrai(imp.r.issue === "ok" && imp.r.pieces === 200 && imp.r.possedes.includes("neon"), "import : pièces créditées, style importé", JSON.stringify(imp.r));
const imp2 = await un(db, `select boutique_importe($1,'appareil-1',200,array[]::text[]) r`, [id9]);
vrai(imp2.r.issue === "deja" && imp2.r.pieces === 200, "import rejoué : aucun second crédit");
const k1 = "22222222-2222-4222-8222-222222222222";
const ach = await un(db, `select boutique_achete($1,'bonbon',$2) r`, [id9, k1]);
vrai(ach.r.issue === "pauvre" && ach.r.manque === 100, "trop pauvre : refusé, manque 100", JSON.stringify(ach.r));
await un(db, `select boutique_importe($1,'appareil-2',150,array[]::text[])`, [id9]);
const ach2 = await un(db, `select boutique_achete($1,'bonbon',$2) r`, [id9, k1]);
vrai(ach2.r.issue === "ok" && ach2.r.pieces === 50 && ach2.r.porte === "bonbon", "achat : débité, possédé, porté", JSON.stringify(ach2.r));
const ach3 = await un(db, `select boutique_achete($1,'bonbon',$2) r`, [id9, k1]);
vrai(ach3.r.issue === "ok" && ach3.r.rejoue && ach3.r.pieces === 50, "même clé rejouée : même achat, pas de second débit");
const ach4 = await un(db, `select boutique_achete($1,'bonbon',gen_random_uuid()) r`, [id9]);
vrai(ach4.r.issue === "deja", "racheter un style possédé : 'deja'");
const livre = await un(db, `select u.pieces, (select sum(delta) from mouvement_pieces where utilisateur_id = u.id) s from utilisateur u where id = $1`, [id9]);
vrai(Number(livre.s) === livre.pieces, "grand livre : somme des mouvements = solde", JSON.stringify(livre));
vrai((await un(db, `select boutique_porte($1,'craie') r`, [id9])).r === false, "porter un style non possédé : false");
vrai((await un(db, `select boutique_porte($1,'neon') r`, [id9])).r === true, "porter un style possédé : true");
await db.query(`update skin set retire_le = now() where code = 'pixel'`);
vrai((await un(db, `select boutique_achete($1,'pixel',gen_random_uuid()) r`, [id9])).r.issue === "inconnu", "style retiré : plus en vente");
// le style disparaît physiquement (cas extrême) : l'historique reste
await db.query(`delete from skin_utilisateur where skin_id = (select id from skin where code='bonbon')`);
await db.query(`delete from skin where code='bonbon'`);
const hist = await un(db, `select skin_id, skin_code, prix_paye from achat where utilisateur_id = $1`, [id9]);
vrai(hist.skin_id === null && hist.skin_code === "bonbon" && hist.prix_paye === 300, "style supprimé : l'achat garde code et prix (SET NULL)");

console.log("— compte_supprime");
vrai((await un(db, `select compte_supprime($1, '{"carnet":{}}') r`, [id9])).r === true, "suppression logique");
const apres = await un(db, `select u.supprime_le is not null s, u.pseudo, u.version_jeton,
  (select count(*) from lien_plateforme where utilisateur_id=u.id) l, (select count(*) from performance where utilisateur_id=u.id) p,
  (select count(*) from carte_utilisateur where utilisateur_id=u.id) c, (select count(*) from meilleur_score where utilisateur_id=u.id) m,
  (select count(*) from achat where utilisateur_id=u.id) a from utilisateur u where id = $1`, [id9]);
vrai(apres.s && apres.pseudo === "" && Number(apres.l) === 0 && Number(apres.p) === 0 && Number(apres.c) === 0 && Number(apres.m) === 0, "personnel effacé (liens, scores, cartes, records)", JSON.stringify(apres));
vrai(Number(apres.a) === 1, "historique d'achat conservé");
await leve(db, `delete from utilisateur where id = $1`, [id9], "suppression PHYSIQUE bloquée tant qu'il y a un historique (restrict)", "foreign key");

console.log("— accès");
const pub = await un(db, `select count(*) n from information_schema.routine_privileges where grantee = 'PUBLIC' and routine_name in ('boutique_achete','compte_supprime','performance_pose','agregats_ecrit')`);
vrai(Number(pub.n) === 0, "EXECUTE retiré à PUBLIC sur les fonctions d'écriture");

console.log(`\n${ok} réussies, ${ko} échouées`);
process.exit(ko ? 1 : 0);
