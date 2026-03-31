# Backend Deployment Plan

## Overview

Deploy the FastAPI backend + PostgreSQL + Redis + ML service to an **AWS EC2 t2.micro** instance using Docker Compose, triggered automatically via **GitHub Actions** on pushes to `main`.

> **Note:** The EC2 free tier (t2.micro: 1 vCPU, 1GB RAM) is free for 12 months only. Oracle Cloud Free Tier (4 ARM VMs, 6GB RAM total) is free forever and would work with the same workflow.

---

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────────────┐
│  Vercel (Frontend)   │ ──────▶ │  EC2 Instance (Backend)          │
│  Next.js Client      │  HTTPS  │  ┌────────────────────────────┐  │
│                      │         │  │ docker compose              │  │
│  NEXT_PUBLIC_API_URL │         │  │  ├─ api (FastAPI :8000)     │  │
│  = https://ec2-ip    │         │  │  ├─ postgres (:5432)        │  │
└─────────────────────┘         │  │  ├─ redis (:6379)           │  │
                                │  │  └─ ml (FastAPI :8001)       │  │
                                │  └────────────────────────────┘  │
                                └──────────────────────────────────┘
```

---

## Files to Create

### 1. `server/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. `server/docker-compose.prod.yml`

Production compose file — includes the `api` service (unlike the dev compose which only has infrastructure).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: slotera-db
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-slotera}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: slotera-redis
    restart: always
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: slotera-api
    restart: always
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-slotera}
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: ${SECRET_KEY}
      ENVIRONMENT: production
      STORAGE_TYPE: ${STORAGE_TYPE:-local}
      UPLOAD_DIR: /app/uploads
      CORS_ORIGINS: ${CORS_ORIGINS}
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  ml:
    build:
      context: ../ml
      dockerfile: Dockerfile
    container_name: slotera-ml
    restart: always
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-slotera}
      DATABASE_URL_SYNC: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-slotera}
      ENVIRONMENT: production
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
  uploads_data:
```

### 3. `.github/workflows/deploy-backend.yml`

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - "server/**"
      - "ml/**"
      - ".github/workflows/deploy-backend.yml"

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -e
            cd ~/slotera
            git pull origin main

            # Write prod env file from secret
            echo "${{ secrets.PROD_ENV_FILE }}" > server/.env.prod

            cd server
            docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

            # Run DB migrations
            docker exec slotera-api python -m db.migrate

            # Clean up old images
            docker image prune -f
```

---

## Code Changes Required

### `server/app/config.py`

Add env-based CORS so the Vercel URL can be injected:

```python
cors_origins: list[str] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

@property
def all_cors_origins(self) -> list[str]:
    import os
    extra = os.getenv("CORS_ORIGINS", "")
    extra_list = [o.strip() for o in extra.split(",") if o.strip()]
    return self.cors_origins + extra_list
```

Then in `server/app/main.py`, change `settings.cors_origins` → `settings.all_cors_origins`.

### `client/next.config.ts`

Use the env var for the rewrite destination:

```typescript
const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// ...
destination: `${backendUrl}/api/:path*`,
```

---

## One-Time EC2 Setup

```bash
# On your EC2 instance (Amazon Linux 2023):
sudo dnf install -y git docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Clone repo
git clone https://github.com/rodinKaradeniz/slotera.git ~/slotera
```

---

## GitHub Secrets

In your repo → Settings → Secrets → Actions, add:

| Secret | Value |
|--------|-------|
| `EC2_HOST` | Your EC2 public IP or Elastic IP |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | Your EC2 private key (`.pem` contents) |
| `PROD_ENV_FILE` | Full contents of your prod `.env` (see below) |

**`PROD_ENV_FILE` contents:**

```
POSTGRES_PASSWORD=a-strong-password
SECRET_KEY=a-very-long-random-string
CORS_ORIGINS=https://slotera.vercel.app
STORAGE_TYPE=local
```

---

## Environment Awareness

| Context | How it works |
|---------|-------------|
| **Local dev** | `docker compose up` in `server/` starts postgres + redis + ml; FastAPI runs natively via `uvicorn` |
| **Production** | GitHub Actions SSHs into EC2 on every push to `main`, runs `docker compose -f docker-compose.prod.yml up -d --build` |
| **Frontend (Vercel)** | Set `NEXT_PUBLIC_API_URL` to EC2 public URL; until backend is deployed, set `NEXT_PUBLIC_USE_MOCK_API=true` to use mock data |

---

## Security Checklist

- [ ] Change `SECRET_KEY` to a strong random value
- [ ] Change `POSTGRES_PASSWORD` to a strong random value
- [ ] Set up EC2 Security Group: allow inbound 8000 (API), 22 (SSH), block everything else
- [ ] Consider adding HTTPS via Caddy or nginx reverse proxy with Let's Encrypt
- [ ] Set up Elastic IP so the address doesn't change on reboot
