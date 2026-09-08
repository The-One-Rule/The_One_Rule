/**
 * MICRO-ÉTATS — annonces courtes, hors flux.
 *
 * Découverte, maîtrise, échauffement, toast, pastille de record. Rien ici
 * ne décide d'une reprise : `show()` les efface, et aucun `setTimeout` ne
 * relance une partie (décision n°9).
 *
 * ⚠️ HORS FLUX. Le calque se cale sur `--field-top` / `--field-h` pendant
 * une manche : il ne prend pas un pixel au terrain. La variante `stop`
 * (maîtrise) couvre l'écran de fin, pas le champ — c'est le seul qui
 * interrompt, parce que c'est l'aboutissement de la boucle longue.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export type MicroKind =
  | "decouverte"
  | "maitrise"
  | "vie"
  | "echauffement"
  | "allure"
  | "quete";

let microTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let pastilleTimer: ReturnType<typeof setTimeout> | null = null;
let stopBranche = false;

export function cacheMicro(): void {
  if (microTimer) clearTimeout(microTimer);
  microTimer = null;
  const el = $("micro");
  el.classList.add("hidden");
  el.classList.remove("is-vu", "is-stop", "is-decouverte", "is-maitrise", "is-vie", "is-echauffement", "is-allure", "is-quete");
  el.setAttribute("aria-hidden", "true");
}

export function montreMicro(opts: {
  kind: MicroKind;
  eyebrow: string;
  nom: string;
  quoi: string;
  ms?: number;
  stop?: boolean;
}): void {
  const el = $("micro");
  $("microEyebrow").textContent = opts.eyebrow;
  $("microNom").textContent = opts.nom;
  $("microQuoi").textContent = opts.quoi;
  el.classList.remove(
    "hidden",
    "is-vu",
    "is-stop",
    "is-decouverte",
    "is-maitrise",
    "is-vie",
    "is-echauffement",
    "is-allure",
    "is-quete",
  );
  el.classList.add(`is-${opts.kind}`);
  if (opts.stop) el.classList.add("is-stop");
  el.setAttribute("aria-hidden", "false");
  void el.offsetWidth;
  el.classList.add("is-vu");
  if (microTimer) clearTimeout(microTimer);
  const duree = opts.ms ?? (opts.stop ? 2400 : 1600);
  microTimer = setTimeout(() => cacheMicro(), duree);
  if (opts.stop && !stopBranche) {
    stopBranche = true;
    el.addEventListener("click", () => cacheMicro());
  }
}

export function cacheToast(): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  $("toast").classList.add("hidden");
}

export function montreToast(titre: string, quoi = "", ms = 2200): void {
  $("toastTitre").textContent = titre;
  $("toastQuoi").textContent = quoi;
  $("toastQuoi").classList.toggle("hidden", !quoi);
  const el = $("toast");
  el.classList.remove("hidden");
  void el.offsetWidth;
  el.classList.add("is-vu");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-vu");
    cacheToast();
  }, ms);
}

export function cachePastille(): void {
  if (pastilleTimer) clearTimeout(pastilleTimer);
  pastilleTimer = null;
  $("pastille").classList.add("hidden");
}

/**
 * Pastille RECORD DÉPASSÉ — 900 ms, hors de la scène.
 *
 * Le pied annonce déjà le dépassement dans sa case. Celle-ci est le flash
 * que la maquette pose dans la gouttière : le champ ne bouge pas.
 */
export function montrePastille(titre: string, note: string): void {
  $("pastilleScore").textContent = titre;
  $("pastilleNote").textContent = note;
  const el = $("pastille");
  el.classList.remove("hidden");
  void el.offsetWidth;
  el.classList.add("is-vu");
  if (pastilleTimer) clearTimeout(pastilleTimer);
  pastilleTimer = setTimeout(() => {
    el.classList.remove("is-vu");
    cachePastille();
  }, 900);
}
