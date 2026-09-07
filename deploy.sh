#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Spheronix Attendance System — EC2 Deployment Script
# Run this on a fresh Ubuntu 22.04 LTS EC2 instance (t3.medium or above)
# ──────────────────────────────────────────────────────────────────────────────
set -e

echo "════════════════════════════════════════════════════════════"
echo " Spheronix Attendance System — Production Deployment"
echo "════════════════════════════════════════════════════════════"

PROJECT_DIR="/home/ubuntu/attendance-system"

# ── 1. System Updates ─────────────────────────────────────────────────────────
echo "📦 [1/10] Updating system..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Install Node.js 20 LTS ─────────────────────────────────────────────────
echo "📦 [2/10] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

# ── 3. Install PM2 globally ───────────────────────────────────────────────────
echo "📦 [3/10] Installing PM2..."
sudo npm install -g pm2
pm2 --version

# ── 4. Install Nginx ──────────────────────────────────────────────────────────
echo "📦 [4/10] Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# ── 5. Install Certbot ────────────────────────────────────────────────────────
echo "📦 [5/10] Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

# ── 6. Clone/Copy Project ─────────────────────────────────────────────────────
echo "📦 [6/10] Setting up project..."
if [ -d "$PROJECT_DIR" ]; then
    echo "Project directory exists, pulling latest..."
    cd $PROJECT_DIR && git pull
else
    echo "Cloning repository..."
    git clone https://github.com/spheronixtechnology/attendance-system.git $PROJECT_DIR
fi

# ── 7. Install API Dependencies ───────────────────────────────────────────────
echo "📦 [7/10] Installing API dependencies..."
cd $PROJECT_DIR/apps/api
npm install --production

# ── 8. Build Frontend Apps ────────────────────────────────────────────────────
echo "📦 [8/10] Building frontend apps..."
for app in admin manager employee; do
    echo "  Building $app..."
    cd $PROJECT_DIR/apps/$app
    npm install
    npm run build
    echo "  ✅ $app built successfully"
done

# ── 9. Configure Nginx ────────────────────────────────────────────────────────
echo "📦 [9/10] Configuring Nginx..."
sudo cp $PROJECT_DIR/nginx.conf /etc/nginx/sites-available/attendance-system
sudo ln -sf /etc/nginx/sites-available/attendance-system /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 10. Setup SSL with Certbot ────────────────────────────────────────────────
echo "📦 [10/10] Setting up SSL..."
sudo certbot --nginx \
    -d admin.spheronixtechnology.in \
    -d manager.spheronixtechnology.in \
    -d employee.spheronixtechnology.in \
    -d api.spheronixtechnology.in \
    --non-interactive \
    --agree-tos \
    --email admin@spheronixtechnology.in

# ── 11. Create .env file if not exists ───────────────────────────────────────
if [ ! -f "$PROJECT_DIR/apps/api/.env" ]; then
    echo "⚠️  Creating .env from template — EDIT THIS IMMEDIATELY!"
    cp $PROJECT_DIR/apps/api/.env.example $PROJECT_DIR/apps/api/.env
    echo "   → Edit: nano $PROJECT_DIR/apps/api/.env"
fi

# ── 12. Start API with PM2 ────────────────────────────────────────────────────
echo "🚀 Starting API with PM2..."
mkdir -p /var/log/pm2
cd $PROJECT_DIR
pm2 start ecosystem.config.json
pm2 save
sudo pm2 startup systemd -u ubuntu --hp /home/ubuntu

# ── 13. Setup Certbot auto-renewal ───────────────────────────────────────────
echo "🔒 Setting up SSL auto-renewal..."
echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" | sudo crontab -

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo ""
echo "🔗 Endpoints:"
echo "   Admin:    https://admin.spheronixtechnology.in"
echo "   Manager:  https://manager.spheronixtechnology.in"
echo "   Employee: https://employee.spheronixtechnology.in"
echo "   API:      https://api.spheronixtechnology.in"
echo ""
echo "📋 Next Steps:"
echo "   1. Edit .env: nano $PROJECT_DIR/apps/api/.env"
echo "   2. Run seed:  cd $PROJECT_DIR && node apps/api/src/scripts/seed.js"
echo "   3. Check PM2: pm2 status"
echo "   4. Check logs: pm2 logs attendance-api"
echo "════════════════════════════════════════════════════════════"
