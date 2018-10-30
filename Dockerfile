# Base node
FROM node:10.9.0-alpine AS base

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
RUN yarn install \
 && yarn cache clean
 
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

EXPOSE 9300

CMD node --max_old_space_size=400 -r esm ./app.js
