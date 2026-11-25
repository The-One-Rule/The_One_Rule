# Audit de cohérence UI/UX — 25/11/2026

> Carte du kanban « UI/UX : revoir le site pour le rendre cohérent ». La carte
> est une direction ; cet audit en fait une liste, **mesurée** et non jugée à
> l'œil (CLAUDE.md §2 : une capture d'écran ment sur les positions).

## Méthode

Chrome sans affichage (`playwright-core`, Chrome du système), serveur de dev,
**10 écrans** (accueil, SOLO, cartes, classement, amis, réglages, profil, entrée
multi, boutique, brief d'entraînement) × **2 formats** (375 × 812, 1280 × 800) ×
**jour et nuit** — 40 relevés. Animations neutralisées avant chaque mesure.

Pour chaque élément visible de l'écran, de la barre haute et de la barre basse :

- **contraste** du texte contre son fond EFFECTIF (fonds translucides composés,
  `color(srgb …)` lu en 0-1 — le piège du §12) ; seuil 3:1 ;
- **débordement** du TEXTE hors de sa boîte (`Range`, pas la boîte seule) ;
- **cibles tactiles** sous 40 px au téléphone ;
- **taille** de texte sous le plancher de 11 px ;
- **défilement horizontal** de la page ;
- **inventaire** des boutons et des titres d'écran (police, taille, graisse,
  arrondi, trait) pour voir ce qui devrait se ressembler et ne se ressemble pas.

## Résultats

| Mesure | Avant | Après |
|---|---|---|
| Débordements de texte | 0 | 0 |
| Défilement horizontal | 0 | 0 |
| Cibles < 40 px au téléphone | 0 | 0 |
| Texte < 11 px | 0 | 0 |
| Contraste < 3:1 (hors censure et décor) | 1 | **0** |
| Titres d'écran hors de l'échelle commune | 3 | 1 (voulu) |

### Corrigé

- **« SANS CODE »** (entrée multi, PARTIE RAPIDE) : 2,76:1 la nuit — le violet
  d'action `#7c52ff` sur le lilas `#342a5c`. Passé à `--signal-pale`, le même
  violet réglé pour se lire sur fond : 5,47:1 le jour, 5,96:1 la nuit.
- **Titres de BOUTIQUE et d'AMIS** : figés à 32 et 34 px, quand les autres
  titres d'écran suivent `clamp(30px, 5.5vw, 46px)` (30 au téléphone, 46 au
  bureau). Alignés.

### Écarté, avec la raison

- **168 alertes de contraste sont la CENSURE voulue** : les « — — — » et « ? »
  des règles et cartes pas encore rencontrées (§6 n°7). Elles doivent être
  illisibles.
- **Le « ● » de l'icône de pièce** (1,12:1) : c'est le centre doré d'un disque
  jaune, décoratif et `aria-hidden` — pas du texte.
- **Des boutons « en Arial »** dans l'inventaire (interrupteurs des réglages,
  cartes de SOLO) : c'est la police du `<button>` CONTENEUR, qui n'a pas de
  texte propre. Vérifié élément par élément : tout le texte lu est en Fredoka
  (titres, interrupteurs) ou Nunito (descriptions). Faux positif de l'outil.
- **Le titre du CLASSEMENT reste à 30 px au bureau** : valeur relevée sur la
  maquette (« vue leader »), où le titre cède la place au record en 76 px.
  Un parti pris de hiérarchie, pas un oubli.

## Ce qui reste — des directions, pas des correctifs

1. **35 couleurs écrites en dur dans `src/theme.css`** hors des blocs de
   jetons — surtout le violet et le blanc des boutons d'action (`#7d55ff`,
   `#5a2de6`, `#fff`) et le jaune de la pièce (`#ffd23f`). La mémoire (§7)
   l'interdit : une couleur en dur ne change pas la nuit. Aucune ne fait
   tomber le contraste aujourd'hui (mesuré), mais chacune est une valeur qui
   divergera au prochain réglage du thème. À ramener en jetons, écran par
   écran, en remesurant jour et nuit.
2. **Le salon couché (812 × 375)** : LANCER est sous la ligne de flottaison
   (y 1063 pour 375 de haut), et la rangée CONSIGNES l'éloigne de 90 px. Il
   faut défiler pour lancer. Le téléphone couché est rare en salon, mais c'est
   le bouton qui compte.
3. **Les coins d'un carré dépassent le cercle de clic** (1,24 r pour 1,22 r)
   dans tous les styles : environ 0,3 px au téléphone. Toucher au clic relève
   de §6 n°3 — à mesurer en jeu avant d'y toucher.
4. **Ce que l'outil ne voit pas** : l'alignement et l'espacement entre écrans
   (marges, rythme vertical), la cohérence des libellés (« JOUER », « J'Y
   VAIS », « COMMENCER » pour des gestes voisins), et tout ce qui se passe EN
   PARTIE. Ce sont les prochains relevés à écrire ; le script de cet audit est
   la base.
