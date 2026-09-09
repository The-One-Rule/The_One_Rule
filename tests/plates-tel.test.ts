/**
 * Multi téléphone — plaques, emotes et spectateur hors flux.
 *
 * Sous 720 px `#liveHud` sort du flux. `offsetHeight` du bandeau n'est
 * alors plus une hauteur de flex : `dansLeFlux` doit être faux, sinon
 * `syncField` additionne une gouttière fantôme.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const html = readFileSync("index.html", "utf8");
const main = readFileSync("src/main.ts", "utf8");

function corpsMedia(feuille: string, cond: RegExp): string[] {
  const blocs: string[] = [];
  const re = /@media[^{]+\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(feuille))) {
    if (!cond.test(m[0])) continue;
    const debut = m.index + m[0].length;
    let profondeur = 1;
    let i = debut;
    for (; i < feuille.length; i++) {
      if (feuille[i] === "{") profondeur++;
      else if (feuille[i] === "}") {
        profondeur--;
        if (profondeur === 0) break;
      }
    }
    blocs.push(feuille.slice(debut, i));
  }
  return blocs;
}

describe("plaques téléphone hors flux", () => {
  const tel = corpsMedia(css, /max-width:\s*720px/).join("\n");

  it("il y a un bloc 720 px à lire — sinon les tests suivants sont vides", () => {
    expect(tel.length, "aucun @media (max-width: 720px)").toBeGreaterThan(80);
  });

  it("hors has-gutters, #liveHud est un calque au-dessus du pied", () => {
    expect(css).toMatch(/#liveHud\s*\{[^}]*display:\s*contents/);
    expect(tel).toMatch(/#app:not\(\.has-gutters\)\s+#liveHud\s*\{/);
    const overlay = /#app:not\(\.has-gutters\)\s+#liveHud\s*\{([^}]*)\}/.exec(tel);
    expect(overlay, "règle d'overlay #liveHud introuvable").not.toBeNull();
    const corps = overlay![1]!;
    expect(corps).toMatch(/position:\s*absolute/);
    expect(corps).toMatch(/pointer-events:\s*none/);
    expect(corps).toMatch(/bottom:\s*var\(--foot-h\)/);
  });

  it("une rangée, overflow-x, pas overflow-y qui grandit", () => {
    expect(tel).toMatch(/overflow-x:\s*auto/);
    expect(tel).not.toMatch(/overflow-y:\s*auto/);
    expect(tel).toMatch(/flex-wrap:\s*nowrap/);
    expect(tel).not.toMatch(/max-height:\s*26vh/);
  });

  it("la règle adverse n'est plus masquée à 720 px — elle tenait déjà", () => {
    /*
     * Le commentaire au-dessus de `.plates--compact .plate__rule` dit que
     * l'afficher est gratuit en hauteur. Le bloc 720 px la masquait encore.
     * React / série restent hors de la rangée.
     */
    expect(tel).not.toMatch(/plate__rule[^{]*\{[^}]*display:\s*none/);
    expect(tel).toMatch(/plate__react/);
    expect(tel).toMatch(/plate__streak/);
  });

  it("has-gutters pose encore les plaques en colonnes, hors du calque téléphone", () => {
    expect(css).toMatch(/#app\.has-gutters \.plates\s*\{[^}]*position:\s*absolute/);
    expect(tel).toMatch(/#app:not\(\.has-gutters\)/);
    expect(tel).not.toMatch(/#app\.has-gutters \.plates/);
  });

  it("dansLeFlux est faux dès que le media 720 px s'applique", () => {
    expect(main).toMatch(/matchMedia\(\s*["']\(max-width:\s*720px\)["']\s*\)/);
    expect(main).toMatch(
      /dansLeFlux = !gutters && !tel && !platesEl\.classList\.contains\("hidden"\)/,
    );
  });

  it("#liveHud enveloppe plaques, spectateur et emotes — le pied reste dehors", () => {
    const iHud = html.indexOf('id="liveHud"');
    const iFeed = html.indexOf('id="feed"');
    const iFoot = html.indexOf('id="foot"');
    expect(iHud).toBeGreaterThan(0);
    expect(iFeed).toBeGreaterThan(iHud);
    const bloc = html.slice(iHud, iFeed);
    expect(bloc).toContain('id="plates"');
    expect(bloc).toContain('id="watchBar"');
    expect(bloc).toContain('id="emotes"');
    expect(iFoot).toBeGreaterThan(iFeed);
  });

  it("emotes : cible pouce, gap 8 px", () => {
    expect(tel).toMatch(/\.emotes \.chip[^{]*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(tel).toMatch(/\.emotes[^{]*\{[^}]*gap:\s*8px/);
  });
});
