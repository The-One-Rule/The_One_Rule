/**
 * LA CARTE DE PARTAGE — une image, là où il n'y avait qu'un texte.
 *
 * ⚠️ **LE PARTAGE EST À 0 % DEPUIS LE PREMIER JOUR.** Trois relevés, trois fois
 * zéro : jour 2 (14 joueurs), jour 3 (50), jours 238-245 (139). Ce n'est donc
 * pas un creux, c'est une fonctionnalité que personne n'utilise — et le bouton
 * existait pourtant à chaque fois. La maquette annote elle-même la carte comme
 * « la seule chose de l'écran qui n'existe pas encore ».
 *
 * L'hypothèse qu'on teste : ce qui manquait n'est pas le bouton mais l'OBJET.
 * Trois lignes de texte et quatre carrés d'emoji, collés dans une conversation,
 * ne se distinguent d'aucun autre message. Une image se reconnaît, se regarde,
 * et porte l'adresse du jeu sur elle.
 *
 * ⚠️ **DEUX RÈGLES DU DÉPÔT S'APPLIQUENT ICI, ET AUCUNE N'EST NÉGOCIABLE.**
 *
 *   · **UN SCORE SANS SON MODE EST UN CHIFFRE FAUX** (`render/but.ts`). Un 31
 *     d'entraînement à × 2,0 et un 31 de run du jour ne sont pas la même chose ;
 *     la carte porte donc TOUJOURS son mode, et son allure quand il y en a une.
 *   · **L'IDENTITÉ NOCTURNE** : aucun dégradé, aucun arrondi, capitales,
 *     l'accent réservé à l'essentiel. Une carte de partage est la seule image
 *     du jeu que verront des gens qui n'y ont jamais joué.
 *
 * Le module est coupé en deux : `donneesCarte` est PURE et testée — c'est elle
 * qui porte les décisions — et `dessineCarte` ne fait que peindre. Sans cette
 * coupe, rien ne serait vérifiable : jsdom n'a pas de canvas.
 */
import { t } from "../i18n";
import { policeDisplay, policeMono } from "./polices";

/** Ce que la carte dit. Des chaînes déjà composées, aucune décision au pinceau. */
export interface DonneesCarte {
  /** « RUN DU JOUR · J245 » ou « ENTRAÎNEMENT · × 1,0 ». Jamais vide. */
  sur: string;
  /** Le nom de la règle, dans la langue courante. */
  regle: string;
  /** Le chiffre, en grand. */
  score: number;
  /** Ce que le chiffre compte — « MANCHES TENUES », « SUR 40 »… */
  scoreLabel: string;
  /** La frise, marque par marque. */
  marks: readonly string[];
  /** « NOUVEAU RECORD · +8 », ou `null` s'il n'y a rien à célébrer. */
  exploit: string | null;
  /** L'adresse, en bas. C'est la seule raison d'être commerciale de l'image. */
  url: string;
  /** Le slogan — ce qui explique le jeu à quelqu'un qui n'y a jamais joué. */
  slogan: string;
}

export interface EntreeCarte {
  mode: "daily" | "training" | "escalade" | "ranked";
  jour: number;
  regle: string;
  score: number;
  cleared: boolean;
  marks: readonly string[];
  allure: number;
  /** Dépassement de record, déjà décidé par `render/exploit.ts`. */
  avance?: number | undefined;
  url: string;
}

/**
 * Ce que la carte doit dire, décidé une fois.
 */
export function donneesCarte(e: EntreeCarte): DonneesCarte {
  const sur =
    e.mode === "daily"
      ? t("partageTitreJour")(e.jour)
      : e.mode === "escalade"
        ? t("modeEscalade")
        : e.mode === "ranked"
          ? t("modeClasse")
          : `${t("modeTraining")} · × ${t("allureTxt")(e.allure)}`;

  const scoreLabel =
    e.mode === "daily"
      ? t("finSurTotal")(40)
      : e.cleared
        ? t("finSansFaute")
        : t("finManchesTenues");

  return {
    sur,
    regle: e.regle,
    score: e.score,
    scoreLabel,
    marks: e.marks,
    /*
     * ⚠️ L'exploit ne paraît QUE s'il a été décidé ailleurs. `exploitDuRun`
     * écarte déjà le run du jour, les paliers et les duels ; le refaire ici
     * donnerait deux jugements à tenir d'accord, et c'est exactement la faute
     * du REJOUER muet — le bouton promettait ce que la fonction refusait.
     */
    exploit: e.avance && e.avance > 0 ? t("finRecordCarte")(e.avance) : null,
    url: e.url,
    slogan: t("slogan"),
  };
}

/* ------------------------------------------------------------------ *
 * Le pinceau
 * ------------------------------------------------------------------ */

/** Côté de la carte. Carré : c'est le seul format qui ne se fait recadrer nulle part. */
export const CARTE_PX = 1080;

/** La palette Nocturne, en dur — un canvas ne lit pas les variables CSS. */
const INK = "#0e1520";
const INK_2 = "#151e2c";
const LINE = "#26344a";
const PAPER = "#efeae0";
const PAPER_DIM = "#8494a8";
const SIGNAL = "#9184d9";
const AMBRE = "#f5b214";

/** La couleur d'une marque, et sa silhouette — le second canal du mode motifs. */
const MARQUES: Record<string, { fond: string; glyphe: string }> = {
  "🟩": { fond: "#40f7c0", glyphe: "●" },
  "🟦": { fond: "#4aa3f7", glyphe: "◆" },
  "🟨": { fond: AMBRE, glyphe: "▲" },
  "🟥": { fond: "#b01732", glyphe: "✕" },
};

/**
 * Peint la carte.
 *
 * ⚠️ **AUCUN ARRONDI, AUCUN DÉGRADÉ** (décision n°8). Les angles droits ne sont
 * pas un défaut de finition, c'est l'identité — et cette image est la seule que
 * verront des gens qui n'ont jamais ouvert le jeu.
 *
 * ⚠️ **LA FRISE EST BORNÉE À 60 MARQUES.** Un run de 201 manches donnerait 201
 * carrés de 5 px : illisible, et surtout faux — on croirait à du bruit. Au-delà,
 * on garde les DERNIÈRES, celles qui racontent la fin, et on le dit.
 */
export function dessineCarte(cvs: HTMLCanvasElement, d: DonneesCarte): void {
  const S = CARTE_PX;
  cvs.width = S;
  cvs.height = S;
  const g = cvs.getContext("2d");
  if (!g) return;

  const mono = policeMono(600, 28);
  const disp = (px: number): string => policeDisplay(600, px);

  g.fillStyle = INK;
  g.fillRect(0, 0, S, S);

  // La trame du terrain : un point tous les 50 px, comme le canvas de jeu.
  g.fillStyle = LINE;
  for (let y = 50; y < S; y += 50) {
    for (let x = 50; x < S; x += 50) g.fillRect(x, y, 2, 2);
  }

  const M = 88; // marge
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  g.strokeRect(M - 24, M - 24, S - (M - 24) * 2, S - (M - 24) * 2);

  g.textBaseline = "top";

  // 1. Sur quoi porte ce score. Jamais absent — un chiffre sans son mode est faux.
  g.font = mono;
  g.fillStyle = SIGNAL;
  g.fillText(d.sur.toUpperCase(), M, M);

  // 2. La règle : c'est elle qu'on reconnaît, et elle porte le jeu.
  g.font = disp(96);
  g.fillStyle = PAPER;
  g.fillText(d.regle.toUpperCase(), M, M + 62);

  // 3. Le chiffre.
  g.font = disp(300);
  g.fillStyle = PAPER;
  g.fillText(String(d.score), M, M + 200);
  const largeurScore = g.measureText(String(d.score)).width;

  g.font = mono;
  g.fillStyle = PAPER_DIM;
  g.fillText(d.scoreLabel.toUpperCase(), M + largeurScore + 28, M + 400);

  // 4. L'exploit, s'il y en a un — le seul accent chaud de la carte.
  if (d.exploit) {
    const y = M + 452;
    g.fillStyle = AMBRE;
    g.fillRect(M, y, 8, 44);
    g.font = mono;
    g.fillText(d.exploit.toUpperCase(), M + 26, y + 8);
  }

  // 5. La frise.
  /*
   * ⚠️ LA FRISE MONTE, ET ELLE GROSSIT.
   *
   * Premier rendu : 26 px de côté, ancrés au bas de la carte. Résultat mesuré à
   * l'écran — 250 px de vide entre le chiffre et la frise, et une bande de
   * marques si fine qu'elle se lisait comme une décoration. Or la frise EST le
   * récit du run : c'est la seule partie de la carte qui raconte comment ça
   * s'est passé, et pas seulement combien.
   *
   * Elle est donc calée sous l'exploit et non sur le pied, et à 40 px elle tient
   * encore ses quatre lignes au maximum de 60 marques.
   */
  const marks = d.marks.length > 60 ? d.marks.slice(-60) : d.marks;
  const cote = 40;
  const ecart = 8;
  const parLigne = Math.floor((S - M * 2 + ecart) / (cote + ecart));
  const yFrise = M + 540;
  marks.forEach((m, i) => {
    const info = MARQUES[m];
    if (!info) return;
    const x = M + (i % parLigne) * (cote + ecart);
    const y = yFrise + Math.floor(i / parLigne) * (cote + ecart);
    g.fillStyle = info.fond;
    g.fillRect(x, y, cote, cote);
    // La silhouette, comme dans le jeu : la frise est la seule surface qui ne
    // disait son affaire que par la teinte.
    g.fillStyle = INK;
    g.font = policeDisplay(700, 22);
    g.textAlign = "center";
    g.fillText(info.glyphe, x + cote / 2, y + 8);
    g.textAlign = "left";
  });

  // 6. Le pied : le slogan, puis l'adresse. C'est la seule raison d'être de
  //    l'image pour quelqu'un qui ne connaît pas le jeu.
  g.fillStyle = LINE;
  g.fillRect(M, S - M - 96, S - M * 2, 2);

  g.font = disp(38);
  g.fillStyle = PAPER;
  g.fillText(d.slogan.toUpperCase(), M, S - M - 74);

  g.font = mono;
  g.fillStyle = PAPER_DIM;
  const u = d.url.replace(/^https?:\/\//, "");
  g.textAlign = "right";
  g.fillText(u.toUpperCase(), S - M, S - M - 66);
  g.textAlign = "left";

  void INK_2;
}
