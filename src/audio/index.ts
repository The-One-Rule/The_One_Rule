/**
 * Moteur sonore.
 *
 * Tout est synthétisé : aucun fichier à charger, donc aucun délai au premier
 * lancement, un jeu qui démarre hors ligne, et un poids nul dans le bundle.
 *
 * Deux couches indépendantes :
 *   · la MUSIQUE, ordonnancée en avance sur l'horloge WebAudio. C'est elle
 *     qui fait passer le jeu de « test de réflexes » à « sensation de flow ».
 *   · les EFFETS, déclenchés à l'événement.
 *
 * Règle de conception tenue partout : aucune information de jeu ne dépend du
 * son. Une partie jouée en silence doit rester parfaitement lisible.
 */

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;

let sfxOn = true;
let musicOn = true;

export function unlock(): void {
  if (!ac) {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(ac.destination);

      musicBus = ac.createGain();
      musicBus.gain.value = musicOn ? 1 : 0;
      musicBus.connect(master);

      sfxBus = ac.createGain();
      sfxBus.gain.value = sfxOn ? 1 : 0;
      sfxBus.connect(master);
    } catch {
      ac = null;
    }
  }
  if (ac?.state === "suspended") void ac.resume();
}

export function setEnabled(on: boolean): void {
  sfxOn = on;
  if (sfxBus && ac) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02);
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  if (musicBus && ac) musicBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05);
  if (!on) music.stop();
}

export const isEnabled = (): boolean => sfxOn;
export const isMusicEnabled = (): boolean => musicOn;

/* ------------------------------------------------------------------ *
 * Briques de synthèse
 * ------------------------------------------------------------------ */

/**
 * Toute la synthèse passe par ce garde.
 *
 * Le son est un agrément, jamais une dépendance : un navigateur qui
 * n'implémente pas une brique WebAudio doit donner un jeu silencieux, pas un
 * jeu cassé. Une exception ici remonterait dans la boucle de rendu.
 */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* jeu silencieux plutôt que jeu mort */
  }
}

function voice(
  bus: GainNode,
  t0: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  glideTo?: number,
): void {
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(bus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Bruit filtré : sert au charley et aux impacts. */
function noise(bus: GainNode, t0: number, dur: number, vol: number, hz: number, q = 1): void {
  if (!ac) return;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = hz;
  filt.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(gain).connect(bus);
  src.start(t0);
  src.stop(t0 + dur);
}

/* ------------------------------------------------------------------ *
 * La musique
 *
 * Séquenceur à lookahead : on programme les notes ~120 ms à l'avance sur
 * l'horloge audio, jamais sur setTimeout. C'est la seule façon d'obtenir un
 * tempo stable — le fil principal est occupé par le rendu et le GC, et un
 * décalage de 20 ms sur un kick s'entend immédiatement.
 * ------------------------------------------------------------------ */

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

/** Fréquence Hz d'une note MIDI absolue — 440 Hz = La4 = note 69. */
const noteHz = (midiNote: number): number => 440 * Math.pow(2, (midiNote - 69) / 12);

/** Constante indépendante, conservée pour les effets (inchangée). */
const ROOT = 55; // La1
const midi = (semi: number): number => ROOT * Math.pow(2, semi / 12);

/* ------------------------------------------------------------------ *
 * Matière harmonique — importée d'une composition AIVA (MIDI), pas
 * inventée. Extraite du fichier fourni par Pierre :
 *
 *   - alternance Do majeur / Si♭ mineur toutes les 2 temps (phrygien
 *     dominant : Do Réb Mi Fa Sol Lab Sib — sombre, tendu, jamais triste)
 *   - basse qui pose Do2/Sib1 sur les mêmes temps
 *   - un motif mélodique en voisinage Sol4↔Sol#4, une hésitation qui
 *     inquiète plus qu'une mélodie qui chante
 *   - un arpège qui n'entre qu'après une section nue (dans le MIDI, à la
 *     seconde 32) : cette FORME — calme puis bascule nette — remplace mon
 *     ancien seuil continu, elle se reproduit ici par palier d'intensité
 *
 * Les voicings d'accords sont ceux du fichier, pas des triades théoriques :
 * ------------------------------------------------------------------ */
const CHORD_C: readonly number[] = [55, 60, 64, 67]; // Sol3 Do4 Mi4 Sol4
const CHORD_BB: readonly number[] = [53, 58, 61, 65]; // Fa3 Sib3 Réb4 Fa4
const BASS_C = 36; // Do2
const BASS_BB = 34; // Sib1
/** Arpège par accord : mêmes fondamentales que le fichier, une octave dessous. */
const ARP_C: readonly number[] = [48, 48, 52, 55, 48, 55, 52, 48]; // Do3 Mi3 Sol3
const ARP_BB: readonly number[] = [46, 46, 49, 53, 46, 53, 49, 46]; // Sib2 Réb3 Fa3
/** Le motif Sol4↔Sol#4↔Fa4 du MIDI, condensé sur 8 pas. */
const MELODY_MOTIF: readonly number[] = [67, 68, 67, 68, 65, -1, -1, -1];
/** Neuvième mineure sur la basse courante — la couleur inquiétante du phrygien. */
const TENSION_C = 61; // Réb4 contre Do
const TENSION_BB = 59; // Si3 contre Sib

class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private step = 0;
  private bpm = 91; // tempo d'origine de la composition importée
  /** 0 → 1 : monte avec le niveau, ouvre les couches une à une */
  private intensity = 0;
  private targetBpm = 91;
  /** en doubles-croches : se réduit à l'approche du niveau max, l'arpège se resserre */
  private arpDiv = 2;

  start(): void {
    if (!ac || !musicBus || this.timer !== null) return;
    this.step = 0;
    this.nextNote = ac.currentTime + 0.06;
    this.bpm = 91;
    this.targetBpm = 91;
    this.intensity = 0;
    this.arpDiv = 2;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Le tempo et la densité suivent le niveau — c'est la mécanique du jeu
   * elle-même qui doit s'entendre, pas seulement se voir sur la fenêtre de
   * temps. Trois leviers montent ensemble, jamais un seul :
   *   - le BPM grimpe de 91 à 176 (quasi le double, senti par tous)
   *   - l'intensité ouvre les couches (basse → accords → arpège → tension)
   *   - l'arpège double sa cadence dans le dernier tiers : à niveau élevé
   *     il ne joue plus seulement plus vite, il joue plus DENSE
   */
  /**
   * ⚠️ L'ALLURE ENTRE DANS LE CALCUL, et sans elle la musique MENTAIT.
   *
   * Le tempo ne suivait que le numero de manche. Or l'allure multiplie la
   * duree de chaque manche : a DEBUT (2.0) la fenetre de la manche 20 fait
   * 1848 ms, pres du double des 924 ms de NORMAL — et la musique jouait
   * pourtant exactement le meme tempo. Elle courait donc devant un jeu calme,
   * ce qui est le contraire de ce qu'elle est censee faire : dire, a
   * l'oreille, combien de temps il reste.
   *
   * Depuis que DEBUT est l'allure PAR DEFAUT d'un joueur neuf, c'est le cas
   * le plus frequent du jeu, pas un cas de bord.
   *
   * Un tempo est une duree : il se divise donc par l'allure, exactement comme
   * la fenetre se multiplie par elle. A DEBUT la musique tourne a moitie
   * vitesse, a RAPIDE elle sature plus tot.
   *
   * ⚠️ A `PACE_DEFAULT`, RIEN NE CHANGE — la division par 1 est l'identite, et
   * c'est voulu : ce reglage-la a ete cale a l'oreille, et il reste la
   * reference contre laquelle les autres se placent.
   *
   * Le plancher a 64 evite qu'une allure tres lente ne rende le pouls
   * inaudible ; le plafond a 176 est celui d'avant.
   */
  setLevel(level: number, allure = 1): void {
    const a = allure > 0 ? allure : 1;
    this.targetBpm = Math.max(64, Math.min(176, (91 + level * 2.55) / a));
    // Les COUCHES s'ouvrent au meme rythme relatif : vingt manches a l'allure
    // de reference, quarante a DEBUT, seize a RAPIDE. Sans ca, un debutant
    // atteignait la dissonance finale alors qu'il a encore deux secondes par
    // manche.
    this.intensity = Math.min(1, level / (20 * a));
    this.arpDiv = this.intensity > 0.8 ? 1 : 2;
  }

  /** Coupure nette à la mort, sans traîne. */
  cut(): void {
    if (!ac || !musicBus) return;
    musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    setTimeout(() => {
      this.stop();
      if (ac && musicBus) musicBus.gain.setTargetAtTime(musicOn ? 1 : 0, ac.currentTime, 0.2);
    }, 260);
  }

  private tick(): void {
    if (!ac || !musicBus) return;
    while (this.nextNote < ac.currentTime + SCHEDULE_AHEAD) {
      safely(() => this.schedule(this.step, this.nextNote));
      // Le tempo rattrape sa cible en continu : jamais de à-coup au
      // changement de manche, la montée se sent progressive.
      this.bpm += (this.targetBpm - this.bpm) * 0.05;
      this.nextNote += 60 / this.bpm / 4; // double-croches à ce tempo
      this.step = (this.step + 1) % 16; // une mesure = 2 temps d'accord × 2
    }
  }

  private schedule(step: number, t: number): void {
    const bus = musicBus;
    if (!bus) return;
    const I = this.intensity;
    // Deux temps d'accord par mesure de 16 pas, comme dans le fichier importé.
    const halfBar = step < 8 ? 0 : 1;
    const chord = halfBar === 0 ? CHORD_C : CHORD_BB;
    const bassNote = halfBar === 0 ? BASS_C : BASS_BB;
    const arp = halfBar === 0 ? ARP_C : ARP_BB;
    const tension = halfBar === 0 ? TENSION_C : TENSION_BB;
    const beatInHalf = step % 8;

    // Basse : présente dès la première seconde, c'est l'ancre du tempo —
    // et donc la première chose qui trahit l'accélération.
    if (beatInHalf === 0) {
      voice(bus, t, noteHz(bassNote), 0.34, "triangle", 0.15, noteHz(bassNote) * 0.94);
    }

    // Accords tenus : la couleur Do majeur / Si♭ mineur du fichier.
    if (I > 0.12 && beatInHalf === 0) {
      for (const n of chord) voice(bus, t, noteHz(n), 0.7, "sine", 0.028);
    }

    // Motif mélodique : le voisinage Sol↔Sol# qui inquiète plutôt qu'il ne chante.
    if (I > 0.28) {
      const note = MELODY_MOTIF[beatInHalf];
      if (note && note > 0) voice(bus, t, noteHz(note), 0.16, "triangle", 0.045);
    }

    // Arpège : la couche qui dit "ça va vite maintenant". Sa cadence se
    // resserre avec arpDiv — même schéma, joué deux fois plus dense.
    if (I > 0.42 && step % this.arpDiv === 0) {
      const idx = Math.floor(step / this.arpDiv) % arp.length;
      voice(bus, t, noteHz(arp[idx]! + 12), 0.1, "square", 0.02 + I * 0.024);
    }

    // Tension : la neuvième mineure du fichier, notre seule vraie
    // dissonance, réservée aux tout derniers paliers.
    if (I > 0.82 && step === 0) {
      voice(bus, t, noteHz(tension), 0.85, "sawtooth", 0.03);
    }
  }
}

const music = new Music();

export const musicApi = {
  start(): void {
    if (musicOn) music.start();
  },
  level(n: number, allure = 1): void {
    music.setLevel(n, allure);
  },
  /** Ambiance salon : basse intensité, entre manches et hors run. */
  lobby(): void {
    if (musicOn) {
      if (!music.running) music.start();
      music.setLevel(3);
    }
  },
  cut(): void {
    music.cut();
  },
  stop(): void {
    music.stop();
  },
};

/* ------------------------------------------------------------------ *
 * Les effets
 * ------------------------------------------------------------------ */

/** Pentatonique : le combo peut monter indéfiniment sans jamais sonner faux. */
const COMBO_STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

export const sfx = {
  /**
   * Pas intermédiaire d'une séquence : « enregistré, continue ».
   *
   * Sans lui, un premier clic sur une consigne en deux temps — LE JUMEAU
   * double toutes les étapes — ne produisait STRICTEMENT rien : ni son, ni
   * particule. Dans une fenêtre d'une seconde et demie, le joueur ne peut pas
   * distinguer « c'est pris, continue » de « le jeu ne m'a pas entendu », et
   * il conclut que la consigne ne se valide pas.
   *
   * Volontairement sec et discret : c'est un accusé de réception, pas une
   * félicitation. La réussite doit rester le seul moment qui chante.
   */
  step(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      // 0.045 et non 0.025 : voir la note de `success` — l'accuse de reception
      // passait sous la ligne de basse, donc il n'accusait rien du tout.
      voice(sfxBus!, t, midi(45), 0.035, "square", 0.045);
    });
  },

  /**
   * Réussite : monte avec la série en cours.
   *
   * ⚠️ LE JEU N'ENTENDAIT QUE SES ECHECS, et le releve des gains le disait :
   *
   *     elimImpact 0.16 · basse de la musique 0.15 · fail 0.10
   *     trapAvoided 0.055 · success 0.045 · step 0.025
   *
   * Rater claquait ; reussir passait SOUS la ligne de basse. Le retour positif
   * existait donc dans le code et nulle part dans l'oreille — c'est ce qui a
   * ete rapporte comme « il faudrait ramener les sons qui confirment qu'un
   * joueur a bien valide sa manche ». Ils n'avaient pas disparu, ils etaient
   * couverts.
   *
   * Les confirmations rejoignent le niveau des echecs. Le piege dejoue passe
   * juste au-dessus : c'est le seul moment ou le jeu felicite, et le seul geste
   * qu'il existe pour apprendre.
   */
  success(combo: number): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const s = COMBO_STEPS[Math.min(combo, COMBO_STEPS.length - 1)]!;
      const t = ac!.currentTime;
      voice(sfxBus!, t, midi(s + 36), 0.07, "square", 0.095);
      voice(sfxBus!, t + 0.012, midi(s + 48), 0.05, "sine", 0.065);
    });
  },

  /**
   * Piège déjoué : deux notes montantes, timbre distinct de la réussite
   * simple. C'est le seul moment où le jeu félicite, et il doit s'entendre.
   */
  trapAvoided(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      voice(sfxBus!, t, midi(36), 0.09, "triangle", 0.115);
      voice(sfxBus!, t + 0.075, midi(43), 0.12, "triangle", 0.105);
      voice(sfxBus!, t + 0.15, midi(48), 0.18, "triangle", 0.09);
    });
  },

  fail(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      voice(sfxBus!, t, 190, 0.3, "sawtooth", 0.1, 70);
      voice(sfxBus!, t + 0.06, 96, 0.5, "sawtooth", 0.085, 42);
      noise(sfxBus!, t, 0.22, 0.07, 700, 0.6);
    });
  },

  /** Impact d'élimination : plus bas, plus long que fail. */
  elimImpact(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      voice(sfxBus!, t, 110, 0.55, "sawtooth", 0.16, 36);
      voice(sfxBus!, t + 0.08, 58, 0.7, "sawtooth", 0.14, 28);
      noise(sfxBus!, t, 0.4, 0.12, 420, 0.85);
      noise(sfxBus!, t + 0.12, 0.28, 0.08, 180, 0.5);
    });
  },

  /** Échauffement : on signale l'erreur sans la punir. */
  grace(): void {
    if (!ac || !sfxBus) return;
    safely(() => voice(sfxBus!, ac!.currentTime, 300, 0.13, "sine", 0.05, 240));
  },

  /** Tic discret d'entrée de manche : cale l'attention sur le tempo. */
  roundStart(): void {
    if (!ac || !sfxBus) return;
    safely(() => noise(sfxBus!, ac!.currentTime, 0.025, 0.028, 2600, 1.4));
  },

  /** Sting de reprise après une pause : plus affirmé que roundStart. */
  resumeSting(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      voice(sfxBus!, t, midi(36), 0.06, "square", 0.04);
      voice(sfxBus!, t + 0.05, midi(43), 0.07, "square", 0.035);
      noise(sfxBus!, t + 0.02, 0.04, 0.04, 2200, 1.2);
    });
  },

  /**
   * LE CŒUR — un battement de la montée (`render/tension.ts`).
   *
   * Deux sinus graves, « poum-poum ». Le 55 Hz seul ne sort pas d'un haut-
   * parleur de téléphone : l'octave au-dessus le rend audible partout, le
   * grave le rend physique là où il passe.
   */
  coeur(force: number): void {
    if (!ac || !sfxBus || force <= 0) return;
    safely(() => {
      const t = ac!.currentTime;
      const v = Math.min(1, force);
      voice(sfxBus!, t, 58, 0.16, "sine", 0.1 * v, 44);
      voice(sfxBus!, t, 116, 0.09, "sine", 0.045 * v, 90);
      voice(sfxBus!, t + 0.17, 54, 0.14, "sine", 0.06 * v, 42);
      voice(sfxBus!, t + 0.17, 108, 0.07, "sine", 0.028 * v, 86);
    });
  },

  /**
   * LE GONG (règle de salon) — le SEUL son qui porte une information de jeu,
   * l'exception assumée à la doctrine de l'en-tête : il dit « ne fais rien ».
   *
   * Un gong et non un bip : des partiels INHARMONIQUES (2,76 et 5,4 fois la
   * fondamentale, ceux d'une plaque de métal) qui ne ressemblent à aucun
   * autre son du jeu, et une frappe bruitée qui s'entend sur un haut-parleur
   * de téléphone, où le 98 Hz seul ne sort pas.
   */
  gong(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      voice(sfxBus!, t, 98, 1.6, "sine", 0.17);
      voice(sfxBus!, t, 98 * 2.76, 1.1, "sine", 0.09);
      voice(sfxBus!, t, 98 * 5.4, 0.6, "sine", 0.05);
      voice(sfxBus!, t, 196, 1.3, "triangle", 0.05);
      noise(sfxBus!, t, 0.09, 0.09, 1800, 0.7);
    });
  },

  /** Un palier de la montée est franchi : une marche, vers le haut. */
  palier(n: number): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      const base = 36 + n * 2;
      voice(sfxBus!, t, midi(base), 0.18, "sawtooth", 0.035);
      voice(sfxBus!, t + 0.09, midi(base + 5), 0.22, "sawtooth", 0.035);
      noise(sfxBus!, t, 0.12, 0.03, 900, 0.8);
    });
  },

  /** Dernier quart de la fenêtre : l'urgence s'entend avant d'être lue. */
  urgent(): void {
    if (!ac || !sfxBus) return;
    safely(() => voice(sfxBus!, ac!.currentTime, 1500, 0.04, "square", 0.022));
  },

  runStart(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      [0, 7, 12].forEach((s, i) => voice(sfxBus!, t + i * 0.08, midi(s + 24), 0.12, "square", 0.05));
    });
  },

  win(): void {
    if (!ac || !sfxBus) return;
    safely(() => {
      const t = ac!.currentTime;
      [0, 5, 7, 12, 19].forEach((s, i) =>
        voice(sfxBus!, t + i * 0.1, midi(s + 36), 0.24, "square", 0.055),
      );
    });
  },

  /** Le fantôme vient de passer devant. Discret mais reconnaissable. */
  ghostPass(): void {
    if (!ac || !sfxBus) return;
    safely(() => voice(sfxBus!, ac!.currentTime, midi(31), 0.18, "sine", 0.05, midi(24)));
  },

  ui(): void {
    if (!ac || !sfxBus) return;
    safely(() => voice(sfxBus!, ac!.currentTime, 720, 0.03, "sine", 0.03));
  },
};
