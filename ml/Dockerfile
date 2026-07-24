FROM python:3.12-slim

WORKDIR /app

# Runtime dependency for LightGBM's native library
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port \"${PORT:-8001}\""]
