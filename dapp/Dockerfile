# Dockerfile para el dapp de NomikOS (Next.js 16) — contexto = ./dapp
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* se leen en BUILD: hay que declarar el ARG para que el
# `args:` de docker compose lo inyecte (sin esto se ignora en silencio).
ARG NEXT_PUBLIC_DEPLOYMENT=""
ENV NEXT_PUBLIC_DEPLOYMENT=$NEXT_PUBLIC_DEPLOYMENT
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/public public
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/node_modules node_modules
ENV NODE_ENV=production
ENV PORT=3000
# NEXT_PUBLIC_DEPLOYMENT lo inyecta docker compose ("docker") — el panel
# lo muestra como «Ejecución local · docker detectada».
EXPOSE 3000
CMD ["npm", "start"]
