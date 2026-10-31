FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

ADD https://codeload.github.com/payloadcms/payload/tar.gz/refs/tags/v3.82.1 /tmp/payload.tar.gz
RUN mkdir -p /opt/payload \
    && tar -xzf /tmp/payload.tar.gz --strip-components=1 -C /opt/payload \
    && rm /tmp/payload.tar.gz
WORKDIR /opt/payload/templates/with-cloudflare-d1
RUN pnpm install --ignore-workspace

COPY entrypoint.sh /usr/local/bin/nomikos-payload-entrypoint
RUN chmod 0755 /usr/local/bin/nomikos-payload-entrypoint

EXPOSE 3100
ENTRYPOINT ["/usr/local/bin/nomikos-payload-entrypoint"]
