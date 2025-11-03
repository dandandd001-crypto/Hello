# Truth or Dare - Deployment Guide

## Ubuntu Production Deployment

This guide will help you deploy the Truth or Dare application on an Ubuntu server (22.04 or 24.04 LTS).

### Prerequisites
- Ubuntu 22.04 or 24.04 LTS
- Sudo access
- Domain name pointed to your server IP
- GitHub repository with your code

### Step 1: Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install basic tools
sudo apt install -y curl wget git build-essential ufw
```

### Step 2: Install Node.js 24.x LTS

```bash
# Install prerequisites
sudo apt install -y ca-certificates curl gnupg

# Add NodeSource GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# Add Node.js 24.x repository
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] \
https://deb.nodesource.com/node_24.x nodistro main" | \
  sudo tee /etc/apt/sources.list.d/nodesource.list

# Install Node.js
sudo apt update
sudo apt install -y nodejs

# Verify installation
node -v  # Should show v24.x.x
npm -v
```

### Step 3: Install PostgreSQL 16

```bash
# Add PostgreSQL APT repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

# Import repository signing key
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### Step 4: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database and user
psql << EOF
CREATE DATABASE truthordare_db;
CREATE USER truthordare_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE truthordare_db TO truthordare_user;
\\q
EOF

# Exit postgres user
exit

# Test connection
psql -h localhost -U truthordare_user -d truthordare_db -W
```

### Step 5: Install Nginx 1.28.0

```bash
# Install prerequisites
sudo apt install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring

# Import Nginx signing key
curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor \
    | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null

# Add stable repository
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
http://nginx.org/packages/ubuntu `lsb_release -cs` nginx" \
    | sudo tee /etc/apt/sources.list.d/nginx.list

# Set repository priority
echo -e "Package: *\\nPin: origin nginx.org\\nPin: release o=nginx\\nPin-Priority: 900\\n" \
    | sudo tee /etc/apt/preferences.d/99nginx

# Install Nginx
sudo apt update
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify installation
nginx -v
```

### Step 6: Install PM2

```bash
# Install PM2 globally
sudo npm install pm2@latest -g

# Verify installation
pm2 -v

# Setup PM2 startup script
pm2 startup
# Follow the command it outputs
```

### Step 7: Configure Firewall

```bash
# Allow SSH (important!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 8: Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository
git clone https://github.com/yourusername/truth-or-dare.git

# Navigate into project
cd truth-or-dare
```

### Step 9: Configure Environment Variables

```bash
# Create .env file
nano .env
```

Add the following (adjust values):

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL=postgresql://truthordare_user:your_secure_password_here@localhost:5432/truthordare_db
```

Save and exit (Ctrl+X, then Y, then Enter)

### Step 10: Install Dependencies and Build

```bash
# Install all dependencies
npm install

# Build frontend
npm run build
```

### Step 11: Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/conf.d/truthordare.conf
```

Add the following configuration (replace yourdomain.com and yourusername):

```nginx
upstream backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # Root directory for frontend
    root /home/yourusername/truth-or-dare/client/dist;
    index index.html;

    # Frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API requests
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io WebSocket connections
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Uploaded files
    location /uploads/ {
        alias /home/yourusername/truth-or-dare/uploads/;
        expires 7d;
    }
}
```

```bash
# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 12: Install SSL Certificate

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Step 13: Start Application with PM2

```bash
# Navigate to project directory
cd ~/truth-or-dare

# Start application with PM2
pm2 start npm --name "truthordare" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# Check status
pm2 status
pm2 logs truthordare
```

### Step 14: Create Upload Directory

```bash
# Create uploads directory
mkdir -p ~/truth-or-dare/uploads

# Set proper permissions
chmod 755 ~/truth-or-dare/uploads
```

---

## Beginner-Friendly Deployment Guide

### What You Need
- A server or computer with Ubuntu Linux
- A domain name (free options: DuckDNS.org, Freenom.com, No-IP.com)
- Your code on GitHub
- Basic command line knowledge

### Quick Setup Steps

1. **Connect to your server**
   ```bash
   ssh username@your-server-ip
   ```

2. **Update system**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Install Node.js** (follow Step 2 above)

4. **Install PostgreSQL** (follow Step 3-4 above)

5. **Install Nginx** (follow Step 5 above)

6. **Install PM2**
   ```bash
   sudo npm install pm2@latest -g
   ```

7. **Get your code**
   ```bash
   cd ~
   git clone https://github.com/yourusername/your-repo.git
   cd your-repo
   ```

8. **Install dependencies**
   ```bash
   npm install
   npm run build
   ```

9. **Configure environment** (create .env file with database details)

10. **Setup Nginx** (follow Step 11 above)

11. **Get free SSL**
    ```bash
    sudo certbot --nginx -d yourdomain.com
    ```

12. **Start your app**
    ```bash
    pm2 start npm --name "truthordare" -- start
    pm2 save
    pm2 startup
    ```

### Common Commands

```bash
# View logs
pm2 logs

# Restart app
pm2 restart truthordare

# Check status
pm2 status

# Update code
cd ~/your-repo
git pull
npm install
npm run build
pm2 restart truthordare
```

### Troubleshooting

**App won't start:**
- Check logs: `pm2 logs`
- Check database: `sudo systemctl status postgresql`

**Can't access site:**
- Check Nginx: `sudo systemctl status nginx`
- Check firewall: `sudo ufw status`

**Database connection error:**
- Verify .env file has correct password
- Test connection: `psql -h localhost -U truthordare_user -d truthordare_db`

---

## Free Domain Options

- **DuckDNS**: https://www.duckdns.org - Very beginner-friendly
- **Freenom**: https://www.freenom.com - Free .tk, .ml, .ga domains
- **No-IP**: https://www.noip.com - Free dynamic DNS

---

## Maintenance

### Update Application

```bash
cd ~/truth-or-dare
git pull
npm install
npm run build
pm2 restart truthordare
```

### View Logs

```bash
pm2 logs truthordare
pm2 logs truthordare --lines 100
```

### Monitor Resources

```bash
pm2 monit
```

### Backup Database

```bash
pg_dump -U truthordare_user -d truthordare_db > backup_$(date +%Y%m%d).sql
```

---

## Support

For issues or questions, check the logs first:
```bash
pm2 logs truthordare --lines 50
sudo tail -f /var/log/nginx/error.log
```
