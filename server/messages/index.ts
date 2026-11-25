/**
 * Branchement d'une socket : décodage, puis un cas par message.
 * Le salon ne vit pas ici : on appelle les fonctions de `salon.ts`.
 */
import type { RawData, WebSocketServer } from "ws";
import { adresseDe, REFUS_AVANT_COUPURE, SEAU_CAPACITE, SEAU_PAR_SECONDE, Seau } from "../debit";
import { choisitTable } from "../rapide";
import { CODE_ALPHABET } from "../code";
import { fautSignalerActe, peutLancerImposteur } from "../../src/engine/imposteur";
import { peutLancerCoop, borneCurseur } from "../../src/engine/coop";
import { verifieJeton } from "../jeton";
import { CONSIGNES_VERSION } from "../../src/engine/instructions";
import { glyphFor, glyphFromIndex } from "../../src/net/glyph";
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LEN,
  CURSOR_COOLDOWN_MS,
  EMOTE_COOLDOWN_MS,
  EMOTE_COUNT,
  INPUT_TOLERANCE_MS,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  decodeClient,
  sanitizeSettings,
} from "../../shared/protocol";
import { carteValide, photoValide } from "../../shared/profil";
import {
  AUTH_SECRET,
  PROFIL_PHOTO_COOLDOWN_MS,
  appliquerClicCoop,
  broadcast,
  clients,
  closeRound,
  clotureVote,
  diffuseEtatBientot,
  diffuserCurseurs,
  echecsJoin,
  enPartie,
  envoiePhotos,
  guarded,
  idsAssis,
  leaveRoom,
  matchState,
  nouveauSalon,
  now,
  parseGlyph,
  plusTard,
  rejoindre,
  roomState,
  rooms,
  send,
  startMatch,
  uid,
  type Client,
} from "../salon";

export function branche(wss: WebSocketServer): void {
wss.on("connection", (ws, req) => {
  const client: Client = {
    id: uid(),
    name: "ANONYME",
    ws,
    room: null,
    alive: true,
    glyph: glyphFor(""),
    watching: null,
    lastEmoteAt: 0,
    lastChatAt: 0,
    photoAt: 0,
    lastCursorAt: 0,
    key: "",
    graceTimer: null,
    rookie: false,
    clavier: false,
    consignes: 1,
    reprise: false,
    compte: null,
    adresse: adresseDe(req.headers, req.socket.remoteAddress),
    seau: new Seau(SEAU_CAPACITE, SEAU_PAR_SECONDE, Date.now()),
    refus: 0,
  };
  client.glyph = glyphFor(client.id);

  clients.add(client);
  ws.on("pong", () => (client.alive = true));
  /*
   * ⚠️ SANS CET ÉCOUTEUR, UN SEUL CLIENT FAIT TOMBER TOUS LES SALONS.
   *
   * `ws` émet `error` sur toute trame qu'il refuse — plus grosse que
   * `maxPayload`, UTF-8 invalide, opcode inconnu. Un `EventEmitter` sans
   * écouteur d'`error` LÈVE, et rien ne rattrape l'exception : le processus
   * meurt, et avec lui chaque partie en mémoire. Découvert en portant une
   * photo sur le fil ; l'e2e envoie désormais une trame trop grosse et exige
   * que le serveur réponde encore. La socket fautive se ferme d'elle-même
   * (`ws` s'en charge), et `close` fait le ménage habituel.
   */
  ws.on("error", (e) => {
    console.warn(`socket ${client.id} : ${e.message}`);
  });

  ws.on("message", guarded((raw: RawData) => {
    // Le seau AVANT le décodage : un message en trop ne doit rien coûter.
    if (!client.seau.prend(Date.now())) {
      client.refus += 1;
      if (client.refus === REFUS_AVANT_COUPURE) ws.close(1008, "debit");
      return;
    }
    client.refus = 0;
    const msg = decodeClient(raw.toString());
    if (!msg) return;

    switch (msg.t) {
      case "hello": {
        if (msg.v !== PROTOCOL_VERSION) {
          send(client, { t: "error", code: "bad_version" });
          ws.close();
          return;
        }
        client.name = String(msg.name ?? "").slice(0, 14).toUpperCase() || "ANONYME";
        client.key = String(msg.key ?? "").slice(0, 32);
        client.rookie = msg.rookie === true;
        // `=== true` et non une coercition : absent doit valoir NON.
        client.clavier = msg.clavier === true;
        // Absent, douteux ou inconnu vaut 1 ; plus récent que le serveur est
        // ramené au sien — il ne sait juger que ce qu'il connaît.
        client.consignes =
          Number.isInteger(msg.consignes) && (msg.consignes as number) >= 1
            ? Math.min(msg.consignes as number, CONSIGNES_VERSION)
            : 1;
        client.glyph = parseGlyph(msg.glyph, client.id);
        client.reprise = msg.reprise === true;

        /*
         * Le compte, s'il y en a un.
         *
         * SYNCHRONE, et c'est la raison d'être de `server/jeton.ts` : chez la
         * plupart des clients, `create` ou `join` arrive dans le même paquet
         * TCP que ce `hello`. Une vérification asynchrone ferait entrer le
         * joueur dans le salon sous son identité anonyme, et son nom
         * changerait sous les yeux des autres une milliseconde plus tard.
         *
         * Tout échec — pas de jeton, périmé, signature fausse, serveur sans
         * secret — laisse `compte` à `null` et n'envoie AUCUNE erreur : le
         * joueur joue. Un message d'erreur ici bloquerait un chemin d'entrée
         * pour une couche qui n'est pas censée en être un.
         *
         * Le pseudo et le glyphe du jeton font alors autorité sur ceux
         * annoncés dans le `hello`. C'est ce qui règle l'usurpation de nom à
         * l'intérieur d'un salon : un nom vérifié ne se recopie pas.
         */
        const revendications = verifieJeton(msg.tok, AUTH_SECRET);
        if (revendications) {
          client.compte = revendications.sub;
          if (revendications.psd) client.name = revendications.psd;
          client.glyph = glyphFromIndex(revendications.gly);
        }

        send(client, { t: "welcome", id: client.id });
        return;
      }

      /* La synchro d'horloge : le client estime offset = serverNow − (aller+retour)/2.
         C'est tout ce dont il a besoin pour caler ses fenêtres sur les nôtres. */
      case "ping":
        send(client, { t: "pong", sent: msg.sent, serverNow: now() });
        return;

      /*
       * LE PROFIL — carte de visite et photo. Tout ce qui ne passe pas la
       * validation PARTAGÉE (`shared/profil.ts`) est simplement oublié : aucun
       * message d'erreur, un profil n'est pas un chemin d'entrée.
       */
      case "profil": {
        const carte = carteValide(msg.carte);
        const t = Date.now();
        /*
         * Une photo se relaie à tout le salon : 14 Ko fois neuf. Personne ne
         * change de photo deux fois en une seconde et demie (il faut rouvrir le
         * sélecteur de fichiers), donc un changement plus rapproché est un
         * script — on garde l'ancienne. La CARTE, elle, reste libre : quelques
         * octets, et on la choisit en cliquant de l'une à l'autre.
         */
        const photoDemandee = photoValide(msg.photo);
        const photo =
          photoDemandee !== client.photo && t - client.photoAt < PROFIL_PHOTO_COOLDOWN_MS
            ? client.photo
            : photoDemandee;
        const photoAvant = client.photo;
        // Rien n'a changé : rien à relayer.
        if (carte === client.carte && photo === photoAvant) return;
        if (photo !== photoAvant) client.photoAt = t;
        client.carte = carte;
        client.photo = photo;
        const room = client.room;
        if (room) {
          diffuseEtatBientot(room);
          if (photo !== photoAvant) {
            broadcast(room, { t: "photos", photos: { [client.id]: photo ?? "" } });
          }
        }
        return;
      }

      case "create": {
        leaveRoom(client);
        const room = nouveauSalon(client, false);
        broadcast(room, roomState(room));
        envoiePhotos(room, client);
        return;
      }

      /*
       * PARTIE RAPIDE — voir `server/rapide.ts`. Une table publique qui
       * attend, sinon une en cours (on y regarde jusqu'au match suivant),
       * sinon une neuve. L'entrée elle-même est EXACTEMENT celle de `join` :
       * reprise de siège, spectateur en cours de match, photos.
       */
      case "quick": {
        if (client.room?.public) {
          send(client, roomState(client.room));
          return;
        }
        leaveRoom(client);
        const code = choisitTable(
          [...rooms.values()]
            .filter((r) => r.public)
            .map((r) => ({ code: r.code, joueurs: r.clients.size, enPartie: enPartie(r) })),
          MAX_PLAYERS,
        );
        const table = code ? rooms.get(code) : undefined;
        if (table) {
          rejoindre(client, table);
          return;
        }
        const room = nouveauSalon(client, true);
        broadcast(room, roomState(room));
        envoiePhotos(room, client);
        return;
      }

      case "join": {
        /*
         * Au-delà de `ECHECS_JOIN_MAX` codes inconnus par minute, la même
         * réponse part SANS regarder la table : celui qui balaie les codes
         * n'apprend plus rien. Voir `debit.ts`.
         */
        const t = Date.now();
        const code = String(msg.code ?? "").toUpperCase();
        /*
         * Un code MAL FORMÉ ne désigne aucun salon : il ne révèle rien, donc
         * il ne compte pas comme un essai. Seuls les codes qui POURRAIENT
         * exister usent le crédit de l'adresse — sinon une faute de frappe
         * hostile (le corpus de l'e2e, un client bricolé) bloquerait le vrai
         * code tapé juste après par quelqu'un du même réseau.
         */
        const bienForme = code.length === 4 && [...code].every((ch) => CODE_ALPHABET.includes(ch));
        if (!bienForme || echecsJoin.bloquee(client.adresse, t)) {
          send(client, { t: "error", code: "room_unknown" });
          return;
        }
        const room = rooms.get(code);
        if (!room) {
          echecsJoin.note(client.adresse, t);
          send(client, { t: "error", code: "room_unknown" });
          return;
        }
        rejoindre(client, room);
        return;
      }

      case "start": {
        const room = client.room;
        // Une table publique part SEULE : personne n'y est l'hôte de personne.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (enPartie(room)) {
          send(client, { t: "error", code: "in_match" });
          return;
        }
        if (room.settings.mode === "imposteur") {
          if (!peutLancerImposteur(idsAssis(room).length)) {
            send(client, { t: "error", code: "need_players" });
            return;
          }
        }
        if (room.settings.mode === "coop") {
          if (!peutLancerCoop(idsAssis(room).length)) {
            send(client, { t: "error", code: "need_players" });
            return;
          }
        }
        if (room.clients.size < 1) return;
        startMatch(room);
        return;
      }

      case "settings": {
        const room = client.room;
        // Les réglages d'une table publique sont ceux par défaut, pour tous.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (enPartie(room)) {
          send(client, { t: "error", code: "in_match" });
          return;
        }
        room.settings = sanitizeSettings({ ...room.settings, ...msg.settings });
        broadcast(room, roomState(room));
        return;
      }

      /* Regarder quelqu'un ne coûte RIEN au serveur : la scène étant
         déterministe, le spectateur la reconstruit lui-même. On ne fait
         qu'enregistrer son choix pour l'afficher aux autres. */
      case "watch": {
        // Borné : un identifiant fait 8 caractères, et cette valeur est
        // retenue par connexion. Sans borne, chaque client pourrait faire
        // stocker au serveur près de 4 Ko à volonté.
        client.watching = String(msg.playerId ?? "").slice(0, 16) || null;
        return;
      }

      case "input": {
        const room = client.room;
        if (!room || !room.roundOpen) return;

        if (room.coop) {
          const coop = room.coop;
          if (msg.round !== coop.roundIdx) return;
          const floorC = Math.max(room.roundStartAt, now() - INPUT_TOLERANCE_MS);
          const atC = Math.min(Math.max(Number(msg.at) || 0, floorC), room.roundDeadline);
          const elapsedC = atC - room.roundStartAt;
          const aC = msg.action as Partial<{ k: string; i: unknown }> | undefined;
          if (!aC || aC.k !== "c") return;
          const iC = aC.i === null || aC.i === undefined ? null : Number(aC.i);
          if (iC !== null && !Number.isInteger(iC)) return;
          const entC = coop.entityOf(client.id, iC);
          const r = coop.inputCoop(
            client.id,
            msg.round,
            {
              kind: "click",
              ent: entC,
              x: entC ? entC.x : Number.NaN,
              y: entC ? entC.y : Number.NaN,
            },
            elapsedC,
          );
          if (!r) return;
          appliquerClicCoop(room, r);
          return;
        }

        const match = room.match;
        if (!match) return;
        if (msg.round !== match.roundIdx) return;

        /*
         * La date de l'input est bornée par ce que le serveur peut vérifier :
         * jamais avant le départ de la manche, jamais après l'échéance, et
         * jamais plus tôt que « maintenant moins la tolérance ». Le client
         * horodate pour compenser SA latence ; la borne empêche d'horodater
         * dans le passé pour gagner du temps de réaction.
         */
        const floor = Math.max(room.roundStartAt, now() - INPUT_TOLERANCE_MS);
        const at = Math.min(Math.max(Number(msg.at) || 0, floor), room.roundDeadline);
        const elapsed = at - room.roundStartAt;

        // La forme est déjà validée. On relit quand même : un index non entier
        // ne doit pas atteindre `ents[i]`.
        const a = msg.action as Partial<{ k: string; i: unknown; key: unknown }> | undefined;
        if (!a || (a.k !== "c" && a.k !== "k" && a.k !== "r" && a.k !== "l")) return;

        // `ents[i]` avec un i non entier peut remonter une propriété héritée
        // (« __proto__ » renvoie un objet, que `?? null` ne rattrape pas).
        // On n'accepte donc qu'un index entier, ou null pour « rien cliqué ».
        const i = a.i === null || a.i === undefined ? null : Number(a.i);
        if (i !== null && !Number.isInteger(i)) return;

        // Une touche est un caractère ou un nom de touche court. Sans borne,
        // `maxPayload` autoriserait une chaîne de 4 Ko dans chaque input.
        const key = String(a.key ?? "").slice(0, 16);

        /*
         * La position du clic vient de l'ENTITÉ, reconstruite par le serveur.
         *
         * Elle valait `x: 0` en dur, parce que le fil ne transporte qu'un index
         * — décision volontaire de l'anti-triche : le serveur ne doit rien
         * croire du client, et il n'a aucune idée de sa résolution.
         *
         * Mais une règle JUGE sur cette position. LE GAUCHER interdit la
         * première colonne (`a.x < 200`), donc avec x = 0 elle déclarait une
         * infraction à CHAQUE clic, où qu'on clique. Constaté en soirée de
         * test : « dès qu'un joueur l'obtient, il est assuré de perdre ». Le
         * solo n'était pas touché — main.ts, lui, envoie les vraies
         * coordonnées de champ.
         *
         * Le serveur a l'information : il reconstruit la scène, donc il connaît
         * `ent.x`. On juge là-dessus — autorité conservée, sans rien demander
         * au client.
         *
         * Clic dans le vide : on ne sait pas où, et prétendre « en (0,0) »
         * ferait mentir la règle. NaN ne satisfait aucune comparaison, donc
         * aucune règle de zone ne se déclenche et le verdict honnête —
         * « TU AS CLIQUÉ DANS LE VIDE » — reprend la main.
         */
        const ent = a.k === "c" || a.k === "l" ? match.entityOf(client.id, i) : null;
        // Le LEVER (MAINTENIR, GLISSER) se reconstruit comme le clic : depuis
        // l'entité, jamais depuis un point que le client annoncerait.
        const action =
          a.k === "c" || a.k === "l"
            ? {
                kind: a.k === "c" ? ("click" as const) : ("lift" as const),
                ent,
                x: ent ? ent.x : Number.NaN,
                y: ent ? ent.y : Number.NaN,
              }
            : a.k === "k"
              ? { kind: "key" as const, key }
              : { kind: "release" as const, key };

        const vierge = match.encoreSansGeste(client.id);
        match.input(client.id, msg.round, action, elapsed);
        if (fautSignalerActe(match.imposteur, vierge, match.encoreSansGeste(client.id))) {
          broadcast(room, { t: "acted", idx: match.roundIdx, playerId: client.id });
        }

        // Tous les vivants ont conclu → on n'attend pas l'échéance pour rien.
        const allDone = match.alive.every((s) => {
          const st = matchState(match, s.id);
          return st === null || st.outcome !== null;
        });
        if (allDone && room.timer) {
          clearTimeout(room.timer);
          closeRound(room);
        }
        return;
      }

      case "vote": {
        const room = client.room;
        const match = room?.match;
        if (!room || !match) return;
        const accuseId = String(msg.playerId ?? "").slice(0, 16);
        if (!accuseId) return;
        const r = match.poserVote(client.id, accuseId);
        if (r.ignore || !r.issue) return;
        clotureVote(room, r.issue);
        return;
      }

      case "cursor": {
        const room = client.room;
        const coop = room?.coop;
        if (!room || !coop) return;
        if (!coop.estActif(client.id)) return;
        const t = now();
        if (t - client.lastCursorAt < CURSOR_COOLDOWN_MS) return;
        const p = borneCurseur(msg.x, msg.y);
        if (!p) return;
        client.lastCursorAt = t;
        room.cursorPos.set(client.id, p);
        diffuserCurseurs(room);
        return;
      }

      case "emote": {
        const room = client.room;
        if (!room) return;
        // Déjà filtré par `valideClient` ; la borne reste ici, au cas où.
        const k = Number(msg.k);
        if (!Number.isInteger(k) || k < 0 || k >= EMOTE_COUNT) return;
        const t = now();
        if (t - client.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        client.lastEmoteAt = t;
        broadcast(room, { t: "emote", playerId: client.id, k });
        return;
      }

      case "chat": {
        const room = client.room;
        if (!room) return;
        const text = String(msg.text ?? "")
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001F\u007F]/g, " ")
          .trim()
          .slice(0, CHAT_MAX_LEN);
        if (!text) return;
        const t = now();
        if (t - client.lastChatAt < CHAT_COOLDOWN_MS) return;
        client.lastChatAt = t;
        broadcast(room, { t: "chat", playerId: client.id, name: client.name, text });
        return;
      }

      case "kick": {
        const room = client.room;
        // Sur une table publique, le premier arrivé n'a aucun droit sur les
        // suivants : une expulsion y serait un abus, pas une modération.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        // Les identifiants sont attribués par connexion : une liste de bannis
        // serait vide de sens — l'exclu revient avec un nouvel id s'il a gardé
        // le code. L'exclusion sort de la pièce, elle ne ferme pas la porte.
        // Sans comptes, la seule protection réelle est la sourdine locale.
        const victim = room.clients.get(String(msg.playerId ?? ""));
        if (!victim || victim.id === client.id) return;
        send(victim, { t: "error", code: "kicked" });
        leaveRoom(victim);
        victim.ws.close();
        return;
      }

      case "leave":
        leaveRoom(client);
        return;
    }
  }));

  ws.on("close", guarded(() => {
    clients.delete(client);

    /*
     * Coupure pendant un match : on GARDE le siège au lieu de déclarer forfait.
     *
     * Sans ça, une bascule d'application sur téléphone élimine définitivement —
     * et c'est le comportement normal d'un navigateur mobile, pas un incident
     * rare. Le joueur absent continue de perdre des vies par timeout, donc il
     * ne gagne rien à disparaître ; il peut simplement revenir.
     *
     * Un `leave` explicite ne passe pas par ici : partir reste immédiat.
     */
    const room = client.room;
    const seatVivant =
      (!!room?.match && room.match.seats.some((s) => s.id === client.id && !s.eliminated)) ||
      (!!room?.coop && room.coop.seats.some((s) => s.id === client.id));
    if (room && seatVivant && client.key) {
      // Absent : plus aucune manche ne lui est ouverte, donc plus de vie
      // perdue par timeout. Sans ça le sursis ne servait à rien — il était
      // éliminé bien avant d'avoir pu revenir.
      room.match?.setAway(client.id, true);
      room.coop?.setAway(client.id, true);
      if (room.coop && room.cursorPos.delete(client.id)) diffuserCurseurs(room);
      client.graceTimer = plusTard(() => {
        client.graceTimer = null;
        leaveRoom(client);
      }, RECONNECT_GRACE_MS);
      broadcast(room, roomState(room)); // les plaques montrent « déconnecté »
      return;
    }
    leaveRoom(client);
  }, "fermeture"));
});
}
