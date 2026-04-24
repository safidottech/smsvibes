# ══════════════════════════════════════════════════════════════════════
# SMSVIBES — Hostinger Cloud Server Preparation Guide
# ══════════════════════════════════════════════════════════════════════
#
# Sprint1.Task21 | DevOps | Medium
# Target: Hostinger Cloud Startup (Ubuntu 22.04 / Managed Node.js)
# ══════════════════════════════════════════════════════════════════════

## Table of Contents

1. [SSH Access (Port 65002)](#1-ssh-access-port-65002)
2. [Runtime Environment — Node.js 20](#2-runtime-environment--nodejs-20)
3. [Process Management — PM2 Cluster](#3-process-management--pm2-cluster)
4. [Reverse Proxy — Nginx](#4-reverse-proxy--nginx)
5. [SSL Termination — Let's Encrypt](#5-ssl-termination--lets-encrypt)
6. [Firewall Rules](#6-firewall-rules)
7. [Post-Setup Verification Checklist](#7-post-setup-verification-checklist)

---

## Why Port 65002?

The default SSH port (22) is the most targeted port by automated brute-force scanners.
Moving SSH to **port 65002** achieves two critical goals:

1. **Security Hardening** — Eliminates 99%+ of automated SSH brute-force attempts by
   using a non-standard, high-numbered port outside common scanner ranges.
2. **CI/CD Pipeline Stability** — The GitHub Actions deployment workflow (`deploy.yml`)
   is hard-coded to connect on port 65002. Consistency between manual access and
   automated deployments eliminates configuration drift and failed deployments.

> **⚠️ IMPORTANT:** Every SSH command, SCP transfer, and GitHub Secret (`SSH_PORT`)
> must reference port **65002**. The default port 22 will be blocked by the firewall
> after this setup is complete.

---

## 1. SSH Access (Port 65002)

### 1.1 Initial Connection (Hostinger default)

```bash
# First-time connection uses Hostinger's default port (usually 22)
ssh root@<SERVER_IP> -p 22
```

### 1.2 Change SSH Port to 65002

```bash
# Backup the original config
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Edit SSH configuration
sudo nano /etc/ssh/sshd_config
```

**Find and modify these directives:**

```sshd_config
# ── Port ──
Port 65002

# ── Security Hardening ──
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2

# ── Restrict to SSH Protocol 2 ──
Protocol 2
```

### 1.3 Deploy SSH Key (for CI/CD)

```bash
# On your LOCAL machine — generate a dedicated deploy key
ssh-keygen -t ed25519 -C "smsvibes-deploy@github-actions" -f ~/.ssh/smsvibes_deploy

# Copy the public key to the server (while still on port 22)
ssh-copy-id -i ~/.ssh/smsvibes_deploy.pub -p 22 root@<SERVER_IP>

# Verify the key is in authorized_keys
ssh -i ~/.ssh/smsvibes_deploy -p 22 root@<SERVER_IP> "cat ~/.ssh/authorized_keys"
```

### 1.4 Restart SSH & Verify New Port

```bash
# Restart SSH daemon
sudo systemctl restart sshd

# ⚠️ DO NOT close your current session yet!
# Open a NEW terminal and test the new port:
ssh -i ~/.ssh/smsvibes_deploy root@<SERVER_IP> -p 65002
```

> **⚠️ CAUTION:** Only proceed to firewall changes (Section 6) AFTER confirming
> you can connect on port 65002. Locking yourself out requires a Hostinger
> console/VNC recovery.

### 1.5 GitHub Secrets Required

| Secret Name      | Value                                    |
|------------------|------------------------------------------|
| `SSH_HOST`       | `<SERVER_IP>`                            |
| `SSH_USERNAME`   | `root` (or dedicated deploy user)        |
| `SSH_KEY`        | Contents of `~/.ssh/smsvibes_deploy`     |
| `SSH_PORT`       | `65002`                                  |

---

## 2. Runtime Environment — Node.js 20

### 2.1 Verify Managed Node.js

Hostinger Cloud Startup comes with a managed Node.js runtime. Verify the version:

```bash
# Check Node.js version (must be 20.x)
node --version
# Expected: v20.x.x

# Check npm version
npm --version
# Expected: 10.x.x
```

### 2.2 Install Node.js 20 (if not pre-installed)

```bash
# Install via NodeSource (if Hostinger doesn't provide Node 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 2.3 Install Global Dependencies

```bash
# PM2 — Process Manager (production grade)
sudo npm install -g pm2@latest

# Verify PM2
pm2 --version
# Expected: 5.x.x
```

### 2.4 Create Application Directory

```bash
# Create the deployment target directory
sudo mkdir -p /var/www/smsvibes
sudo chown -R $USER:$USER /var/www/smsvibes

# Create required subdirectories
mkdir -p /var/www/smsvibes/{backend,frontend,shared,logs}
```

---

## 3. Process Management — PM2 Cluster

### 3.1 Create PM2 Ecosystem File

Create the file at `/var/www/smsvibes/ecosystem.config.cjs`:

```javascript
// ══════════════════════════════════════════════════════════════
// SMSVIBES — PM2 Ecosystem Configuration
// ══════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    {
      // ── Backend API Server ──
      name: "smsvibes-api",
      cwd: "/var/www/smsvibes/backend",
      script: "dist/server.js",
      instances: 2,                    // Cluster mode: 2 instances
      exec_mode: "cluster",
      max_memory_restart: "512M",

      // ── Environment ──
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },

      // ── Logging ──
      log_file: "/var/www/smsvibes/logs/api-combined.log",
      out_file: "/var/www/smsvibes/logs/api-out.log",
      error_file: "/var/www/smsvibes/logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // ── Reliability ──
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000,

      // ── Graceful Shutdown ──
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};
```

### 3.2 Start & Persist PM2

```bash
# Start the application in production mode
cd /var/www/smsvibes
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list (survives reboots)
pm2 save

# Generate and install PM2 startup script
pm2 startup systemd
# Copy and run the command PM2 outputs

# Verify running processes
pm2 status
pm2 logs smsvibes-api --lines 50
```

### 3.3 Common PM2 Commands

```bash
# Reload with zero-downtime (cluster mode)
pm2 reload smsvibes-api

# Hard restart
pm2 restart smsvibes-api

# Stop
pm2 stop smsvibes-api

# Monitor (live dashboard)
pm2 monit

# Flush logs
pm2 flush smsvibes-api
```

---

## 4. Reverse Proxy — Nginx

### 4.1 Install Nginx (if not pre-installed)

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 4.2 Create SMSVIBES Nginx Server Block

Create `/etc/nginx/sites-available/smsvibes`:

```nginx
# ══════════════════════════════════════════════════════════════
# SMSVIBES — Nginx Reverse Proxy Configuration
# ══════════════════════════════════════════════════════════════

# ── Upstream: PM2 Cluster (Backend API) ──
upstream smsvibes_backend {
    least_conn;
    server 127.0.0.1:5000;
    keepalive 64;
}

# ── HTTP → HTTPS Redirect ──
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge path (required for SSL setup)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# ── Main HTTPS Server Block ──
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # ┌──────────────────────────────────────────────┐
    # │ SSL (Let's Encrypt — see Section 5)          │
    # └──────────────────────────────────────────────┘
    # ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    # include             /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # ┌──────────────────────────────────────────────┐
    # │ Security Headers                             │
    # └──────────────────────────────────────────────┘
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ┌──────────────────────────────────────────────┐
    # │ Gzip Compression                             │
    # └──────────────────────────────────────────────┘
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # ┌──────────────────────────────────────────────┐
    # │ Route: /api → Backend (PM2 Cluster)          │
    # └──────────────────────────────────────────────┘
    location /api {
        proxy_pass         http://smsvibes_backend;
        proxy_http_version 1.1;

        # Headers
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # ┌──────────────────────────────────────────────┐
    # │ Route: /socket.io → WebSocket Upgrade        │
    # └──────────────────────────────────────────────┘
    location /socket.io {
        proxy_pass         http://smsvibes_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket-friendly timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout    7d;
        proxy_read_timeout    7d;
    }

    # ┌──────────────────────────────────────────────┐
    # │ Route: / → Frontend (Next.js static export)  │
    # └──────────────────────────────────────────────┘
    location / {
        root /var/www/smsvibes/frontend/out;
        try_files $uri $uri.html $uri/ /index.html;

        # Cache static assets aggressively
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # ┌──────────────────────────────────────────────┐
    # │ Error Pages                                  │
    # └──────────────────────────────────────────────┘
    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    # ── Request Limits ──
    client_max_body_size 10M;
}
```

### 4.3 Enable the Site

```bash
# Symlink to sites-enabled
sudo ln -s /etc/nginx/sites-available/smsvibes /etc/nginx/sites-enabled/

# Remove the default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration syntax
sudo nginx -t
# Expected: syntax is ok / test is successful

# Reload Nginx
sudo systemctl reload nginx
```

---

## 5. SSL Termination — Let's Encrypt

### 5.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 Obtain SSL Certificate

```bash
# Obtain certificate (Nginx plugin handles config automatically)
sudo certbot --nginx \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --non-interactive \
  --agree-tos \
  --email your-email@example.com \
  --redirect
```

### 5.3 Verify Auto-Renewal

```bash
# Test the renewal process
sudo certbot renew --dry-run

# Certbot installs a systemd timer for auto-renewal.
# Verify it is active:
sudo systemctl status certbot.timer
```

### 5.4 Post-SSL: Uncomment Nginx Directives

After Certbot succeeds, verify that it has uncommented (or added) these lines
in `/etc/nginx/sites-available/smsvibes`:

```nginx
ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
include             /etc/letsencrypt/options-ssl-nginx.conf;
ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;
```

Then reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Firewall Rules

### 6.1 Configure UFW

```bash
# Allow SSH on custom port FIRST (critical order!)
sudo ufw allow 65002/tcp comment 'SSH Custom Port'

# Allow web traffic
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Deny default SSH port (after confirming 65002 works)
sudo ufw deny 22/tcp comment 'Block Default SSH'

# Enable firewall
sudo ufw enable

# Verify rules
sudo ufw status verbose
```

**Expected output:**

```
Status: active

To                         Action      From
--                         ------      ----
65002/tcp                  ALLOW       Anywhere    # SSH Custom Port
80/tcp                     ALLOW       Anywhere    # HTTP
443/tcp                    ALLOW       Anywhere    # HTTPS
22/tcp                     DENY        Anywhere    # Block Default SSH
```

---

## 7. Post-Setup Verification Checklist

Run through every item **before** triggering the first CI/CD deployment.

| #  | Check                                      | Command                                               | Expected                     |
|----|--------------------------------------------|-------------------------------------------------------|------------------------------|
| 01 | SSH on port 65002                          | `ssh -p 65002 root@<SERVER_IP>`                       | Successful login             |
| 02 | Port 22 blocked                            | `ssh -p 22 root@<SERVER_IP>`                          | Connection refused/timeout   |
| 03 | Node.js version                            | `node --version`                                      | `v20.x.x`                    |
| 04 | npm version                                | `npm --version`                                       | `10.x.x`                     |
| 05 | PM2 installed                              | `pm2 --version`                                       | `5.x.x`                      |
| 06 | PM2 startup configured                     | `pm2 startup`                                         | Already configured message   |
| 07 | Nginx running                              | `sudo systemctl status nginx`                         | `active (running)`           |
| 08 | Nginx config valid                         | `sudo nginx -t`                                       | `syntax is ok`               |
| 09 | App directory exists                       | `ls -la /var/www/smsvibes/`                           | Subdirectories listed        |
| 10 | UFW active                                 | `sudo ufw status`                                     | `Status: active`             |
| 11 | SSL certificate (after domain setup)       | `sudo certbot certificates`                           | Certificate listed           |
| 12 | SSL auto-renewal                           | `sudo certbot renew --dry-run`                        | `Congratulations`            |

---

## Environment Summary

```
┌────────────────────────────────────────────────────────┐
│  SMSVIBES Production Environment                       │
├────────────────────────────────────────────────────────┤
│  Host:       Hostinger Cloud Startup                   │
│  OS:         Ubuntu 22.04 LTS                          │
│  SSH Port:   65002                                     │
│  Node.js:    v20.x (managed)                           │
│  PM2:        v5.x (cluster mode, 2 instances)          │
│  Nginx:      Latest stable                             │
│  SSL:        Let's Encrypt (auto-renew)                │
│  Firewall:   UFW (65002, 80, 443 open)                 │
│  App Root:   /var/www/smsvibes/                         │
│  API Port:   5000 (internal, proxied via Nginx)        │
└────────────────────────────────────────────────────────┘
```

---

> **Next Task:** S1.22 — GitHub Actions CI/CD pipeline (`deploy.yml`) that connects
> to this server on port 65002 for automated zero-downtime deployments.