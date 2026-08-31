/**
 * CE QUE VOIT UN ROBOT.
 *
 * Rien ici ne casse quand on l'enfreint — c'est exactement pourquoi ça a
 * besoin d'un test. Un `Disallow: /` de trop, un espace de noms mal
 * orthographié dans le sitemap, une canonique qui pointe ailleurs : le
 * fichier reste valide, le site continue de marcher, et il disparaît
 * simplement de la recherche. On ne s'en aperçoit pas, on constate juste
 * qu'on ne se trouve pas.
 *
 * Écrit après que Pierre a cherché son propre jeu sans le trouver. À ce
 * moment-là : `robots.txt` 404, `sitemap.xml` 404, aucune canonique, aucune
 * donnée structurée.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const robots = readFileSync("public/robots.txt", "utf8");
const sitemap = readFileSync("public/sitemap.xml", "utf8");

const SITE = "https://www.theonerule.party/";

describe("robots.txt", () => {
  it("n'interdit rien", () => {
    /*
     * `Disallow: /` interdit TOUT le site. C'est une ligne, elle est valide,
     * et elle rend le site invisible. Le test existe pour cette ligne-là.
     */
    expect(/^\s*Disallow:\s*\/\s*$/m.test(robots), "Disallow: / interdit tout le site").toBe(false);
    expect(robots).toMatch(/User-agent:\s*\*/);
  });

  it("annonce le sitemap avec une URL absolue", () => {
    // Une URL relative dans un robots.txt est ignorée en silence.
    expect(robots).toContain(`Sitemap: ${SITE}sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  it("porte le BON espace de noms", () => {
    /*
     * `sitemaps.org`, au pluriel. Écrit `sitemap.org`, le fichier reste du
     * XML parfaitement valide et Google le refuse. Erreur commise en
     * l'écrivant, attrapée en relisant.
     */
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("liste l'accueil, et rien d'autre", () => {
    // L'application tient sur une page : les écrans ne sont pas adressables.
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(urls).toEqual([SITE]);
  });
});

describe("le head", () => {
  it("porte une canonique, et elle pointe sur le site", () => {
    /*
     * Sans elle, un partage avec `?utm=...` ou `#compte=ok` devient une page
     * distincte pour un robot, et l'audience se dilue entre des doublons.
     */
    const m = /<link rel="canonical" href="([^"]+)"/.exec(html);
    expect(m, "canonique absente").not.toBeNull();
    expect(m![1]).toBe(SITE);
  });

  it("le titre porte le slogan, pas seulement le nom", () => {
    /*
     * « THE ONE RULE » seul est une phrase anglaise banale : des millions de
     * pages la contiennent. Le slogan est ce qui rend le titre cherchable.
     */
    const m = /<title>([^<]+)<\/title>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]!.length).toBeGreaterThan(20);
    expect(m![1]).toContain("obeying is the mistake");
  });

  it("la description est utile et de la bonne longueur", () => {
    const m = /<meta\s+name="description"\s+content="([^"]+)"/.exec(html.replace(/\s+/g, " "));
    expect(m, "description absente").not.toBeNull();
    const d = m![1]!;
    // Sous ~70 caractères, Google la remplace par ce qu'il trouve ; au-delà
    // de ~320, il la coupe. Entre les deux, c'est nous qui écrivons.
    expect(d.length).toBeGreaterThan(70);
    expect(d.length).toBeLessThan(320);
  });

  it("les données structurées sont un JSON valide qui décrit un JEU", () => {
    /*
     * C'est la seule chose du head qui change la FORME du résultat de
     * recherche et pas seulement son texte. Un JSON casse la fait ignorer en
     * entier, sans avertissement.
     */
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(m, "aucune donnée structurée").not.toBeNull();
    const data = JSON.parse(m![1]!) as Record<string, unknown>;
    expect(data["@type"]).toBe("VideoGame");
    expect(data.url).toBe(SITE);
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.inLanguage).toEqual(["fr", "en"]);
  });

  it("l'image de partage reste absolue et d'accord avec l'URL", () => {
    // Reprend l'invariant de `marque.test.ts` : `og:image` relatif n'est pas
    // résolu par les robots qui fabriquent l'aperçu.
    const img = /<meta property="og:image" content="([^"]+)"/.exec(html);
    const url = /<meta property="og:url" content="([^"]+)"/.exec(html);
    expect(img![1]!.startsWith("https://")).toBe(true);
    expect(img![1]!.startsWith(url![1]!)).toBe(true);
  });
});
