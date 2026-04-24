FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

# ── Sistema base ─────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    xvfb x11vnc novnc websockify \
    ffmpeg supervisor curl wget gnupg xdotool tzdata \
    --no-install-recommends && \
    ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime && \
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get install -y ./google-chrome-stable_current_amd64.deb && \
    rm google-chrome-stable_current_amd64.deb && \
    rm -rf /var/lib/apt/lists/*

# ── Node.js 22 ───────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# ── MediaMTX ─────────────────────────────────────────────────────────────────
ARG MEDIAMTX_VERSION=1.17.1
RUN wget -q "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz" -O /tmp/mediamtx.tar.gz && \
    tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin mediamtx && \
    rm /tmp/mediamtx.tar.gz

# ── Next.js build ────────────────────────────────────────────────────────────
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY next.config.ts tsconfig.json postcss.config.mjs ./
RUN npm run build

# ── Montar app standalone ────────────────────────────────────────────────────
RUN mkdir -p /app/.next && \
    cp -r .next/standalone/. /app/ && \
    cp -r .next/static /app/.next/static && \
    mkdir -p /app/public && \
    (cp -r public/. /app/public/ 2>/dev/null || true)

# ── Configs e scripts ────────────────────────────────────────────────────────
COPY config/supervisord.conf /etc/supervisor/supervisord.conf
COPY config/mediamtx.yml /etc/mediamtx.yml
COPY scripts/ /opt/scripts/
RUN chmod +x /opt/scripts/*.sh

# ── Entrypoint ───────────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/app/data"]
EXPOSE 3000 1935 8888 6081

CMD ["/entrypoint.sh"]