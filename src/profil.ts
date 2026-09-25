/**
 * LE PROFIL — la carte de visite et la photo.
 *
 * Elles vivaient dans `multi.ts`, derrière l'écran NOM ET SIGNE. Rapporté par
 * Pierre : « c'est quand on clique sur changer de nom qu'on peut changer sa
 * photo de profil ». Deux défauts dans la même phrase : on ne les TROUVAIT pas,
 * et elles dépendaient d'un module qui devient INERTE sans serveur de salons
 * (`createMulti` rend un objet vide quand `VITE_WS_URL` manque). Un profil ne
 * demande pas de réseau : il est enregistré sur l'appareil, et le salon n'en
 * reçoit qu'une copie.
 *
 * Tout est enregistré DÈS le choix. `surChange` prévient le salon.
 */
import * as P from "./game/progress";
import { ruleById } from "./engine/rules";
import type { OneRule } from "./engine/types";
import { glyphSvg } from "./net/glyph";
import { signeAffiche } from "./compte/revendication";
import { reduitPhoto } from "./render/photo";
import { nomDeRegle, t } from "./i18n";
import { sfx } from "./audio";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let surChange: () => void = () => {};

export function rendProfil(): void {
  const s = P.load();
  const hote = $("idCartes");
  hote.replaceChildren();
  const gagnees = Object.keys(s.encountered)
    .map((id) => ruleById(id))
    .filter((r): r is OneRule => !!r);
  const choix: (OneRule | null)[] = [null, ...gagnees];
  for (const r of choix) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "cartepick__opt" + (r ? "" : " cartepick__opt--aucune");
    opt.setAttribute("role", "radio");
    const pris = (s.profil.carte ?? null) === (r?.id ?? null);
    opt.setAttribute("aria-checked", String(pris));
    opt.setAttribute("aria-label", r ? nomDeRegle(r.id, r.name) : t("carteAucune"));
    if (r) {
      const img = document.createElement("img");
      img.src = `/cartes/${r.id}.png`;
      img.alt = "";
      img.loading = "lazy";
      opt.appendChild(img);
    } else {
      opt.textContent = "—";
    }
    opt.addEventListener("click", () => {
      sfx.ui();
      P.mutate((st) => {
        if (r) st.profil.carte = r.id;
        else delete st.profil.carte;
      });
      surChange();
      rendProfil();
    });
    hote.appendChild(opt);
  }
  const photo = s.profil.photo;
  const apercu = $("idPhotoApercu");
  if (photo) {
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    apercu.replaceChildren(img);
  } else {
    // Le signe AFFICHÉ — celui du compte s'il y en a un, comme la barre haute
    // et les salons : un seul visage d'un écran à l'autre.
    apercu.innerHTML = glyphSvg(signeAffiche(s), 44);
  }
  $("btnPhotoRetirer").classList.toggle("hidden", !photo);
}

/** Branche les deux sélecteurs, une fois. */
export function brancheProfil(quandChange: () => void): void {
  surChange = quandChange;
  $<HTMLInputElement>("idPhotoFichier").addEventListener("change", async (ev) => {
    const champ = ev.currentTarget as HTMLInputElement;
    const fichier = champ.files?.[0];
    champ.value = "";
    if (!fichier) return;
    const photo = await reduitPhoto(fichier);
    const err = $("profilErr");
    if (!photo) {
      err.textContent = t("photoIllisible");
      err.classList.remove("hidden");
      return;
    }
    err.classList.add("hidden");
    P.mutate((st) => {
      st.profil.photo = photo;
    });
    sfx.ui();
    surChange();
    rendProfil();
  });
  $("btnPhotoRetirer").addEventListener("click", () => {
    P.mutate((st) => {
      delete st.profil.photo;
    });
    sfx.ui();
    surChange();
    rendProfil();
  });
}
