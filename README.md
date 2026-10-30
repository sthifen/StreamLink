<p align="center">
  <img src="https://sthifen.github.io/apps/logos/synctablet.svg" width="112" height="112" alt="Sync Tablet" />
</p>

<h1 align="center">Sync Tablet</h1>

<p align="center">
  <strong>Apuntes a mano en tu tablet Android que aparecen en vivo en tu PC con Linux.</strong><br />
  Handwritten notes on your Android tablet that show up live on your Linux PC.
</p>

> 🚧 **Sync Tablet 2.0 en desarrollo.** Esta es la primera pieza (apuntes a mano).
> La versión 1 (Electron) está en la rama [`legacy-v1`](../../tree/legacy-v1).

## Qué hace

- **En la tablet:** cuadernos y páginas (A4) con fondo de rayas, cuadros o liso.
  El **lápiz escribe** (con presión) y **el dedo mueve la hoja y hace zoom**, así la
  palma no pinta. Pluma, resaltador, goma (también con la punta de goma o el botón
  del S Pen), deshacer y rehacer. Funciona sin el PC.
- **En el PC:** lo que escribes aparece al momento en `http://localhost:8788`, y cada
  página se guarda en `~/SyncTablet/<Cuaderno>/Página NN.svg` para abrirla en
  cualquier programa (Obsidian, el navegador, un visor de imágenes).
- **Sin conexión:** la tablet guarda todo y, al volver a conectar, el PC se pone al
  día solo.

## Cómo se usa

1. En el PC: `./synctablet` (deja la ventana abierta).
2. En la tablet: instala `synctablet.apk` y conecta el cable USB con la
   *depuración USB* activada (como en [Encaje](https://github.com/sthifen/encaje)).
   Por WiFi: en la app, botón **WiFi** y la IP del PC.
3. Escribe. Abre `http://localhost:8788` en el PC para verlo en vivo.

## Compilar

```bash
cargo build --release          # PC: target/release/synctablet
android/build-apk.sh --install # tablet: sin Gradle ni Android Studio
cargo test
```

## Cómo funciona

```
Tablet (Java, sin dependencias)                PC (Rust, axum)
InkView ── trazo/borrado ──► WebSocket ──USB (adb reverse) / WiFi──► /ws/ink ──► ~/SyncTablet (JSON + SVG)
                                                                          └──► /ws/live ──► visor web
```

- La tablet es la dueña de los datos: cada cambio sube la versión de la página. Al
  conectar manda la versión de cada página y el PC pide las que tiene atrasadas.
- `src/ink.rs` (modelo y operaciones), `src/store.rs` (disco), `src/svg.rs`
  (exportar), `src/server.rs` (HTTP/WebSocket), `src/adb.rs` (`adb reverse`).
- `android/src/dev/synctablet/`: `InkView` (dibujo de baja latencia), `Store`
  (guardado local), `SyncClient` (conexión).

## Próximas piezas

1. Cuaderno tipo Notion en el PC: apuntes a mano, notas escritas, PDFs y fotos juntos.
2. Enlaces entre cosas.
3. Phone Link: notificaciones, fotos y archivos de la tablet en el PC.
