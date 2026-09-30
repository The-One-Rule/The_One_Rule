/**
 * LA PARTIE RAPIDE — ce que ce fichier défend :
 *   · une table publique ne part pas seule, et part à deux ;
 *   · une arrivée ne REPOUSSE jamais le départ (sinon un flux d'arrivées la
 *     tiendrait en attente pour toujours), elle ne peut que le rapprocher ;
 *   · on rejoint d'abord une table qui attend, la plus pleine ; jamais une
 *     table pleine ni une table vide.
 */
import { describe, expect, it } from "vitest";
import {
  ATTENTE_APRES_MATCH_MS,
  ATTENTE_PLEINE_MS,
  ATTENTE_SALON_MS,
  choisitTable,
  echeanceDepart,
  RAPIDE_VITE,
} from "../server/rapide";

describe("quand une table publique part", () => {
  it("jamais seule", () => {
    expect(echeanceDepart({ assis: 1, maintenant: 0, echeance: null, apresMatch: false })).toBeNull();
    expect(echeanceDepart({ assis: 1, maintenant: 0, echeance: 500, apresMatch: true })).toBeNull();
  });

  it("à deux, après la fenêtre d'arrivée", () => {
    expect(echeanceDepart({ assis: 2, maintenant: 1000, echeance: null, apresMatch: false })).toBe(
      1000 + ATTENTE_SALON_MS,
    );
  });

  it("⚠️ une arrivée ne repousse JAMAIS l'échéance", () => {
    let e: number | null = null;
    for (let t = 0, assis = 2; assis < RAPIDE_VITE; t += 3000, assis++) {
      const suivante = echeanceDepart({ assis, maintenant: t, echeance: e, apresMatch: false });
      if (e !== null) expect(suivante!).toBeLessThanOrEqual(e);
      e = suivante;
    }
    expect(e).toBe(ATTENTE_SALON_MS);
  });

  it("une table pleine part vite", () => {
    expect(
      echeanceDepart({ assis: RAPIDE_VITE, maintenant: 1000, echeance: 1000 + ATTENTE_SALON_MS, apresMatch: false }),
    ).toBe(1000 + ATTENTE_PLEINE_MS);
  });

  it("après un match, une pause fixe", () => {
    expect(echeanceDepart({ assis: 3, maintenant: 50, echeance: null, apresMatch: true })).toBe(
      50 + ATTENTE_APRES_MATCH_MS,
    );
  });
});

describe("où va une partie rapide", () => {
  it("une table qui attend avant une table en cours, la plus pleine d'abord", () => {
    expect(
      choisitTable(
        [
          { code: "AAAA", joueurs: 8, enPartie: true },
          { code: "BBBB", joueurs: 2, enPartie: false },
          { code: "CCCC", joueurs: 4, enPartie: false },
        ],
        10,
      ),
    ).toBe("CCCC");
  });

  it("une table en cours plutôt que rien", () => {
    expect(choisitTable([{ code: "AAAA", joueurs: 3, enPartie: true }], 10)).toBe("AAAA");
  });

  it("jamais une table pleine ni vide", () => {
    expect(
      choisitTable(
        [
          { code: "AAAA", joueurs: 10, enPartie: false },
          { code: "BBBB", joueurs: 0, enPartie: false },
        ],
        10,
      ),
    ).toBeNull();
  });
});
