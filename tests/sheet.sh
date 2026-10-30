#!/usr/bin/env bash
# Prueba las fórmulas de las hojas de cálculo y la galería de figuras en el PC.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
mkdir -p "$OUT/src/dev/synctablet"
cp "$ROOT/android/src/dev/synctablet/Sheet.java" "$ROOT/android/src/dev/synctablet/ShapeLibrary.java" "$ROOT/tests/SheetTest.java" "$OUT/src/dev/synctablet/"
if command -v javac >/dev/null; then JAVAC=(javac); else JAVAC=(java -m jdk.compiler/com.sun.tools.javac.Main); fi
"${JAVAC[@]}" -d "$OUT/classes" "$OUT"/src/dev/synctablet/*.java
java -cp "$OUT/classes" dev.synctablet.SheetTest
