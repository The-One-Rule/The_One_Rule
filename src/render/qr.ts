/**
 * LE QR CODE DU SALON — maquette 8.1 : « Dans la même pièce ? Scannez. »
 *
 * Le social de TOR est SYNCHRONE (playtest jour 2) : on dicte le code, on est
 * dans la même pièce. Un QR évite de taper quatre lettres sur un téléphone.
 *
 * PUR : une chaîne SVG, un seul chemin, en `currentColor` — le QR suit
 * l'encre du thème (jour et nuit) sans une couleur écrite en dur. Une marge
 * de quatre modules, la zone de silence que demande la norme : sans elle,
 * les lecteurs de téléphone échouent sur un fond qui n'est pas blanc pur.
 *
 * Encodeur : `qrcode-generator` (MIT, sans dépendance).
 */
import qrcode from "qrcode-generator";

export const ZONE_SILENCE = 4;

/** Les modules sombres, en lignes de la matrice. */
export function matriceQr(texte: string): boolean[][] {
  const q = qrcode(0, "M");
  q.addData(texte);
  q.make();
  const n = q.getModuleCount();
  const m: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const ligne: boolean[] = [];
    for (let c = 0; c < n; c++) ligne.push(q.isDark(r, c));
    m.push(ligne);
  }
  return m;
}

export function qrSvg(texte: string): string {
  const m = matriceQr(texte);
  const n = m.length;
  const t = n + ZONE_SILENCE * 2;
  let d = "";
  m.forEach((ligne, r) => {
    // Une suite de modules sombres = un seul rectangle : un chemin court.
    let c = 0;
    while (c < n) {
      if (!ligne[c]) {
        c++;
        continue;
      }
      let f = c;
      while (f < n && ligne[f]) f++;
      d += `M${c + ZONE_SILENCE} ${r + ZONE_SILENCE}h${f - c}v1h${c - f}z`;
      c = f;
    }
  });
  return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img"><rect width="${t}" height="${t}" fill="var(--qr-fond, #fff)"/><path d="${d}" fill="var(--qr-encre, #000)"/></svg>`;
}
