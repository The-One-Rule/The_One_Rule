import { describe, expect, it } from "vitest";
import { cleanEnv } from "../src/env";

/* ------------------------------------------------------------------ *
 * Nettoyage des variables d'environnement
 *
 * Cas réel, en production : `VITE_COLLECT_URL` valait "﻿/api/collect"
 * parce que Windows PowerShell ajoute un BOM en encodant une valeur passée par
 * un tube. Chaque envoi de mesure partait donc sur `/%EF%BB%BF/api/collect` et
 * recevait un 404 — le jeu tournait parfaitement, le bandeau de consentement
 * s'affichait, aucune erreur nulle part, et la collecte ne retenait rien.
 * ------------------------------------------------------------------ */

describe("cleanEnv", () => {
  it("retire le BOM UTF-8, le vrai coupable", () => {
    expect(cleanEnv("﻿/api/collect")).toBe("/api/collect");
    expect(cleanEnv("﻿wss://exemple.fly.dev")).toBe("wss://exemple.fly.dev");
  });

  it("retire les blancs qu'un copier-coller traîne", () => {
    expect(cleanEnv("  /api/collect  ")).toBe("/api/collect");
    expect(cleanEnv("/api/collect\n")).toBe("/api/collect");
    expect(cleanEnv("﻿  /api/collect \r\n")).toBe("/api/collect");
  });

  it("traite une valeur vide comme absente", () => {
    // Le module de mesure doit rester TOTALEMENT inerte sans endpoint : pas de
    // bandeau, pas de file, aucun appel réseau. Une chaîne de blancs ne doit
    // donc pas passer pour une URL.
    expect(cleanEnv(undefined)).toBeUndefined();
    expect(cleanEnv("")).toBeUndefined();
    expect(cleanEnv("   ")).toBeUndefined();
    expect(cleanEnv("﻿")).toBeUndefined();
  });

  it("ne touche pas à une valeur saine", () => {
    expect(cleanEnv("/api/collect")).toBe("/api/collect");
    expect(cleanEnv("wss://the-one-rule-salons.fly.dev")).toBe(
      "wss://the-one-rule-salons.fly.dev",
    );
  });
});
