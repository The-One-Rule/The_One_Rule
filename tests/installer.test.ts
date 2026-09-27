/**
 * L'invitation à installer : une fois, après trois parties, jamais sur un
 * écran déjà occupé, jamais à qui l'a déjà installé, et jamais un geste qui
 * n'existe pas sur l'appareil.
 */
import { describe, expect, it } from "vitest";
import { estSafariIos, installAProposer, RUNS_AVANT_INSTALL } from "../src/game/installer";

const base = { runsAcheves: 5, dejaVu: false, installe: false, autreDemande: false, inviteAndroid: false, safariIos: false };

describe("installAProposer", () => {
  it("Android avec l'invite de Chrome, iOS dans Safari", () => {
    expect(installAProposer({ ...base, inviteAndroid: true })).toBe("android");
    expect(installAProposer({ ...base, safariIos: true })).toBe("ios");
  });
  it("rien sans geste possible (bureau, vue intégrée)", () => {
    expect(installAProposer(base)).toBeNull();
  });
  it("jamais avant trois parties, jamais deux fois, jamais une fois installé", () => {
    const ok = { ...base, inviteAndroid: true };
    expect(installAProposer({ ...ok, runsAcheves: RUNS_AVANT_INSTALL - 1 })).toBeNull();
    expect(installAProposer({ ...ok, dejaVu: true })).toBeNull();
    expect(installAProposer({ ...ok, installe: true })).toBeNull();
  });
  it("une sollicitation par écran : elle cède", () => {
    expect(installAProposer({ ...base, inviteAndroid: true, autreDemande: true })).toBeNull();
  });
});

describe("estSafariIos", () => {
  const safari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  it("reconnaît Safari sur iPhone", () => {
    expect(estSafariIos(safari, 5)).toBe(true);
  });
  it("écarte Chrome iOS et les vues intégrées", () => {
    expect(estSafariIos(safari.replace("Version/17.4", "CriOS/124.0"), 5)).toBe(false);
    expect(
      estSafariIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0", 5),
    ).toBe(false);
  });
  it("écarte Android et le bureau", () => {
    expect(estSafariIos("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36", 5)).toBe(false);
    expect(estSafariIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15", 0)).toBe(false);
  });
});

describe("le manifeste et l'en-tête", () => {
  it("⚠️ l'application installée ne force PAS le paysage", async () => {
    // Le manifeste disait "landscape" : installé, le jeu se serait ouvert
    // couché, alors qu'au téléphone il se joue DEBOUT (terrain debout, n°16).
    const { readFileSync } = await import("node:fs");
    const man = JSON.parse(readFileSync("public/site.webmanifest", "utf8"));
    expect(man.orientation === undefined || man.orientation === "any").toBe(true);
    const html = readFileSync("index.html", "utf8");
    expect(html).toMatch(/apple-mobile-web-app-capable" content="yes"/);
  });
});
