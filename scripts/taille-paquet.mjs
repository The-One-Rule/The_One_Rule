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
  // 113,5 Ko avant la migration React (docs/adr/0010), plafond 120. React et
  // React DOM (≈ 59 Ko) et le balisage compilé des écrans (≈ 14 Ko) s'y sont
  // ajoutés : +73,9 Ko mesurés à l'esbuild (115,7 → 189,6 Ko), en contrepartie
  // d'un index.html qui ne pèse plus ≈ 33 Ko gzip. Plafond relevé à 195 Ko.
  // À RE-MESURER au premier `vite build` : la mesure est faite hors Vite.
  // 25/11/2026, re-mesuré au `vite build` : 194,2 Ko sur master (règles de
  // salon et caméléon compris), 196,4 avec les cartes d'amélioration du kanban
  // (+2,2 Ko : pièces, invitation d'un ami, difficulté des consignes, retour
  // au clic). Aucune dépendance ajoutée. Plafond relevé à 199 Ko.
  index: 199 * 1024,
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
