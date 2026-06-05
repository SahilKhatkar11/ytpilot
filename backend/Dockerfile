FROM node:22-bookworm-slim AS pot-provider-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
        libcairo2-dev \
        libgif-dev \
        libjpeg-dev \
        libpango1.0-dev \
        librsvg2-dev \
        pkg-config \
        python3 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch 1.3.1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-provider \
    && cd /opt/bgutil-provider/server \
    && npm ci \
    && npx tsc

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libcairo2 \
        libgif7 \
        libjpeg62-turbo \
        libpango-1.0-0 \
        librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=pot-provider-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=pot-provider-builder /opt/bgutil-provider /opt/bgutil-provider

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
