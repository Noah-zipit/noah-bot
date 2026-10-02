# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- run stage ----
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY asset ./asset
# data/, sessions/, logs/, tmp/ are created at runtime.
# Mount a persistent volume at /app/sessions (and /app/data) so the
# WhatsApp login and user database survive restarts/redeploys.
EXPOSE 3000
CMD ["node", "dist/index.js"]
