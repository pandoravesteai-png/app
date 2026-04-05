# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./
COPY --from=build /app/tsconfig.json ./
# Install tsx to run server.ts
RUN npm install -g tsx
ENV NODE_ENV=production
EXPOSE 3000
CMD ["tsx", "server.ts"]
