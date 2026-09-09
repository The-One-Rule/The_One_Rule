/**
 * Émotes : le fil reste un index. Fil des chutes : deux lignes, pas 70 vw.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMOTE_COUNT } from "../shared/protocol";
import { EMOTE_GLYPHE, emoteGlyphe, emotes } from "../src/i18n";

const proto = readFileSync("shared/protocol.ts", "utf8");
const multi = readFileSync("src/multi.ts", "utf8");
const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("émotes — index, pas le glyphe", () => {
  it("le protocole n'envoie qu'un index", () => {
    expect(proto).toMatch(/\{ t: "emote"; k: number \}/);
    expect(proto).toMatch(/\{ t: "emote"; playerId: string; k: number \}/);
    expect(proto).not.toMatch(/t: "emote"[^|\n]*glyphe/);
    expect(proto).not.toMatch(/t: "emote"[^|\n]*label/);
    expect(EMOTE_COUNT).toBe(6);
  });

  it("six mots traduits, six glyphes communs, même rang", () => {
    expect(emotes().length).toBe(EMOTE_COUNT);
    expect(EMOTE_GLYPHE.length).toBe(EMOTE_COUNT);
    expect(emoteGlyphe(0)).toBe("👋");
    expect(emoteGlyphe(5)).toBe("🚫");
    expect(emoteGlyphe(99)).toBe("");
  });

  it("populateEmotes pose aria-label = le mot, et n'écrit pas textContent sur le bouton", () => {
    const fn = /function populateEmotes\(\)[\s\S]*?\n  \}/.exec(multi)?.[0] ?? "";
    expect(fn.length, "populateEmotes introuvable").toBeGreaterThan(80);
    expect(fn).toMatch(/setAttribute\(\s*"aria-label",\s*label\s*\)/);
    expect(fn).toMatch(/emoteGlyphe\(k\)/);
    expect(fn).not.toMatch(/btn\.textContent\s*=/);
  });

  it("la bulle de plaque montre le glyphe, pas le mot", () => {
    expect(multi).toMatch(/bubble\.textContent = emoteGlyphe\(k\)/);
    expect(multi).not.toMatch(/bubble\.textContent = emotes\(\)/);
  });
});

describe("fil des chutes", () => {
  it("deux lignes au plus, plus de panneau à 70 vw", () => {
    expect(multi).toMatch(/feedEl\.children\.length > 2/);
    expect(multi).not.toMatch(/feedEl\.children\.length > 3/);
    expect(css).not.toMatch(/\.feed\s*\{[^}]*70vw/);
    expect(css).toMatch(/\.feed\s*\{[^}]*max-width:\s*min\(\s*40vw,\s*200px\s*\)/);
    expect(css).toMatch(/\.feed__line\s*\{[^}]*font-size:\s*var\(--t-micro\)/);
    expect(css).toMatch(/\.feed\s*\{[^}]*pointer-events:\s*none/);
  });
});
