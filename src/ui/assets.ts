/**
 * L'URL d'un fichier de `public/`.
 *
 * Vite réécrit les URL d'`index.html` d'après `base` (ici `./`) ; il ne touche
 * pas aux chaînes d'un composant. Cette fonction refait la même chose : le site
 * reste servable sous un sous-chemin, comme l'annonçait l'ancien `index.html`.
 */
export const asset = (chemin: string): string => import.meta.env.BASE_URL + chemin;
