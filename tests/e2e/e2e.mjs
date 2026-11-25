/**
 * Bout en bout, un seul processus : le serveur est importé (il ouvre son port),
 * trois vrais clients WebSocket jouent un match court.
 * ALICE joue juste · BOB clique tout · CHLOE ne répond jamais.
 */
process.env.PORT = "8797";
process.env.METRICS_PORT = "8798";
import WebSocket from "ws";
import { setTimeout as sleep } from "node:timers/promises";

/*
 * Deux e2e lancés en parallèle se disputent le port et le second meurt sur une
 * pile Node de vingt lignes, sans dire ce qui se passe. Le cas est fréquent —
 * une boucle de vérification laissée en tâche de fond — et le message compte
 * plus que la pile.
 */
process.on("uncaughtException", (e) => {
  if (e && e.code === "EADDRINUSE") {
    console.error(`ARRÊT : le port ${process.env.PORT} est déjà pris.`);
    console.error("Un autre e2e tourne probablement déjà. Attends sa fin, puis relance.");
    process.exit(2);
  }
  throw e;
});

await import("../../server/index.ts");
const { buildMultiRound, poolMulti, applyRule, draftShared } = await import("../../src/engine/multiround.ts");
const { draftImposteur, SANS_REGLE } = await import("../../src/engine/imposteur.ts");
const { INSTRUCTIONS, CONSIGNES_VERSION } = await import("../../src/engine/instructions/index.ts");
const { HOLD_MS } = await import("../../src/engine/difficulty.ts");
const { ONE_RULES, ruleById } = await import("../../src/engine/rules/index.ts");
const { MOTIFS } = await import("../../src/engine/motifs.ts");
const { COUNTDOWN_MS, INTERLUDE_MS, MAX_ROUND_MS } = await import("../../shared/protocol.ts");
const { ECHECS_JOIN_MAX } = await import("../../server/debit.ts");

/*
 * Attendre le DÉPART d'un match, pas une durée devinée.
 *
 * Six attentes étaient écrites en dur — 3000, 3200, 3400, 3600 ms — toutes
 * calées de tête sur un compte à rebours de 3 secondes. Allonger celui-ci pour
 * laisser le temps de lire la règle les a toutes fait mentir d'un coup : elles
 * mesuraient une constante qu'elles ne nommaient pas.
 */
const APRES_DEPART = COUNTDOWN_MS + 600;

/*
 * UNE MANCHE ENTIÈRE, PAUSE COMPRISE — et c'est la SEPTIÈME attente de ce
 * fichier à avoir été écrite en dur.
 *
 * `sleep(3000)` attendait qu'un spectateur voie passer un verdict. Ça tenait
 * tant qu'une manche plafonnait à 2400 ms. La courbe de difficulté a été
 * redescendue sur directive de Pierre — le plafond multi passe de 2400 à
 * 4000 — et l'attente est devenue trop courte du jour au lendemain : plus aucun
 * verdict dans la fenêtre, assertion rouge, et rien dans le code de match qui
 * ait changé.
 *
 * Exactement le défaut que le commentaire du dessus décrit déjà : une attente
 * qui MESURE une constante sans la nommer. On la nomme.
 */
const UNE_MANCHE = MAX_ROUND_MS + INTERLUDE_MS + 600;

/*
 * Journal bavard.
 *
 * Un « E2E : 1 échec(s) » sans nom d'assertion s'est produit deux fois sans
 * jamais se reproduire sous observation. Ce fichier dit donc, pour chaque
 * assertion : son numéro, l'instant où elle est tombée, et — quand elle porte
 * sur une grandeur mesurée — la MARGE qui la sépare de son seuil. Les
 * assertions qui passent de justesse sont récapitulées à la fin : ce sont les
 * seules candidates sérieuses à un échec intermittent.
 */
const T0 = Date.now();
const ms = () => String(Date.now() - T0).padStart(6, " ");
const journal = [];
const serres = [];

/*
 * Quand le pilote automatique agit, apres l'ouverture d'une manche.
 *
 * 460 ms, et le chiffre n'est pas libre : LA SECONDE tue toute action lancee
 * avant 400 ms (« TU AS AGI TROP TOT »), et MIN_ROUND_MS vaut 700 — il faut
 * donc tomber dans la fenetre etroite qui reste. Les etapes suivantes ajoutent
 * 55 ms chacune, ce qui laisse encore 185 ms de marge sur une manche au plus
 * court, plus les 120 ms d'INPUT_TOLERANCE_MS.
 *
 * Le pilote tirait a 230 ms. Ca n'a jamais pose probleme tant que l'attribution
 * des regles etait figee — les sieges 0 a 2 recevaient LE SANG, LA POINTE et LE
 * COLOSSE, aucune contrainte de temps. Depuis que le pool est permute par
 * match, ALICE peut tirer LA SECONDE : elle mourait alors a chaque manche, et
 * l'e2e accusait le jeu d'avoir elimine le mauvais joueur. Meme famille que
 * l'aide `playPerfect` des tests unitaires, qui ne jouait que la premiere
 * etape et cliquait en x:0.
 */
const DELAI_PILOTE = 460;

function client(name, key, rookie = false, clavier = false, consignes = undefined, son = undefined) {
  const ws = new WebSocket("ws://localhost:8797");
  const c = {
    name, key, rookie, clavier, ws, id: "", room: null, seed: 0, roundIdx: -1, rules: {},
    verdicts: [], ended: null, offset: 0, offsets: [], emotes: [], chats: [], errors: [],
    rounds: [], recus: [], clavierMatch: null, consignesMatch: null, manuel: false,
    tirages: {}, pieges: {}, faute: false, fauteFaite: null,
    imposteur: false, mode: null, acted: [], journals: [], observes: [], voteResults: [],
    coopClics: [], cursorsMsgs: [], chargesCoop: [], photos: [], ferme: null,
  };
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "welcome") c.id = m.id;
    if (m.t === "pong") { c.offset = m.serverNow - (m.sent + Date.now()) / 2; c.offsets.push(c.offset); }
    if (m.t === "room") c.room = m;
    if (m.t === "match_start") {
      c.seed = m.seed;
      c.rules = m.rules;
      c.clavierMatch = m.clavier === true;
      // Absent vaut 1 : exactement ce que fait le vrai client (voir `poolMulti`).
      c.consignesMatch = typeof m.consignes === "number" ? m.consignes : 1;
      c.mode = m.settings?.mode ?? null;
      c.imposteur = false;
    }
    if (m.t === "role" && m.imposteur === true) c.imposteur = true;
    if (m.t === "acted") c.acted.push(m);
    if (m.t === "journal") c.journals.push(m);
    if (m.t === "observe") c.observes.push(m);
    if (m.t === "vote_result") c.voteResults.push(m);
    if (m.t === "coop_clic") c.coopClics.push(m);
    if (m.t === "cursors") c.cursorsMsgs.push(m);
    if (m.t === "charge") c.chargesCoop.push(m);
    if (m.t === "photos") c.photos.push(m.photos);
    // Horodatage de réception : c'est ce qui permet de comparer les pauses
    // annoncées par le serveur à celles réellement vécues par un client.
    if (m.t === "round" || m.t === "verdict") c.recus.push({ t: m.t, idx: m.idx, at: Date.now(), nextRoundAt: m.nextRoundAt ?? null });
    if (m.t === "round") {
      c.rounds.push({ idx: m.idx, at: Date.now(), deadline: m.deadline });
      // Index de la manche EN COURS, lu et non deduit : le deviner depuis le
      // nombre de verdicts recus rendait les tests dependants du minutage.
      c.roundIdx = m.idx;
      if (m.rules) c.rules = m.rules;
      // Le tirage choisi par le serveur (absent = 0), exactement comme le client.
      c.tirages[m.idx] = typeof m.tirage === "number" ? m.tirage : 0;
      /*
       * CHLOE ne répond jamais (elle sert aux timeouts), et tout client
       * marqué `manuel` est piloté par son scénario.
       *
       * Imposteur : `draftImposteur`, jamais `buildMultiRound` / `draftShared`.
       * L'imposteur joue SANS_REGLE (il doit obéir y compris aux pièges).
       */
      if (name === "CHLOE" || c.manuel) return;
      let round;
      /** La règle que CE siège joue — le pilote la consulte sur « n'importe où ». */
      let regleJouee;
      const modeImp = c.mode === "imposteur" || c.room?.settings?.mode === "imposteur";
      if (modeImp) {
        const commune = ONE_RULES.find((r) => r.id === c.rules[c.id])
          || ONE_RULES.find((r) => r.id === Object.values(c.rules)[0]);
        if (!commune) return;
        const rule = c.imposteur ? SANS_REGLE : commune;
        regleJouee = rule;
        const shared = draftImposteur(c.seed, m.idx, commune, poolMulti(c.clavierMatch === true, c.consignesMatch ?? 1));
        round = applyRule(shared, rule, c.seed);
      } else {
        // `ruleById` et non `ONE_RULES` : LA RANCUNE n'est pas au catalogue
        // solo, et son identifiant porte sa cible (`rancune:rond`). Le vrai
        // client fait exactement ça.
        const rule = ruleById(c.rules[c.id] ?? "");
        if (!rule) return;
        regleJouee = rule;
        // Le pool vient du drapeau RECU dans `match_start`, jamais deduit : c'est
        // exactement ce que fait le vrai client, et c'est ce qui garantit que les
        // deux cotes du fil reconstruisent la meme manche.
        round = buildMultiRound(c.seed, m.idx, rule, poolMulti(c.clavierMatch === true, c.consignesMatch ?? 1), c.tirages[m.idx]);
        c.pieges[m.idx] = { trap: round.trap, instr: round.instructionId, gong: round.gong === true };
      }
      const at = () => Date.now() + c.offset;
      /*
       * LA FAUTE COMMANDÉE (scénario LA RANCUNE) : une fois, sur la première
       * manche qui s'y prête, le pilote touche une MAUVAISE pièce — d'une
       * forme qui n'est ni sa rancune actuelle ni celle de la cible. C'est la
       * seule façon de savoir d'avance quelle forme doit devenir la rancune.
       */
      if (c.faute && !round.trap && round.steps[0]?.kind === "click") {
        const visee = round.ents[round.steps[0].idx];
        const actuelle = String(regleJouee.id).split(":")[1];
        const fi = round.ents.findIndex((e) => e !== visee && e.shape !== actuelle && e.shape !== visee.shape);
        if (fi >= 0) {
          c.faute = false;
          c.fauteFaite = { idx: m.idx, forme: round.ents[fi].shape, visee: visee.shape, avant: regleJouee.id, regles: { ...c.rules } };
          setTimeout(() => ws.send(JSON.stringify({ t: "input", round: m.idx, at: at(), action: { k: "c", i: fi } })), DELAI_PILOTE);
          return;
        }
      }
      setTimeout(() => {
        if (name === "BOB") { ws.send(JSON.stringify({ t: "input", round: m.idx, at: at(), action: { k: "c", i: 0 } })); return; }
        if (round.steps.length === 0) return; // piège : silence
        let quand = 0;
        round.steps.forEach((st) => {
          /*
           * ⚠️ « N'IMPORTE OÙ » NE VEUT PAS DIRE « LA PREMIÈRE PIÈCE ».
           *
           * Le pilote cliquait `ents[0]` sur `clickAny` : mortel sous LES
           * ANGLES si la pièce 0 est dans un coin, sous L'AZUR si elle est
           * bleue. Trouvé en mesurant le scénario du double appui — 3 morts
           * sur 39 verdicts qui ressemblaient à un désaccord de pool, et qui
           * n'étaient que l'aide qui jouait mal (§11, la même famille que
           * `playPerfect`). Il choisit donc une pièce que SA règle autorise,
           * comme le crochet `__tor.joue` du jeu.
           */
          const permise = (e) =>
            regleJouee.judge({ kind: "click", ent: e, x: e.x, y: e.y }, { round, elapsedMs: DELAI_PILOTE }) === null &&
            (st.kind !== "clickAnyExcept" || e.color !== st.color);
          /*
           * ⚠️ ET QUAND AUCUNE PIÈCE N'EST PERMISE, ON CLIQUE DANS LE VIDE.
           *
           * `Math.max(0, findIndex(...))` retombait sur la pièce 0 — interdite
           * par construction dans ce cas. Balayé hors ligne, au tempo du
           * pilote : 341 manches sur 114 341 mouraient ainsi (0,3 %), toutes
           * sur « n'importe où » ou « partout sauf », et c'est ce qui a fait
           * tomber l'assertion du jeu de consignes en CI (1 faute sur 57). Le
           * vide est la bonne réponse, et le serveur le juge sans position
           * (`i: null`, comme `vueServeur`) : 0 échec sur 234 003 manches.
           */
          const permiseIdx = round.ents.findIndex(permise);
          const envoie = (a, dans) =>
            setTimeout(() => ws.send(JSON.stringify({ t: "input", round: m.idx, at: at(), action: a })), dans);
          /*
           * MAINTENIR : l'appui, puis le lever APRÈS `HOLD_MS` (plus une marge
           * pour le temps de vol). GLISSER : le lever tombe sur la pièce
           * d'arrivée. Le temps avance d'autant pour les étapes suivantes —
           * LE JUMEAU double un maintien, et le second doit attendre le
           * premier.
           */
          if (st.kind === "hold") {
            envoie({ k: "c", i: st.idx }, quand);
            envoie({ k: "l", i: st.idx }, quand + HOLD_MS + 80);
            quand += HOLD_MS + 80 + 55;
            return;
          }
          const a = st.kind === "click" ? { k: "c", i: st.idx }
            : st.kind === "drop" ? { k: "l", i: st.idx }
            : st.kind === "key" ? { k: "k", key: st.key }
            : { k: "c", i: permiseIdx < 0 ? null : permiseIdx };
          envoie(a, quand);
          quand += 55;
        });
      }, DELAI_PILOTE);
    }
    if (m.t === "verdict") {
      c.verdicts.push(m);
      /*
       * Les règles de la manche SUIVANTE, comme le vrai client
       * (`multi.ts`). Elles n'arrivaient qu'aux rotations, où `round.rules`
       * les redonne aussi ; depuis LA RANCUNE elles arrivent SEULES quand une
       * cible change — un pilote qui les ignorerait jouerait l'ancienne.
       */
      if (m.nextRules) c.rules = m.nextRules;
    }
    if (m.t === "match_end") c.ended = m;
    if (m.t === "emote") c.emotes.push(m);
    if (m.t === "chat") c.chats.push(m);
    if (m.t === "error") c.errors.push(m);
  });
  ws.on("close", (code) => { c.ferme = code; });
  return new Promise((res) => ws.on("open", () => { ws.send(JSON.stringify({ t: "hello", v: 1, name, key, rookie, clavier, reprise: true, ...(consignes === undefined ? {} : { consignes }), ...(son === undefined ? {} : { son }) })); setTimeout(() => res(c), 120); }));
}

const [alice, bob, chloe] = await Promise.all([client("ALICE"), client("BOB"), client("CHLOE")]);
for (const c of [alice, bob, chloe]) for (let i = 0; i < 4; i++) { c.ws.send(JSON.stringify({ t: "ping", sent: Date.now() })); await sleep(25); }

alice.ws.send(JSON.stringify({ t: "create" }));
await sleep(150);
bob.ws.send(JSON.stringify({ t: "join", code: alice.room.code }));
chloe.ws.send(JSON.stringify({ t: "join", code: alice.room.code }));
await sleep(200);
alice.ws.send(JSON.stringify({ t: "start" }));

// BOB (erreurs) et CHLOE (timeouts) tombent ; dès qu'ALICE est seule, le
// serveur envoie match_end immédiatement — plus besoin de leave forcé.
const t0 = Date.now();
while (!alice.ended && Date.now() - t0 < 40000) await sleep(250);

/*
 * Instantané du PREMIER match, pris ici et pas à la fin.
 *
 * `alice` sert ensuite à d'autres scénarios — dont un salon recréé pour les
 * messages malformés. Relire ses verdicts en fin de course mélangeait donc
 * deux matchs : les index repartaient à zéro, les scores « reculaient » et les
 * erreurs volontaires du test de robustesse remontaient comme des anomalies.
 */
const match1 = {
  verdicts: [...alice.verdicts],
  recus: [...alice.recus],
  errors: [...alice.errors],
};

let fails = 0;
let n = 0;
const ok = (b, msg) => {
  n++;
  const ligne = `${b ? "ok  " : "FAIL"} [${String(n).padStart(3, "0")} @${ms()}ms] ${msg}`;
  console.log(ligne);
  journal.push({ n, ok: !!b, msg });
  if (!b) fails++;
  return !!b;
};

/**
 * Assertion sur une grandeur mesurée, avec sa marge.
 *
 * `sens` vaut "min" (la valeur doit dépasser le seuil) ou "max" (elle doit
 * rester en dessous). La marge relative est imprimée à chaque fois, et toute
 * assertion qui passe à moins de 30 % de son seuil est récapitulée en fin de
 * course : c'est là, et nulle part ailleurs, que se cachent les échecs
 * intermittents.
 */
const okMarge = (valeur, seuil, sens, msg, unite = "ms") => {
  const passe = sens === "min" ? valeur > seuil : valeur < seuil;
  const marge = seuil === 0 ? 1 : Math.abs(valeur - seuil) / Math.abs(seuil);
  const pct = (marge * 100).toFixed(0);
  const detail = `${msg} — mesuré ${Math.round(valeur)} ${unite}, seuil ${sens === "min" ? ">" : "<"} ${seuil} ${unite}, marge ${pct} %`;
  const r = ok(passe, detail);
  if (r && marge < 0.3) serres.push({ n, marge: Number(pct), msg: detail });
  return r;
};

/** Trace d'information : jamais un échec, mais visible dans la sortie. */
const info = (msg) => console.log(`info [    @${ms()}ms] ${msg}`);
ok(!!alice.ended, "match_end reçu sans leave forcé (fin immédiate au dernier survivant)");
const last = alice.verdicts[alice.verdicts.length - 1];
ok(alice.verdicts.length >= 3, `manches jouées : ${alice.verdicts.length}`);
ok(bob.verdicts.length === alice.verdicts.length, "verdicts identiques chez tous les clients");
const bobP = last?.players.find((p) => p.name === "BOB");
const chloeP = last?.players.find((p) => p.name === "CHLOE");
ok(bobP && bobP.lives === 0, `BOB éliminé (vies=${bobP?.lives})`);
ok(chloeP && chloeP.lives === 0, `CHLOE éliminée par timeouts (vies=${chloeP?.lives})`);
const aliceP = last?.players.find((p) => p.name === "ALICE");
ok(aliceP && aliceP.lives > 0, `ALICE en vie (vies=${aliceP?.lives}, score=${aliceP?.score})`);
// Les pièges sont probabilistes (~10-20 % des manches) : sur un match court il
// peut n'y en avoir aucun. Le comportement lui-même est couvert par les tests
// unitaires de MatchLogic ; ici on ne fait que le signaler s'il a eu lieu.
const trapDodged = alice.verdicts.some((v) => Object.values(v.outcomes).some((o) => o.kind === "survive" && o.trap));
info(trapDodged ? "un piège a été déjoué pendant ce match" : "aucun piège tiré sur ce match court (normal)");
okMarge(Math.abs(alice.offset), 50, "max", "offset d'horloge en local");
info(
  `offsets relevés sur ${alice.offsets.length} pings : ` +
    alice.offsets.map((o) => o.toFixed(1)).join(" · "),
);

// Débit emotes : le salon existe encore après match_end.
alice.emotes.length = 0;
bob.ws.send(JSON.stringify({ t: "emote", k: 0 }));
bob.ws.send(JSON.stringify({ t: "emote", k: 1 }));
await sleep(200);
ok(alice.emotes.length === 1, `débit emote : 1 reçue sur 2 rapides (got ${alice.emotes.length})`);
ok(alice.emotes[0]?.playerId === bob.id, "emote porte l'id de BOB");
await sleep(1600);
bob.ws.send(JSON.stringify({ t: "emote", k: 2 }));
await sleep(200);
ok(alice.emotes.length === 2, `débit emote : 2e acceptée après cooldown (got ${alice.emotes.length})`);
ok(alice.emotes[1]?.playerId === bob.id && alice.emotes[1]?.k === 2, "3e emote : bon playerId et k");

// Chat : coupe, débit silencieux, trim, kick.
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: "x".repeat(300) }));
await sleep(200);
ok(alice.chats.length === 1, `chat long : 1 message reçu (got ${alice.chats.length})`);
ok(alice.chats[0]?.text?.length === 140, `chat coupé à 140 (got ${alice.chats[0]?.text?.length})`);
ok(alice.chats[0]?.playerId === bob.id && alice.chats[0]?.name === "BOB", "chat porte playerId et name de BOB");

await sleep(800);
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: "un" }));
bob.ws.send(JSON.stringify({ t: "chat", text: "deux" }));
await sleep(200);
ok(alice.chats.length === 1, `débit chat : 1 reçu sur 2 rapides (got ${alice.chats.length})`);

await sleep(800);
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: " " }));
await sleep(200);
ok(alice.chats.length === 0, "chat espace seul : ignoré");

bob.errors.length = 0;
bob.ws.send(JSON.stringify({ t: "kick", playerId: alice.id }));
await sleep(200);
ok(alice.room?.players?.some((p) => p.id === alice.id), "kick non-hôte : ALICE toujours dans le salon");
ok(bob.errors.some((e) => e.code === "not_host"), "kick non-hôte : BOB reçoit not_host");

const chloeClosed = new Promise((res) => chloe.ws.once("close", () => res(true)));
alice.ws.send(JSON.stringify({ t: "kick", playerId: chloe.id }));
await Promise.race([chloeClosed, sleep(800).then(() => false)]);
await sleep(150);
ok(
  chloe.ws.readyState === WebSocket.CLOSED || chloe.ws.readyState === WebSocket.CLOSING,
  "hôte exclut CHLOÉ : connexion fermée",
);
ok(!alice.room?.players?.some((p) => p.id === chloe.id), "hôte exclut CHLOÉ : absente du room suivant");

// Rotation : annoncee AVANT, dans une pause faite pour ca.
//
// Mesure en soiree : environ deux tiers des pertes de vies venaient de
// rotations non vues. La regle changeait par une ligne en haut a gauche,
// pendant qu'il fallait jouer. Le serveur doit donc allonger l'interlude qui
// precede et y joindre les regles a venir.
{
  const a = await client("ROT1", "cle-rot1");
  const b = await client("ROT2", "cle-rot2");
  a.ws.send(JSON.stringify({ t: "create" }));
  await sleep(220);
  b.ws.send(JSON.stringify({ t: "join", code: a.room.code }));
  await sleep(250);
  // rotationEvery = 4 : la rotation tombe a la manche 4, sans attendre 8.
  a.ws.send(JSON.stringify({ t: "settings", settings: { speed: 0.65, lives: 5, rotationEvery: 4 } }));
  await sleep(250);
  a.ws.send(JSON.stringify({ t: "start" }));

  const limite = Date.now() + 45000;
  let annonce = null;
  while (!annonce && Date.now() < limite) {
    annonce = a.verdicts.find((v) => v.nextRules);
    await sleep(150);
  }
  ok(!!annonce, "les regles a venir sont jointes au verdict qui precede la rotation");
  if (annonce) {
    ok(annonce.idx === 3, `annoncee au verdict de la manche 3, avant la 4 (got ${annonce.idx})`);
    ok(!!annonce.nextRules[a.id], "ma prochaine regle m'est nommee");
    ok(annonce.nextRules[a.id] !== undefined, "l'attribution complete est fournie");
    /*
     * Mesuré depuis la RÉCEPTION du verdict, pas depuis maintenant.
     *
     * `Date.now()` est appelé après une boucle d'attente de 150 ms de pas :
     * jusqu'à 150 ms du temps de lecture avaient déjà été consommées par le
     * test lui-même, et cette perte variable est la seule chose qui approchait
     * l'assertion de son seuil.
     */
    const recu = a.recus.find((r) => r.t === "verdict" && r.idx === annonce.idx);
    const pause = annonce.nextRoundAt - (recu?.at ?? Date.now());
    okMarge(pause, 1500, "min", "la pause de rotation laisse le temps de lire");
    info(`retard d'observation du test : ${Date.now() - (recu?.at ?? Date.now())} ms`);
  }

  for (const c of [a, b]) c.ws.close();
  await sleep(220);
}

/*
 * POOL PAR SALON : entre claviers, les consignes clavier s'ouvrent.
 *
 * Le pool s'adapte au SALON et non au joueur — la scene et la consigne
 * restent communes, c'est ce qui fait qu'on crie ensemble. Deux garanties a
 * verifier, et aucune ne se voit dans un test unitaire :
 *
 *   · le drapeau traverse vraiment le fil, dans le bon sens ;
 *   · les deux cotes reconstruisent la MEME manche. Si le serveur tirait dans
 *     un pool et le client dans l'autre, leurs indices de pieces ne
 *     designeraient pas les memes formes : le joueur mourrait en cliquant ce
 *     que son ecran lui montre. C'est le defaut tenu pour fatal.
 *
 * Le pilote joue avec le pool du drapeau recu. S'il y avait desaccord, les
 * clics tomberaient a cote et les morts s'accumuleraient — c'est la mesure.
 */
{
  const eq = [];
  for (const n of ["K1", "K2", "K3"]) eq.push(await client(n, "cle-" + n, false, true));
  eq[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = eq[0].room.code;
  for (const c of eq.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(160); }
  await sleep(250);
  eq[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART + 14000);

  ok(eq.every((c) => c.clavierMatch === true), "le salon tout-clavier ouvre le pool elargi");

  const vues = new Set();
  for (let idx = 0; idx <= Math.max(0, eq[0].roundIdx); idx++) {
    vues.add(buildMultiRound(eq[0].seed, idx, ONE_RULES[0], poolMulti(true)).instructionId);
  }
  const auClavier = [...vues].filter((id) => !INSTRUCTIONS.find((i) => i.id === id)?.touch);
  info(`salon clavier : ${eq[0].rounds.length} manches, consignes vues ${[...vues].join(", ")}`);

  /*
   * On assertit ce que la graine a REELLEMENT produit, sans rien esperer.
   *
   * Quatre consignes clavier sur dix-neuf : exiger qu'il en sorte une en N
   * manches rendrait ce point intermittent, et un test qui echoue une fois sur
   * dix ne prouve plus rien. Quand la graine en donne une, on verifie qu'elle
   * a bien traverse ; quand elle n'en donne pas, on le DIT — le fait que le
   * pool elargi contienne autre chose est verrouille dans tests/multi.
   */
  if (auClavier.length) {
    ok(true, `une consigne clavier est bien sortie en salon clavier (${auClavier.join(", ")})`);
  } else {
    info("aucune consigne clavier tiree sur ces manches — contenu du pool couvert par tests/multi");
  }

  // La mesure qui compte : si les deux cotes tiraient dans des pools
  // differents, le pilote cliquerait systematiquement la mauvaise piece.
  const morts = eq.flatMap((c) => c.verdicts.filter((v) => v.outcome?.kind === "death"));
  const parMotif = {};
  for (const m of morts) parMotif[m.outcome.reason ?? "?"] = (parMotif[m.outcome.reason ?? "?"] ?? 0) + 1;
  const total = eq.reduce((s, c) => s + c.verdicts.length, 0);
  info(`verdicts ${total}, morts ${morts.length} — ${JSON.stringify(parMotif)}`);
  ok(total > 0, `des manches ont ete jouees en salon clavier (${total} verdicts)`);
  okMarge(
    total === 0 ? 1 : morts.length / total,
    0.5,
    "max",
    "les clics tombent juste en salon clavier (un desaccord de pool les ferait tous rater)",
    "",
  );

  // Et le controle : un salon MIXTE doit retomber sur le tactile.
  const mixte = [];
  for (const [n, k] of [["M1", true], ["M2", false]]) mixte.push(await client(n, "cle-" + n, false, k));
  mixte[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const codeM = mixte[0].room.code;
  mixte[1].ws.send(JSON.stringify({ t: "join", code: codeM }));
  await sleep(300);
  mixte[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);
  ok(
    mixte.every((c) => c.clavierMatch === false),
    "un seul telephone assis suffit a refermer le pool pour tout le salon",
  );

  /*
   * ET LE CAS QUI POURRAIT MORDRE : un telephone qui arrive APRES la decision.
   *
   * Le drapeau est fige au lancement — c'est voulu, il ne doit pas changer
   * sous les pieds d'un match en cours. Mais le salon SURVIT au match, et le
   * meme salon rejoue. Si le second match reprenait le drapeau du premier, la
   * table garderait le pool clavier avec un telephone assis dedans, et ce
   * telephone recevrait des consignes qu'il ne peut pas jouer : mort a chaque
   * manche, sans rien avoir fait de mal.
   *
   * Ni les tests unitaires ni le controle ci-dessus ne voient ce cas : le
   * premier construit un `MatchLogic` a la main, le second n'a qu'un salon
   * jamais rejoue. Il faut le fil ET une seconde partie.
   */
  const tard = [];
  for (const [n, k] of [["T1", true], ["T2", true]]) tard.push(await client(n, "cle-" + n, false, k));
  // Personne ne joue : le pilote automatique survivrait jusqu'a MAX_ROUNDS et
  // ce bloc durerait plus longtemps que tout le reste de l'e2e reuni.
  for (const c of tard) c.manuel = true;
  tard[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const codeT = tard[0].room.code;
  tard[1].ws.send(JSON.stringify({ t: "join", code: codeT }));
  await sleep(300);
  tard[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);
  ok(tard[0].clavierMatch === true, "le salon part bien en pool clavier");

  // Le telephone s'assied PENDANT le match.
  const retard = await client("T3", "cle-T3", false, false);
  retard.manuel = true;
  retard.ws.send(JSON.stringify({ t: "join", code: codeT }));
  await sleep(400);
  ok(!!retard.room, "un telephone peut entrer pendant un match (il est spectateur)");

  // On attend la vraie fin — deviner une duree ferait un test intermittent.
  const t0Tard = Date.now();
  while (!tard[0].ended && Date.now() - t0Tard < 45000) await sleep(200);
  ok(!!tard[0].ended, "le premier match se termine");

  tard[0].clavierMatch = null;
  retard.clavierMatch = null;
  await sleep(400);
  tard[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);
  ok(
    tard[0].clavierMatch === false && retard.clavierMatch === false,
    `le salon RECALCULE au second match et se referme (PC=${tard[0].clavierMatch}, tel=${retard.clavierMatch})`,
  );

  for (const c of [...eq, ...mixte, ...tard, retard]) c.ws.close();
  await sleep(220);
}

/*
 * LE DOUBLE APPUI — la négociation du jeu de consignes, sur le fil.
 *
 * Front et salons se déploient séparément. Un serveur qui tirerait dans un
 * pool que le client ne connaît pas jugerait une autre manche que celle
 * affichée : le défaut tenu pour fatal. D'où la négociation, et ces trois
 * vérifications — une table récente l'ouvre, un seul siège ancien la
 * referme, et quand la consigne sort, le pilote qui joue CE QU'IL VOIT
 * survit.
 */
{
  const recents = [];
  for (const n of ["V1", "V2", "V3"]) recents.push(await client(n, "cle-" + n, false, false, CONSIGNES_VERSION));
  recents[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = recents[0].room.code;
  for (const c of recents.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(160); }
  await sleep(250);
  recents[0].ws.send(JSON.stringify({ t: "start" }));
  /*
   * ⚠️ JUSQU'À LA MANCHE 10, pas un nombre de secondes. La consigne n'entre
   * au tirage qu'à la manche 4 : avant, les deux pools donnent la même
   * manche par construction. Un premier essai à 16 s couvrait les manches 0
   * à 4 et laissait passer un client resté en version 1 sans une faute
   * (éprouvé). Une attente FIXE de 40 s n'atteignait la manche 10 que huit
   * fois sur dix — la pause de rotation (3,4 s) mange la marge. On attend
   * donc l'instant choisi, borné.
   */
  const debut = Date.now();
  while (recents[0].roundIdx < 10 && Date.now() - debut < APRES_DEPART + 75000) await sleep(250);
  // Le verdict de la manche courante doit être tombé avant qu'on le lise.
  await sleep(2600);
  ok(
    recents.every((c) => c.consignesMatch === CONSIGNES_VERSION),
    `une table récente ouvre le jeu de consignes ${CONSIGNES_VERSION}`,
  );
  ok(recents[0].roundIdx >= 10, `assez de manches jouées pour qu'un désaccord se voie (jusqu'à la ${recents[0].roundIdx})`);

  // Les manches jouées qui étaient un double appui, reconstruites du côté client.
  const doubles = [];
  for (let idx = 0; idx <= Math.max(0, recents[0].roundIdx); idx++) {
    const id = draftShared(recents[0].seed, idx, poolMulti(false, CONSIGNES_VERSION), recents[0].tirages[idx] ?? 0).instructionId;
    if (id === "doubleTap" || id === "tiens" || id === "glisse") doubles.push(`${idx}:${id}`);
  }
  /*
   * La mesure porte sur TOUTES les manches, pas seulement les doubles appuis :
   * dès la manche 4, deux pools différents tirent des consignes différentes
   * quelle que soit la graine, et le pilote — qui joue ce qu'IL reconstruit —
   * cliquerait à côté. En temps normal il ne meurt jamais (relevé : 0 mort sur
   * 12 verdicts en salon clavier). Aucune mort hors dépassement de temps, donc.
   */
  // Le fil ne porte que le MOTIF (`RoundOutcome`) : on écarte les deux
  // motifs d'horloge, qui dépendent de la charge de la machine (§12).
  const horloge = new Set([MOTIFS.temps, MOTIFS.sequence]);
  const fautes = recents.flatMap((c) =>
    c.verdicts
      .map((v) => v.outcomes?.[c.id])
      .filter((o) => o && o.kind === "death" && !horloge.has(o.reason)),
  );
  const joues = recents.reduce((n, c) => n + c.verdicts.length, 0);
  ok(
    joues > 0 && fautes.length === 0,
    `jeu de consignes ${CONSIGNES_VERSION} : serveur et clients reconstruisent la même manche (${joues} verdicts, ${fautes.length} faute(s)` +
      (fautes.length ? ` : ${fautes.map((o) => o.reason).join(" | ")})` : ")"),
  );
  if (doubles.length) info(`consignes du multi tirées et jouées : ${doubles.join(", ")}`);
  else info("aucune consigne du multi tirée sur ces manches — leur jugement est couvert par les unitaires");

  /*
   * VERSION 4 (directive de Pierre, 01/10) : plus de « NE FAIS RIEN », et
   * jamais deux pièges d'affilée pour un même siège. Lu sur les manches que
   * chaque pilote a RECONSTRUITES avec le tirage reçu — c'est-à-dire ce que
   * le joueur a vu. La faute de reconstruction est couverte juste au-dessus.
   */
  const rien = recents.flatMap((c) =>
    Object.entries(c.pieges).filter(([, p]) => p.instr === "nothing" || p.instr === "nothingLure").map(([i]) => `${c.name ?? "?"}@${i}`),
  );
  ok(rien.length === 0, `jeu de consignes ${CONSIGNES_VERSION} : aucune manche « NE FAIS RIEN » (${rien.join(", ") || "aucune"})`);
  // Seulement les manches où le siège JOUAIT (un verdict le nomme) : un
  // éliminé n'est plus protégé, et n'a pas à l'être.
  const doublesPieges = recents.flatMap((c) => {
    const joue = new Set(c.verdicts.filter((v) => v.outcomes?.[c.id]).map((v) => v.idx));
    return Object.keys(c.pieges)
      .map(Number)
      .filter((i) => joue.has(i) && joue.has(i - 1) && c.pieges[i]?.trap && c.pieges[i - 1]?.trap)
      .map((i) => `${c.name ?? "?"}@${i - 1}-${i}`);
  });
  const nPieges = recents.reduce((n, c) => n + Object.values(c.pieges).filter((p) => p.trap).length, 0);
  ok(
    // Sans exiger de piège : en onze manches, n'en voir aucun est rare mais
    // possible, et l'assertion deviendrait intermittente (§2).
    doublesPieges.length === 0,
    `jeu de consignes ${CONSIGNES_VERSION} : jamais deux pièges d'affilée pour un même siège (${nPieges} pièges, ${doublesPieges.join(", ") || "aucun enchaînement"})`,
  );
  const retires = Object.values(recents[0].tirages).filter((t) => t > 0).length;
  info(`tirages retirés par le serveur : ${retires} manche(s) sur ${Object.keys(recents[0].tirages).length}`);

  // Un seul siège ancien (sans le champ) referme le jeu pour toute la table.
  const mixte = [await client("W1", "cle-W1", false, false, 2), await client("W2", "cle-W2")];
  mixte[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  mixte[1].ws.send(JSON.stringify({ t: "join", code: mixte[0].room.code }));
  await sleep(300);
  mixte[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);
  ok(
    mixte.every((c) => c.consignesMatch === 1),
    `un client d'une version antérieure referme le jeu de consignes (${mixte.map((c) => c.consignesMatch).join(",")})`,
  );

  // Un client qui s'annonce PLUS récent que le serveur est ramené au sien.
  const futur = [await client("F1", "cle-F1", false, false, 99), await client("F2", "cle-F2", false, false, 99)];
  futur[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  futur[1].ws.send(JSON.stringify({ t: "join", code: futur[0].room.code }));
  await sleep(300);
  futur[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);
  ok(
    futur.every((c) => c.consignesMatch === CONSIGNES_VERSION),
    `une version inconnue est ramenée à celle du serveur (${futur.map((c) => c.consignesMatch).join(",")})`,
  );

  for (const c of [...recents, ...mixte, ...futur]) c.ws.close();
  await sleep(220);
}

/*
 * LA RANCUNE — la cible change sur le fil, et le client la suit.
 *
 * Le serveur tient la rancune par équipe ; le client ne la DÉDUIT jamais, il
 * la lit dans l'identifiant de règle (`rancune:rond`) que porte
 * `verdict.nextRules`. Trois choses à voir de bout en bout : la table récente
 * peut la tirer, une faute en change la cible dans le verdict même, et le
 * pilote — qui joue ce qu'il a reçu — survit ensuite sous la NOUVELLE cible.
 * S'il jouait l'ancienne, un piège sur la nouvelle forme le tuerait.
 */
{
  const tab = [];
  for (let i = 0; i < 6; i++) tab.push(await client("R" + i, "cle-R" + i, false, false, CONSIGNES_VERSION));
  tab[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = tab[0].room.code;
  for (const c of tab.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(140); }
  // Deux vies : la faute en coûte une, et le porteur doit jouer après elle.
  tab[0].ws.send(JSON.stringify({ t: "settings", settings: { lives: 2 } }));
  await sleep(300);

  /*
   * Six sièges, quinze règles au pool tactile : LA RANCUNE tombe sur un siège
   * quatre lancements sur dix. Même doctrine que LE GAUCHER — on relance,
   * borné, et l'échec se nomme.
   */
  let porteur = null;
  let essais = 0;
  for (; essais < 20 && !porteur; essais++) {
    /*
     * ⚠️ LES VERDICTS AUSSI. Les index de manche repartent de 0 à chaque
     * match : sans ce vidage, l'assertion qui cherche le verdict de LA manche
     * fautive lisait celui d'un match de relance (siège inactif, mort au
     * temps, aucune rancune en jeu). Vu en CI après quatre lancements — et
     * dans un passage local qu'on avait cru « cassé » par le test.
     */
    for (const c of tab) { c.rules = {}; c.ended = null; c.verdicts = []; }
    tab[0].ws.send(JSON.stringify({ t: "start" }));
    await sleep(500);
    porteur = tab.find((c) => String(c.rules[c.id] ?? "").startsWith("rancune:")) ?? null;
    if (porteur) break;
    for (const c of tab) c.manuel = true;
    const finMatch = Date.now() + 30000;
    while (!tab[0].ended && Date.now() < finMatch) await sleep(150);
    for (const c of tab) c.manuel = false;
    await sleep(400);
  }
  info(`LA RANCUNE obtenue en ${essais + 1} lancement(s) — ${porteur ? porteur.rules[porteur.id] : "aucune"}`);
  ok(!!porteur, "une table en version 5 peut tirer LA RANCUNE");

  if (porteur) {
    const depart = String(porteur.rules[porteur.id]);
    porteur.faute = true;
    const limite = Date.now() + APRES_DEPART + 40000;
    while (!porteur.fauteFaite && Date.now() < limite) await sleep(100);
    const faute = porteur.fauteFaite;
    ok(!!faute, "le porteur a trouvé une manche où se tromper de pièce");
    if (faute) {
      const fin = Date.now() + 8000;
      while (!porteur.verdicts.some((v) => v.idx === faute.idx) && Date.now() < fin) await sleep(60);
      const v = porteur.verdicts.find((x) => x.idx === faute.idx);
      const mien = v?.outcomes?.[porteur.id];
      ok(mien?.kind === "death", `la mauvaise pièce coûte une vie (${mien?.kind ?? "aucun verdict"}${mien?.reason ? " " + mien.reason : ""})`);
      /*
       * Un clic arrivé après l'échéance (machine chargée) fait mourir au
       * TEMPS : la rancune devient alors la pièce VISÉE — c'est la règle
       * (`formeQuiACoute`), pas un échec. Jamais observé tant que les
       * verdicts sont vidés à chaque relance (voir plus haut).
       */
      const attendue = mien?.reason === MOTIFS.temps ? faute.visee : faute.forme;
      ok(
        v?.nextRules?.[porteur.id] === `rancune:${attendue}`,
        `le verdict annonce la nouvelle rancune : ${faute.avant} → ${v?.nextRules?.[porteur.id] ?? "rien"} (attendu rancune:${attendue}, départ ${depart})`,
      );
      // Hors rotation, les AUTRES gardent leur règle : seule la cible bouge.
      if (v?.nextRules && (faute.idx + 1) % 8 !== 0) {
        const autres = tab.filter((c) => c !== porteur && v.nextRules[c.id] !== undefined);
        const changees = autres.filter((c) => v.nextRules[c.id] !== faute.regles[c.id]);
        ok(
          changees.length === 0 && autres.length > 0,
          `hors rotation, seule la règle du porteur change (${changees.map((c) => `${faute.regles[c.id]}→${v.nextRules[c.id]}`).join(", ") || "aucune autre"})`,
        );
      }

      // Trois manches de plus, jouées par le pilote sous la NOUVELLE cible.
      const apres = faute.idx + 3;
      const fin2 = Date.now() + 30000;
      while (porteur.verdicts.every((x) => x.idx < apres) && !porteur.ended && Date.now() < fin2) await sleep(120);
      const horloge = new Set([MOTIFS.temps, MOTIFS.sequence]);
      const suite = porteur.verdicts
        .filter((x) => x.idx > faute.idx)
        .map((x) => x.outcomes?.[porteur.id])
        .filter((o) => o && o.kind !== "idle");
      const fautes = suite.filter((o) => o.kind === "death" && !horloge.has(o.reason));
      ok(
        suite.length > 0 && fautes.length === 0,
        `sous sa nouvelle rancune, le pilote joue ce que juge le serveur (${suite.length} manche(s), ${fautes.length} faute(s)` +
          (fautes.length ? ` : ${fautes.map((o) => o.reason).join(" | ")})` : ")"),
      );
    }
  }

  for (const c of tab) c.ws.close();
  await sleep(220);
}

/*
 * LES RÈGLES DE SALON (kanban) — L'IMMOBILE, LE VOISIN, LA FOULE, LE MIROIR,
 * L'INSOUMIS, L'INCONNUE et LE GONG, jouées sur un vrai serveur.
 *
 * Ce que les unitaires ne prouvent pas : que le serveur ATTRIBUE ces règles à
 * une table en version 6, que leurs identifiants (`inconnue:sang`) voyagent et
 * se résolvent chez le client, et que le pilote — qui joue ce qu'IL
 * reconstruit, miroir et encre rouge compris — ne meure jamais sur une manche
 * que le serveur juge autrement (n°3). Toute la table annonce le son : LE GONG
 * peut sortir.
 *
 * Dix sièges, vingt-deux règles : une règle de salon tombe presque à chaque
 * lancement. On relance quand même jusqu'à l'obtenir, borné et nommé (§11).
 */
{
  const SALON = /^(immobile|voisin|foule|miroir|insoumis|gong|inconnue:)/;
  const tab = [];
  for (let i = 0; i < 10; i++) tab.push(await client("S" + i, "cle-S" + i, false, false, CONSIGNES_VERSION, true));
  tab[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = tab[0].room.code;
  for (const c of tab.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(120); }
  tab[0].ws.send(JSON.stringify({ t: "settings", settings: { lives: 5 } }));
  await sleep(300);

  let porteurs = [];
  let essais = 0;
  for (; essais < 6 && porteurs.length === 0; essais++) {
    for (const c of tab) { c.rules = {}; c.ended = null; c.verdicts = []; }
    tab[0].ws.send(JSON.stringify({ t: "start" }));
    await sleep(500);
    porteurs = tab.filter((c) => SALON.test(String(c.rules[c.id] ?? "")));
    if (porteurs.length) break;
    for (const c of tab) c.manuel = true;
    const finMatch = Date.now() + 30000;
    while (!tab[0].ended && Date.now() < finMatch) await sleep(150);
    for (const c of tab) c.manuel = false;
    await sleep(400);
  }
  ok(porteurs.length > 0, `une table en version 6 tire des règles de salon (${essais + 1} lancement(s))`);
  ok(
    tab.every((c) => !String(c.rules[c.id] ?? "x").match(/^inconnue$/) && ruleById(String(c.rules[c.id] ?? "")) !== undefined),
    "chaque identifiant attribué se résout chez le client — aucun représentant du pool ne voyage",
  );

  // Au-delà d'une rotation (manche 8) : chaque siège change de règle une fois.
  const debut = Date.now();
  while (tab[0].roundIdx < 12 && Date.now() - debut < APRES_DEPART + 80000) await sleep(250);
  await sleep(2600);
  const horloge = new Set([MOTIFS.temps, MOTIFS.sequence]);
  const portees = new Set();
  const fautes = [];
  let joues = 0;
  for (const c of tab) {
    for (const v of c.verdicts) {
      const o = v.outcomes?.[c.id];
      if (!o) continue;
      joues++;
      if (o.kind === "death" && !horloge.has(o.reason)) fautes.push(`${c.name}@${v.idx} : ${o.reason}`);
    }
    for (const r of Object.values(c.rules)) if (SALON.test(String(r))) portees.add(String(r));
  }
  for (const r of porteurs.map((c) => String(c.rules[c.id]))) portees.add(r);
  info(`règles de salon portées : ${[...portees].join(", ")}`);
  ok(
    joues > 0 && fautes.length === 0,
    `règles de salon : le pilote joue ce que juge le serveur (${joues} verdicts, ${fautes.length} faute(s)` +
      (fautes.length ? ` : ${fautes.join(" | ")})` : ")"),
  );
  const gongs = tab.reduce((n, c) => n + Object.values(c.pieges).filter((p) => p.gong).length, 0);
  info(`gongs sonnés chez les porteurs : ${gongs}`);

  for (const c of tab) c.ws.close();
  await sleep(220);
}

/*
 * DUO : deux joueurs, une reserve — verifie sur le fil.
 *
 * La propriete centrale du mode ne peut pas se prouver en unitaire : il faut
 * qu'un vrai serveur apparie, qu'une vraie faute traverse, et que les DEUX
 * clients voient la reserve baisser. Si les vies n'etaient partagees que dans
 * la memoire du serveur, l'ecran continuerait d'afficher trois vies a un
 * partenaire qui n'en a plus que deux — et il mourrait sans comprendre.
 */
{
  const eq = [];
  for (const n of ["D1", "D2", "D3", "D4"]) eq.push(await client(n, "cle-" + n));
  eq[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = eq[0].room.code;
  for (const c of eq.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(150); }
  await sleep(250);
  eq[0].ws.send(JSON.stringify({ t: "settings", settings: { duo: true, lives: 3 } }));
  await sleep(300);
  ok(eq[0].room?.settings?.duo === true, "le reglage EQUIPES se propage a tout le salon");

  // D2 ne repond jamais : il mourra par depassement de temps, et c'est la
  // reserve de D1 qu'on regarde baisser.
  eq[1].manuel = true;
  eq[0].ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART);

  const equipeDe = (c, id) =>
    (c.verdicts[c.verdicts.length - 1]?.players ?? c.room?.players ?? []).find(
      (p) => p.name === id,
    )?.team;
  ok(equipeDe(eq[0], "D1") === equipeDe(eq[0], "D2"), "D1 et D2 forment une equipe");
  ok(equipeDe(eq[0], "D1") !== equipeDe(eq[0], "D3"), "D3 est dans une AUTRE equipe");

  const regles = eq[0].rules;
  ok(
    regles[eq[0].id] === regles[eq[1].id],
    `les deux partenaires portent la meme regle (${regles[eq[0].id]} / ${regles[eq[1].id]})`,
  );

  // On laisse D2 mourir plusieurs fois, puis on compare les reserves.
  //
  // Les vies se lisent dans le dernier VERDICT et non dans `room` : `roomState`
  // n'est pas rediffuse a chaque manche, donc `room.players` reste sur les
  // vies du lancement. C'est le meme flux que le vrai client utilise.
  //
  // ⚠️ ON ATTEND LA CONDITION, PAS UNE DUREE. Neuf secondes fixes ne
  // garantissaient pas une mort de D2 : ses manches sont tirees au hasard, et
  // une suite de pieges (ne rien faire = survivre) le garde en vie. Vu tomber
  // une fois (D1=3, D2=3 apres 9 s) sans aucun code de match change ; le
  // passage suivant lisait D1=2. On attend donc la PREMIERE baisse de la
  // reserve, bornee a 30 s, puis encore 2 s pour que le verdict voyage.
  const viesDe = (v, nom) => v?.players?.find((p) => p.name === nom)?.lives;
  const debutFenetre = Date.now();
  while (Date.now() - debutFenetre < 30000) {
    if (eq[0].verdicts.some((v) => (viesDe(v, "D1") ?? 3) < 3)) break;
    await sleep(250);
  }
  info(`premiere baisse de la reserve apres ${Date.now() - debutFenetre} ms`);
  await sleep(2000);
  const dernier = eq[0].verdicts[eq[0].verdicts.length - 1];
  const v1 = viesDe(dernier, "D1");
  const v2 = viesDe(dernier, "D2");
  const v3 = viesDe(dernier, "D3");
  info(`verdicts recus : ${eq[0].verdicts.length}`);
  info(`vies vues par D1 : D1=${v1} D2=${v2} D3=${v3} (D2 ne joue pas)`);
  ok(v1 === v2, `la reserve est COMMUNE : D1 et D2 affichent le meme compte (${v1} / ${v2})`);
  ok(v1 < 3, `les fautes de D2 ont entame la reserve de D1 (${v1} sur 3)`);

  /*
   * ⚠️ CETTE ASSERTION ETAIT INTERMITTENTE, ET LE DEPOT LA CONNAISSAIT.
   *
   * Elle lisait les vies de D3 APRES neuf secondes d'attente. Or D3 joue, lui,
   * et rien ne garantit qu'il ne faute jamais sur neuf secondes — une regle
   * que le pilote de l'e2e joue mal (LE GAUCHER, LA SECONDE) suffit. Elle est
   * tombee une fois sur deux lancements consecutifs sans qu'aucun code de
   * match n'ait change, et le recapitulatif ne la voyait pas : il ne surveille
   * que les marges des grandeurs mesurees, et celle-ci est une egalite.
   *
   * Ce qu'on veut prouver n'est pas « D3 ne faute jamais », c'est « les
   * reserves sont SEPAREES ». On lit donc D3 a l'instant EXACT ou la reserve
   * de l'autre equipe baisse pour la premiere fois : a cette manche-la, si les
   * reserves sont bien separees, D3 est encore intact.
   */
  const bascule = eq[0].verdicts.find((v) => (viesDe(v, "D1") ?? 3) < 3);
  const v3Alors = viesDe(bascule, "D3");
  ok(
    bascule !== undefined,
    `la reserve de l'equipe de D2 a bien baisse pendant la fenetre observee`,
  );
  ok(
    v3Alors === 3,
    `a l'instant ou l'equipe de D2 perd sa premiere vie, l'autre equipe est intacte (${v3Alors})`,
  );

  for (const c of eq) c.ws.close();
  await sleep(220);
}

// LE GAUCHER : un clic HORS de la zone interdite ne doit pas tuer.
//
// Le fil ne transporte qu'un index de piece, jamais de coordonnees. Le serveur
// posait donc x:0 en dur, et LE GAUCHER (qui interdit x < 200) declarait une
// infraction a CHAQUE clic. Constate en soiree : « des qu'un joueur l'obtient,
// il est assure de perdre ». On rejoue ici le chemin complet — vrai serveur,
// vrai client ws — sur une piece situee hors de la zone.
{
  const { draftShared, applyRule } = await import("../../src/engine/multiround.ts");
  const { ONE_RULES: RULES } = await import("../../src/engine/rules/index.ts");
  const gaucher = RULES.find((r) => r.id === "gaucher");

  /*
   * Le porteur se DECOUVRE, il ne se suppose pas.
   *
   * Ce bloc affirmait « le 4e arrivant porte LE GAUCHER des la manche 0 »,
   * parce que rulesAt indexait MULTI_RULES par l'ordre des sieges sans jamais
   * toucher a la graine. C'etait le defaut lui-meme transforme en assertion :
   * le siege 0 recevait LE SANG a chaque match, a vie.
   *
   * Il s'est ensuite appuye sur une BIJECTION : dix regles au pool, dix sieges
   * au maximum, donc chaque regle tombait exactement une fois et LE GAUCHER
   * etait garanti.
   *
   * ⚠️ CETTE GARANTIE EST MORTE. Le catalogue est passe a seize regles, donc le
   * pool tactile a quatorze pour dix sieges : LE GAUCHER n'apparait plus que
   * 10 fois sur 14. L'assertion serait devenue INTERMITTENTE — elle tomberait
   * environ une fois sur trois, sans qu'aucun code de jeu n'ait change.
   *
   * On RELANCE donc le match jusqu'a l'obtenir. Chaque `start` tire une graine
   * neuve, donc une permutation neuve, et le salon survit au match : c'est le
   * chemin le moins cher. La boucle est bornee et son echec est nomme — un
   * test qui abandonne en silence ne prouve rien.
   */
  const eq = [];
  for (let i = 0; i < 10; i++) eq.push(await client("G" + i, "cle-G" + i));
  eq[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const code = eq[0].room.code;
  for (const c of eq.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code })); await sleep(120); }
  await sleep(300);

  let cible = null;
  let essais = 0;
  for (; essais < 12 && !cible; essais++) {
    for (const c of eq) { c.rules = {}; c.ended = null; }
    eq[0].ws.send(JSON.stringify({ t: "start" }));
    // Assez tot pour marquer le porteur AVANT la premiere manche : le compte a
    // rebours dure COUNTDOWN_MS, et rien n'est joue pendant ce temps.
    await sleep(500);
    cible = eq.find((c) => c.rules[c.id] === "gaucher") ?? null;
    if (cible) break;
    // Personne ne le porte : on vide le match en cours pour pouvoir relancer.
    for (const c of eq) c.manuel = true;
    const finMatch = Date.now() + 30000;
    while (!eq[0].ended && Date.now() < finMatch) await sleep(150);
    for (const c of eq) c.manuel = false;
    await sleep(400);
  }
  info(`LE GAUCHER obtenu en ${essais + 1} lancement(s) — pool de 14 pour 10 sieges`);
  ok(!!cible, "un siege porte LE GAUCHER");
  // Le pilote automatique le laisse tranquille : son scenario le conduit.
  if (cible) cible.manuel = true;
  await sleep(APRES_DEPART - 500);

  // Il clique la piece la PLUS A DROITE a chaque manche. Ce sera souvent la
  // mauvaise cible — peu importe : on verifie seulement que le motif de mort
  // n'est JAMAIS « zone interdite », qui etait le verdict systematique avant.
  const motifs = [];
  let vus = 0;
  let dernier = -1;
  const limite = Date.now() + 30000;
  // `cible` peut manquer si la boucle ci-dessus a echoue : l assertion l a
  // deja dit, et on ne veut pas planter sur un null par-dessus.
  while (cible && vus < 5 && Date.now() < limite) {
    // On agit sur la manche que le serveur vient d'ouvrir, jamais sur une
    // manche devinee : sinon l'input est rejete et le test ne prouve rien.
    if (cible.roundIdx === dernier || cible.roundIdx < 0 || !cible.seed) {
      await sleep(80);
      continue;
    }
    const idx = cible.roundIdx;
    dernier = idx;
    const round = applyRule(draftShared(cible.seed, idx), gaucher, cible.seed);
    let plusADroite = -1;
    let maxX = -1;
    round.ents.forEach((e, i) => { if (e.x > maxX) { maxX = e.x; plusADroite = i; } });
    if (plusADroite < 0 || maxX < 260) continue;

    vus++;
    cible.ws.send(JSON.stringify({ t: "input", round: idx, at: Date.now() + cible.offset, action: { k: "c", i: plusADroite } }));
    // On attend le verdict de CETTE manche, pas une duree arbitraire.
    const fin = Date.now() + 8000;
    while (!cible.verdicts.some((v) => v.idx === idx) && Date.now() < fin) await sleep(60);
    const mien = cible.verdicts.find((v) => v.idx === idx)?.outcomes?.[cible.id];
    /*
     * Bavard par defaut, et non derriere DIAG : c'est precisement ce qui
     * manquait le jour ou l'assertion est tombee. Une ligne par manche testee
     * dit ou l'on a clique, dans quelle scene, et ce que le serveur en a fait.
     */
    info(
      `GAUCHER manche ${idx} : clic i=${plusADroite} x=${Math.round(maxX)} ` +
        `(zone interdite x<200) · piege=${round.trap} · etapes=${round.steps.length} ` +
        `· verdict=${mien ? `${mien.kind}${mien.reason ? " " + mien.reason : ""}` : "aucun"}`,
    );
    if (mien?.kind === "death") motifs.push(String(mien.reason));
  }
  ok(vus > 0, `des manches ont pu etre testees sous LE GAUCHER (${vus})`);

  const zone = motifs.filter((m) => m.includes("ZONE INTERDITE"));
  ok(
    zone.length === 0,
    `aucun clic hors zone n'est declare infraction (motifs vus : ${motifs.join(" | ") || "aucune mort"})`,
  );
  for (const c of eq) c.ws.close();
  await sleep(250);
}

// Spectateur : rejoindre PENDANT une partie doit donner de quoi la suivre.
//
// Toute l'interface de spectateur existe — barre de cibles, pied « JE REGARDE
// X », reconstruction locale de la scène — mais elle est conditionnee a un etat
// de match que seul `match_start` cree. Le serveur ne l'envoyait qu'au
// lancement : quelqu'un qui arrivait en cours de partie n'obtenait donc RIEN et
// attendait devant un salon fige jusqu'a la fin.
{
  const joueur = await client("JOUEUR", "cle-joueur");
  joueur.ws.send(JSON.stringify({ t: "create" }));
  await sleep(200);
  const code = joueur.room.code;
  joueur.ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART); // compte a rebours + une manche entamee

  const curieux = await client("CURIEUX", "cle-curieux");
  curieux.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(500);

  ok(curieux.seed !== 0, "le spectateur recoit la graine du match en cours");
  ok(curieux.seed === joueur.seed, "meme graine que le joueur : scene partagee");
  ok(!curieux.rules[curieux.id], "il n'a PAS de regle a lui (pas de siege)");
  ok(
    Object.keys(curieux.rules).length > 0,
    "mais il recoit l'attribution des autres, de quoi reconstruire leur vue",
  );
  const vu = curieux.room?.players?.find((p) => p.name === "CURIEUX");
  ok(vu?.spectator === true, "il est bien marque spectateur");

  const avant = curieux.verdicts.length;
  await sleep(UNE_MANCHE);
  ok(curieux.verdicts.length > avant, "il suit les verdicts des manches en direct");

  for (const c of [joueur, curieux]) c.ws.close();
  await sleep(200);
}

// Accueil du débutant : une vie de plus, annoncée à tout le salon.
{
  const ancien = await client("ANCIEN", "cle-ancien", false);
  ancien.ws.send(JSON.stringify({ t: "create" }));
  await sleep(200);
  const code = ancien.room.code;
  const bleu = await client("BLEU", "cle-bleu", true);
  bleu.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(250);
  // Le statut circule dès le salon...
  const auSalon = ancien.room?.players ?? [];
  ok(
    auSalon.find((p) => p.name === "BLEU")?.rookie === true,
    "le débutant est annoncé aux autres dès le salon (statut public)",
  );
  ok(
    auSalon.find((p) => p.name === "ANCIEN")?.rookie === false,
    "l'habitué n'est pas marqué débutant",
  );

  ancien.ws.send(JSON.stringify({ t: "start" }));
  // Les vies de SIÈGE sont publiées dès le lancement : startMatch rediffuse
  // l'état du salon avant match_start. On les lit donc AVANT qu'une manche
  // soit jouée — sinon une mort légitime en manche 0 rendrait le test
  // dépendant de la règle tirée, donc du hasard.
  await sleep(300);
  const enJeu = ancien.room?.players ?? [];
  const pBleu = enJeu.find((p) => p.name === "BLEU");
  const pAncien = enJeu.find((p) => p.name === "ANCIEN");
  ok(!!pBleu && !!pAncien, "état des sièges publié dès le lancement");
  ok(
    pBleu && pAncien && pBleu.lives === pAncien.lives + 1,
    `le débutant a une vie de plus (${pAncien?.lives} → ${pBleu?.lives})`,
  );

  for (const c of [ancien, bleu]) c.ws.close();
  await sleep(200);
}

// Reprise de siège après coupure — le cas NORMAL sur mobile.
//
// Avant : l'identifiant était attribué par connexion, donc ws.close()
// déclenchait forfeit() et revenir donnait une identité neuve, c'est-à-dire un
// siège de spectateur. Une bascule d'application éliminait définitivement.
{
  const dora = await client("DORA", "cle-stable-dora");
  dora.ws.send(JSON.stringify({ t: "create" }));
  await sleep(200);
  const code = dora.room.code;
  const emil = await client("EMIL", "cle-stable-emil");
  emil.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(200);
  dora.ws.send(JSON.stringify({ t: "start" }));
  await sleep(APRES_DEPART); // compte à rebours + une manche entamée

  /*
   * Référence prise sur le DERNIER VERDICT, pas sur le dernier message `room`.
   *
   * Les messages `room` d'avant le lancement annoncent les vies de réglage, pas
   * celles du siège. Comparer à cette valeur rendait le test dépendant du
   * hasard : selon la règle unique tirée, EMIL peut mourir légitimement pendant
   * la manche qui précède la coupure, et l'écart constaté n'aurait alors plus
   * rien à voir avec son absence. Les verdicts, eux, portent l'état réel.
   */
  const t0v = Date.now();
  while (emil.verdicts.length === 0 && Date.now() - t0v < 12000) await sleep(150);
  const dernier = emil.verdicts[emil.verdicts.length - 1];
  const avant = dernier?.players?.find((p) => p.name === "EMIL");
  ok(!!avant, "état d'EMIL relevé sur un verdict avant la coupure");
  const idAvant = emil.id;
  emil.ws.close();
  // Assez long pour que plusieurs manches passent : un absent ne doit PAS
  // perdre de vie par timeout, sinon il est éliminé avant d'avoir pu revenir
  // et, à deux joueurs, son élimination termine le match pour tout le monde.
  await sleep(6000);
  ok(!dora.ended, "le match continue pendant l'absence (il ne s'annule pas)");

  const vuParDora = dora.room?.players?.find((p) => p.name === "EMIL");
  ok(!!vuParDora, "siège gardé pendant la coupure (EMIL toujours listé)");
  ok(vuParDora?.connected === false, "EMIL apparaît déconnecté aux autres");

  const emil2 = await client("EMIL", "cle-stable-emil");
  emil2.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(400);
  // Le client détruit son état de match quand il est coupé et ne le rebâtit
  // que sur `match_start`. Sans ce renvoi, beginRound() sort immédiatement :
  // le joueur récupérait son siège mais restait bloqué au salon jusqu'à la fin
  // — le « je dois attendre que tout le monde ait fini pour jouer ».
  ok(emil2.seed !== 0, "match_start renvoyé à la reprise (le client peut rejouer)");
  ok(emil2.seed === dora.seed, "même graine que les autres : scène partagée intacte");
  ok(!!emil2.rules[emil2.id], "sa règle unique lui est réattribuée");
  /*
   * On attend l'EVENEMENT, pas une duree.
   *
   * Ce point attendait 3000 ms fixes, et tombait environ une fois sur deux.
   * Ce n'etait pas du hasard mais une marge : a deux joueurs, l'absent perd
   * une vie par depassement de temps, ce qui declenche l'interlude « vie
   * perdue » de 2400 ms. Une manche peut donc coûter jusqu'a MAX_ROUND_MS
   * (2400) + 2400 = 4800 ms — bien au-dela de la fenetre.
   *
   * Allonger le sommeil aurait rallonge l'e2e pour tout le monde et laisse la
   * meme fragilite un cran plus loin. Sonder jusqu'a l'arrivee rend le test
   * deterministe ET rapide dans le cas courant, et la duree mesuree part dans
   * le message : c'est elle qui dira, un jour, que les interludes ont bouge.
   */
  const verdictsAvant = emil2.verdicts.length;
  const t0Verdict = Date.now();
  const PLAFOND_VERDICT = 9000;
  while (emil2.verdicts.length === verdictsAvant && Date.now() - t0Verdict < PLAFOND_VERDICT) {
    await sleep(100);
  }
  const misVerdict = Date.now() - t0Verdict;
  const moi = emil2.room?.players?.find((p) => p.id === emil2.id);
  info(
    `EMIL a la reprise : manches vues=${emil2.rounds.length} termine=${!!emil2.ended} ` +
      `spectateur=${moi?.spectator} vies=${moi?.lives} joueurs=${emil2.room?.players?.length} ` +
      `dora manches=${dora.rounds.length} dora termine=${!!dora.ended}`,
  );
  okMarge(
    misVerdict,
    PLAFOND_VERDICT,
    "max",
    `il reçoit à nouveau les verdicts des manches (${emil2.verdicts.length - verdictsAvant} reçu(s))`,
  );
  ok(emil2.id === idAvant, `siège repris : même identifiant (${idAvant} → ${emil2.id})`);
  const apres = emil2.room?.players?.find((p) => p.id === emil2.id);
  ok(apres?.spectator === false, "EMIL rejoue, il n'est PAS spectateur");
  ok(
    apres && avant && apres.lives === avant.lives,
    `vies INTACTES malgré 6 s d'absence (${avant?.lives} → ${apres?.lives})`,
  );

  // Rejoindre un salon où l'on est déjà ne doit rien casser : ce chemin passait
  // par leaveRoom(), donc par forfeit(), et annulait la partie pour tout le monde.
  const doraAvant = dora.room?.players?.find((p) => p.name === "DORA");
  dora.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(400);
  const doraApres = dora.room?.players?.find((p) => p.name === "DORA");
  ok(!dora.ended, "REJOINDRE en étant déjà dans le salon n'annule pas le match");
  /*
   * On vérifie qu'il n'y a pas eu FORFAIT, pas que le compteur de vies est
   * figé. Le match tourne pendant la mesure : DORA peut perdre une vie
   * légitimement entre les deux lectures, selon la règle qu'elle porte. Une
   * égalité stricte rendait donc le test dépendant du hasard — constaté, il
   * tombait une fois sur trois. Le forfait, lui, met les vies à zéro et
   * élimine : c'est ça, et seulement ça, que le chemin cassé produisait.
   */
  ok(
    doraApres && doraApres.lives > 0 && doraApres.spectator === false,
    `REJOINDRE ne déclare pas forfait (vies ${doraAvant?.lives} → ${doraApres?.lives}, spectateur ${doraApres?.spectator})`,
  );

  /*
   * ⚠️ COUPURE À MOITIÉ OUVERTE (audit C1). Le téléphone change de réseau :
   * il revient par une socket NEUVE alors que le serveur croit l'ancienne
   * toujours ouverte — il ne s'en apercevra qu'au battement de cœur, 15 à
   * 30 s plus tard. On simule exactement ça : emil2 n'est PAS fermé.
   * Avant le correctif, EMIL entrait en inconnu, spectateur, et perdait son
   * siège en forfait une fois l'ancienne socket enfin tombée.
   */
  const emil3 = await client("EMIL", "cle-stable-emil");
  emil3.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(500);
  ok(emil3.id === idAvant, `demi-coupure : la socket neuve reprend le siège (${idAvant} → ${emil3.id})`);
  ok(
    emil2.errors.some((e) => e.code === "remplace") && emil2.ferme !== null,
    `demi-coupure : l'ancienne socket est prévenue puis fermée (code ${emil2.ferme})`,
  );
  const emils = emil3.room?.players?.filter((p) => p.name === "EMIL") ?? [];
  ok(
    emils.length === 1 && emils[0].spectator === false,
    `demi-coupure : un seul EMIL, et il joue (${emils.length} ligne(s))`,
  );

  // Une clé différente ne doit RIEN pouvoir reprendre.
  const voleur = await client("VOLEUR", "cle-inconnue");
  voleur.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(300);
  ok(voleur.id !== idAvant, "une autre clé ne reprend pas le siège d'EMIL");

  for (const c of [dora, emil2, emil3, voleur]) c.ws.close();
  await sleep(200);
}

// Messages malformés : le serveur doit survivre.
//
// `decodeClient` ne valide que la présence d'un `t`. Un `input` sans `action`
// levait un TypeError dans le gestionnaire `message`, et une exception non
// capturée dans un écouteur Node tue le processus — donc TOUS les salons de
// l'instance, depuis une seule socket. Ce test est la régression : si le
// serveur meurt ici, plus rien ne répond ensuite et /health tombe avec.
/*
 * Un client DÉDIÉ : le corpus change son identité et finit par faire fermer
 * sa socket (un `hello` de mauvaise version), ce qu'aucun autre scénario ne
 * doit subir.
 */
const fuzz = await client("FUZZ", "cle-fuzz");
fuzz.manuel = true;
fuzz.ws.send(JSON.stringify({ t: "create" }));
await sleep(150);
fuzz.ws.send(JSON.stringify({ t: "start" }));
await sleep(APRES_DEPART); // COUNTDOWN_MS + marge : il faut une manche OUVERTE pour atteindre le code fautif
/*
 * ⚠️ « Le serveur répond encore » ne prouve plus rien : depuis `guarded` et le
 * filet `uncaughtException`, il survit à TOUTE exception. Le critère qui a des
 * dents est le compteur `erreurs` de /health — chaque exception rattrapée
 * l'incrémente. Un message malformé doit être REFUSÉ en silence, pas
 * rattrapé après avoir levé (phase 3, point 17).
 *
 * Le corpus croise CHAQUE type de message du protocole avec des valeurs
 * hostiles pour chacun de ses champs, plus des trames qui ne sont pas du JSON.
 */
const lisErreurs = () =>
  fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const erreursAvant = (await lisErreurs())?.erreurs;
const HOSTILES = [null, undefined, true, -1, 1e308, Number.NaN, "", "__proto__", "x".repeat(2000), [], {}, [null], { __proto__: { x: 1 } }];
const CHAMPS = {
  hello: ["v", "name", "key", "glyph", "tok", "rookie", "clavier", "consignes", "son", "reprise"],
  ping: ["sent"],
  profil: ["carte", "photo"],
  join: ["code"],
  settings: ["settings"],
  watch: ["playerId"],
  input: ["round", "at", "action"],
  vote: ["playerId"],
  cursor: ["x", "y"],
  emote: ["k"],
  chat: ["text"],
  kick: ["playerId"],
};
const malformes = [
  { t: "input", round: 0, at: 0 },
  { t: "input", round: 0, at: 0, action: { k: "c", i: "__proto__" } },
  { t: "input", round: 0, at: 0, action: { k: "c", i: 1e9 } },
  { t: "input", round: 0, at: 0, action: { k: "k" } },
  { t: "input", round: 0, at: 0, action: { k: "l", i: -3 } },
  { t: "input", round: 0, at: 0, action: { k: "r", key: { length: 1e9 } } },
];
for (const [t, champs] of Object.entries(CHAMPS)) {
  for (const champ of champs) {
    // Un `hello` garde une version valide : sinon le serveur FERME la socket
    // (`bad_version`, c'est sa règle) et la suite du corpus n'arrive jamais —
    // le premier passage l'a montré, « 0 exception » ne prouvait alors rien.
    if (t === "hello" && champ === "v") continue;
    for (const v of HOSTILES) malformes.push(t === "hello" ? { t, v: 1, [champ]: v } : { t, [champ]: v });
  }
}
// Les types qu'on ne connaît pas, ou qu'on n'attend pas en premier.
for (const t of ["inconnu", "", "__proto__", "constructor", "start", "quick", "create", "leave"]) malformes.push({ t });
// Le `hello` en dernier : il change l'identité d'ALICE, on la rétablit après.
const crus = ["", "{", "null", "[]", "42", '"x"', '{"t":null}', '{"t":42}', '{"t":{}}', "\u0000\u0001"];
/*
 * ⚠️ CADENCÉ, depuis les limites de débit (`server/debit.ts`) : envoyé d'un
 * bloc, le corpus bute sur le seau de sa socket, qui le coupe (1008). C'est le
 * bon comportement — et il est éprouvé plus bas, à part — mais ce scénario-ci
 * veut éprouver le DÉCODAGE de chaque message : 30 par seconde, sous les 40
 * accordés.
 */
let envoyesFuzz = 0;
const cadence = async () => {
  envoyesFuzz += 1;
  if (envoyesFuzz % 30 === 0) await sleep(1000);
};
for (const m of malformes) {
  fuzz.ws.send(JSON.stringify(m));
  await cadence();
  if (m.t === "leave" || m.t === "create" || m.t === "quick") {
    // On remet FUZZ dans une partie ouverte pour que `input` atteigne son code.
    fuzz.ws.send(JSON.stringify({ t: "create" }));
    fuzz.ws.send(JSON.stringify({ t: "start" }));
    envoyesFuzz += 2;
  }
}
for (const c of crus) {
  fuzz.ws.send(c);
  await cadence();
}
fuzz.ws.send(Buffer.from([0xff, 0xfe, 0x00]));
await sleep(400);
ok(fuzz.ferme === null, `le corpus est allé jusqu'au bout sur une socket ouverte (fermée : ${fuzz.ferme})`);
const surviving = await lisErreurs();
ok(surviving?.ok === true, `serveur vivant après ${malformes.length + crus.length + 1} messages malformés`);
ok(
  typeof erreursAvant === "number" && surviving?.erreurs === erreursAvant,
  `aucune exception rattrapée sur le corpus malformé (erreurs ${erreursAvant} → ${surviving?.erreurs})`,
);
// Et la version hostile en DERNIER : le serveur doit refuser puis fermer.
fuzz.ws.send(JSON.stringify({ t: "hello", v: "x" }));
await sleep(200);
ok(
  fuzz.errors.some((e) => e.code === "bad_version") && fuzz.ferme !== null,
  `un hello de mauvaise version est refusé puis fermé (code ${fuzz.ferme})`,
);
ok(alice.ws.readyState === WebSocket.OPEN, "socket d'ALICE toujours ouverte après les malformés");
alice.ws.send(JSON.stringify({ t: "leave" }));
await sleep(150);

// Sonde de l'hébergeur. Elle doit répondre SUR LE MÊME PORT que la WebSocket,
// sinon la machine est déclarée morte en boucle alors que le jeu tourne.
const health = await fetch(`http://127.0.0.1:${process.env.PORT}/health`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
ok(health?.ok === true, `sonde /health : 200 (rooms=${health?.rooms}, players=${health?.players})`);
ok(typeof health?.uptime === "number", `sonde /health : uptime présent (${health?.uptime}s)`);
const notFound = await fetch(`http://127.0.0.1:${process.env.PORT}/`)
  .then((r) => r.status)
  .catch(() => 0);
ok(notFound === 404, `hors /health : 404 et non 200 (got ${notFound})`);
const metricsPublic = await fetch(`http://127.0.0.1:${process.env.PORT}/metrics`)
  .then((r) => r.status)
  .catch(() => 0);
ok(metricsPublic === 404, `les métriques ne sont pas exposées sur le port public (got ${metricsPublic})`);
const metrics = await fetch(`http://127.0.0.1:${process.env.METRICS_PORT}/metrics`)
  .then(async (r) => (r.ok ? r.text() : null))
  .catch(() => null);
ok(
  metrics?.includes("# TYPE tor_rooms gauge") &&
    metrics.includes("tor_websocket_connections ") &&
    metrics.includes("# TYPE tor_caught_errors_total counter"),
  "le port dédié expose des métriques Prometheus sans étiquettes variables",
);

/* ------------------------------------------------------------------ *
 * COOP — curseur décoratif. Le clic est jugé sur l'index, pas sur x,y.
 * ------------------------------------------------------------------ */
{
  const { draftCoop } = await import("../../src/engine/coop.ts");
  const { FIELD_H } = await import("../../src/engine/types.ts");
  const seuilG = ONE_RULES.find((r) => r.id === "gaucher")?.zone?.[0]?.x1 ?? 200;

  const attendre = async (pred, ms) => {
    const t0 = Date.now();
    while (!pred() && Date.now() - t0 < ms) await sleep(100);
    return pred();
  };

  let dent = false;
  /*
   * ⚠️ 40 ESSAIS, PAS 10. La graine vient du serveur : il faut que LE GAUCHER
   * tombe sur l'un des quatre sièges ET que la pièce 3 soit hors de sa zone,
   * soit environ une chance sur cinq par essai. À dix essais, l'assertion
   * échouait par pur hasard une fois sur dix environ (0,79^10) — vu tomber
   * sur un lancement sans qu'aucun code de coop n'ait changé. À quarante,
   * moins d'une fois sur dix mille, et un essai raté ne coûte qu'une seconde.
   */
  for (let essai = 0; essai < 40 && !dent; essai++) {
    const js = [];
    for (const n of ["K1", "K2", "K3", "K4"]) {
      const c = await client(n, "cle-cur-" + n + "-" + essai);
      c.manuel = true;
      js.push(c);
    }
    for (const c of js) for (let i = 0; i < 4; i++) {
      c.ws.send(JSON.stringify({ t: "ping", sent: Date.now() }));
      await sleep(20);
    }
    js[0].ws.send(JSON.stringify({ t: "create" }));
    await sleep(250);
    const code = js[0].room.code;
    for (const c of js.slice(1)) {
      c.ws.send(JSON.stringify({ t: "join", code }));
      await sleep(120);
    }
    js[0].ws.send(JSON.stringify({ t: "settings", settings: { mode: "coop" } }));
    await sleep(200);
    js[0].ws.send(JSON.stringify({ t: "start" }));
    const start = await attendre(() => js[0].mode === "coop" && Object.keys(js[0].rules).length >= 4, 4000);
    if (!start) {
      for (const c of js) c.ws.close();
      await sleep(150);
      continue;
    }
    const porteur = js.find((c) => js[0].rules[c.id] === "gaucher");
    const e3 = draftCoop(js[0].seed, 0).ents.find((e) => e.idx === 3);
    if (!porteur || !e3 || e3.x < seuilG) {
      for (const c of js) c.ws.close();
      await sleep(150);
      continue;
    }
    const round = await attendre(() => porteur.roundIdx >= 0, APRES_DEPART + 2000);
    if (!round) {
      for (const c of js) c.ws.close();
      await sleep(150);
      continue;
    }
    await sleep(DELAI_PILOTE);
    // Mensonge dans la zone interdite du GAUCHER (x < 200). Un second
    // envoi à FIELD_W passerait le juge si le cooldown lâchait : on n'en
    // envoie donc qu'un, à l'antipode gauche.
    porteur.ws.send(JSON.stringify({ t: "cursor", x: 0, y: FIELD_H }));
    await sleep(80);
    const at = Date.now() + porteur.offset;
    porteur.ws.send(JSON.stringify({ t: "input", round: porteur.roundIdx, at, action: { k: "c", i: 3 } }));
    await sleep(350);
    const autre = js.find((c) => c.id !== porteur.id);
    ok(
      (autre?.cursorsMsgs.length ?? 0) >= 1,
      `coop curseur : t:cursors relayé (got ${autre?.cursorsMsgs.length ?? 0})`,
    );
    const interdit = porteur.coopClics.some((m) => m.i === 3 && m.pris === false);
    const pris =
      porteur.coopClics.some((m) => m.i === 3 && m.pris === true) ||
      porteur.chargesCoop.some((m) => m.i === 3 && m.n > 0);
    ok(
      !interdit && pris,
      "le verdict d'un clic sur i=3 reste identique si le curseur ment (x,y aux antipodes)",
    );
    dent = true;
    for (const c of js) c.ws.close();
    await sleep(200);
  }
  ok(dent, "coop curseur : une graine avec GAUCHER et i=3 hors zone a été trouvée");
}

/* ------------------------------------------------------------------ *
 * IMPOSTEUR — un scénario borné, nommé, pas une assertion orpheline.
 *
 * 4 clients, 10 manches, un vote, relance. `draftImposteur` côté pilote,
 * jamais `buildMultiRound`. Si le DUO plus haut casse, les modes sont
 * mélangés : on corrige, on ne désactive pas.
 * ------------------------------------------------------------------ */
{
  const raz = (c) => {
    c.verdicts = [];
    c.ended = null;
    c.acted = [];
    c.journals = [];
    c.observes = [];
    c.voteResults = [];
    c.imposteur = false;
    c.mode = null;
    c.rules = {};
    c.rounds = [];
    c.recus = [];
    c.errors = [];
  };

  const attendre = async (pred, ms, quoi) => {
    const t0 = Date.now();
    while (!pred() && Date.now() - t0 < ms) await sleep(200);
    const ok = pred();
    // Une attente épuisée le DIT, avec ce qu'elle attendait : l'assertion qui
    // suit tombera, et ce journal dira pourquoi (§2, « l'e2e est bavard »).
    if (!ok && quoi) info(`attente épuisée après ${ms} ms : ${quoi}`);
    return ok;
  };

  const jouerUnMatch = async (joueurs, accusateur, voter = null) => {
    for (const c of joueurs) raz(c);
    joueurs[0].ws.send(JSON.stringify({ t: "start" }));
    const dix = await attendre(() => joueurs[0].verdicts.length >= 10, 90000, "10 verdicts");
    ok(dix, `imposteur : 10 verdicts (reçus ${joueurs[0].verdicts.length})`);
    ok(!joueurs[0].ended, "imposteur : pas de match_end avant le 10e");
    const viesZero = [];
    for (const v of joueurs[0].verdicts) {
      for (const p of v.players ?? []) {
        if (!p.spectator && p.lives === 0) viesZero.push(`${p.name}@${v.idx}`);
      }
    }
    ok(viesZero.length === 0, `imposteur : zéro lives à 0 (${viesZero.join(",") || "aucun"})`);
    const obs = await attendre(
      () => joueurs[0].journals.length >= 1 && joueurs[0].observes.length >= 1,
      4000,
      "journal+observe",
    );
    ok(obs, `imposteur : journal puis observe (j=${joueurs[0].journals.length} o=${joueurs[0].observes.length})`);
    ok(!joueurs[0].ended, "imposteur : toujours pas de match_end pendant l'observation");
    const nImp = joueurs.filter((c) => c.imposteur).length;
    ok(nImp === 1, `imposteur : exactement un rôle privé (reçus ${nImp})`);
    /*
     * `t:acted` d'un villageois. Les cinq indices pairs sont des pièges
     * forcés : un villageois n'y envoie rien. Les cinq impairs peuvent
     * encore piéger naturellement — un seed qui les piège tous laisserait
     * le village silencieux, et l'ancienne égalité « au moins un acted
     * villageois » tombait sans qu'aucun code n'ait cassé. On lit donc le
     * journal : s'il a agi, le live doit l'avoir dit.
     */
    const village = joueurs.filter((c) => !c.imposteur);
    const villageIds = new Set(village.map((c) => c.id));
    const tours = joueurs[0].journals[0]?.tours ?? [];
    let villageAAgi = false;
    for (const tour of tours) {
      for (const id of villageIds) {
        if (tour.sieges?.[id]?.aAgit) villageAAgi = true;
      }
    }
    ok(
      villageAAgi
        ? joueurs[0].acted.some((a) => villageIds.has(a.playerId))
        : joueurs[0].acted.length > 0,
      `imposteur : un t:acted d'un villageois (${joueurs[0].acted.length} acted, aAgitVillage=${villageAAgi})`,
    );
    if (voter) voter(joueurs, village);
    else {
      const cible = accusateur(joueurs);
      for (const v of village) v.ws.send(JSON.stringify({ t: "vote", playerId: cible }));
    }
    const vote = await attendre(() => joueurs[0].voteResults.length >= 1, 4000, "vote_result");
    ok(vote, "imposteur : vote_result reçu");
    const fin = await attendre(() => !!joueurs[0].ended, 4000, "match_end");
    ok(fin, "imposteur : match_end après le vote (écran de fin existant)");
    return joueurs[0].voteResults[0] ?? null;
  };

  const imp = [];
  for (const n of ["I1", "I2", "I3", "I4"]) imp.push(await client(n, "cle-" + n));
  for (const c of imp) for (let i = 0; i < 4; i++) { c.ws.send(JSON.stringify({ t: "ping", sent: Date.now() })); await sleep(25); }
  imp[0].ws.send(JSON.stringify({ t: "create" }));
  await sleep(250);
  const codeImp = imp[0].room.code;
  for (const c of imp.slice(1)) { c.ws.send(JSON.stringify({ t: "join", code: codeImp })); await sleep(150); }
  await sleep(250);
  imp[0].ws.send(JSON.stringify({ t: "settings", settings: { mode: "imposteur" } }));
  await sleep(300);
  ok(imp[0].room?.settings?.mode === "imposteur", "imposteur : le réglage se propage");
  ok(imp[0].room?.settings?.duo === false, "imposteur : duo reste false (l'e2e DUO n'est pas mélangé)");

  const r1 = await jouerUnMatch(imp, (js) => js.find((c) => c.imposteur).id);

  const pub = Object.values(imp[0].rules);
  ok(pub.length === 4, `imposteur : 4 ruleId publics (${pub.length})`);
  ok(pub.every((id) => id && id !== "sansRegle"), `imposteur : aucun ruleId public vide ni sansRegle (${pub.join(",")})`);
  ok(new Set(pub).size === 1, `imposteur : le JSON public ne distingue pas (${pub.join(",")})`);
  const roomJson = JSON.stringify(imp[0].room);
  ok(!roomJson.includes("sansRegle"), "imposteur : room ne porte pas sansRegle");
  ok(!roomJson.includes("imposteurId"), "imposteur : room ne porte pas imposteurId");

  ok(r1?.vainqueur === "village", `imposteur : 3 voix sur l'imposteur → village (got ${r1?.vainqueur})`);
  ok(r1?.imposteurId === imp.find((c) => c.imposteur)?.id, "imposteur : l'issue nomme le bon siège");

  await sleep(500);
  const r2 = await jouerUnMatch(imp, (js) => js.find((c) => !c.imposteur).id);
  ok(r2?.vainqueur === "imposteur", `imposteur : 3 voix sur un villageois → imposteur (got ${r2?.vainqueur})`);

  /*
   * ⚠️ UN VOTANT QUI PART NE BLOQUE PLUS LE SALON (audit C3). Trois voix
   * partagées, sans majorité ; le seul siège qui n'a pas voté quitte la
   * table. Avant le correctif, plus aucune voix n'arrivait, donc rien ne
   * clôturait : le match restait posé pour toujours et le salon répondait
   * `in_match` à tout. Le vote doit se clore AUSSITÔT — pas au bout de la
   * borne de 90 s, que l'attente de 4 s ne laisserait pas atteindre.
   */
  await sleep(500);
  let partant = null;
  const r3 = await jouerUnMatch(imp, null, (js, village) => {
    const imposteur = js.find((c) => c.imposteur);
    // Celui qui part n'est jamais js[0] : c'est lui qu'on écoute.
    partant = village.find((c) => c !== js[0]);
    const votants = js.filter((c) => c !== partant);
    // Chacun accuse quelqu'un de différent : aucune majorité possible.
    votants.forEach((v, i) => v.ws.send(JSON.stringify({ t: "vote", playerId: votants[(i + 1) % votants.length].id })));
    void imposteur;
    setTimeout(() => partant.ws.send(JSON.stringify({ t: "leave" })), 300);
  });
  ok(!!r3, "imposteur : un votant qui part après un vote partagé clôt le vote (pas de salon bloqué)");
  ok(r3?.vainqueur === "imposteur", `imposteur : sans majorité, l'imposteur l'emporte (got ${r3?.vainqueur})`);

  for (const c of imp) c.ws.close();
  await sleep(220);
  void partant;
}

/* ------------------------------------------------------------------ *
 * LE PROFIL — carte de visite et photo, sur le fil.
 *
 * ⚠️ La photo est le plus gros message du protocole, et le plafond de `ws`
 * (`maxPayload`) valait 4096 : une vraie photo de téléphone y FERMAIT la
 * socket, sans un message. On envoie donc une photo de 13 Ko, près de
 * `PHOTO_MAX`, et on exige que la connexion survive.
 * ------------------------------------------------------------------ */
{
  const [p1, p2] = await Promise.all([client("PROFIL1", "pro1"), client("PROFIL2", "pro2")]);
  for (const c of [p1, p2]) c.manuel = true;
  const entete = "data:image/jpeg;base64,";
  const lourde = entete + "A".repeat(13_000 - entete.length);
  p1.ws.send(JSON.stringify({ t: "create" }));
  await sleep(150);
  p1.ws.send(JSON.stringify({ t: "profil", carte: "sang", photo: lourde }));
  // 150 ms de regroupement de l'état du salon (`diffuseEtatBientot`), plus la marge.
  await sleep(400);
  ok(p1.ferme === null, `profil : une photo de 13 Ko ne ferme pas la socket (code ${p1.ferme})`);
  const moi1 = p1.room?.players.find((x) => x.id === p1.id);
  ok(moi1?.carte === "sang", `profil : la carte est publiée dans le salon (${moi1?.carte})`);

  p2.ws.send(JSON.stringify({ t: "join", code: p1.room.code }));
  await sleep(250);
  const recue = p2.photos.find((ph) => ph[p1.id]);
  ok(recue?.[p1.id] === lourde, "profil : l'arrivant reçoit la photo de ceux déjà là");
  ok(p2.room?.players.find((x) => x.id === p1.id)?.carte === "sang", "profil : l'arrivant voit la carte");

  // Du douteux : une carte qui sortirait d'une url() CSS, une photo qui
  // serait une adresse à sonder. Ignorés, jamais une erreur.
  const erreursAvant = p2.errors.length;
  p2.ws.send(JSON.stringify({ t: "profil", carte: 'sang")', photo: "https://exemple.org/moi.jpg" }));
  await sleep(200);
  ok(p2.errors.length === erreursAvant && p2.ferme === null, "profil : un profil douteux n'est ni une erreur ni une coupure");
  ok(p1.room?.players.find((x) => x.id === p2.id)?.carte === undefined, "profil : une carte douteuse n'est pas publiée");
  ok(!p1.photos.some((ph) => ph[p2.id]), "profil : une photo douteuse n'est pas relayée");

  // Retirer sa photo se relaie comme une chaîne vide. Après le délai minimal
  // entre deux changements de photo.
  await sleep(1600);
  const avant = p2.photos.length;
  p1.ws.send(JSON.stringify({ t: "profil", carte: "roue" }));
  await sleep(200);
  ok(p2.photos.slice(avant).some((ph) => ph[p1.id] === ""), "profil : retirer sa photo se relaie");
  ok(p2.room?.players.find((x) => x.id === p1.id)?.carte === "roue", "profil : changer de carte se relaie");

  // Deux photos d'affilée : la seconde, trop rapprochée, est ignorée.
  const autre = entete + "QUJD";
  p1.ws.send(JSON.stringify({ t: "profil", carte: "roue", photo: entete + "WFla" }));
  await sleep(50);
  p1.ws.send(JSON.stringify({ t: "profil", carte: "roue", photo: autre }));
  await sleep(200);
  ok(!p2.photos.some((ph) => ph[p1.id] === autre), "profil : une rafale de photos ne se relaie pas");

  /*
   * Une trame plus grosse que `maxPayload`. Le serveur n'écoutait pas `error`
   * sur ses sockets : `ws` levait, et le PROCESSUS mourait — tous les salons
   * avec lui. On exige que la fautive seule soit coupée.
   */
  const intrus = await client("INTRUS", "intr");
  intrus.manuel = true;
  intrus.ws.send(JSON.stringify({ t: "chat", text: "A".repeat(40_000) }));
  await sleep(300);
  ok(intrus.ferme !== null, `trame trop grosse : la socket fautive est coupée (code ${intrus.ferme})`);
  const pongsAvant = p2.offsets.length;
  p2.ws.send(JSON.stringify({ t: "ping", sent: Date.now() }));
  await sleep(200);
  ok(p2.offsets.length > pongsAvant && p2.ferme === null, "trame trop grosse : le serveur répond encore aux autres");

  for (const c of [p1, p2]) c.ws.close();
  await sleep(220);
}

/* ------------------------------------------------------------------ *
 * LA PARTIE RAPIDE — une table publique qui part et repart seule.
 *
 * Tout est mesuré sur le fil, contre les constantes de `server/rapide.ts` :
 * seul, on attend ; à deux, l'échéance est posée et le match part À
 * L'HEURE ; LANCER et les réglages y sont ignorés ; un troisième qui arrive
 * en cours de match rejoint LA MÊME table, en spectateur ; et après le
 * match, le suivant repart sans que personne ne touche à rien, le
 * spectateur assis. Les trois clients sont `manuel` : ils ne jouent pas, et
 * le match se termine au temps.
 * ------------------------------------------------------------------ */
{
  const { ATTENTE_SALON_MS, ATTENTE_APRES_MATCH_MS } = await import("../../server/rapide.ts");
  const [q1, q2, q3] = await Promise.all([client("RAPIDE1", "kq1"), client("RAPIDE2", "kq2"), client("RAPIDE3", "kq3")]);
  const departs = new Map();
  for (const c of [q1, q2, q3]) {
    c.manuel = true;
    departs.set(c, []);
    c.ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "match_start") departs.get(c).push({ at: Date.now(), rules: m.rules });
    });
    for (let i = 0; i < 4; i++) { c.ws.send(JSON.stringify({ t: "ping", sent: Date.now() })); await sleep(25); }
  }

  q1.ws.send(JSON.stringify({ t: "quick" }));
  await sleep(250);
  ok(q1.room?.public === true, "partie rapide : la table est PUBLIQUE");
  ok(q1.room?.autoAt === null, "partie rapide : seul, aucun départ n'est prévu");

  q2.ws.send(JSON.stringify({ t: "quick" }));
  await sleep(250);
  ok(q2.room?.code === q1.room?.code, `partie rapide : le second rejoint la MÊME table (${q1.room?.code} / ${q2.room?.code})`);
  const autoAt = q1.room?.autoAt;
  ok(typeof autoAt === "number", "partie rapide : à deux, l'échéance est posée et diffusée");
  const reste = autoAt - (Date.now() + q1.offset);
  okMarge(Math.abs(reste - ATTENTE_SALON_MS), 1000, "max", "partie rapide : l'échéance vaut la fenêtre d'arrivée");

  // Personne n'est l'hôte de personne : LANCER et les réglages ne font rien.
  q1.ws.send(JSON.stringify({ t: "start" }));
  q1.ws.send(JSON.stringify({ t: "settings", settings: { lives: 1 } }));
  await sleep(300);
  ok(departs.get(q1).length === 0, "partie rapide : LANCER est ignoré sur une table publique");
  ok(q1.room?.settings?.lives !== 1, "partie rapide : les réglages sont ignorés sur une table publique");

  const tDepart = Date.now();
  while (!departs.get(q1).length && Date.now() - tDepart < ATTENTE_SALON_MS + 3000) await sleep(100);
  const premier = departs.get(q1)[0];
  ok(!!premier, "partie rapide : le match part SEUL");
  if (premier) {
    okMarge(Math.abs(premier.at + q1.offset - autoAt), 600, "max", "partie rapide : il part à l'heure annoncée");
  }

  // Un troisième arrive pendant le match : même table, il regarde.
  q3.ws.send(JSON.stringify({ t: "quick" }));
  await sleep(400);
  ok(q3.room?.code === q1.room?.code, "partie rapide : une arrivée en cours de match rejoint la table EN COURS");
  ok(departs.get(q3).length === 1 && !(q3.id in (departs.get(q3)[0]?.rules ?? {})),
    "partie rapide : l'arrivant reçoit le match en cours, sans siège");

  // Personne ne joue : le match se termine au temps, puis repart seul.
  const tFin = Date.now();
  while (departs.get(q1).length < 2 && Date.now() - tFin < 90_000) await sleep(200);
  const second = departs.get(q1)[1];
  ok(!!second, "partie rapide : le match SUIVANT repart sans que personne ne lance");
  if (second) {
    ok(q3.id in second.rules, "partie rapide : le spectateur d'hier est assis au match suivant");
    const fin = q1.recus.filter((r) => r.t === "verdict" && r.nextRoundAt == null).pop();
    if (fin) {
      okMarge(Math.abs(second.at - fin.at - ATTENTE_APRES_MATCH_MS), 1500, "max", "partie rapide : la pause entre deux matchs est celle annoncée");
    }
  }
  for (const c of [q1, q2, q3]) c.ws.close();
  await sleep(220);
}

/* ------------------------------------------------------------------ *
 * Cohérence du flux — relue sur ce que le serveur a réellement envoyé.
 *
 * Rien de neuf n'est joué ici : on repasse sur les messages déjà collectés
 * pendant le premier match. Ces invariants ne coûtent rien et attrapent des
 * défauts qu'aucune assertion ponctuelle ne verrait — un verdict rejoué, un
 * joueur oublié dans un tour, une vie qui remonte.
 * ------------------------------------------------------------------ */
{
  const idxs = match1.verdicts.map((v) => v.idx);
  const croissant = idxs.every((v, i) => i === 0 || v > idxs[i - 1]);
  ok(croissant, `les manches se suivent sans doublon ni retour (${idxs.join(",")})`);

  const manquants = [];
  for (const v of match1.verdicts) {
    for (const p of v.players ?? []) {
      if (!(p.id in (v.outcomes ?? {}))) manquants.push(`${p.name}@${v.idx}`);
    }
  }
  ok(manquants.length === 0, `chaque joueur a un verdict à chaque manche (manquants : ${manquants.join(", ") || "aucun"})`);

  const remontees = [];
  const dernieresVies = new Map();
  const derniersScores = new Map();
  for (const v of match1.verdicts) {
    for (const p of v.players ?? []) {
      const vAvant = dernieresVies.get(p.id);
      if (vAvant !== undefined && p.lives > vAvant) remontees.push(`${p.name} ${vAvant}→${p.lives}@${v.idx}`);
      dernieresVies.set(p.id, p.lives);
      const sAvant = derniersScores.get(p.id);
      if (sAvant !== undefined && p.score < sAvant) remontees.push(`${p.name} score ${sAvant}→${p.score}@${v.idx}`);
      derniersScores.set(p.id, p.score);
    }
  }
  ok(remontees.length === 0, `aucune vie ne remonte, aucun score ne recule (${remontees.join(", ") || "rien à signaler"})`);

  const pauses = [];
  for (const r of match1.recus) {
    if (r.t !== "verdict" || r.nextRoundAt == null) continue;
    const suivant = match1.recus.find((x) => x.t === "round" && x.idx === r.idx + 1);
    if (suivant) pauses.push({ idx: r.idx, annoncee: Math.round(r.nextRoundAt - r.at), vecue: suivant.at - r.at });
  }
  info(
    `pauses (annoncée → vécue) : ` +
      (pauses.map((p) => `#${p.idx} ${p.annoncee}→${p.vecue}`).join(" · ") || "aucune mesurée"),
  );
  const enRetard = pauses.filter((p) => p.vecue < p.annoncee - 250);
  ok(enRetard.length === 0, `aucune manche ne démarre avant l'heure annoncée (${enRetard.map((p) => `#${p.idx}`).join(",") || "aucune"})`);

  const futur = match1.recus.filter((r) => r.nextRoundAt != null && r.nextRoundAt <= r.at);
  ok(futur.length === 0, `nextRoundAt toujours dans le futur à la réception (${futur.length} en défaut)`);

  const inattendues = match1.errors.filter((e) => e.code !== "not_host");
  ok(inattendues.length === 0, `aucune erreur inattendue chez ALICE (${inattendues.map((e) => e.code).join(",") || "aucune"})`);
}

/* ------------------------------------------------------------------ *
 * LES LIMITES DE DÉBIT (`server/debit.ts`) — phase 4, point 23.
 *
 * ⚠️ TOUJOURS EN DERNIER : le balayage de codes BLOQUE l'adresse pendant une
 * minute, et tous les clients de ce fichier partagent 127.0.0.1. Placé plus
 * haut, il ferait refuser les `join` de tous les scénarios suivants.
 * ------------------------------------------------------------------ */
{
  const [hote, flot, balai] = await Promise.all([client("HOTEDEBIT", "hdeb"), client("FLOT", "flot"), client("BALAI", "balai")]);
  for (const c of [hote, flot, balai]) c.manuel = true;
  hote.ws.send(JSON.stringify({ t: "create" }));
  await sleep(150);
  const code = hote.room?.code;
  const avant = (await lisErreurs())?.erreurs;
  // Une rafale de 2000 messages : 80 passent, puis le seau refuse, et coupe.
  for (let i = 0; i < 2000; i++) flot.ws.send(JSON.stringify({ t: "ping", sent: i }));
  await sleep(400);
  ok(flot.ferme === 1008, `débit : une rafale fait couper la socket fautive (code ${flot.ferme})`);
  ok(hote.ws.readyState === WebSocket.OPEN, "débit : les autres sockets restent ouvertes");
  const apres = await lisErreurs();
  ok(apres?.ok === true && apres?.erreurs === avant, `débit : serveur vivant, aucune exception (erreurs ${avant} → ${apres?.erreurs})`);

  // Le balayage : ECHECS_JOIN_MAX codes inconnus, puis le VRAI code est refusé.
  const faux = [];
  for (const a of "ABCDEFGHJK") for (const b of "MNPQ") if (faux.length < ECHECS_JOIN_MAX) faux.push(`Z${a}${b}9`);
  for (const f of faux.filter((f) => f !== code)) {
    balai.ws.send(JSON.stringify({ t: "join", code: f }));
    await sleep(40);
  }
  balai.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(300);
  ok(
    balai.room?.code !== code && balai.errors.filter((e) => e.code === "room_unknown").length === faux.length + 1,
    `débit : après ${faux.length} codes inconnus, même le vrai est refusé (${balai.room?.code ?? "hors salon"})`,
  );
  ok(balai.ferme === null, "débit : le balayeur n'est pas coupé — il n'apprend simplement plus rien");
}

/* ------------------------------------------------------------------ *
 * Récapitulatif
 * ------------------------------------------------------------------ */
console.log("");
console.log(`— ${n} assertions, ${fails} échec(s), ${Math.round((Date.now() - T0) / 1000)} s`);
if (serres.length) {
  console.log(`— ${serres.length} assertion(s) passée(s) à moins de 30 % de leur seuil :`);
  for (const s of serres.sort((a, b) => a.marge - b.marge)) {
    console.log(`   [${String(s.n).padStart(3, "0")}] marge ${s.marge} % · ${s.msg}`);
  }
  console.log("   Ce sont les seules candidates sérieuses à un échec intermittent.");
} else {
  console.log("— aucune assertion serrée : rien qui ressemble à un échec intermittent en attente.");
}
if (fails) {
  console.log("— échecs :");
  for (const e of journal.filter((x) => !x.ok)) console.log(`   [${String(e.n).padStart(3, "0")}] ${e.msg}`);
}
console.log(fails === 0 ? "E2E OK" : `E2E : ${fails} échec(s)`);
process.exit(fails === 0 ? 0 : 1);
