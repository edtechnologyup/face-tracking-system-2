FROM python:3.10-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch — default pip torch pulls ~2GB CUDA wheels and fails on slim images
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    torchvision==0.17.2+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
# Install openface-test without deps so it cannot override CPU torch / headless opencv
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps openface-test==0.1.26

COPY app ./app
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV OPENFACE_WEIGHTS_DIR=/app/weights
ENV OPENFACE_DEVICE=cpu
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
