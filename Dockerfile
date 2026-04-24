FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY index.html styles.css app.js server.js README.md ./

EXPOSE 4444
CMD ["npm", "start"]
