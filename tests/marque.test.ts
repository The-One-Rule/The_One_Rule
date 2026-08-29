/**
 * @vitest-environment jsdom
 *
 * L'identité de marque : favicon, icônes, carte de partage.
 *
 * Toutes ces déclarations échouent EN SILENCE. Un `href` qui ne pointe sur
 * rien ne lève aucune erreur : l'onglet reprend l'icône vide du navigateur, et
 * la vignette du lien d'invitation disparaît. Personne ne le voit avant qu'un
 * joueur colle le lien dans une conversation — c'est-à-dire au pire moment,
 * puisque ce lien est le seul chemin pour faire venir quelqu'un à distance.
 *
 * `og:image` a une exigence de plus, qu'aucun navigateur ne signale : elle
 * doit être ABSOLUE. Un chemin relatif est simplement ignoré par les robots
 * qui fabriquent l'aperçu, et le lien s'affiche nu.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = "public";

let head: Document;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  head = new DOMParser().parseFromString(html, "text/html");
});

/** `./favicon.svg` → `public/favicon.svg`. */
const surDisque = (href: string) => join(PUBLIC, href.replace(/^\.?\//, ""));

/** Largeur et hauteur d'un PNG, lues dans son en-tête IHDR. */
function taillePng(chemin: string): { l: number; h: number } {
  const buf = readFileSync(chemin);
  expect(buf.subarray(0, 4).toString("hex"), `${chemin} n'est pas un PNG`).toBe("89504e47");
  return { l: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe("icônes", () => {
  it("chaque icône déclarée existe vraiment", () => {
    // `Array.from` et non l'étalement : la config TS de ce dépôt ne rend pas
    // les `NodeList` itérables. Même contrainte que `tests/hidden.test.ts`.
    const liens = Array.from(head.querySelectorAll('link[rel*="icon"], link[rel="manifest"]'));
    // Garde-fou : si le sélecteur cassait, la boucle serait vide et le test
    // passerait pour de mauvaises raisons.
    expect(liens.length).toBeGreaterThanOrEqual(4);
    for (const l of liens) {
      const href = l.getAttribute("href")!;
      expect(existsSync(surDisque(href)), `déclaré mais absent : ${href}`).toBe(true);
    }
  });

  it("le manifeste ne renvoie que vers des fichiers présents", () => {
    const man = JSON.parse(readFileSync(join(PUBLIC, "site.webmanifest"), "utf8"));
    expect(man.icons.length).toBeGreaterThan(0);
    for (const i of man.icons) {
      expect(existsSync(surDisque(i.src)), `manifeste : ${i.src} absent`).toBe(true);
    }
  });

  it("les icônes PNG ont la taille qu'elles annoncent", () => {
    // Une icône de 192 déclarée « 512x512 » est installée puis rendue floue
    // sur l'écran d'accueil, sans le moindre avertissement.
    const man = JSON.parse(readFileSync(join(PUBLIC, "site.webmanifest"), "utf8"));
    for (const i of man.icons.filter((x: { type: string }) => x.type === "image/png")) {
      const { l, h } = taillePng(surDisque(i.src));
      expect(`${l}x${h}`, `${i.src} annonce ${i.sizes}`).toBe(i.sizes);
    }
  });
});

describe("carte de partage", () => {
  const meta = (sel: string) => head.querySelector(sel)?.getAttribute("content") ?? "";

  it("l'image est déclarée en URL absolue", () => {
    // Le point qui casse sans rien dire : un chemin relatif est ignoré par les
    // robots d'aperçu, et le lien d'invitation s'affiche nu.
    for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const url = meta(sel);
      expect(url, `${sel} manquante`).not.toBe("");
      expect(url.startsWith("https://"), `${sel} doit être absolue, vu : ${url}`).toBe(true);
    }
  });

  it("l'image existe et mesure ce que les balises annoncent", () => {
    const url = meta('meta[property="og:image"]');
    const nom = new URL(url).pathname;
    const chemin = surDisque(nom);
    expect(existsSync(chemin), `${nom} absent de public/`).toBe(true);

    const { l, h } = taillePng(chemin);
    expect(String(l)).toBe(meta('meta[property="og:image:width"]'));
    expect(String(h)).toBe(meta('meta[property="og:image:height"]'));
    // Les aperçus larges exigent 1200x630 : en dessous, la plupart des clients
    // retombent sur une vignette carrée et rognent le lockup.
    expect({ l, h }).toEqual({ l: 1200, h: 630 });
  });

  it("les deux images de partage désignent le même fichier", () => {
    expect(meta('meta[name="twitter:image"]')).toBe(meta('meta[property="og:image"]'));
  });

  it("og:url et og:image partagent le même domaine", () => {
    // Le domaine est écrit en dur : si le site déménage, il faut corriger les
    // deux, et l'une des deux s'oublie.
    const dom = (u: string) => new URL(u).origin;
    expect(dom(meta('meta[property="og:image"]'))).toBe(dom(meta('meta[property="og:url"]')));
  });
});
