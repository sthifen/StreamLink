# Sync Tablet

App de escritorio para Linux que conecta tu tablet Android al PC —
espejo de pantalla con scrcpy + transferencia de archivos con Syncthing.

## Instalación rápida

```bash
# 1. Instala Node.js (si no lo tienes)
# Fedora:
sudo dnf install -y nodejs

# Ubuntu:
sudo apt install -y nodejs npm

# Arch:
sudo pacman -S --noconfirm nodejs npm

# 2. Clona o descomprime el proyecto y entra a la carpeta
cd sync-tablet

# 3. Ejecuta el script de instalación
bash instalar.sh

# 4. Inicia la app
npm run dev
```

## Herramientas que necesita la app

La app verifica estas herramientas al arrancar y te guía para instalarlas:

| Herramienta | Para qué sirve | Requerida |
|-------------|----------------|-----------|
| `adb`       | Conectar la tablet al PC | ✓ |
| `scrcpy`    | Espejo de pantalla en tiempo real | ✓ |
| `syncthing` | Sincronización de archivos por Wi-Fi | ✓ |
| `xdotool`   | Detección de ventanas | Opcional |

## Estructura del proyecto

```
sync-tablet/
├── electron/
│   ├── main.js      ← Proceso principal (Node.js, acceso al sistema)
│   └── preload.js   ← Puente seguro entre Electron y React
├── src/
│   ├── App.jsx               ← Router: Setup → App principal
│   ├── pages/
│   │   ├── SetupScreen.jsx   ← Pantalla de requisitos al inicio
│   │   └── MainApp.jsx       ← App principal con tabs
│   └── components/
│       ├── DeviceHeader.jsx  ← Header con estado ADB
│       ├── ScrcpyPage.jsx    ← Pestaña "Pantalla"
│       ├── TransferPage.jsx  ← Pestaña "Transferencia / Drop"
│       └── SettingsPage.jsx  ← Panel de configuración
├── package.json
├── vite.config.js
└── instalar.sh
```

## Flujo de la app

1. Al arrancar → **SetupScreen** verifica adb, scrcpy, syncthing, xdotool
2. Por cada herramienta faltante → botón "Instalar" abre terminal con el comando
3. Al continuar → pantalla principal con dos pestañas:
   - **Pantalla**: botón play → lanza scrcpy
   - **Transferencia**: chat tipo Drop + historial de archivos en ~/Drop
4. Engranaje → panel de configuración (General, ADB, Syncthing, Dependencias)

## Empaquetar para distribución

```bash
npm run build
# Genera en dist/:  sync-tablet.AppImage  sync-tablet.deb  sync-tablet.rpm
```
