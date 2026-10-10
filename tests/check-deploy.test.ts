/**
 * Le vérificateur de déploiement ne suit que les scripts de l'APPLI.
 *
 * Vercel injecte sa barre d'outils dans ses préversions, sur un autre
 * domaine. `check-deploy.mjs` lit toute réponse venue d'un autre hôte comme
 * un déploiement protégé (code 3) : la suivre faisait tomber la vérification
 * de préversion dès que `VERCEL_AUTOMATION_BYPASS_SECRET` était posé — vu sur
 * la PR #22, le 10/10/2026. Voir `scripts/scripts-de-l-appli.mjs`.
 */
import { describe, expect, it } from "vitest";
import { scriptsDeLAppli } from "../scripts/scripts-de-l-appli.mjs";

const PREVERSION = "https://the-one-rule-glr7hhhvb-alexestgrands-projects.vercel.app";

/** La forme d'une page de préversion : le paquet Vite, puis la barre de Vercel. */
const PAGE = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-B7vEpSZT.js"></script>
</head><body>
<script src="https://vercel.live/_next-live/feedback/feedback.js" data-explicit-opt-in="true"></script>
</body></html>`;

describe("les scripts que le vérificateur suit", () => {
  it("⚠️ la barre d'outils de Vercel n'est PAS suivie, le paquet du jeu l'est", () => {
    expect(scriptsDeLAppli(PAGE, PREVERSION)).toEqual([`${PREVERSION}/assets/index-B7vEpSZT.js`]);
  });

  it("un chemin relatif se résout contre l'adresse vérifiée", () => {
    const page = `<script src="assets/qr-SLAXndKt.js"></script>`;
    expect(scriptsDeLAppli(page, PREVERSION)).toEqual([`${PREVERSION}/assets/qr-SLAXndKt.js`]);
  });

  it("une adresse absolue sur le même hôte est gardée", () => {
    const page = `<script src="${PREVERSION}/assets/index.js"></script>`;
    expect(scriptsDeLAppli(page, PREVERSION)).toEqual([`${PREVERSION}/assets/index.js`]);
  });

  it("une page sans script de l'appli rend une liste vide — l'appelant le signale", () => {
    const page = `<script src="https://vercel.live/_next-live/feedback/feedback.js"></script>`;
    expect(scriptsDeLAppli(page, PREVERSION)).toEqual([]);
  });

  it("la production n'est pas touchée : son paquet reste suivi", () => {
    const prod = "https://www.theonerule.party";
    const page = `<script type="module" src="/assets/index-B7vEpSZT.js"></script>`;
    expect(scriptsDeLAppli(page, prod)).toEqual([`${prod}/assets/index-B7vEpSZT.js`]);
  });
});
