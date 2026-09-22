FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY src/ ./src/

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]