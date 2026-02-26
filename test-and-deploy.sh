#!/bin/bash
# Automated test and deploy script for ShipStation integration
# Run this ON the dev server

set -e

echo "🚀 Starting automated test and deploy..."

# Pull latest changes
echo "📦 Pulling latest code..."
git pull

# Restart server
echo "🔧 Restarting server..."
pm2 restart wolfwave
sleep 2
echo "✅ Server restarted"

# Run tests
echo "🧪 Running ShipStation integration tests..."
node test-shipstation.js

# Show recent logs
echo ""
echo "📊 Recent server logs:"
pm2 logs wolfwave --lines 20 --nostream | grep -i "shipstation\|error" || echo "No errors found"

echo ""
echo "✅ Done!"
