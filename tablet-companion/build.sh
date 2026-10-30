#!/bin/bash
# Construye la APK de Tablet Companion
# Requisitos: conexión a internet (primera vez descarga Gradle ~130MB)

set -e
cd "$(dirname "$0")"

WRAPPER_JAR="gradle/wrapper/gradle-wrapper.jar"

# Descarga el wrapper JAR si no existe
if [ ! -f "$WRAPPER_JAR" ]; then
    echo ">>> Descargando gradle-wrapper.jar..."
    # Versión correspondiente a Gradle 8.9
    WRAPPER_URL="https://github.com/gradle/gradle/raw/v8.9.0/gradle/wrapper/gradle-wrapper.jar"
    if command -v curl &>/dev/null; then
        curl -L -o "$WRAPPER_JAR" "$WRAPPER_URL"
    elif command -v wget &>/dev/null; then
        wget -O "$WRAPPER_JAR" "$WRAPPER_URL"
    else
        echo "ERROR: necesitas curl o wget"
        exit 1
    fi
fi

echo ">>> Compilando APK (primera vez tarda ~5 minutos descargando Gradle)..."
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
    echo ""
    echo "✓ APK generada: $APK"
    echo ""
    echo "Instalar en el tablet conectado por USB:"
    echo "  adb install -r $APK"
    echo ""
    echo "Instalar por WiFi (si ya está pareado):"
    echo "  adb -s <IP>:5555 install -r $APK"
else
    echo "ERROR: No se encontró la APK. Revisa los errores de compilación arriba."
    exit 1
fi
