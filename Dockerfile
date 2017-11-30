# Base node
FROM node:8.9.1-alpine AS base

WORKDIR /app
COPY package.json /app

#
# ---- Dependencies ----
FROM base AS dependencies
# install only production node packages
RUN yarn install --production
# mv production node_modules aside
RUN mv node_modules /root/prod_node_modules
# install ALL node_modules, including 'devDependencies'
RUN yarn install
 
#
# ---- Test ----
# run linters
FROM dependencies AS test
COPY . /app
RUN yarn lint
 
#
# ---- Release ----
FROM base AS release
# copy production node_modules
COPY --from=dependencies /root/prod_node_modules ./node_modules
COPY . /app

USER node

EXPOSE 3001

CMD node ./app.js
