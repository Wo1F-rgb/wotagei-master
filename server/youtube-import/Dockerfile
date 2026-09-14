FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    YOUTUBE_IMPORT_HOST=0.0.0.0 \
    YOUTUBE_IMPORT_PORT=8765

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./server.py

EXPOSE 8765
USER nobody
ENTRYPOINT ["python", "server.py"]
