/**
 * La configuration de la CLI Prisma (`generate`, `migrate`, `validate`).
 *
 * Deux adresses, et elles ne servent pas aux mêmes choses :
 *
 *   · `DIRECT_URL` — la connexion DIRECTE (Supabase : port 5432, ou le
 *     pooler en mode SESSION). C'est celle des migrations : `migrate deploy`
 *     pose un verrou consultatif et enchaîne du DDL, ce qu'un pooler en mode
 *     transaction ne garantit pas ;
 *   · `DATABASE_URL` — l'adresse des fonctions `api/`, en mode transaction
 *     (port 6543). Elle n'est lue ICI qu'en repli, pour le développement
 *     local où une seule base sert aux deux.
 *
 *   · `SHADOW_DATABASE_URL` — une base JETABLE, que `migrate dev` et
 *     `npm run base:derive` effacent pour y rejouer les migrations. Jamais
 *     celle de production.
 *
 * Aucune n'est exigée : `prisma generate` n'ouvre pas de connexion, et le
 * build Vercel doit passer sans elles. `env()` de `prisma/config` LÈVERAIT
 * sur une variable absente — d'où `process.env`.
 */
import { defineConfig } from "prisma/config";
import { cleanEnv } from "./src/env.js";

const url = cleanEnv(process.env.DIRECT_URL) ?? cleanEnv(process.env.DATABASE_URL);
const fantome = cleanEnv(process.env.SHADOW_DATABASE_URL);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url || fantome
    ? { datasource: { ...(url ? { url } : {}), ...(fantome ? { shadowDatabaseUrl: fantome } : {}) } }
    : {}),
});
