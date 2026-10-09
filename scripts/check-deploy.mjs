#!/usr/bin/env node
/**
 * Vérifie qu'un déploiement mesure vraiment.
 *
 *   node scripts/check-deploy.mjs https://ton-app.vercel.app
 *
 * Ce script existe pour une seule panne, mais c'est la plus coûteuse de la
 * chaîne : `VITE_COLLECT_URL` est lu par Vite **à la compilation**. La poser
 * dans Vercel sans redéployer ne fait rien, et rien n'a l'air cassé — le jeu
 * tourne, le bandeau de mesure ne s'affiche pas, aucune requête ne part, aucune
 * erreur nulle part. Ça ne se découvre qu'en cherchant les chiffres, une
 * semaine plus tard, quand la semaine est perdue.
 *
 * On lit donc le bundle servi en production et on regarde si l'URL du
 * collecteur y a bien été inlinée. Lecture seule : rien n'est envoyé, aucun
 * événement synthétique n'est injecté — polluer la collecte pour vérifier la
 * collecte fausserait le D1 qu'on cherche à mesurer.
 */

const base = process.argv[2]?.replace(/\/+$/, "");
if (!base) {
  console.error("usage : node scripts/check-deploy.mjs https://ton-app.vercel.app");
  process.exit(2);
}

/*
 * Une PRÉVERSION Vercel peut être protégée (« Deployment Protection ») : sans
 * jeton elle répond 401, et le vérificateur échouerait sur un déploiement
 * sain. `VERCEL_AUTOMATION_BYPASS_SECRET`, s'il est posé, passe la porte —
 * c'est le mécanisme que Vercel prévoit pour l'automatisation. Absent, rien
 * ne change : la production n'est pas protégée.
 */
const contournement = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const entetes = contournement ? { "x-vercel-protection-bypass": contournement } : {};

const get = async (url) => {
  const res = await fetch(url, { redirect: "follow", headers: entetes });
  if (!res.ok) {
    console.error(`✗ ${url} a répondu ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  return res.text();
};

const html = await get(base + "/");

// Vite émet un seul module d'entrée. On prend tous les scripts et on les
// concatène plutôt que de deviner lequel porte la mesure : un découpage en
// morceaux ferait échouer un test qui cherche dans le mauvais fichier.
const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
if (!srcs.length) {
  console.error("✗ aucun <script src> dans la page : ce n'est pas un build Vite servi.");
  process.exit(1);
}
const bundles = await Promise.all(srcs.map((s) => get(new URL(s, base + "/").href)));
const code = bundles.join("\n");

/*
 * Une variable d'environnement peut arriver SOUILLÉE : espace, retour ligne,
 * ou BOM UTF-8 collé devant — Windows PowerShell en ajoute un quand il encode
 * une valeur passée par un tube.
 *
 * C'est arrivé, et ce test-ci passait quand même : il cherchait la sous-chaîne
 * `/api/collect`, que "﻿/api/collect" contient. L'endpoint réel était
 * `/%EF%BB%BF/api/collect`, chaque envoi partait en 404, et le vérificateur
 * annonçait un déploiement sain. On regarde donc le caractère qui PRÉCÈDE.
 */
const SALES = /[﻿​ \s]/;
const iCollect = code.indexOf("/api/collect");
const avantCollect = iCollect > 0 ? code[iCollect - 1] : "";
const collectSouille = iCollect >= 0 && SALES.test(avantCollect);

/*
 * `cleanEnv()` retire BOM et blancs À LA LECTURE, côté client. Une valeur
 * souillée n'est donc plus une panne — mais elle reste une saleté qu'on veut
 * voir et nettoyer à la source. On la signale sans faire échouer : un
 * vérificateur qui crie sur un état que le code gère apprend à être ignoré,
 * et le jour où il criera pour de bon, personne ne l'écoutera.
 */
const checks = [
  {
    nom: "collecteur branché (VITE_COLLECT_URL)",
    ok: iCollect >= 0,
    quoi:
      "Le bundle ne contient pas l'URL du collecteur : la mesure est INERTE.\n" +
      "     Poser VITE_COLLECT_URL=/api/collect dans Vercel, puis REDÉPLOYER\n" +
      "     (la reposer sans rebuild ne change rien).",
    note: collectSouille
      ? "valeur souillée par un caractère invisible " +
        `(U+${avantCollect.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) ` +
        "— neutralisé\n" +
        "     à l'exécution par cleanEnv(), mais à reposer proprement quand tu y toucheras."
      : null,
  },
  {
    nom: "multijoueur branché (VITE_WS_URL)",
    ok: /wss:\/\//.test(code),
    quoi:
      "Aucune URL wss:// dans le bundle : le bouton MULTIJOUEUR sera masqué.\n" +
      "     Normal si tu déploies le solo seul. Sinon : VITE_WS_URL, puis redéployer.\n" +
      "     Attention, wss:// et jamais ws:// depuis une page https.",
  },
];

// Le collecteur doit répondre même sans stockage : c'est ce qui distingue
// « la fonction n'est pas déployée » de « la fonction tourne sans Redis ».
//
// Sans objet en local : `vite preview` sert le repli SPA sur tout chemin
// inconnu et répond donc 200, faute de runtime de fonction. On n'exige ce
// test que hors localhost, sinon il crie au loup à chaque essai local.
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base);
let edge = null;
try {
  const res = await fetch(base + "/api/collect", { method: "GET", headers: entetes });
  edge = res.status;
} catch {
  /* injoignable : traité ci-dessous */
}
checks.push({
  nom: "fonction /api/collect déployée",
  // 405 = la fonction est là et refuse GET, ce qu'elle doit faire.
  ok: local || edge === 405,
  ignore: local,
  quoi:
    `GET /api/collect a répondu ${edge ?? "rien"} au lieu de 405.\n` +
    "     405 est la bonne réponse : la fonction existe et refuse GET.\n" +
    "     404 signifie que api/ n'a pas été déployé.",
});

console.log(`\nVérification de ${base}\n`);
let dur = false;
for (const c of checks) {
  const etat = c.ignore ? "PASSÉ" : c.ok ? "OK  " : "ÉCHEC";
  console.log(`  ${etat}  ${c.nom}`);
  if (c.ignore) {
    console.log("     non testable en local : pas de runtime de fonction sous vite preview");
  } else if (!c.ok) {
    console.log(`     ${c.quoi}`);
    if (c.nom.startsWith("collecteur")) dur = true;
  } else if (c.note) {
    console.log(`     NOTE · ${c.note}`);
  }
}

console.log(
  "\n  Ceci ne prouve que le CÂBLAGE. Que le stockage retienne vraiment se\n" +
    "  vérifie en jouant un run sur la production, puis :\n" +
    "      node scripts/pull.mjs | node scripts/report.mjs\n" +
    "  Sans Upstash, api/collect.ts retombe sur console.log : la fonction répond\n" +
    "  204, tout a l'air normal, et il n'y aura jamais de D7.\n",
);

process.exit(dur ? 1 : 0);
