# Layanan render Video Belajar. Build dari akar repo (templat ada di apps/web/components/video/templat):
#   docker compose build video-render
FROM node:22-bookworm-slim

# Pustaka sistem untuk Chrome headless (render Remotion), font termasuk emoji, dan Python untuk Piper (suara lokal)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 \
      libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      fonts-noto-color-emoji fonts-noto-core fonts-dejavu-core \
      python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Piper + suara bahasa Indonesia (id_ID-news_tts-medium), dijalankan offline tanpa API key
RUN pip3 install --break-system-packages --no-cache-dir piper-tts \
    && mkdir -p /opt/piper && cd /opt/piper && python3 -m piper.download_voices id_ID-news_tts-medium

# Font video Studio (OFL: Nunito, Playfair Display, Poppins) — berkas yang sama dengan pratinjau web
COPY apps/web/public/fonts/video /usr/share/fonts/truetype/video
RUN fc-cache -f

WORKDIR /app
# Revideo memakai Puppeteer; browser-nya tidak diunduh terpisah karena memakai Chrome headless milik Remotion.
# Telemetri Revideo dimatikan.
ENV PUPPETEER_SKIP_DOWNLOAD=true DISABLE_TELEMETRY=true
COPY services/video-render/package.json services/video-render/package-lock.json ./
RUN npm ci --no-fund --no-audit
# Browser render Remotion diunduh saat build agar render pertama tidak menunggu
RUN node -e "import('@remotion/renderer').then((r) => r.ensureBrowser())"
ENV REVIDEO_BROWSER=/app/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell

COPY apps/web/components/video/templat ./templat
COPY services/video-render/src ./src
COPY services/video-render/revideo ./revideo
COPY services/video-render/worker.mjs ./

CMD ["node", "worker.mjs"]
