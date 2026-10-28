FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts
COPY client client
ARG VITE_API_URL=http://localhost:5000/api/v1
ARG VITE_SOCKET_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build --workspace=client
FROM nginxinc/nginx-unprivileged:alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost:8080/ || exit 1
