#!/bin/bash
# Automated test and deploy script for ShipStation integration

set -e

echo "🚀 Starting automated test and deploy..."

# Deploy changes
echo "📦 Deploying to server..."
git add -A
git commit -m "Auto-deploy ShipStation changes" || echo "No changes to commit"
git push

# SSH to server and run tests
echo "🔧 Running on server..."
ssh web@wolfwave.shop << 'ENDSSH'
cd ~/wolfwave
git pull
pm2 restart wolfwave
sleep 2
echo "✅ Server restarted"

echo "🧪 Running ShipStation integration tests..."
node test-shipstation.js

echo "📊 Checking server logs..."
pm2 logs wolfwave --lines 20 --nostream | grep -i "shipstation\|error" || echo "No errors found"

ENDSSH

echo "✅ Done!"
