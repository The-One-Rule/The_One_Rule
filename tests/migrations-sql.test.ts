/**
 * Les migrations, lues comme du TEXTE — le filet qui tient sans base.
 *
 * Le comportement des fonctions SQL a été éprouvé sur un vrai PostgreSQL 17
 * (voir docs/BASE-DE-DONNEES.md, « Validation »). Ce fichier garde, à chaque
 * `vitest run`, les propriétés dont l'oubli ne casserait RIEN de visible :
 *
 *   · une table sans RLS est lisible par la clé publique du navigateur ;
 *   · une fonction sans `revoke … from public` est appelable par elle ;
 *   · une clé étrangère sans `on delete` explicite reprend le défaut de
 *     Postgres (NO ACTION) sans que personne l'ait décidé ;
 *   · un catalogue en base qui ne suit plus le code fait ignorer, en silence,
 *     la projection d'une règle neuve ;
 *   · `compte_supprime` qui oublie une table laisse une donnée personnelle
 *     après une demande de suppression.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { CHAPITRES } from "../src/game/parcours";
import { SKINS } from "../src/game/boutique";
import { multiRulesFor } from "../server/match";

const DOSSIER = join(__dirname, "..", "supabase", "migrations");
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
const lit = (f: string) => readFileSync(join(DOSSIER, f), "utf8");
/** Le SQL sans ses commentaires de ligne : un mot cité en commentaire ne compte pas. */
const sql = (f: string) => lit(f).replace(/--.*$/gm, "");
const tout = fichiers.map(sql).join("\n");

/** Le bloc entre deux marqueurs `-- [catalogue:x]` et le `on conflict` suivant. */
function bloc(marqueur: string): string {
  const brut = lit("0007_catalogue.sql");
  const i = brut.indexOf(`-- [catalogue:${marqueur}]`);
  expect(i, `marqueur ${marqueur} absent`).toBeGreaterThan(0);
  return brut.slice(i, brut.indexOf("on conflict", i));
}

describe("migrations — ordre et nommage", () => {
  it("numérotées sans trou ni doublon", () => {
    const n = fichiers.map((f) => Number(f.slice(0, 4)));
    expect(n).toEqual(n.map((_, i) => i + 1));
  });
});

describe("migrations — accès", () => {
  it("toute table créée active le RLS", () => {
    const tables = [...tout.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]!);
    expect(tables.length).toBeGreaterThan(15);
    for (const t of tables) {
      expect(tout, `RLS absent sur ${t}`).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    }
  });

  it("toute fonction de 0009 perd EXECUTE pour PUBLIC", () => {
    const s = sql("0009_transactions.sql");
    const crees = [...s.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]!);
    const liste = s.slice(s.indexOf("fonctions text[] := array["));
    for (const f of crees) expect(liste, `${f} reste appelable par la clé publique`).toContain(`'${f}(`);
    expect(liste).toContain("revoke all on function %s from public");
    // Le déclencheur de 0008 aussi : il est listé avec elles.
    expect(liste).toContain("'utilisateur_derive_banniere()'");
  });
});

describe("migrations — stratégie de suppression", () => {
  it("toute clé étrangère posée par la refonte dit ce qu'elle fait à la suppression", () => {
    for (const f of ["0007_catalogue.sql", "0008_progression.sql"]) {
      // Jusqu'à la fin de la colonne (`,` en fin de ligne) ou de l'instruction.
      const refs = [...sql(f).matchAll(/references\s+\w+\s*\([^)]*\)([\s\S]*?)(?:,\s*\n|;)/g)];
      expect(refs.length).toBeGreaterThan(3);
      for (const r of refs) expect(r[0], `${f} : ${r[0]}`).toMatch(/on delete (cascade|restrict|set null)/);
    }
  });

  it("l'historique d'achats survit : restrict depuis le compte, SET NULL depuis le style", () => {
    const achat = sql("0008_progression.sql").match(/create table if not exists achat \(([\s\S]*?)\n\);/)![1]!;
    expect(achat).toMatch(/utilisateur_id\s+uuid not null references utilisateur\(id\) on delete restrict/);
    expect(achat).toMatch(/skin_id\s+uuid references skin\(id\) on delete set null/);
    expect(achat).toMatch(/skin_code\s+text not null/);
    expect(achat).toMatch(/prix_paye\s+integer not null/);
  });

  it("compte_supprime efface tout ce qui est personnel, et pas l'historique", () => {
    const s = sql("0009_transactions.sql");
    const corps = s.slice(s.indexOf("function compte_supprime"), s.indexOf("function agregats_ecrit"));
    for (const t of [
      "lien_plateforme", "meilleur_score", "statistique", "performance",
      "carte_utilisateur", "progression_chapitre", "amitie", "demande_ami", "skin_utilisateur",
    ]) {
      expect(corps, `compte_supprime laisse ${t}`).toMatch(new RegExp(`delete from ${t}\\b`));
    }
    expect(corps).not.toMatch(/delete from (achat|mouvement_pieces)\b/);
    expect(corps).toMatch(/version_jeton = version_jeton \+ 1/);
  });
});

describe("migrations — les noms que PostgREST cite", () => {
  it("0006 recrée les clés étrangères des jointures à l'identique", () => {
    const s = sql("0006_identifiants_uuid.sql");
    for (const nom of ["amitie_ami_id_fkey", "demande_ami_de_id_fkey", "demande_ami_a_id_fkey"]) {
      expect(s).toContain(`add constraint ${nom}`);
    }
  });
});

describe("migrations — le catalogue suit le code", () => {
  it("les règles : mêmes codes, même ordre, même piège, même maintien", () => {
    const lignes = [...bloc("regles").matchAll(/\('(\w+)', (true|false), (true|false)\)/g)].map((m) => [
      m[1],
      m[2] === "true",
      m[3] === "true",
    ]);
    expect(lignes).toEqual(ONE_RULES.map((r) => [r.id, r.traps, !!r.watchRelease]));
  });

  it("les styles : mêmes codes, mêmes prix, même ordre", () => {
    const lignes = [...bloc("skins").matchAll(/\('(\w+)', (\d+), (\d+)\)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
    expect(lignes).toEqual(SKINS.map((x, i) => [x.id, x.prix, i]));
  });

  it("les chapitres : l'ordre du parcours", () => {
    const lignes = [...bloc("chapitres").matchAll(/\('(\w+)', (\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
    expect(lignes).toEqual(CHAPITRES.map((c, i) => [c, i + 1]));
  });

  it("le pool du multi : le plus large qu'un salon puisse ouvrir", () => {
    const codes = [...bloc("multi").matchAll(/'(\w+)'/g)].map((m) => m[1]).filter((c) => c !== "multi");
    expect(codes.sort()).toEqual(multiRulesFor(true).map((r) => r.id).sort());
  });
});
