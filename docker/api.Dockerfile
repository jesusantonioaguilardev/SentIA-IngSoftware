# API de SentIA + software de monitoreo (se construye desde la carpeta "14 Prototipo")
FROM node:22-alpine

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# msnodesqlv8 es solo para Windows; en Docker se usa el driver tedious (JavaScript puro).
RUN npm ci --omit=optional --omit=dev && npm cache clean --force

COPY server/ ./
COPY monitoreo/ /app/monitoreo/

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/api/ping >/dev/null || exit 1
CMD ["node", "index.js"]
