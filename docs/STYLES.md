# Créer un style de pièces

> Pour un créateur, un designer, ou la personne qui intègre leur travail.
> Carte du kanban « Catalogue de styles : en faire plus avec des créateurs ».

Un **style** change la façon dont les pièces du terrain sont **dessinées**, et le
sol sur lequel elles reposent. Il s'achète à la boutique avec les pièces gagnées
en jouant. Cinq existent : STICKER (offert), NÉON 150, BONBON 300, PIXEL 450,
CRAIE 600.

Un style **ne change jamais le jeu**. C'est la seule règle, et ce document dit
ce qu'elle veut dire concrètement.

## Ce qu'un style a le droit de toucher

| Libre | Interdit |
|---|---|
| le contour, son épaisseur, sa couleur | la **teinte** de la pièce |
| l'ombre, le reflet, la brillance, le grain | la **forme** (carré, rond, triangle) |
| un arrondi des angles | la **taille** au-delà de la zone cliquable |
| le **sol** du terrain et sa trame | la **position** de la pièce |
| une animation légère (respiration, scintillement) | ce qui dit quelque chose du **verdict** |

Pourquoi chaque interdit :

- **La teinte** est le mot de la consigne (« CLIQUE LE ROUGE »). Les quatre
  teintes — garance `#F74058`, azur `#237EF6`, jade `#40F7C0`, ambre `#F5B214` —
  sont calibrées pour rester distinctes en daltonisme, **au chiffre près**. Un
  style peut les éclairer d'un halo, les poser sur un fond, les border : il
  doit les PEINDRE telles quelles.
- **La forme** est le mot de la règle (« jamais de triangle »). Un rond doit
  rester un rond au premier coup d'œil, à 34 px de diamètre sur un téléphone.
- **La taille** : le jeu juge le clic sur un CERCLE de 1,22 × le rayon de la
  pièce. Une pièce dessinée plus grosse que cette zone fait cliquer à côté —
  le joueur voit sa pièce sous son doigt et perd quand même. C'est le défaut
  que ce projet tient pour fatal. (Les coins d'un carré dépassent déjà ce
  cercle de 2 % dans tous les styles, maison compris : environ 0,3 px au
  téléphone. C'est la géométrie du jeu, pas une marge à exploiter.)
- **Le verdict** : une pièce piégée ne doit jamais se distinguer des autres.
  Le piège ne se révèle qu'après la mort.

## Ce que le jeu vérifie tout seul

`tests/styles-contrat.test.ts` passe sur **chaque** style du catalogue, donc sur
le vôtre dès qu'il y entre :

1. le **corps** de la pièce — ce qui est peint dans sa teinte, dégradés
   compris — reste sous **1,3 × le rayon**, et tout le dessin, ombre portée
   comprise, sous **1,5 ×** ; pour les trois formes, les quatre teintes,
   couché et debout (au téléphone le terrain tourne). Ces bornes sont celles
   du style maison mesuré (1,24 au coin du carré, 1,43 pour son ombre) ;
2. chaque pièce est peinte dans sa teinte calibrée ;
3. la **trame du mode MOTIFS** (le second canal des daltoniens : hachures,
   points, barres) est posée par-dessus — sinon acheter votre style la
   retirerait à ceux qui en ont besoin ;
4. le style a son prix (croissant dans le catalogue), son terrain, son nom et
   sa phrase en français et en anglais.

Si l'un tombe, le style n'entre pas. Ce n'est pas un jugement de goût.

## Ce qu'il faut livrer

Pour un designer, le plus simple est une **planche** par style :

- les trois formes, dans les quatre teintes, à 120 px et à 34 px (la taille
  téléphone) ;
- le sol du terrain, avec sa trame éventuelle ;
- une version sur fond clair et une sur fond sombre si le style y tient ;
- un nom court (8 lettres au plus, il s'affiche en capitales) et une phrase
  d'une ligne, en français et en anglais.

Le style est ensuite **dessiné en code** (canvas 2D), pas importé en images :
une image ne tournerait pas avec le terrain debout, ne recevrait pas la trame
des daltoniens, et pèserait sur le chargement de tous les joueurs.

## Comment on l'intègre

1. `src/game/boutique.ts` — l'identifiant dans `SkinId`, et le prix dans
   `SKINS` (les prix montent ; un chapitre du parcours parfait rapporte 200).
2. `src/render/skins.ts` — son sol dans `TERRAINS`, et sa branche dans
   `dessinePiece`. Elle reçoit la teinte (`TEINTES[p.color]`), le rayon à
   dessiner, l'orientation, et la trame à poser en dernier (`poseTrame`).
3. `src/i18n-parcours.ts` — `skinNom` et `skinDesc`, dans les deux langues.
4. `npm run lint`, `npx tsc --noEmit`, `npx vitest run` — le contrat ci-dessus
   doit passer.
5. Une PR, avec la planche en pièce jointe et une capture **mesurée** du
   terrain au téléphone (375 × 812) et au bureau.

## Ce qui n'existe pas encore

- **Le crédit du créateur** : la boutique n'affiche pas d'auteur. Une ligne
  « par … » sous la phrase serait simple à ajouter quand le premier style
  extérieur arrivera.
- **La rémunération** : les pièces ne s'achètent pas, et la carte « Modèle
  économique » n'est pas tranchée. Rien ici n'engage là-dessus.
