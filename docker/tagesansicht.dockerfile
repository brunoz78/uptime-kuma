# Thin image: the official Uptime Kuma image of the same version,
# with the changed server files and a rebuilt frontend laid on top.
ARG UPSTREAM_VERSION=2.5.11

############################################
# Build the frontend (independent of the target platform)
############################################
FROM --platform=$BUILDPLATFORM node:22-bookworm AS build
WORKDIR /src

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY .npmrc package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

############################################
# Final image
############################################
FROM louislam/uptime-kuma:${UPSTREAM_VERSION}

LABEL org.opencontainers.image.source="https://github.com/brunoz78/uptime-kuma"
LABEL org.opencontainers.image.description="Uptime Kuma with a daily view on status pages"

RUN rm -rf /app/dist
COPY --chown=node:node --from=build /src/dist /app/dist
COPY --chown=node:node server /app/server
COPY --chown=node:node db /app/db
COPY --chown=node:node src /app/src
