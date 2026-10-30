//! Sync Tablet: los apuntes a mano de la tablet Android aparecen en vivo en
//! el PC con Linux (`http://localhost:8788`) y se guardan en `~/SyncTablet`
//! como JSON (la fuente de verdad) y SVG (para abrirlos en cualquier lado).
//!
//! Por USB usa `adb reverse` (ver `adb.rs`); por WiFi, la app se conecta a
//! la IP del PC.

mod adb;
mod ink;
mod server;
mod store;
mod svg;

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use clap::Parser;

#[derive(Parser)]
#[command(version, about = "Apuntes a mano en la tablet Android, en vivo en tu PC con Linux")]
struct Args {
    /// Puerto HTTP (la app de la tablet usa el 8788)
    #[arg(long, default_value_t = 8788)]
    port: u16,
    /// Dirección de escucha (0.0.0.0 para que la tablet llegue por WiFi)
    #[arg(long, default_value = "0.0.0.0")]
    bind: IpAddr,
    /// Carpeta de los apuntes
    #[arg(long)]
    dir: Option<PathBuf>,
    /// No configurar `adb reverse` para las tablets por USB
    #[arg(long)]
    no_usb: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "error,synctablet=info".into()),
        )
        .with_target(false)
        .init();
    let args = Args::parse();
    let dir = args
        .dir
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join("SyncTablet"));
    let store = store::Store::open(&dir)?;
    let (live, _) = tokio::sync::broadcast::channel(256);
    let state = Arc::new(server::AppState { store: Mutex::new(store), live, devices: Mutex::new(Vec::new()) });

    let addr = SocketAddr::new(args.bind, args.port);
    let listener =
        tokio::net::TcpListener::bind(addr).await.with_context(|| format!("no se pudo escuchar en {addr}"))?;
    if !args.no_usb {
        tokio::spawn(adb::watch(args.port));
    }
    tracing::info!("apuntes en {}; visor en http://localhost:{}", dir.display(), args.port);
    axum::serve(listener, server::router(state).into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
