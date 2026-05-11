# Deploy DataLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `datalens.nstoug.com` on the Hetzner VPS with production-grade Dockerfiles, a unified CI/CD pipeline, and gateway nginx routing — matching or improving on the docforge deployment pattern.

**Architecture:** The React frontend is served by an nginx container that also proxies API calls internally to the FastAPI backend; both share a `gateway_net` Docker network with the VPS gateway nginx, which routes `datalens.nstoug.com` to the frontend container. CI builds ARM64 images on push to `main`, pushes to GHCR, then SSHs into the VPS to pull and restart.

**Tech Stack:** Python 3.13 / FastAPI / uv / Docker multi-stage / nginx:1.25-alpine / pnpm / GitHub Actions / GHCR / Hetzner CAX11 (ARM64) / Cloudflare

---

## File Map

### `datalens` repo
| File | Action |
|------|--------|
| `backend/Dockerfile.prod` | Rewrite — multi-stage, uv from official image, non-root user, no PYTHONPATH hack |
| `frontend/nginx.conf` | Create — proxies `/upload`, `/analyse/`, `/results`, `/health` to `backend:8000`; SSE settings; SPA fallback |
| `frontend/Dockerfile.prod` | Update — build context `./frontend`, `VITE_API_URL=""` default, copies `nginx.conf` |
| `docker-compose.prod.yml` | Create — backend + frontend from GHCR, `gateway_net` external network, resource limits |
| `compose.yaml` | Update — prod profile build contexts changed from `.` to `./backend` / `./frontend` |
| `.github/workflows/ci.yml` | Rewrite — unified test → build-push → deploy, all actions pinned to SHA digests |

### `hetzner-vps-portfolio-infra` repo
| File | Action |
|------|--------|
| `nginx/nginx.conf` | Add `datalens` upstream + `datalens.nstoug.com` server block |

---

## Task 1: Rewrite `backend/Dockerfile.prod`

**Files:**
- Modify: `backend/Dockerfile.prod`

**Context:** The current Dockerfile.prod is single-stage, installs uv via pip (slow, impure), carries build tools into production, and uses `PYTHONPATH=/app/src` as a workaround instead of properly installing the package. The new version is multi-stage with a non-root runtime user.

- [ ] **Step 1: Replace `backend/Dockerfile.prod` with multi-stage version**

Write this exact content to `backend/Dockerfile.prod`:

```dockerfile
# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.10.12 /uv /usr/local/bin/uv

WORKDIR /app

# Copy manifests first — Docker caches this layer until deps change
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy source, then install the project itself as a proper wheel (no PYTHONPATH hack)
COPY src/ src/
RUN uv sync --frozen --no-dev --no-editable

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

# Only the venv is needed — datalens_ai is installed into site-packages via --no-editable
COPY --from=builder /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

USER appuser
EXPOSE 8000

CMD ["uvicorn", "datalens_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

- [ ] **Step 2: Validate the build (optional local check)**

```bash
cd /home/nikos/codebase/projects/datalens
docker build -f backend/Dockerfile.prod ./backend -t datalens-backend-test
```

Expected: build completes, no errors. If Docker is unavailable locally, skip — CI will catch this.

- [ ] **Step 3: Commit**

```bash
cd /home/nikos/codebase/projects/datalens
git add backend/Dockerfile.prod
git commit -m "feat: rewrite backend Dockerfile.prod — multi-stage, non-root, uv from official image"
```

---

## Task 2: Add `frontend/nginx.conf` and update `frontend/Dockerfile.prod`

**Files:**
- Create: `frontend/nginx.conf`
- Modify: `frontend/Dockerfile.prod`

**Context:** The current Dockerfile.prod generates nginx config via an inline `RUN printf` (fragile, unreadable) and uses root context `.`. The new version has a proper `nginx.conf` file and uses `./frontend` as build context. `VITE_API_URL` defaults to `""` so production builds make same-origin relative requests that nginx proxies internally.

- [ ] **Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy regular API calls to the FastAPI backend container
    location ~ ^/(upload|results|health) {
        proxy_pass         http://backend:8000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header   Connection        "";
        proxy_redirect     off;
        client_max_body_size 15M;
    }

    # SSE streaming — disable buffering so events reach the browser immediately
    location /analyse/ {
        proxy_pass         http://backend:8000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header   Connection        "";
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 300s;
    }

    # Swagger/ReDoc — useful for portfolio viewers browsing the API docs
    location ~ ^/(docs|redoc|openapi.json) {
        proxy_pass       http://backend:8000;
        proxy_set_header Host $host;
        proxy_redirect   off;
    }

    # SPA fallback — all unmatched paths serve index.html for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-lived cache for content-hashed static assets
    location ~* \.(js|css|png|jpg|svg|ico|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
}
```

- [ ] **Step 2: Replace `frontend/Dockerfile.prod`**

```dockerfile
# Stage 1: build
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Default "" → same-origin relative URLs in production (/upload, /analyse/, etc.)
# compose.yaml passes http://localhost:8000 for local prod-profile testing
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN pnpm build

# Stage 2: serve
FROM nginx:1.25-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Validate nginx config syntax**

```bash
docker run --rm -v /home/nikos/codebase/projects/datalens/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.25-alpine nginx -t
```

Expected output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

- [ ] **Step 4: Commit**

```bash
cd /home/nikos/codebase/projects/datalens
git add frontend/nginx.conf frontend/Dockerfile.prod
git commit -m "feat: add frontend nginx.conf and update Dockerfile.prod for ./frontend context"
```

---

## Task 3: Add `docker-compose.prod.yml`

**Files:**
- Create: `docker-compose.prod.yml`

**Context:** This is the production compose file deployed to the VPS by CI. It uses pre-built GHCR images (no build step), joins `gateway_net` for nginx routing, and sets resource limits appropriate for the Hetzner CAX11 (2 vCPU, 4 GB RAM shared with other stacks).

- [ ] **Step 1: Create `docker-compose.prod.yml`**

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
        aliases: [datalens-frontend]   # stable DNS name used in gateway nginx.conf
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
    external: true   # created by hetzner-vps-portfolio-infra; must exist before up
```

- [ ] **Step 2: Validate compose file syntax**

```bash
cd /home/nikos/codebase/projects/datalens
docker compose -f docker-compose.prod.yml config --quiet && echo "syntax ok"
```

Expected: `syntax ok` (the `external: true` network warning about gateway_net not existing locally is normal).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: add docker-compose.prod.yml for VPS deployment"
```

---

## Task 4: Update `compose.yaml` prod profile build contexts

**Files:**
- Modify: `compose.yaml`

**Context:** The prod profile services (`api-prod`, `frontend-prod`) currently use `context: .` (repo root) because the old Dockerfiles expected root-relative COPY paths. After the Dockerfile.prod redesigns, both now expect their own directory as build context.

- [ ] **Step 1: Update `compose.yaml` prod profile**

Replace the `api-prod` and `frontend-prod` service definitions. The dev profile (`api`, `frontend`) is unchanged.

Find this block:

```yaml
  # ── Production ───────────────────────────────────────────────────────────────
  api-prod:
    profiles: [prod]
    build:
      context: .
      dockerfile: ./backend/Dockerfile.prod
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
    env_file: .env

  frontend-prod:
    profiles: [prod]
    build:
      context: .
      dockerfile: ./frontend/Dockerfile.prod
      args:
        - VITE_API_URL=http://localhost:8000
    ports:
      - "80:80"
    depends_on:
      - api-prod
```

Replace with:

```yaml
  # ── Production ───────────────────────────────────────────────────────────────
  api-prod:
    profiles: [prod]
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
    env_file: .env

  frontend-prod:
    profiles: [prod]
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
      args:
        - VITE_API_URL=http://localhost:8000   # override default "" for local testing
    ports:
      - "80:80"
    depends_on:
      - api-prod
```

- [ ] **Step 2: Validate**

```bash
cd /home/nikos/codebase/projects/datalens
docker compose --profile prod config --quiet && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 3: Commit**

```bash
git add compose.yaml
git commit -m "fix: update compose.yaml prod profile build contexts to ./backend and ./frontend"
```

---

## Task 5: Rewrite `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

**Context:** The current workflow only tests. Replace it with a unified CI/CD workflow (`test → build-push → deploy`) with all GitHub Actions pinned to SHA digests (mutable version tags like `@v4` can be silently updated to contain malicious code). The `build-push` and `deploy` jobs only run on push to `main`.

All SHA digests below are the same as docforge where applicable, with the pnpm action added.

- [ ] **Step 1: Replace `.github/workflows/ci.yml`**

```yaml
name: CI/CD

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4

      - uses: astral-sh/setup-uv@38f3f104447c67c051c4a08e39b64a148898af3a  # v4

      - name: Backend — lint + test
        working-directory: backend
        env:
          OPENROUTER_API_KEY: dummy-key-for-ci
          LANGSMITH_TRACING: "false"
          LANGSMITH_API_KEY: ""
        run: |
          uv sync --frozen --extra dev
          uv run ruff check src/
          uv run pytest --cov=datalens_ai --cov-fail-under=70

      - uses: pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa  # v4
        with:
          version: 10

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4
        with:
          node-version: "22"
          cache: "pnpm"
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Frontend — type-check, lint, test
        working-directory: frontend
        run: |
          pnpm install --frozen-lockfile
          pnpm exec tsc -b
          pnpm lint
          pnpm test

  build-push:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4

      - name: Lowercase repo owner
        run: echo "REPO_OWNER=${GITHUB_REPOSITORY_OWNER,,}" >> $GITHUB_ENV

      - uses: docker/setup-qemu-action@c7c53464625b32c7a7e944ae62b3e17d2b600130  # v3

      - uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f  # v3

      - uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9  # v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend (ARM64)
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8  # v6
        with:
          context: ./backend
          platforms: linux/arm64
          push: true
          tags: ghcr.io/${{ env.REPO_OWNER }}/datalens-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push frontend (ARM64)
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8  # v6
        with:
          context: ./frontend
          platforms: linux/arm64
          push: true
          tags: ghcr.io/${{ env.REPO_OWNER }}/datalens-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4

      - name: Lowercase repo owner
        run: echo "REPO_OWNER=${GITHUB_REPOSITORY_OWNER,,}" >> $GITHUB_ENV

      - name: Copy docker-compose.prod.yml to VPS
        uses: appleboy/scp-action@917f8b81dfc1ccd331fef9e2d61bdc6c8be94634  # v0.1.7
        with:
          host: ${{ secrets.VPS_IP }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          source: "docker-compose.prod.yml"
          target: "~/datalens"

      - name: Deploy to VPS
        uses: appleboy/ssh-action@029f5b4aeeeb58fdfe1410a5d17f967dacf36262  # v1.0.3
        env:
          GITHUB_ACTOR: ${{ github.actor }}
          GHCR_PAT: ${{ secrets.GHCR_PAT }}
          REPO_OWNER: ${{ env.REPO_OWNER }}
        with:
          host: ${{ secrets.VPS_IP }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          envs: GITHUB_ACTOR,GHCR_PAT,REPO_OWNER
          script: |
            set -e
            cd ~/datalens
            echo "$GHCR_PAT" | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker image prune -f
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('/home/nikos/codebase/projects/datalens/.github/workflows/ci.yml'))" && echo "yaml ok"
```

Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
cd /home/nikos/codebase/projects/datalens
git add .github/workflows/ci.yml
git commit -m "feat: replace ci.yml with unified CI/CD pipeline — test, build ARM64, deploy to VPS"
```

---

## Task 6: Add `datalens` block to gateway nginx.conf

**Files:**
- Modify: `hetzner-vps-portfolio-infra/nginx/nginx.conf`

**Context:** The gateway nginx owns ports 80/443 on the VPS and routes by hostname. Adding datalens requires one upstream definition and one server block. The `/upload` location gets the stricter `api` rate limit zone (same as docforge's `/api/` limit). The `/analyse/` location needs `proxy_buffering off` at the gateway level too — without this, the gateway would buffer the SSE stream before it reaches the browser.

- [ ] **Step 1: Add upstream after the existing `docforge` upstream**

In `hetzner-vps-portfolio-infra/nginx/nginx.conf`, find:

```nginx
upstream docforge {
    server docforge-frontend:80;
    keepalive 32;
}
```

Add after it:

```nginx
upstream datalens {
    server datalens-frontend:80;
    keepalive 32;
}
```

- [ ] **Step 2: Add server block at the end of the file**

Append after the last closing `}` of the docforge server block:

```nginx
# ── datalens.nstoug.com — DataLens ───────────────────────────────────────────

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name datalens.nstoug.com;

    ssl_certificate     /etc/ssl/cloudflare/cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff"                             always;
    add_header X-Frame-Options           "DENY"                                always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"     always;
    add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()" always;

    location /health-nginx {
        access_log off;
        return 200 "healthy\n";
    }

    # Stricter rate limit on upload and analyse (expensive AI calls)
    location /upload {
        limit_req zone=api burst=10 nodelay;

        proxy_pass         http://datalens;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Connection        "";
        proxy_redirect     off;
        client_max_body_size 15M;
    }

    # SSE: disable buffering at gateway level too, otherwise stream is held until buffer fills
    location /analyse/ {
        limit_req zone=api burst=10 nodelay;

        proxy_pass         http://datalens;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Connection        "";
        proxy_redirect     off;
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }

    location / {
        limit_req zone=general burst=40 nodelay;

        proxy_pass         http://datalens;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Connection        "";
        proxy_redirect     off;
    }
}
```

- [ ] **Step 3: Validate nginx config syntax**

```bash
docker run --rm \
  -v /home/nikos/codebase/projects/hetzner-vps-portfolio-infra/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.25-alpine nginx -t
```

Expected:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

- [ ] **Step 4: Commit**

```bash
cd /home/nikos/codebase/projects/hetzner-vps-portfolio-infra
git add nginx/nginx.conf
git commit -m "feat: add datalens.nstoug.com upstream and server block"
```

---

## Task 7: Set GitHub Secrets

**Context:** The `datalens` repo needs the same 4 secrets as docforge. The values are identical — they reference the same VPS and the same GHCR PAT. Copy them via the `gh` CLI.

- [ ] **Step 1: Copy secrets from docforge to datalens**

The values from docforge are already set; read them and set them on the new repo:

```bash
# Set VPS_IP
gh secret set VPS_IP --repo niXtou/datalens \
  --body "$(gh secret list --repo niXtou/docforge --json name,updatedAt | python3 -c 'print("46.224.211.133")')"
```

`gh` cannot read secret values (by design), so set them by their known values:

```bash
gh secret set VPS_IP    --repo niXtou/datalens --body "46.224.211.133"
gh secret set VPS_USER  --repo niXtou/datalens --body "root"
```

For `SSH_PRIVATE_KEY` and `GHCR_PAT`, their values are on your local machine:

```bash
# SSH private key (same key used for hetzner-portfolio SSH config)
gh secret set SSH_PRIVATE_KEY --repo niXtou/datalens \
  --body "$(cat ~/.ssh/id_ed25519_hetzner)"

# GHCR PAT — copy the value from docforge (you'll need to enter it manually or retrieve it from a password manager)
gh secret set GHCR_PAT --repo niXtou/datalens
# ↑ this opens $EDITOR or prompts stdin — paste the PAT value
```

- [ ] **Step 2: Verify all 4 secrets are set**

```bash
gh secret list --repo niXtou/datalens
```

Expected output (dates will differ):
```
GHCR_PAT         <date>
SSH_PRIVATE_KEY  <date>
VPS_IP           <date>
VPS_USER         <date>
```

---

## Task 8: VPS one-time setup, gateway reload, DNS, and first deploy

**Context:** This task runs on the VPS. The `~/datalens/` directory and `.env` file must exist before CI can deploy. After the gateway nginx config is reloaded, traffic to `datalens.nstoug.com` will route correctly — but only once the DNS record is added in Cloudflare.

- [ ] **Step 1: SSH into VPS and create the datalens directory + .env**

```bash
ssh hetzner-portfolio
```

On the VPS:

```bash
mkdir ~/datalens

cat > ~/datalens/.env <<'EOF'
ENVIRONMENT=production
OPENROUTER_API_KEY=<your-openrouter-key>
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<your-langsmith-key>
LANGSMITH_PROJECT=datalens
LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com
EOF

chmod 600 ~/datalens/.env
```

- [ ] **Step 2: Reload the gateway nginx to pick up the datalens server block**

On the VPS:

```bash
# The gateway stack lives in its own directory — reload without restarting
cd ~/hetzner-vps-portfolio-infra   # or wherever the infra compose lives
docker compose exec nginx nginx -s reload
```

Expected: `2024/... signal process started` (no error).

Verify the new config is live:
```bash
docker compose exec nginx nginx -t
```

Expected: `syntax is ok` + `test is successful`

- [ ] **Step 3: Add Cloudflare DNS record**

In the Cloudflare dashboard for `nstoug.com`:
- Type: `A`
- Name: `datalens`
- IPv4: `46.224.211.133`
- Proxy status: **Proxied** 🟠

- [ ] **Step 4: Trigger the first deploy**

Push to `main` (or merge a PR). The CI/CD pipeline will:
1. Run tests
2. Build ARM64 images and push to GHCR
3. SCP `docker-compose.prod.yml` to `~/datalens/` on VPS
4. SSH → pull → up → prune

Monitor at: `https://github.com/niXtou/datalens/actions`

- [ ] **Step 5: Verify the deployment**

From your machine:

```bash
# Health check
curl -s https://datalens.nstoug.com/health
```

Expected: `{"status":"ok"}`

```bash
# Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://datalens.nstoug.com/
```

Expected: `200`

On the VPS (check containers are running):

```bash
ssh hetzner-portfolio "docker ps --filter name=datalens --format 'table {{.Names}}\t{{.Status}}'"
```

Expected:
```
NAMES               STATUS
datalens-frontend   Up X minutes
datalens-backend    Up X minutes
```

---

## Self-Review Notes

**Spec coverage check:**
- §3 Backend Dockerfile.prod → Task 1 ✓
- §4 Frontend nginx.conf + Dockerfile.prod → Task 2 ✓
- §5 docker-compose.prod.yml → Task 3 ✓
- §5 compose.yaml update → Task 4 ✓
- §6 CI/CD workflow → Task 5 ✓
- §7 Gateway nginx → Task 6 ✓
- §6 Secrets → Task 7 ✓
- §8 VPS setup + DNS + first deploy → Task 8 ✓

**Key invariants to verify during execution:**
- `datalens-frontend` container alias in `docker-compose.prod.yml` matches the upstream target in gateway `nginx.conf`
- `backend` hostname in `frontend/nginx.conf` matches the service name in `docker-compose.prod.yml`
- GHCR image tags `ghcr.io/nixtou/datalens-backend:latest` and `ghcr.io/nixtou/datalens-frontend:latest` match between CI workflow and docker-compose.prod.yml
