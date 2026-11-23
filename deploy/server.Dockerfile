# Builds the staff website, then runs the server (which serves it).
FROM node:24-alpine AS web
WORKDIR /app
COPY shared ./shared
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=web /app/web/dist ./web/dist
# Photos live in /data (a volume); the server runs as the unprivileged node user.
RUN mkdir -p /data && chown node:node /data
WORKDIR /app/server
USER node
EXPOSE 8787
CMD ["node", "src/main.ts"]
