# 0008 — Tout ce qui voyage est négocié ; Fly d'abord

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; négociation en place depuis le
  double appui (25/09/2026), ordre de déploiement fixé après la panne du
  30/09/2026
- **Décideur** : conception ; ordre confirmé par l'incident

## Contexte

Le front (Vercel) et les salons (Fly) se déploient **séparément**, et un
joueur peut garder ouvert l'onglet de la veille. À tout instant, un client et
le serveur peuvent donc être de versions différentes.

Le 30/09/2026, Vercel servait un client qui envoyait la photo de profil
(4-8 Ko) à un serveur Fly resté sur une version plafonnée à 4 Ko : chaque
joueur avec une photo tuait tous les salons en se connectant.

## Décision

1. **Toute évolution de ce qui voyage est négociée.** Un champ neuf est
   annoncé dans `hello` ; le serveur retient le **minimum** commun (pool
   `clavier`, `consignes`, `reprise`…), le **fige au lancement** et le
   transmet dans `match_start`. **Absent vaut non** : un client ou un serveur
   plus ancien retombe sur ce qu'il sait faire. `PROTOCOL_VERSION` ne bouge
   que pour une rupture.
2. **Fly d'abord, Vercel ensuite** dès qu'une évolution touche le fil.
3. Tout nouveau message plus gros qu'un chat relève `maxPayload` du serveur.

## Conséquences

- Les quatre combinaisons (ancien/nouveau × client/serveur) doivent tomber sur
  un comportement que les deux côtés connaissent — chaque négociation a son
  test, et l'e2e en exerce plusieurs.
- `multi_manche_illisible` mesure en production un client qui ne sait pas
  reconstruire une manche : toute valeur non nulle veut dire « redéployer
  celui des deux qui est en retard ».
- Le flux de retour arrière des salons le rappelle : ramener les salons sans
  ramener le front qui attend le nouveau protocole recrée l'incident à
  l'envers.

## Références

`CLAUDE.md` §4 (pool par salon), §9, §12 « Les salons plantaient en boucle »,
« Le double appui » ; `shared/protocol.ts`.
