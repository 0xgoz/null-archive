FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY vite.config.js ./
COPY src/ ./src/

RUN npm run build

FROM nginx:alpine

# Copy the generated site from the named build stage.
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Document the port on which Nginx listens.
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
