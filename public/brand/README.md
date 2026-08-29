# The One Rule — logos

## Le signe
Un panneau d'interdiction reconstruit avec le vocabulaire du jeu : **le cadre est la règle**,
**le disque est une pièce**, **la barre est le refus**. Le disque est la seule chose que
l'accent touche — jamais la barre, jamais une pièce jouable.

## Fichiers

    mark/tor-mark.svg                 signe seul, fond transparent (usage par défaut, fond sombre)
    mark/tor-mark-on-dark.svg         signe sur #161826, prêt à poser
    mark/tor-mark-on-light.svg        signe pour fond clair
    mark/tor-mark-mono.svg            une seule couleur via currentColor (hérite du texte)
    mark/tor-mark-mono-light.svg      aplat clair — gravure, sérigraphie, fax
    mark/tor-mark-mono-dark.svg       aplat sombre
    mark/tor-badge.svg                pastille pleine — avatar, app icon, sticker
    favicon/favicon.svg               32 px, traits épaissis pour rester lisible à 16 px
    lockup/tor-lockup-horizontal*.svg signe + nom, la variante à utiliser en en-tête
    lockup/tor-lockup-vertical*.svg   signe + nom empilés, pour formats étroits ou carrés
    wordmark/tor-wordmark*.svg        le nom seul
    tokens.json                       couleurs, typo, géométrie et interdits, lisibles par script

## Couleurs

    fond      #161826
    encre     #161826
    papier    #efeae0
    accent    #9184d9   (le disque, et rien d'autre)

## Géométrie
viewBox `0 0 96 96`. Cadre encart 6, rayon 18, trait 6. Disque r=19 centré.
Barre de (16,80) à (80,16), trait 6. Toute mise à l'échelle est proportionnelle :
ne redessine pas le trait, scale le SVG.

## Zone de respect
La moitié du côté du cadre — 42 unités sur 96 — sur les quatre bords. Rien n'y entre.

## Taille minimale
Signe : 24 px. En dessous, utilise `favicon/favicon.svg`.
Lockup horizontal : 96 px de large. En dessous, passe au signe seul.

## Interdits
Remplir le cadre d'accent. Incliner ou faire tourner le signe. Ajouter une ombre portée.
Recolorer la barre. Étirer le lockup de façon non uniforme.

## Note pour Claude Code
Les lockups et le wordmark utilisent `<text>` avec **Inter 600** : ils ont besoin de la
police pour rendre correctement. Charge Inter dans la page, ou vectorise le texte
(`resvg`, Figma « Outline stroke », `inkscape --export-text-to-path`) avant de livrer un
asset autonome. Le signe seul et le favicon n'ont aucune dépendance.
