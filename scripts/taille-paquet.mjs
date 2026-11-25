/**
 * LE CLIQUET DE TAILLE DU PAQUET — à lancer après `vite build`.
 *
 *     node scripts/taille-paquet.mjs
 *
 * Mesuré le 08/10 (phase 4, point 26) : le paquet principal fait 334 Ko,
 * 113,5 Ko gzip, et il ne contient AUCUNE bibliothèque tierce — tout est du
 * code du jeu (main 83 Ko, i18n 70, multi 47, rendu 43…). Le seul tiers,
 * l'encodeur QR, est chargé À LA DEMANDE (`import()` dans `setRoomCode`) :
 * sinon 21 Ko de plus pour chaque visiteur de l'accueil, qui n'ouvrira peut-
 * être jamais un salon.
 *
 * Rien ne gardait ni l'un ni l'autre. Un `import` statique de `render/qr.ts`
 * réintégrerait l'encodeur sans un avertissement, et le paquet peut grossir
 * de commit en commit sans que personne ne le voie. Les plafonds sont posés
 * quelques pour cent AU-DESSUS de la mesure : un cliquet, pas un objectif.
 * Le dépasser n'est pas interdit — c'est une décision, qui se prend en le
 * relevant ici, avec sa raison.
 */
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DOSSIER = "dist/assets";
const PLAFONDS_GZIP = {
  // 110,8 Ko avant React (24/11). React 19 dans l'entrée, mesuré le 25/11 :
  // 185,2 Ko gzip. Le HTML des réglages a quitté index.html (−1,5 Ko gzip).
  // Plafond à quelques pour cent au-dessus de la mesure, pas pour absorber
  // la suite. ADR 0010.
  index: 190 * 1024,
  // 41,3 → 36,6 Ko après le retrait des règles mortes (phase 4, point 27).
  style: 39 * 1024,
  qr: 9 * 1024,
};

const fichiers = readdirSync(DOSSIER).filter((f) => /\.(js|css)$/.test(f));
const de = (prefixe) => fichiers.find((f) => f.startsWith(`${prefixe}-`));
let echecs = 0;
const dit = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) echecs++;
};

for (const [nom, plafond] of Object.entries(PLAFONDS_GZIP)) {
  const f = de(nom);
  if (!f) {
    dit(false, `${nom} : aucun fichier « ${nom}-*.js|css » dans ${DOSSIER}`);
    continue;
  }
  const brut = readFileSync(join(DOSSIER, f));
  const gz = gzipSync(brut, { level: 9 }).length;
  dit(
    gz <= plafond,
    `${nom} : ${(gz / 1024).toFixed(1)} Ko gzip (${(brut.length / 1024).toFixed(0)} Ko brut) — plafond ${(plafond / 1024).toFixed(0)} Ko`,
  );
}

// L'encodeur QR reste DEHORS du paquet que tout le monde télécharge.
const index = de("index");
if (index) {
  const code = readFileSync(join(DOSSIER, index), "utf8");
  dit(!code.includes("qrcode"), "l'encodeur QR n'est pas dans le paquet principal (chargé à la demande)");
}

console.log(echecs ? `\nTAILLE DU PAQUET : ${echecs} échec(s)` : "\nTAILLE DU PAQUET : ok");
process.exit(echecs ? 1 : 0);
