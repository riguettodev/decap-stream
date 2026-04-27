# ── Stage 1: Next.js build ───────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY src/ ./src/
COPY public/ ./public/
COPY next.config.ts tsconfig.json postcss.config.mjs ./
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

ARG MEDIAMTX_VERSION=1.17.1

# Cache mounts: .deb baixados e índice de pacotes ficam no cache do BuildKit (não entram na imagem)
# /var/lib/apt/lists: índice apt (apt-get update) — seguro cachear
# /var/cache/apt: .deb baixados — seguro cachear
# /var/lib/apt inteiro NÃO é cacheado: extended_states rastreia auto/manual e corromperia o estado entre builds
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb x11vnc novnc websockify \
        ffmpeg supervisor xdotool tzdata \
        chromium \
        curl gnupg \
    && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime \
    \
    # Node.js 22
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    \
    # MediaMTX
    && curl -fsSL "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz" \
        -o /tmp/mediamtx.tar.gz \
    && tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin mediamtx \
    \
    # Remove apenas as ferramentas de build — qualquer remoção além disso causa cascata em deps do chromium/novnc
    && apt-get remove -y curl gnupg \
    && apt-get autoremove -y \
    && apt-get clean \
    && find /usr/lib/chromium/locales -name '*.pak' ! -name 'en-US.pak' -delete 2>/dev/null || true \
    \
    # Chromium managed policy: disable password manager, autofill and translate
    && mkdir -p /etc/chromium/policies/managed \
    && printf '{"PasswordManagerEnabled":false,"AutofillAddressEnabled":false,"AutofillCreditCardEnabled":false,"TranslateEnabled":false}' \
        > /etc/chromium/policies/managed/policy.json \
    \
    && rm -rf \
        /var/lib/apt/lists/* \
        /tmp/* /var/tmp/* \
        /usr/share/doc \
        /usr/share/man \
        /usr/share/locale \
        /usr/lib/locale

COPY --from=builder /build/.next/standalone/ /app/
COPY --from=builder /build/.next/static/ /app/.next/static/
COPY --from=builder /build/public/ /app/public/

COPY config/supervisord.conf /etc/supervisor/supervisord.conf
COPY config/mediamtx.yml /etc/mediamtx.yml
COPY scripts/ /opt/scripts/
COPY docker/server.mjs /opt/server.mjs
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/scripts/*.sh /entrypoint.sh

VOLUME ["/app/data"]
EXPOSE 3000 1935 8888 6080

CMD ["/entrypoint.sh"]
