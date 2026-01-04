#!/bin/bash
echo "======================================"
echo "   Waifu-RT3D x Open-WebUI Integrator"
echo "======================================"
echo ""
echo "This script will download and setup the official Open-WebUI"
echo "alongside your Waifu-RT3D backend."
echo ""

# Check for node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js (v18+) from https://nodejs.org/"
    exit 1
fi

echo "1. Cloning Open-WebUI..."
git clone https://github.com/open-webui/open-webui.git
cd open-webui

echo "2. Installing Dependencies (this may take a while)..."
# Copy our .env example if we had one, for now just basic install
npm install

echo "3. Creating Start Script..."
echo "To run Open-WebUI, use: cd open-webui && npm run dev"
echo "It will typically run on localhost:5173"
echo ""
echo "✅ Setup Complete!"
echo "NOTE: To connect Waifu-RT3D's backend to Open-WebUI,"
echo "you will need to configure Open-WebUI to point to our API,"
echo "or integration the 3D viewer via iframe."
