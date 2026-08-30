/**
 * Instrumentation minimale.
 *
 * Objectif : produire les quatre chiffres qui décident de la suite du projet
 * (D1, D7, durée médiane de session, taux de partage). Rien d'autre.
 *
 * Contraintes tenues :
 *  - aucun service tiers, aucun cookie, aucune donnée personnelle
 *  - un identifiant aléatoire local, jamais rattaché à une identité
 *  - envoi en fire-and-forget : une panne du collecteur ne doit jamais
 *    ralentir ni casser une partie
 *  - désactivable, et le refus est respecté définitivement
 */

/**
 * Les quatre premiers chiffres mesurent un joueur seul. Les événements
 * `*_sent` / `*_opened` mesurent l'entonnoir social, qui a sa propre question :
 * un lien envoyé est une intention, un lien ouvert est une adhésion, et seul
 * `run_start` qui suit prouve que quelqu'un a joué. Les trois crans se lisent
 * séparément parce qu'ils échouent pour des raisons différentes — personne
 * n'envoie, personne n'ouvre, ou personne ne franchit l'écran d'annonce.
 *
 * Les deux surfaces sociales sont instrumentées symétriquement : le duel
 * asynchrone (`duel_*`) et l'invitation au salon (`invite_*`). N'en mesurer
 * qu'une ferait lire « le social ne prend pas » là où c'est l'autre qui sert.
 */
export const EVENT_NAMES = [
  "first_open",
  "day_return",
  "visit_end",
  "run_start",
  "run_end",
  "quest_complete",
  "share",
  "duel_sent",
  "duel_opened",
  "invite_sent",
  "invite_opened",
  "optout",
  /*
   * Le compte, mesuré en trois points.
   *
   * L'entonnoir tient en deux rapports : combien voient l'invitation, combien
   * partent se connecter, combien reviennent avec un compte. C'est la seule
   * façon de savoir si les comptes servent à quelque chose — les testeurs les
   * ont RÉCLAMÉS, ce qui n'est pas la même chose que les utiliser, et le
   * projet a déjà vu une demande unanime (le partage de score) rester à 0 %
   * d'usage réel.
   */
  "compte_invite",
  "compte_start",
  "compte_lie",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface TrackedEvent {
  ev: EventName;
  ts: number;
  [k: string]: unknown;
}

export interface Transport {
  send(payload: { id: string; day: number; batch: TrackedEvent[] }): void;
}

interface Options {
  id: string;
  day: number;
  endpoint?: string;
  enabled: boolean;
  transport?: Transport;
  now?: () => number;
}

const MAX_BATCH = 20;
const FLUSH_MS = 4000;

/** Transport réseau : sendBeacon en priorité, il survit à la fermeture d'onglet. */
function httpTransport(endpoint: string): Transport {
  return {
    send(payload) {
      const body = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
          return;
        }
      } catch {
        /* on retombe sur fetch */
      }
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    },
  };
}

export class Analytics {
  private queue: TrackedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private transport: Transport | null;
  private now: () => number;
  private enabled: boolean;

  constructor(private opts: Options) {
    this.now = opts.now ?? (() => Date.now());
    this.enabled = opts.enabled;
    this.transport =
      opts.transport ?? (opts.endpoint ? httpTransport(opts.endpoint) : null);
  }

  setEnabled(on: boolean): void {
    if (!on) this.flush();
    this.enabled = on;
  }

  track(ev: EventName, props: Record<string, unknown> = {}): void {
    if (!this.enabled || !this.transport) return;
    this.queue.push({ ev, ts: this.now(), ...props });
    if (this.queue.length >= MAX_BATCH) {
      this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || !this.transport) return;
    const batch = this.queue;
    this.queue = [];
    try {
      this.transport.send({ id: this.opts.id, day: this.opts.day, batch });
    } catch {
      // La mesure ne doit jamais pouvoir casser une partie. flush() est appelé
      // depuis pagehide et depuis des gestionnaires de clic : une exception ici
      // remonterait dans le jeu. On perd le lot, c'est tout.
    }
  }

  /** Pour les tests. */
  get pending(): number {
    return this.queue.length;
  }
}

let instance: Analytics | null = null;

export function initAnalytics(opts: Options): Analytics {
  instance = new Analytics(opts);
  return instance;
}

export const track: Analytics["track"] = (ev, props) => instance?.track(ev, props);
export const flush = (): void => instance?.flush();
export const setAnalyticsEnabled = (on: boolean): void => instance?.setEnabled(on);
