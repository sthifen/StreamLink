#!/bin/bash
# ─── Sync Tablet — Script de instalación ──────────────────────────────────────
set -e

echo ""
echo "  ⬡  Sync Tablet — Instalación"
echo "  ─────────────────────────────"
echo ""

# 1. Verificar Node.js
if ! command -v node &>/dev/null; then
  echo "  ✗  Node.js no encontrado."
  echo ""
  echo "  Instala Node.js primero:"
  echo "    Fedora:  sudo dnf install -y nodejs"
  echo "    Ubuntu:  sudo apt install -y nodejs npm"
  echo "    Arch:    sudo pacman -S --noconfirm nodejs npm"
  echo "    O desde: https://nodejs.org"
  echo ""
  exit 1
fi

NODE_VER=$(node --version)
echo "  ✓  Node.js $NODE_VER"

# 2. Verificar npm
if ! command -v npm &>/dev/null; then
  echo "  ✗  npm no encontrado. Instala npm."
  exit 1
fi
echo "  ✓  npm $(npm --version)"

# 3. Instalar dependencias del proyecto
echo ""
echo "  → Instalando dependencias del proyecto…"
npm install

echo ""
echo "  ✓  Todo listo."
echo ""
echo "  Para ejecutar en modo desarrollo:"
echo "    npm run dev"
echo ""
echo "  Para construir el instalador (.AppImage / .deb):"
echo "    npm run build"
echo ""
