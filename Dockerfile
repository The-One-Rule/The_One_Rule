# Serveur de salons WebSocket — The One Rule
#
# Image unique, sans étape de compilation : le serveur exécute le TypeScript
# directement via tsx. Le moteur de jeu est partagé avec le front (src/engine/),
# donc compiler séparément dupliquerait la source de vérité pour zéro bénéfice —
# le coût est de quelques centaines de ms, payé une fois au boot d'une instance
# longue durée.
#
# C'est pour cette raison que `tsx` est une dépendance de PRODUCTION dans
# package.json : ici, ce n'est pas un outil de développement, c'est le runtime.

FROM node:22-slim

WORKDIR /app

# Les dépendances d'abord : cette couche ne se reconstruit que si le manifeste
# change, pas à chaque modification de code.
#
# --omit=dev : ni vite, ni vitest, ni typescript dans une image de production.
# --ignore-scripts : esbuild, tiré par tsx, résout son binaire depuis le paquet
#   de plateforme @esbuild/linux-x64 ; son script d'installation ne sert à rien
#   ici et télécharger à la construction serait un point de panne en plus.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Uniquement ce dont le serveur a besoin — le front est déployé ailleurs.
# src/engine pour rejouer exactement les mêmes scènes que le client,
# src/net pour glyphFor() : le signe d'un joueur est calculé côté serveur.
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY src/engine ./src/engine
COPY src/net ./src/net

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Rien à écrire sur le disque : les salons vivent en mémoire.
USER node

# Node est PID 1, sans npx ni shell intermédiaire : SIGTERM arrive donc
# directement au gestionnaire d'arrêt de server/index.ts, qui ferme les sockets
# avec un code 1001 au lieu de les laisser mourir sans un mot.
CMD ["node", "--import", "tsx", "server/index.ts"]
