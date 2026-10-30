#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Sync Tablet — Instalador automático
#  Doble clic en este archivo para instalar todo
# ═══════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Detectar el AppImage automáticamente — funciona sin importar el nombre exacto
APPIMAGE_PATH=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.AppImage" | head -1)
APPIMAGE_NAME=$(basename "$APPIMAGE_PATH")

# ── Colores ──────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
B='\033[0;34m'; C='\033[0;36m'; W='\033[1;37m'; N='\033[0m'

clear
echo -e "${C}"
echo "  ███████╗██╗   ██╗███╗   ██╗ ██████╗"
echo "  ██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝"
echo "  ███████╗ ╚████╔╝ ██╔██╗ ██║██║"
echo "  ╚════██║  ╚██╔╝  ██║╚██╗██║██║"
echo "  ███████║   ██║   ██║ ╚████║╚██████╗"
echo "  ╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝"
echo -e "${W}         TABLET  —  Instalador${N}"
echo ""
echo -e "${B}═══════════════════════════════════════════${N}"
echo ""

# ── Detectar distro ──────────────────────────────────────
detect_distro() {
  if command -v apt &>/dev/null;    then echo "ubuntu"
  elif command -v dnf &>/dev/null;  then echo "fedora"
  elif command -v pacman &>/dev/null; then echo "arch"
  else echo "unknown"
  fi
}

DISTRO=$(detect_distro)
echo -e " ${W}Sistema detectado:${N} $DISTRO"
echo ""

# ── Paso 1: FUSE (necesario para AppImage) ──────────────
echo -e " ${Y}[1/4]${N} Instalando FUSE (necesario para abrir la app)…"
if ! command -v fusermount &>/dev/null && ! command -v fusermount3 &>/dev/null; then
  case $DISTRO in
    ubuntu)
      sudo apt-get install -y fuse libfuse2 2>/dev/null || \
      sudo apt-get install -y fuse2 libfuse2 2>/dev/null || \
      sudo apt-get install -y fuse 2>/dev/null
      ;;
    fedora)
      sudo dnf install -y fuse fuse-libs 2>/dev/null
      ;;
    arch)
      sudo pacman -S --noconfirm fuse2 2>/dev/null
      ;;
  esac
  echo -e "   ${G}✓ FUSE instalado${N}"
else
  echo -e "   ${G}✓ FUSE ya estaba instalado${N}"
fi

# ── Paso 2: ADB ──────────────────────────────────────────
echo -e " ${Y}[2/4]${N} Instalando ADB (conexión con la tablet)…"
if ! command -v adb &>/dev/null; then
  case $DISTRO in
    ubuntu) sudo apt-get install -y adb 2>/dev/null ;;
    fedora) sudo dnf install -y android-tools 2>/dev/null ;;
    arch)   sudo pacman -S --noconfirm android-tools 2>/dev/null ;;
  esac
  echo -e "   ${G}✓ ADB instalado${N}"
else
  echo -e "   ${G}✓ ADB ya estaba instalado${N}"
fi

# ── Paso 3: scrcpy ───────────────────────────────────────
echo -e " ${Y}[3/4]${N} Instalando scrcpy (espejo de pantalla)…"
if ! command -v scrcpy &>/dev/null; then
  case $DISTRO in
    ubuntu) sudo apt-get install -y scrcpy 2>/dev/null ;;
    fedora) sudo dnf install -y scrcpy 2>/dev/null ;;
    arch)   sudo pacman -S --noconfirm scrcpy 2>/dev/null ;;
  esac
  if ! command -v scrcpy &>/dev/null; then
    # Fallback: snap
    if command -v snap &>/dev/null; then
      sudo snap install scrcpy 2>/dev/null
    fi
  fi
  echo -e "   ${G}✓ scrcpy instalado${N}"
else
  echo -e "   ${G}✓ scrcpy ya estaba instalado${N}"
fi

# ── Paso 4: Permisos AppImage + acceso directo ───────────
echo -e " ${Y}[4/4]${N} Configurando Sync Tablet…"

if [ -f "$APPIMAGE_PATH" ]; then
  chmod +x "$APPIMAGE_PATH"
  echo -e "   ${G}✓ Permisos configurados${N}"

  # Crear acceso directo en el escritorio
  DESKTOP_FILE="$HOME/Escritorio/SyncTablet.desktop"
  # Intentar también en inglés
  [ -d "$HOME/Desktop" ] && DESKTOP_FILE="$HOME/Desktop/SyncTablet.desktop"
  [ -d "$HOME/Escritorio" ] && DESKTOP_FILE="$HOME/Escritorio/SyncTablet.desktop"

  cat > "$DESKTOP_FILE" << DESKTOP
[Desktop Entry]
Name=Sync Tablet
Comment=Conecta y controla tu tablet Android
Exec=$APPIMAGE_PATH
Icon=$APPIMAGE_PATH
Type=Application
Categories=Utility;
StartupNotify=true
DESKTOP
  chmod +x "$DESKTOP_FILE"
  # Marcar como confiable en GNOME
  gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
  echo -e "   ${G}✓ Acceso directo creado en el Escritorio${N}"
else
  echo -e "   ${Y}⚠ No se encontró $APPIMAGE_NAME en esta carpeta${N}"
  echo -e "   Asegúrate de que el .AppImage esté junto a este script."
fi

# ── Regla udev para ADB sin sudo ─────────────────────────
if [ ! -f /etc/udev/rules.d/51-android.rules ]; then
  echo -e "\n Configurando ADB sin necesidad de sudo…"
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0bb4", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="12d1", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="2717", MODE="0666", GROUP="plugdev"' | sudo tee /etc/udev/rules.d/51-android.rules > /dev/null
  sudo udevadm control --reload-rules 2>/dev/null || true
  sudo usermod -aG plugdev "$USER" 2>/dev/null || true
  echo -e "   ${G}✓ ADB configurado${N}"
fi

# ── Resumen final ─────────────────────────────────────────
echo ""
echo -e "${B}═══════════════════════════════════════════${N}"
echo -e " ${G}✓ ¡Instalación completada!${N}"
echo ""
echo -e " ${W}Cómo abrir Sync Tablet:${N}"
echo -e "   • Doble clic en el ícono del Escritorio"
echo -e "   • O doble clic en el archivo .AppImage"
echo ""
echo -e " ${W}Primera vez:${N}"
echo -e "   • Conecta la tablet por USB"
echo -e "   • Acepta la autorización en la tablet"
echo -e "   • Sigue el tutorial que aparece en la app"
echo ""
echo -e "${B}═══════════════════════════════════════════${N}"
echo ""
read -p " Presiona Enter para cerrar…"
