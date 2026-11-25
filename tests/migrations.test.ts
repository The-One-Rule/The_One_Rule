/**
 * Les migrations et le schéma Prisma, lus comme du TEXTE — le filet qui tient
 * sans base.
 *
 * Le comportement est éprouvé contre un vrai PostgreSQL par
 * `tests/depot-contrat.test.ts`, et l'accord schéma ↔ migrations par le job
 * « base » de la CI (`npm run base:derive`). Ce fichier garde, à chaque
 * `vitest run`, les propriétés dont l'oubli ne casserait RIEN de visible :
 *
 *   · une table sans RLS est lisible par la clé publique du navigateur — et
 *     Prisma n'écrit JAMAIS de RLS dans une migration qu'il génère ;
 *   · une fonction SQL qui survit est une loi d'écriture écrite deux fois
 *     (ADR 0012 : elle vit en TypeScript, dans `DepotPrisma`) ;
 *   · une relation sans `onDelete` explicite reprend le défaut de Prisma sans
 *     que personne l'ait décidé ;
 *   · un catalogue en base qui ne suit plus le code fait ignorer, en silence,
 *     la projection d'une règle neuve.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { CHAPITRES } from "../src/game/parcours";
import { SKINS } from "../src/game/boutique";
import { multiRulesFor } from "../server/match";

const DOSSIER = join(__dirname, "..", "prisma", "migrations");
const dossiers = readdirSync(DOSSIER, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
const lit = (d: string) => readFileSync(join(DOSSIER, d, "migration.sql"), "utf8");
/** Le SQL sans ses commentaires de ligne : un mot cité en commentaire ne compte pas. */
const sql = (d: string) => lit(d).replace(/--.*$/gm, "");
const tout = dossiers.map(sql).join("\n");
const BASE = "0_ligne_de_base";
const SCHEMA = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8").replace(/\/\/.*$/gm, "");

/** Le bloc entre deux marqueurs `-- [catalogue:x]` et le `on conflict` suivant. */
function bloc(marqueur: string): string {
  const brut = lit(BASE);
  const i = brut.indexOf(`-- [catalogue:${marqueur}]`);
  expect(i, `marqueur ${marqueur} absent`).toBeGreaterThan(0);
  return brut.slice(i, brut.indexOf("on conflict", i));
}

describe("migrations — forme", () => {
  it("la ligne de base passe la première, et chaque dossier porte sa migration", () => {
    expect(dossiers[0]).toBe(BASE);
    for (const d of dossiers) expect(existsSync(join(DOSSIER, d, "migration.sql")), d).toBe(true);
    expect(readFileSync(join(DOSSIER, "migration_lock.toml"), "utf8")).toMatch(/provider = "postgresql"/);
  });

  it("la ligne de base garde les neuf migrations d'origine, dans l'ordre", () => {
    const n = [...lit(BASE).matchAll(/^-- (\d{4})_\w+\.sql$/gm)].map((m) => Number(m[1]));
    expect(n).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("migrations — accès", () => {
  it("toute table créée active le RLS", () => {
    const tables = [...tout.matchAll(/create table (?:if not exists )?"?(\w+)"?/gi)].map((m) => m[1]!);
    expect(tables.length).toBeGreaterThan(15);
    for (const t of tables) {
      expect(tout, `RLS absent sur ${t} — Prisma ne l'écrit pas : l'ajouter à la main dans la migration`).toMatch(
        new RegExp(`alter table "?${t}"?\\s+enable row level security`, "i"),
      );
    }
  });
});

describe("migrations — la loi d'écriture vit en TypeScript (ADR 0012)", () => {
  it("toute fonction SQL créée est retirée, et le déclencheur aussi", () => {
    const creees = [...tout.matchAll(/create or replace function (\w+)\(/gi)].map((m) => m[1]!);
    expect(creees.length).toBeGreaterThan(10);
    for (const f of creees) expect(tout, `${f} survit aux migrations`).toMatch(new RegExp(`drop function if exists ${f}\\(`, "i"));
    expect(tout).toMatch(/drop trigger if exists utilisateur_banniere on utilisateur/i);
  });

  it("aucune migration après la ligne de base ne crée de fonction ni de déclencheur", () => {
    for (const d of dossiers.slice(1)) expect(sql(d), d).not.toMatch(/create (or replace )?(function|trigger)/i);
  });
});

describe("le schéma Prisma — stratégie de suppression", () => {
  const relations = [...SCHEMA.matchAll(/@relation\(([^)]*fields:[^)]*)\)/g)].map((m) => m[1]!);

  it("toute relation dit ce qu'elle fait à la suppression", () => {
    expect(relations.length).toBeGreaterThan(25);
    for (const r of relations) expect(r, r).toMatch(/onDelete: (Cascade|Restrict|SetNull|NoAction)/);
  });

  it("toute relation et tout index portent le nom qu'ils ont en base", () => {
    for (const r of relations) expect(r, r).toMatch(/map: "\w+"/);
    for (const l of SCHEMA.split("\n").filter((x) => /@@(index|unique|id)\(/.test(x))) expect(l, l).toMatch(/map: "\w+"/);
  });

  it("l'historique d'achats survit : restrict depuis le compte, SET NULL depuis le style", () => {
    const achat = SCHEMA.slice(SCHEMA.indexOf("model Achat {"), SCHEMA.indexOf("}", SCHEMA.indexOf("model Achat {")));
    expect(achat).toMatch(/utilisateur\s+Utilisateur\s+@relation\(fields: \[utilisateurId\], references: \[id\], onDelete: Restrict/);
    expect(achat).toMatch(/skin\s+Skin\?\s+@relation\(fields: \[skinId\], references: \[id\], onDelete: SetNull/);
    const livre = SCHEMA.slice(SCHEMA.indexOf("model MouvementPieces {"), SCHEMA.indexOf("}", SCHEMA.indexOf("model MouvementPieces {")));
    expect(livre).toMatch(/onDelete: Restrict, onUpdate: NoAction, map: "mouvement_pieces_utilisateur_id_fkey"/);
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
