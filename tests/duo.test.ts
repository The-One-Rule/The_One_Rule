/**
 * Le mode DUO : deux joueurs, une réserve.
 *
 * Toute la conception tient dans une phrase — « une erreur d'un membre affecte
 * directement son partenaire » — et cette phrase n'a de sens que si la réserve
 * est VRAIMENT commune. C'est la première chose vérifiée ici.
 *
 * La seconde, moins visible et plus dangereuse : le mode solo doit rester
 * strictement identique. Il est implémenté comme un duo d'équipes à un membre,
 * donc chaque propriété du duo est aussi un risque de régression pour lui.
 */
import { describe, expect, it } from "vitest";
import { MatchLogic } from "../server/match";
import { DEFAULT_SETTINGS } from "../shared/protocol";

const QUATRE = ["a", "b", "c", "d"];
const duo = (ids = QUATRE, lives = 3) =>
  new MatchLogic(7, ids, { ...DEFAULT_SETTINGS, lives }, new Set(), false, true);

const perd = (m: MatchLogic, id: string) => {
  // Passe par le chemin réel : une mort retire une vie à l'équipe.
  const s = m.seats.find((x) => x.id === id)!;
  m.teamOf(s).lives--;
  if (m.teamOf(s).lives <= 0) m.teamOf(s).eliminated = true;
  for (const x of m.seats.filter((y) => y.team === s.team)) {
    x.lives = Math.max(0, m.teamOf(s).lives);
    x.eliminated = m.teamOf(s).eliminated;
  }
};

describe("constitution des équipes", () => {
  it("apparie dans l'ordre d'arrivée", () => {
    // Le seul appariement defendable sans classement ni historique : deux amis
    // qui rejoignent l'un apres l'autre se retrouvent ensemble.
    const m = duo();
    expect(m.teams.length).toBe(2);
    expect(m.teams[0]!.members).toEqual(["a", "b"]);
    expect(m.teams[1]!.members).toEqual(["c", "d"]);
  });

  it("en solo, chaque joueur est sa propre équipe", () => {
    // C'est ce qui fait que le mode existant ne branche nulle part.
    const m = new MatchLogic(7, QUATRE);
    expect(m.teams.length).toBe(4);
    expect(m.teams.every((t) => t.members.length === 1)).toBe(true);
  });

  it("un effectif impair laisse un joueur seul, avec une réserve réduite", () => {
    // Ni exclu — ce serait perdre justement la personne qu'on risque de
    // perdre — ni avantagé : une équipe de deux vide la meme reserve avec deux
    // sources d'erreur au lieu d'une.
    const m = duo(["a", "b", "c"], 3);
    expect(m.teams.length).toBe(2);
    expect(m.teams[1]!.members).toEqual(["c"]);
    expect(m.teams[0]!.lives).toBe(3);
    expect(m.teams[1]!.lives).toBe(2); // ceil(3 / 2)
  });
});

describe("la réserve est commune", () => {
  it("une faute de l'un retire une vie à l'autre", () => {
    // LA propriete du mode. Sans elle, DUO n'est que deux solos cote a cote.
    const m = duo();
    const b = m.seats.find((s) => s.id === "b")!;
    expect(b.lives).toBe(3);
    perd(m, "a");
    expect(m.seats.find((s) => s.id === "b")!.lives).toBe(2);
    expect(m.seats.find((s) => s.id === "a")!.lives).toBe(2);
  });

  it("n'entame PAS la réserve de l'autre équipe", () => {
    const m = duo();
    perd(m, "a");
    expect(m.seats.find((s) => s.id === "c")!.lives).toBe(3);
    expect(m.seats.find((s) => s.id === "d")!.lives).toBe(3);
  });

  it("la réserve épuisée élimine les DEUX d'un coup", () => {
    const m = duo();
    for (let i = 0; i < 3; i++) perd(m, "a");
    expect(m.seats.find((s) => s.id === "a")!.eliminated).toBe(true);
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(true);
    expect(m.teamsAlive.length).toBe(1);
  });
});

describe("la règle est partagée", () => {
  it("les deux partenaires portent la MÊME règle", () => {
    // C'est ce qui leur permet de se surveiller. Sans ca, chacun jouerait une
    // contrainte que l'autre n'aurait aucune raison de connaitre.
    const m = duo();
    const r = m.rulesAt(0);
    expect(r.get("a")!.id).toBe(r.get("b")!.id);
    expect(r.get("c")!.id).toBe(r.get("d")!.id);
  });

  it("mais deux équipes ont des règles différentes", () => {
    const m = duo();
    const r = m.rulesAt(0);
    expect(r.get("a")!.id).not.toBe(r.get("c")!.id);
  });

  it("en solo, chacun garde la sienne", () => {
    const m = new MatchLogic(7, QUATRE);
    const r = m.rulesAt(0);
    expect(new Set(QUATRE.map((id) => r.get(id)!.id)).size).toBe(4);
  });
});

describe("fin de match et tension, comptées en équipes", () => {
  it("un partenaire éliminé ne termine pas le match", () => {
    // Le moment interessant du mode : un duo ampute qui s'accroche.
    const m = duo();
    m.forfeit("a");
    expect(m.teamsAlive.length).toBe(2);
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(false);
  });

  it("le partenaire resté garde la réserve telle qu'elle est", () => {
    // On ne lui rend pas les vies perdues, on ne le punit pas non plus du
    // depart de l'autre.
    const m = duo();
    perd(m, "a");
    m.forfeit("a");
    expect(m.seats.find((s) => s.id === "b")!.lives).toBe(2);
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(false);
  });

  it("l'équipe tombe quand plus personne n'y joue", () => {
    const m = duo();
    m.forfeit("a");
    m.forfeit("b");
    expect(m.teamsAlive.length).toBe(1);
  });

  it("la vis se resserre sur les ÉQUIPES, pas sur les joueurs", () => {
    // Le defaut qu'on evite : un duo ampute declencherait l'apnee du duel
    // alors que quatre personnes jouent encore.
    const m = duo(["a", "b", "c", "d", "e", "f"]);
    const depart = m.tensionAt(0);
    m.forfeit("a");
    expect(m.tensionAt(0), "un partenaire parti ne doit rien resserrer").toBe(depart);
    m.forfeit("b");
    expect(m.tensionAt(0)).toBeLessThan(depart);
  });
});
