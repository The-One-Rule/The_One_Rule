/**
 * LA PREMIÈRE ARRIVÉE.
 *
 * Rapporté par Pierre après avoir fait tester le jeu à ses camarades : « ils
 * ont adoré mais ils n'ont pas immédiatement compris, j'étais à côté pour leur
 * expliquer ». Tant qu'un humain compense l'onboarding, on ne sait pas si le
 * jeu s'explique tout seul.
 *
 * Ce fichier tient les propriétés dont dépend la LEÇON — pas la mise en page,
 * qui se mesure dans le navigateur.
 */
import { describe, expect, it } from "vitest";
import {
  CHRONO_PIEGE_MS,
  REGLE_TUTO,
  TEMPS_JOUES,
  jugeClic,
  mancheDe,
  mancheDecouverte,
  manchePiege,
} from "../src/game/onboarding";
import { ONE_RULES } from "../src/engine/rules";
import { FIELD_H, FIELD_W, RADIUS } from "../src/engine/types";
import { windowMs } from "../src/engine/difficulty";

describe("la règle qu'on enseigne", () => {
  it("existe au catalogue", () => {
    expect(ONE_RULES.some((r) => r.id === REGLE_TUTO)).toBe(true);
  });

  it("⚠️ PIÈGE, sinon le tutoriel n'enseigne pas le jeu", () => {
    /*
     * LE point du dispositif. Le piège est le seul élément non copiable de
     * TOR, et la densité de manches piégeuses du catalogue est de 5,4 % : un
     * nouveau venu peut faire vingt manches sans jamais le rencontrer, et
     * repartir en disant « c'est un jeu de réflexes, j'en ai déjà joué ».
     *
     * Enseigner avec une règle qui ne piège pas — il y en a SEPT sur seize —
     * produirait un tutoriel qui ne parle que de la moitié copiable du jeu.
     * Le test tombe le jour où l'on change de règle d'accueil sans y penser.
     */
    const r = ONE_RULES.find((x) => x.id === REGLE_TUTO)!;
    expect(r.traps, "la règle du tutoriel doit pouvoir piéger").toBe(true);
  });

  it("n'est pas une règle qui exige un clavier ou un maintien", () => {
    // Les camarades testent sur téléphone. Une règle à maintien (ESPACE) ou
    // dépendant du clavier rendrait la première arrivée injouable là où elle
    // sert le plus.
    const r = ONE_RULES.find((x) => x.id === REGLE_TUTO)!;
    expect(r.watchRelease ?? null).toBe(null);
  });
});

describe("les deux manches jouées", () => {
  it("il y en a exactement deux, et ce sont les temps 3 et 5", () => {
    expect([...TEMPS_JOUES]).toEqual([3, 5]);
    for (const t of [1, 2, 4, 6] as const) expect(mancheDe(t)).toBeNull();
    for (const t of TEMPS_JOUES) expect(mancheDe(t)).not.toBeNull();
  });

  it("⚠️ le temps 3 n'a AUCUN chrono", () => {
    // C'est ce qu'on promet à l'écran — « le chrono est désactivé ». Une durée
    // finie ferait conclure la manche à la place du joueur, au moment précis
    // où on lui dit de prendre son temps.
    expect(mancheDecouverte().round.durationMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("⚠️ le temps 5 EST un piège, et se gagne en ne faisant rien", () => {
    const m = manchePiege();
    expect(m.round.trap, "la manche doit être marquée comme piège").toBe(true);
    expect(m.cible, "la bonne réponse est de ne rien faire").toBeNull();
    // Il faut un chrono : c'est en le laissant s'écouler qu'on survit, et
    // c'est le geste que le tutoriel existe pour faire vivre.
    expect(Number.isFinite(m.round.durationMs)).toBe(true);
  });

  it("le chrono du piège laisse le temps de DÉCIDER, pas d'hésiter", () => {
    // À 1500 ms — la fenêtre la plus large du jeu — ne rien faire ressemble à
    // une hésitation. Au double, c'est une décision.
    expect(CHRONO_PIEGE_MS).toBe(windowMs(0) * 2);
    expect(manchePiege().round.durationMs).toBe(CHRONO_PIEGE_MS);
  });

  it("la consigne du piège demande bien ce que la règle interdit", () => {
    // Sans ça, ce n'est pas un piège : c'est une manche qu'on rate.
    const m = manchePiege();
    expect(m.round.colorWord).toBe("garance");
    expect(m.interdite).not.toBeNull();
    expect(m.round.ents[m.interdite!]!.color).toBe("garance");
  });

  it("le temps 3 montre la couleur interdite SANS la demander", () => {
    /*
     * La pièce rouge est là exprès alors que la consigne ne la désigne pas.
     * Elle rend la règle vivante avant de la mettre en conflit — et si le
     * joueur clique dessus, on peut lui expliquer SON erreur au lieu de
     * compter un raté.
     */
    const m = mancheDecouverte();
    expect(m.round.colorWord).toBe("azur");
    expect(m.cible).not.toBeNull();
    expect(m.round.ents[m.cible!]!.color).toBe("azur");
    expect(m.interdite).not.toBeNull();
    expect(m.round.ents[m.interdite!]!.color).toBe("garance");
  });
});

describe("les scènes du tutoriel", () => {
  const toutes = [mancheDecouverte(), manchePiege()];

  it("sont IDENTIQUES à chaque appel", () => {
    /*
     * `place()` mélange les cellules avec un RNG : parfait pour une partie,
     * fatal ici. Un joueur recevrait une leçon lisible et le suivant une leçon
     * encombrée, et on ne saurait jamais laquelle on a mesurée.
     */
    expect(JSON.stringify(mancheDecouverte())).toBe(JSON.stringify(mancheDecouverte()));
    expect(JSON.stringify(manchePiege())).toBe(JSON.stringify(manchePiege()));
  });

  it("tiennent entièrement dans le champ", () => {
    // Une pièce à cheval sur le bord serait cliquable à moitié — sur le seul
    // écran où l'on apprend à cliquer.
    for (const m of toutes) {
      for (const e of m.round.ents) {
        const r = RADIUS[e.size];
        expect(e.ox - r, `${e.color} déborde à gauche`).toBeGreaterThanOrEqual(0);
        expect(e.ox + r, `${e.color} déborde à droite`).toBeLessThanOrEqual(FIELD_W);
        expect(e.oy - r, `${e.color} déborde en haut`).toBeGreaterThanOrEqual(0);
        expect(e.oy + r, `${e.color} déborde en bas`).toBeLessThanOrEqual(FIELD_H);
      }
    }
  });

  it("ne se chevauchent jamais", () => {
    // Deux pièces qui se touchent rendent le verdict d'un clic ambigu.
    for (const m of toutes) {
      const es = m.round.ents;
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const d = Math.hypot(es[i]!.ox - es[j]!.ox, es[i]!.oy - es[j]!.oy);
          expect(d, "deux pièces se chevauchent").toBeGreaterThan(es[i]!.r + es[j]!.r);
        }
      }
    }
  });

  it("⚠️ aucune pièce ne BOUGE", () => {
    // Une cible qui oscille de ±22 px ajoute une difficulté motrice au moment
    // exact où l'on enseigne une décision. Ce n'est pas la leçon.
    for (const m of toutes) for (const e of m.round.ents) expect(e.moving).toBe(false);
  });

  it("les indices sont cohérents avec leur position dans la liste", () => {
    // `scene.hit()` rend une entité et le contrôleur lit son `idx` : un
    // décalage ferait juger le clic sur la mauvaise pièce.
    for (const m of toutes) m.round.ents.forEach((e, i) => expect(e.idx).toBe(i));
  });
});

describe("le jugement d'un clic", () => {
  it("au temps 3 : la cible est juste, l'interdite est NOMMÉE", () => {
    const m = mancheDecouverte();
    expect(jugeClic(m, m.cible)).toBe("juste");
    expect(jugeClic(m, m.interdite)).toBe("interdit");
    expect(jugeClic(m, null), "un clic dans le vide").toBe("ailleurs");
  });

  it("⚠️ au temps 5, OBÉIR est une faute — y compris sur la pièce demandée", () => {
    /*
     * Le cœur de la leçon. La consigne dit « clique le rouge » et le rouge est
     * là : cliquer dessus est l'erreur qu'on veut expliquer, pas une
     * maladresse de visée. D'où `interdit` et non `ailleurs` — le message
     * diffère, et c'est lui qui enseigne.
     */
    const m = manchePiege();
    expect(m.cible).toBeNull();
    expect(jugeClic(m, m.interdite)).toBe("interdit");
    for (let i = 0; i < m.round.ents.length; i++) {
      expect(jugeClic(m, i), "aucun clic n'est juste sur un piège").not.toBe("juste");
    }
    expect(jugeClic(m, null)).toBe("ailleurs");
  });
});
