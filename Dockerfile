### Stage 0 - Base image
FROM node:12-alpine as base
ARG npm_token
ENV NEXUS_TOKEN=$npm_token
WORKDIR /app
RUN apk --no-cache update && \
    apk --no-cache upgrade && \
    apk add --no-cache --virtual .build-dependencies python make g++ && \
    npm install -g npm@latest && \
    mkdir -p node_modules && chown -R node:node .


### Stage 1 - Create cached `node_modules`
# Only rebuild layer if `package.json` has changed
FROM base as dependencies
COPY package.json .
COPY package-lock.json .
COPY .npmrc .
RUN \
  # Build and separate all dependancies required for production
  npm install --cache /tmp/npm-cache --production && cp -R node_modules production_node_modules \
  # Build all modules, including `devDependencies`
  && npm install --cache /tmp/npm-cache \
  && rm -rf /tmp/npm-cache


### Stage 4 - Serve production-ready release
FROM base as production
ENV NODE_ENV=production
ENV NODE_OPTIONS='--max-old-space-size=4096'
RUN apk del .build-dependencies
# Copy only `node_modules` needed to run the server
COPY --from=dependencies /app/production_node_modules ./node_modules
# @godaddy/terminus has an example folder with a package.json file
# This file refers to a version of Mongoose with CVE that makes aquascanner fail
# We just remove here this unused example folder
# Almost same for node-gyp
RUN rm -rf /app/node_modules/@godaddy/terminus/example \
      /usr/local/lib/node_modules/npm/node_modules/node-gyp
# Copy source files
COPY --chown=node:node . .
USER node
EXPOSE 9300
CMD node ./app.js
