# Astra — Production Deployment Guide

> **Architecture**
> - **Backend + Oracle DB** → Docker on an Oracle Cloud (OCI) VM (free tier)
> - **Frontend** → Netlify (free tier, static export of Next.js)
> - **TLS** → Let's Encrypt via Certbot (free)
> - **Domain** → Netlify free subdomain OR a custom domain from Cloudflare/Freenom (free)

---

## Part 1 — Oracle Cloud VM (Backend + Database)

### 1.1  Create a Free OCI VM

Oracle Cloud Always Free tier gives you **2 AMD VMs** or **4 Ampere (ARM) cores** with no credit card charges.

1. Go to [cloud.oracle.com](https://cloud.oracle.com) → Sign In
2. **Compute → Instances → Create Instance**
3. Settings:
   - **Name**: `astra-prod`
   - **Image**: Ubuntu 22.04 (Canonical) — Ampere ARM or AMD both work
   - **Shape**: `VM.Standard.E2.1.Micro` (AMD, Always Free) or `VM.Standard.A1.Flex` (Ampere, 4 OCPU / 24 GB — **recommended**)
   - **Boot volume**: 50 GB (free up to 200 GB total across instances)
   - **SSH key**: Upload your public key (generate with `ssh-keygen -t ed25519` if you don't have one)
4. Click **Create** — note the **Public IP address** when it boots

### 1.2  Open Ports in OCI Firewall

By default OCI blocks everything except port 22.

1. **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default**
2. **Add Ingress Rules**:

| Source CIDR | Protocol | Port(s) | Description |
|-------------|----------|---------|-------------|
| 0.0.0.0/0   | TCP      | 80      | HTTP (redirects to HTTPS) |
| 0.0.0.0/0   | TCP      | 443     | HTTPS |

> Port 1521 (Oracle DB) should NOT be opened — only the backend container accesses it internally.

Also run on the VM itself:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # Ubuntu 22.04
```

### 1.3  SSH Into the VM & Install Docker

```bash
ssh ubuntu@YOUR_VM_PUBLIC_IP

# Install Docker + Docker Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow your user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### 1.4  Upload the Project to the VM

From your **local machine**:

```bash
# From the project root
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='frontend/.next' \
  --exclude='backend/data' --exclude='backend/uploads' \
  ./ ubuntu@YOUR_VM_PUBLIC_IP:~/astra/
```

Or use git:
```bash
# On VM
git clone https://github.com/YOUR_REPO/astra.git ~/astra
```

### 1.5  Copy OCI Config to the VM

The backend needs your OCI signing credentials to call Oracle GenAI.

```bash
# From your local machine
scp -r ~/.oci ubuntu@YOUR_VM_PUBLIC_IP:~/.oci
```

### 1.6  Set Up Environment Files

On the VM:

```bash
cd ~/astra

# Root env (Oracle DB password)
cp .env.prod.example .env.prod
nano .env.prod
# → Set ORACLE_DB_PASSWORD to something strong
# → Set OCI_CONFIG_DIR=/root/.oci (or ~/oci depending on user)

# Backend env
cp backend/.env.prod.example backend/.env.prod
nano backend/.env.prod
# → Set SECRET_KEY (generate: python3 -c "import secrets; print(secrets.token_hex(32))")
# → Set ALLOWED_ORIGINS to your Netlify URL (e.g. https://astra-ai.netlify.app)
# → Verify OCI/GenAI values match your working local .env
```

### 1.7  Configure Nginx Domain

```bash
# Replace YOUR_DOMAIN in the nginx config
# Use your VM's public IP as the domain for now (e.g. 1.2.3.4)
# or your custom domain if you have one (see Part 3)
nano ~/astra/nginx/conf.d/astra.conf
# Replace every occurrence of YOUR_DOMAIN with your actual domain or IP
```

**If you're using an IP address only** (no domain yet), simplify the Nginx config:
```nginx
# Replace the server blocks with this simple HTTP-only version temporarily:
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```
And remove the `certbot` service from `docker-compose.prod.yml` temporarily.

### 1.8  Pull Oracle DB Image

Oracle's container image requires a free login:
```bash
# Create free account at container-registry.oracle.com
docker login container-registry.oracle.com
# Username: your Oracle account email
# Password: your Oracle account password

# Pull the image (this takes ~5 min, it's ~3 GB)
docker pull container-registry.oracle.com/database/free:latest
```

### 1.9  Start Production Stack

```bash
cd ~/astra

# Load the root env and start everything
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Watch Oracle DB start up (takes ~3 min on first boot)
docker compose -f docker-compose.prod.yml logs -f oracle-db

# Once you see "DATABASE IS READY TO USE!", check the backend
docker compose -f docker-compose.prod.yml logs -f backend

# Verify everything is running
docker compose -f docker-compose.prod.yml ps
```

Test it:
```bash
curl http://YOUR_VM_PUBLIC_IP/health
# → {"status":"ok","ai_provider":"oracle_genai"}
```

---

## Part 2 — Free TLS with Let's Encrypt (skip if IP-only)

Only do this after you have a domain pointing to your VM.

```bash
cd ~/astra

# Issue certificate (replace YOUR_DOMAIN and YOUR_EMAIL)
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email YOUR_EMAIL \
  --agree-tos \
  --no-eff-email \
  -d YOUR_DOMAIN \
  -d www.YOUR_DOMAIN

# Reload Nginx to pick up the cert
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Certbot auto-renews every 12 hours inside its container. No cron needed.

---

## Part 3 — Free Domain Options

### Option A: Netlify Subdomain (Zero Setup — Recommended for Hackathon)

Your frontend gets `https://YOUR_SITE_NAME.netlify.app` for free with zero DNS configuration. Use the VM's raw IP for the backend URL.

### Option B: Free Custom Domain via Freenom (.tk / .ml / .ga / .cf / .gq)

1. Go to [freenom.com](https://freenom.com) → search for your name (e.g. `astra-ai`)
2. Select a free TLD → Register for 12 months free
3. **Manage Domain → Manage Freenom DNS → Add Records**:
   - Type: `A`, Name: `api`, Target: `YOUR_VM_PUBLIC_IP` → creates `api.astra-ai.tk`
   - Type: `A`, Name: `@`, Target: `YOUR_VM_PUBLIC_IP` → creates `astra-ai.tk`
4. Update `nginx/conf.d/astra.conf` with `server_name astra-ai.tk api.astra-ai.tk;`
5. Wait ~10 min for DNS to propagate, then run Certbot (Part 2)

### Option C: Free Subdomain via DuckDNS

1. Go to [duckdns.org](https://duckdns.org) → login with GitHub/Google
2. Create subdomain: `astra-ai` → gets `astra-ai.duckdns.org`
3. Set the IP to your VM's public IP
4. Use `astra-ai.duckdns.org` everywhere in Nginx config
5. Run Certbot as in Part 2

---

## Part 4 — Frontend on Netlify (Free)

### 4.1  Create Netlify Account

Go to [netlify.com](https://netlify.com) → Sign Up with GitHub (free forever plan).

### 4.2  Connect Your GitHub Repo

1. Netlify Dashboard → **Add new site → Import an existing project**
2. Pick GitHub → select your `astra` repo
3. Configure:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/out`
4. Click **Deploy site** — Netlify builds and deploys automatically on every `git push`

### 4.3  Set Environment Variables in Netlify

**Site → Site Configuration → Environment Variables → Add a variable**:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `http://YOUR_VM_PUBLIC_IP` (or `https://api.YOUR_DOMAIN` if you have TLS) |
| `NEXT_PUBLIC_ELEVENLABS_API_KEY` | Your ElevenLabs key |

After adding variables → **Deploys → Trigger deploy → Deploy site**.

### 4.4  Custom Domain on Netlify (Optional)

If you bought/got a domain (Part 3):
1. **Site → Domain Management → Add custom domain**
2. Enter `astra-ai.tk` (or your domain)
3. Netlify auto-provisions a free TLS cert via Let's Encrypt — no action needed
4. Update your backend's `ALLOWED_ORIGINS` env var to include `https://astra-ai.tk`
5. Restart backend: `docker compose -f docker-compose.prod.yml restart backend`

---

## Part 5 — Day-to-Day Operations

### Update the backend after code changes

```bash
# On the VM, from ~/astra
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
```

### View logs

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f oracle-db
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Reset demo accounts

```bash
curl -X POST http://YOUR_VM_PUBLIC_IP/api/auth/demo/reset/all
```

### Restart everything

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart
```

### Stop everything

```bash
docker compose -f docker-compose.prod.yml down
# Oracle data is safe in the oracle_data Docker volume
```

---

## Quick Reference — File Summary

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production stack: Oracle DB + Backend + Nginx + Certbot |
| `backend/Dockerfile.prod` | Production backend image (multi-worker, no hot-reload) |
| `backend/.env.prod.example` | Template for backend secrets — copy to `.env.prod` |
| `.env.prod.example` | Template for root secrets (DB password) — copy to `.env.prod` |
| `nginx/nginx.conf` | Nginx main config |
| `nginx/conf.d/astra.conf` | Site config: HTTP→HTTPS redirect, reverse proxy to backend |
| `frontend/netlify.toml` | Netlify build + redirect config |
| `frontend/.env.production.example` | Frontend env template — set in Netlify dashboard |
| `DEPLOY.md` | This file |
