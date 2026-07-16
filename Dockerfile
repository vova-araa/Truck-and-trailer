# --- Build-fase: bouwt de frontend met Vite ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_-variabelen worden tijdens de build ingebakken. Geef ze mee met
# --build-arg (of via render.yaml / docker-compose). De ARG's worden naar ENV
# gepromoveerd zodat de Vite-build ze via import.meta.env oppikt.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# --- Run-fase: kleine image die alleen de server + dist draait ---
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 8787
CMD ["node", "server/index.js"]
