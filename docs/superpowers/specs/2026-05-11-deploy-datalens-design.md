# Deploy DataLens — Design Spec

**Date:** 2026-05-11
**Status:** Approved
**Goal:** Deploy `datalens.nstoug.com` on the Hetzner VPS following the docforge pattern, with parity or improvements across Dockerfiles, CI/CD, and infra config.

---

## 1. Scope

### In scope
- Upgrade backend and frontend production Dockerfiles to docforge quality
- Add `frontend/nginx.conf` (replaces inline printf hack)
- Add `docker-compose.prod.yml` with `gateway_net` networking
- Replace current `ci.yml` with unified `CI/CD` workflow (test → build-push → deploy), using pinned SHA digests throughout
- Add upstream + server block in `hetzner-vps-portfolio-infra` gateway nginx.conf

### Out of scope
- Changes to backend API or frontend UI
- Database / Redis (datalens is stateless — temp files only)
- Python module rename (`datalens_ai` → `datalens` internal imports)

---

## 2. Repository & Folder

- GitHub repo renamed: `niXtou/datalens-ai` → `niXtou/datalens` ✓
- Local folder renamed: `projects/datalens-ai/` → `projects/datalens/` ✓
- Branding strings renamed throughout project ✓

---

## 3. Backend Dockerfile.prod

**Location:** `backend/Dockerfile.prod` (build context: `./backend`)

**Pattern:** Multi-stage, mirrors docforge's backend Dockerfile.

- **Stage 1 (builder):** Copy uv from `ghcr.io/astral-sh/uv:0.10.12` official image (same version as docforge). Copy `pyproject.toml` + `uv.lock` first (layer cache). Run `uv sync --frozen --no-dev --no-editable`. Copy `src/`.
- **Stage 2 (runtime):** Start from `python:3.13-slim`. Create non-root `appuser`. Copy only `.venv/` from builder — `--no-editable` installs `datalens_ai` into `.venv/lib/.../site-packages/`, so `src/` is not needed in the runtime stage (unlike docforge which has alembic files). Set `PATH` to include `.venv/bin`. Set `PYTHONUNBUFFERED=1`. Switch to `appuser`. Expose 8000. CMD: `uvicorn datalens_ai.main:app --host 0.0.0.0 --port 8000 --workers 2`.

**Improvements over current:**
- Multi-stage: no build tools in production image
- uv copied from official image (not installed via pip)
- Non-root user
- No `PYTHONPATH` workaround (package installed with `--no-editable`)

---

## 4. Frontend Dockerfile.prod + nginx.conf

**Location:** `frontend/Dockerfile.prod` (build context: `./frontend`)

**Changes to Dockerfile.prod:**
- Keep `ARG VITE_API_URL=""` with **empty string as default** — the frontend code uses `${import.meta.env.VITE_API_URL}/health` etc.; if the var is unset, Vite resolves it to the literal string `"undefined"`, breaking all API calls. Empty string produces same-origin relative URLs (`/health`, `/upload`, etc.) which nginx proxies correctly. The arg is still accepted so `compose.yaml` can pass `http://localhost:8000` for local prod-profile testing.
- Copy `nginx.conf` from build context into image (replaces inline `RUN printf`)
- Build context changes to `./frontend`; keep pnpm + Node 22 + multi-stage

**New file: `frontend/nginx.conf`**

```
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy API calls to backend container (same Docker internal network)
    location ~ ^/(upload|results|health) {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_redirect off;
        client_max_body_size 15M;
    }

    # SSE endpoint — disable buffering so events reach browser immediately
    location /analyse/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # Swagger/ReDoc (useful for portfolio viewers)
    location ~ ^/(docs|redoc|openapi.json) {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_redirect off;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-lived cache for hashed assets
    location ~* \.(js|css|png|jpg|svg|ico|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
}
```

---

## 5. docker-compose.prod.yml

**Location:** `docker-compose.prod.yml` (repo root)

```yaml
services:
  backend:
    image: ghcr.io/nixtou/datalens-backend:latest
    env_file: .env
    restart: unless-stopped
    networks: [internal]
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G      # LangGraph + scikit-learn are memory-hungry
        reservations:
          cpus: '0.25'
          memory: 256M

  frontend:
    image: ghcr.io/nixtou/datalens-frontend:latest
    restart: unless-stopped
    networks:
      internal:
      gateway_net:
        aliases: [datalens-frontend]   # stable DNS alias used by gateway nginx
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 64M
        reservations:
          memory: 32M

networks:
  internal:
  gateway_net:
    external: true   # shared network owned by hetzner-vps-portfolio-infra
```

No DB, no Redis — datalens is stateless (temp files for upload/results).

---

## 6. CI/CD Workflow

**Location:** `.github/workflows/ci.yml` (replaces current test-only workflow)

**Trigger:** Push to any branch + PRs to `main`.

### Jobs

#### `test` — runs on all pushes and PRs
- Backend: `uv sync --frozen --extra dev` → ruff check → pytest with coverage
- Frontend: `pnpm/action-setup` (SHA: `f40ffcd9367d9f12939873eb1018b921a783ffaa`) → pnpm install --frozen-lockfile → tsc → lint → vitest

#### `build-push` — only on push to `main`, needs `test`
- Sets up QEMU + Buildx (ARM64 cross-compilation for Hetzner CAX11)
- Login to GHCR with `GITHUB_TOKEN` (sufficient for push; `GHCR_PAT` used only for pull on VPS)
- Lowercase repo owner (GHCR requires lowercase)
- Build + push with GHA cache:
  - `ghcr.io/nixtou/datalens-backend:latest` (context: `./backend`)
  - `ghcr.io/nixtou/datalens-frontend:latest` (context: `./frontend`)

#### `deploy` — needs `build-push`
1. SCP `docker-compose.prod.yml` → `~/datalens/` on VPS
2. SSH into VPS:
   ```sh
   set -e
   cd ~/datalens
   echo "$GHCR_PAT" | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   docker image prune -f
   ```

**All GitHub Actions pinned to SHA digests** (mutable version tags can be hijacked).

### Secrets required (set once in repo settings)
Identical names to docforge:
| Secret | Value |
|--------|-------|
| `GHCR_PAT` | Personal access token with `read:packages` (for VPS pull) |
| `SSH_PRIVATE_KEY` | VPS SSH private key |
| `VPS_IP` | `46.224.211.133` |
| `VPS_USER` | `root` |

---

## 7. Gateway Nginx Changes

**File:** `hetzner-vps-portfolio-infra/nginx/nginx.conf`

**Add upstream:**
```nginx
upstream datalens {
    server datalens-frontend:80;
    keepalive 32;
}
```

**Add server block** for `datalens.nstoug.com` — identical SSL/security header setup to docforge. Two locations:
- `/upload` — stricter `api` rate limit zone, `client_max_body_size 15M`
- `/analyse/` — `proxy_buffering off`, `proxy_read_timeout 300s` (SSE)
- `/` — general rate limit

---

## 8. VPS One-Time Setup

Run once via SSH before first deploy:
```sh
mkdir ~/datalens
cat > ~/datalens/.env <<EOF
ENVIRONMENT=production
OPENROUTER_API_KEY=<key>
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<key>
LANGSMITH_PROJECT=datalens
LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com
EOF
```

`gateway_net` already exists (created by portfolio infra). After gateway nginx is updated and reloaded, add a Cloudflare DNS A record: `datalens` → `46.224.211.133` (proxied 🟠).

---

## 9. Files Changed / Created

### `datalens` repo
| File | Action |
|------|--------|
| `backend/Dockerfile.prod` | Rewrite (multi-stage, non-root, uv from official image) |
| `frontend/Dockerfile.prod` | Update (remove VITE_API_URL arg, copy nginx.conf) |
| `frontend/nginx.conf` | New |
| `docker-compose.prod.yml` | New |
| `compose.yaml` | Update prod profile build contexts (`./backend`, `./frontend`); keep VITE_API_URL arg for local testing |
| `.github/workflows/ci.yml` | Rewrite (unified CI/CD, pinned SHAs) |

### `hetzner-vps-portfolio-infra` repo
| File | Action |
|------|--------|
| `nginx/nginx.conf` | Add upstream + server block for `datalens.nstoug.com` |
