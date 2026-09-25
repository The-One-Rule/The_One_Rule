/**
 * Couche réseau cliente — AUCUN DOM.
 *
 * Deux responsabilités :
 *   · l'horloge : reconstruire l'heure serveur par ping, car toutes les
 *     fenêtres de jeu sont exprimées dans ce référentiel ;
 *   · la connexion : parler le protocole, exposer des événements typés.
 *
 * L'interface (main.ts) s'abonne et dessine ; ce module ne sait pas qu'un
 * écran existe.
 */

import { CONSIGNES_VERSION } from "../engine/instructions";
import {
  PROTOCOL_VERSION,
  decodeServer,
  encode,
} from "../../shared/protocol";
import type { ClientMsg, Glyph, RoomSettings, ServerMsg } from "../../shared/protocol";
import { glyphFor } from "./glyph";

/* ------------------------------------------------------------------ *
 * Horloge
 * ------------------------------------------------------------------ */

/**
 * Estimation d'offset par échantillons ping/pong.
 *
 * offset ≈ serverNow − (t0 + t1) / 2 : l'heure serveur comparée au milieu de
 * l'aller-retour. On garde la MÉDIANE de plusieurs échantillons — un seul
 * ping qui traverse un pic de latence fausserait tout, la médiane l'ignore.
 */
export class ServerClock {
  private samples: number[] = [];
  private offset = 0;
  ready = false;

  addSample(t0: number, t1: number, serverNow: number): void {
    this.samples.push(serverNow - (t0 + t1) / 2);
    if (this.samples.length > 9) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.offset = sorted[sorted.length >> 1]!;
    this.ready = this.samples.length >= 3;
  }

  /** L'heure serveur estimée, maintenant. */
  now(): number {
    return Date.now() + this.offset;
  }

  /** Convertit une date serveur en date locale (pour armer un rendu). */
  toLocal(serverTime: number): number {
    return serverTime - this.offset;
  }

  get currentOffset(): number {
    return this.offset;
  }
}

/* ------------------------------------------------------------------ *
 * Connexion
 * ------------------------------------------------------------------ */

type Handler = (msg: ServerMsg) => void;

export class NetClient {
  readonly clock = new ServerClock();
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  myId = "";
  connected = false;
  /**
   * LE PROFIL (carte de visite, photo), relu à CHAQUE `welcome` : le serveur
   * en renvoie un à la reprise d'un siège, avec une identité de client neuve
   * qui ne sait rien du profil de l'ancienne. Une fonction et non une valeur :
   * c'est la sauvegarde qui fait foi, au moment où l'on se présente.
   */
  profil: () => { carte?: string; photo?: string } = () => ({});

  /** Renvoie le profil au salon — après un changement sur l'écran d'identité. */
  envoieProfil(): void {
    if (this.connected) this.send({ t: "profil", ...this.profil() });
  }

  constructor(private url: string) {}

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  /**
   * `key` est un identifiant local stable. Le serveur s'en sert pour rendre
   * son siège à un joueur coupé en pleine partie, au lieu de le faire revenir
   * en spectateur avec une identité neuve. Sans clé, tout fonctionne — on perd
   * seulement la reprise après coupure.
   */
  connect(
    name: string,
    glyph?: Glyph,
    key?: string,
    rookie = false,
    /** Cet appareil peut jouer une consigne au clavier. Défaut prudent : non. */
    clavier = false,
    /**
     * Jeton de compte, s'il y en a un.
     *
     * Facultatif de bout en bout : absent, le serveur assoit un joueur
     * anonyme, ce qui est un état parfaitement normal et indiscernable dans
     * le salon. La connexion ne doit JAMAIS attendre après lui.
     */
    tok?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      /** Vrai seulement après un `welcome` : distingue « jamais établie » de
       *  « perdue en route », qui n'appellent pas le même message. */
      let established = false;
      /**
       * Toute sortie passe par ici. Une promesse de connexion qui ne se règle
       * jamais est pire qu'un échec : `ensureConnected()` l'attend, donc son
       * `finally` ne tourne pas, `connecting` reste vrai et le bouton
       * MULTIJOUEUR reste bloqué sur « CONNEXION… » jusqu'au rechargement.
       */
      const fail = (why: string): void => {
        if (settled) return;
        settled = true;
        reject(new Error(why));
      };
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }
      const ws = this.ws;

      // Filet : une socket ouverte dont le `welcome` n'arrive jamais (serveur
      // figé, poignée de main acceptée puis silence) ne laisserait rien
      // trancher — ni `onerror`, ni `onclose`.
      const timeout = setTimeout(() => {
        fail("connexion sans réponse");
        ws.close();
      }, 8000);

      ws.onopen = () => {
        this.send({
          t: "hello",
          v: PROTOCOL_VERSION,
          name,
          glyph: glyph ?? undefined,
          key,
          rookie,
          clavier,
          tok,
          // Ce que CE bundle sait reconstruire. Le serveur retient le minimum
          // de la table : voir `poolMulti`.
          consignes: CONSIGNES_VERSION,
        });
        // rafale initiale : l'horloge doit être prête avant la première manche
        for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), i * 120);
        this.pingTimer = setInterval(() => this.ping(), 5000);
      };

      ws.onmessage = (ev) => {
        const msg = decodeServer(ev.data);
        if (!msg) return;
        if (msg.t === "welcome") {
          this.myId = msg.id;
          this.connected = true;
          this.send({ t: "profil", ...this.profil() });
          if (!settled) {
            settled = true;
            established = true;
            clearTimeout(timeout);
            resolve();
          }
        }
        if (msg.t === "pong") {
          this.clock.addSample(msg.sent, Date.now(), msg.serverNow);
        }
        for (const h of this.handlers) h(msg);
      };

      ws.onerror = () => fail("connexion impossible");

      ws.onclose = () => {
        this.connected = false;
        clearTimeout(timeout);
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        // Fermeture AVANT le `welcome` : la connexion a échoué, elle n'a pas
        // été perdue. Le cas réel est un `bad_version` — le serveur répond
        // puis ferme proprement, donc sans `onerror` pour trancher. C'est ce
        // qui arrive à un onglet resté ouvert sur l'ancien bundle après un
        // déploiement, exactement au moment où on en a le plus besoin.
        //
        // On n'annonce alors PAS « déconnecté » : le message du serveur est
        // déjà arrivé et il est plus précis. C'est le rejet qui informe.
        if (!established) {
          fail("fermé avant l'établissement");
          return;
        }
        for (const h of this.handlers)
          h({ t: "error", code: "room_unknown", detail: "déconnecté" });
      };
    });
  }

  private ping(): void {
    this.send({ t: "ping", sent: Date.now() });
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  createRoom(): void {
    this.send({ t: "create" });
  }
  joinRoom(code: string): void {
    this.send({ t: "join", code: code.toUpperCase() });
  }
  startMatch(): void {
    this.send({ t: "start" });
  }
  leave(): void {
    this.send({ t: "leave" });
  }

  /** Hôte uniquement : les réglages valent pour tout le salon. */
  setSettings(settings: Partial<RoomSettings>): void {
    this.send({ t: "settings", settings });
  }

  /**
   * Choisir l'écran qu'on regarde en tant que spectateur.
   *
   * Aucun flux supplémentaire n'arrive : le déterminisme du moteur permet de
   * reconstruire la vue de n'importe qui avec buildMultiRound(seed, idx, sa
   * règle). Regarder un match ne coûte rien en bande passante.
   */
  watch(playerId: string): void {
    this.send({ t: "watch", playerId });
  }

  /** Réaction diffusée à tout le salon. Le serveur borne le débit et
   *  réémet avec l'identifiant : on ne s'annonce jamais soi-même. */
  emote(k: number): void {
    this.send({ t: "emote", k });
  }

  chat(text: string): void {
    this.send({ t: "chat", text });
  }

  /** Hôte uniquement. Le serveur revérifie : cette méthode n'est qu'un raccourci. */
  kick(playerId: string): void {
    this.send({ t: "kick", playerId });
  }

  /**
   * Une voix, pendant l'observation. Le serveur ignore un second vote
   * en silence — comme une emote hors débit.
   */
  vote(playerId: string): void {
    this.send({ t: "vote", playerId });
  }

  /** Signe visuel local, dérivé de l'identifiant du joueur. */
  glyph(): Glyph {
    return glyphFor(this.myId);
  }

  /**
   * Un input, horodaté sur l'HORLOGE SERVEUR au moment du geste.
   *
   * C'est le cœur de l'équité réseau : le joueur à 90 ms de latence envoie la
   * date de son clic, pas celle de la réception — le serveur bornera de toute
   * façon (voir INPUT_TOLERANCE_MS côté serveur).
   */
  sendInput(round: number, action: { k: "c"; i: number | null } | { k: "k"; key: string } | { k: "r"; key: string }): void {
    this.send({ t: "input", round, at: this.clock.now(), action });
  }

  /**
   * Position de curseur, coordonnées de champ. Le serveur borne et plafonne
   * à 20 Hz. Ce n'est pas un input : aucun verdict ne s'en sert.
   */
  sendCursor(x: number, y: number): void {
    this.send({ t: "cursor", x, y });
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
