FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace=server
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY server ./server
USER node
WORKDIR /app/server
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:5000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
