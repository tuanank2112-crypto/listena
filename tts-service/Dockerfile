# ListenAI VieNeu TTS Sidecar
# ─────────────────────────────
# Bake model vào image HOẶC mount HuggingFace cache volume
# để restart container KHÔNG tải lại model.
FROM python:3.11-slim

WORKDIR /app

# Cài system deps cần cho onnxruntime/soundfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Volume HuggingFace cache: restart container không tải lại model
ENV HF_HOME=/data/hf
VOLUME ["/data/hf"]
# Volume cache âm thanh
VOLUME ["/app/cache"]

EXPOSE 8001
# Chỉ 1 worker: mỗi worker load một bản model vào RAM
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
