FROM node:alpine

WORKDIR /app/command-line-data-tools
COPY ../command-line-data-tools .

WORKDIR /app/data-export-service-app
COPY package.json /app/data-export-service-app
RUN yarn install
COPY . /app/data-export-service-app

USER NODE

EXPOSE 3001

CMD node ./app.js
