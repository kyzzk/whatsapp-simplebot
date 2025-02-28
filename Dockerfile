FROM node:18-bullseye-slim

# Install Chrome dependencies
RUN apt-get update \
    && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    xvfb \
    xauth \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies as root
COPY package*.json ./
RUN npm install

# Create and set permissions for cache directory and node_modules
RUN mkdir -p .wwebjs_auth/session \
    && chown -R node:node . \
    && chmod -R 755 .

# Switch to non-root user
USER node

# Copy rest of the files including swagger.yaml
COPY --chown=node:node . .
COPY --chown=node:node swagger.yaml ./swagger.yaml

# Configure Puppeteer to use Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DISPLAY=:99

CMD xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" node main.js