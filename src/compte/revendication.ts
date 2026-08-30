/**
 * LA revendication — le moment où la progression d'un appareil rejoint un
 * compte.
 *
 * C'est l'endroit le plus dangereux de tout le chantier, pour une raison qui
 * ne se voit pas en le lisant : un bug ici ne casse rien. Il fait rétrécir un
 * carnet ou retomber une série, silencieusement, définitivement, et personne
 * ne s'en aperçoit avant qu'un joueur ne cherche une règle qu'il sait avoir
 * jouée. D'où les deux garde-fous :
 *
 *   · côté serveur, la fusion est une union et un maximum, jamais une
 *     affectation — donc idempotente : la rejouer ne peut rien détruire ;
 *   · côté appareil, elle n'a lieu QU'UNE FOIS, marquée par
 *     `compte.revendiquePar`. Sans ce marquage, se connecter sur le téléphone
 *     d'un ami aspirerait son carnet et sa série dans son propre compte — et
 *     ce cas est banal en playtest, on est plusieurs sur les mêmes appareils.
 *
 * Ce que la revendication n'apporte PAS : les runs déjà joués. Ils n'ont ni
 * journal ni preuve, donc ils ne peuvent pas devenir des performances
 * vérifiées. Seuls les AGRÉGATS montent — carnet, série, records — et ils
 * restent cantonnés à ce que le joueur se raconte à lui-même. Importer les
 * runs ferait démarrer chaque historique sur des faits invérifiables, dont un
 * futur classement hériterait.
 */

import * as P from "../game/progress";
import { glyphIndex, glyphVariant, glyphFromIndex } from "../net/glyph";
import { compte, revendique } from "./index";
import type { Moi } from "./index";
import type { Glyph } from "../../shared/protocol";

export type Issue =
  /** Pas connecté : rien à faire, et c'est un état normal. */
  | { quoi: "anonyme" }
  /** Cet appareil a déjà donné sa progression — à ce compte ou à un autre. */
  | { quoi: "deja"; a: string }
  /** Le serveur n'a pas répondu. On réessaiera : rien n'est perdu. */
  | { quoi: "echec" }
  | { quoi: "faite"; moi: Moi };

/**
 * Le signe que porte cet appareil, en index canonique.
 *
 * On convertit la variante locale plutôt que d'en tirer un nouveau : le joueur
 * doit retrouver EXACTEMENT le signe qu'il portait déjà. Créer un compte ne
 * doit rien changer de visible — sinon c'est une punition déguisée.
 */
export function glypheLocal(s: P.Save): number {
  if (s.compte.glyphe !== null) return s.compte.glyphe;
  return glyphIndex(glyphVariant(s.anonId, s.multi.glyph));
}

/** Le signe à afficher, compte ou pas. */
export function signeAffiche(s: P.Save): Glyph {
  return s.compte.glyphe !== null
    ? glyphFromIndex(s.compte.glyphe)
    : glyphVariant(s.anonId, s.multi.glyph);
}

/**
 * Revendique si c'est nécessaire et possible. Ne lève jamais.
 *
 * Appelée après une connexion réussie, et à l'ouverture — un aller-retour
 * échoué ne doit pas coûter sa progression à quelqu'un, donc on repasse.
 */
export async function revendiqueSiNecessaire(): Promise<Issue> {
  const c = compte();
  if (!c) return { quoi: "anonyme" };

  const avant = P.load();
  if (avant.compte.revendiquePar) {
    // Y compris quand c'est un AUTRE compte : cet appareil a déjà donné ce
    // qu'il avait, et il ne le donnera pas deux fois.
    return { quoi: "deja", a: avant.compte.revendiquePar };
  }

  const moi = await revendique({
    agregats: P.agregatsDe(avant),
    // Le compte tout neuf n'a ni nom ni signe : il prend ceux que le joueur
    // porte déjà en multijoueur. Le serveur ignore ces deux champs si le
    // compte est déjà nommé — un second appareil ne renomme personne.
    pseudo: avant.ranked.name,
    glyphe: glypheLocal(avant),
  });
  if (!moi) return { quoi: "echec" };

  appliqueMoi(moi, c.id);
  return { quoi: "faite", moi };
}

/**
 * Réinjecte ce que le compte sait dans la sauvegarde locale.
 *
 * Union et maximum de bout en bout : l'appareil a pu continuer de jouer
 * pendant l'aller-retour, et rien de ce qu'il a fait entre-temps ne doit
 * disparaître.
 */
export function appliqueMoi(moi: Moi, idCompte: string): void {
  P.mutate((s) => {
    P.appliqueAgregats(s, moi.agregats);
    s.compte.revendiquePar = idCompte;
    s.compte.glyphe = moi.glyphe;
    // Le nom du compte fait autorité : c'est celui que les salons annoncent,
    // puisque le serveur le lit dans le jeton.
    if (moi.pseudo) s.ranked.name = moi.pseudo;
  });
}

/**
 * Synchronise sans revendiquer.
 *
 * Pour un appareil déjà rattaché : on redescend ce que le compte sait, sans
 * refaire monter la progression locale. C'est ce qui fait qu'un deuxième
 * appareil retrouve le carnet du premier.
 */
export function appliqueSiConnu(moi: Moi): void {
  const c = compte();
  if (!c) return;
  appliqueMoi(moi, c.id);
}
