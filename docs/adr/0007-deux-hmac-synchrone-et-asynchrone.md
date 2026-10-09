# 0007 — Deux implémentations HMAC, un seul noyau

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine à la
  livraison des comptes (septembre 2026)
- **Décideur** : conception

## Contexte

Le même jeton de compte est vérifié à deux endroits :

- sur **Fly**, dans le `hello` du serveur de salons, traité dans un `switch`
  **synchrone** : une vérification asynchrone ferait entrer le joueur sous son
  identité anonyme, puis changerait son nom sous les yeux des autres une
  milliseconde plus tard ;
- sur l'**edge Vercel**, où seul `crypto.subtle` existe — **asynchrone**.

`node:crypto` sait signer sans promesse ; `crypto.subtle`, non.

## Décision

Le noyau JWT (encodage, revendications, péremption) est écrit **une fois**,
pur, dans `shared/jeton.ts`, et reçoit sa primitive HMAC de l'appelant :
`server/jeton.ts` (synchrone, `node:crypto`) et `api/_jeton.ts`
(asynchrone, `crypto.subtle`).

## Conséquences

- Deux chemins qui pourraient diverger en silence — symptôme : « le multi ne
  me reconnaît pas », indébogable. **Gardé par** `tests/jeton.test.ts`, qui
  signe avec l'un et vérifie avec l'autre dans les deux sens, plus une
  comparaison octet pour octet.
- Le serveur de salons n'a pas de base : il ne peut pas vérifier une
  révocation. La péremption du jeton (24 h) EST la fenêtre de révocation en
  salon — assumé et borné (`CLAUDE.md` §9).

## Références

`CLAUDE.md` §12 « Comptes optionnels » ; `shared/jeton.ts`,
`server/jeton.ts`, `api/_jeton.ts`.
