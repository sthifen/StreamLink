//! HTTP del PC:
//!
//! * `/ws/ink`: la tablet. Al conectar manda `hello` con la versión de cada
//!   página; el PC le pide (`want`) las que tiene atrasadas y después recibe
//!   cada trazo y borrado según ocurren.
//! * `/ws/live`: los navegadores con el visor; reciben lo mismo en vivo.
//! * `/api/…`: cuadernos, páginas en JSON y en SVG, para el visor.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{StatusCode, header};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use serde_json::json;
use tokio::sync::broadcast;

use crate::ink::{Applied, Msg};
use crate::store::Store;

pub struct AppState {
    pub store: Mutex<Store>,
    pub live: broadcast::Sender<String>,
    /// Tablets conectadas ahora, para el visor que se abre a mitad.
    pub devices: Mutex<Vec<String>>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(|| async { Html(include_str!("../web/index.html")) }))
        .route("/api/notebooks", get(notebooks))
        .route("/api/page/{id}", get(page_json))
        .route("/api/page/{id}/svg", get(page_svg))
        .route("/ws/ink", get(ws_ink))
        .route("/ws/live", get(ws_live))
        .with_state(state)
}

async fn notebooks(State(s): State<Arc<AppState>>) -> Response {
    let store = s.store.lock().unwrap();
    let versions = store.manifest();
    let device = s.devices.lock().unwrap().first().cloned();
    axum::Json(json!({ "notebooks": store.notebooks(), "versions": versions, "dir": store.root(), "device": device }))
        .into_response()
}

async fn page_json(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> Response {
    match s.store.lock().unwrap().page(&id) {
        Some(p) => axum::Json(p).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn page_svg(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> Response {
    match s.store.lock().unwrap().page(&id) {
        Some(p) => ([(header::CONTENT_TYPE, "image/svg+xml")], crate::svg::page_svg(p)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn ws_live(ws: WebSocketUpgrade, State(s): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(move |mut socket| async move {
        let mut rx = s.live.subscribe();
        loop {
            tokio::select! {
                msg = rx.recv() => match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    // Un navegador lento se perdió mensajes: que recargue la página.
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let _ = socket.send(Message::Text(json!({ "t": "reload" }).to_string().into())).await;
                    }
                    Err(_) => break,
                },
                incoming = socket.recv() => if !matches!(incoming, Some(Ok(_))) { break },
            }
        }
    })
}

async fn ws_ink(
    ws: WebSocketUpgrade,
    State(s): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
) -> Response {
    ws.on_upgrade(move |socket| tablet(socket, s, peer))
}

async fn tablet(mut socket: WebSocket, s: Arc<AppState>, peer: SocketAddr) {
    let mut device = String::new();
    while let Some(Ok(msg)) = socket.recv().await {
        let Message::Text(text) = msg else { continue };
        let parsed: Msg = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                tracing::debug!("mensaje de la tablet inválido: {e}");
                continue;
            }
        };
        let reply = match handle(&s, &parsed, &text) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("no se pudo guardar: {e:#}");
                None
            }
        };
        if let Msg::Hello { device: d, .. } = &parsed {
            device = if d.is_empty() { "Tablet".into() } else { d.clone() };
            s.devices.lock().unwrap().push(device.clone());
            tracing::info!("{device} conectada ({peer})");
            let _ = s.live.send(json!({ "t": "device", "name": device, "connected": true }).to_string());
        }
        if let Some(r) = reply {
            if socket.send(Message::Text(r.into())).await.is_err() {
                break;
            }
        }
    }
    if device.is_empty() {
        return;
    }
    tracing::info!("{device} desconectada");
    let mut devices = s.devices.lock().unwrap();
    if let Some(i) = devices.iter().position(|d| *d == device) {
        devices.remove(i);
    }
    let (connected, name) = match devices.first() {
        Some(other) => (true, other.clone()),
        None => (false, device),
    };
    let _ = s.live.send(json!({ "t": "device", "name": name, "connected": connected }).to_string());
}

/// Aplica un mensaje de la tablet; devuelve la respuesta para ella, si hay.
fn handle(s: &AppState, msg: &Msg, raw: &str) -> anyhow::Result<Option<String>> {
    let mut store = s.store.lock().unwrap();
    let want = |ids: Vec<&str>| Some(json!({ "t": "want", "pages": ids }).to_string());
    let applied = match msg {
        Msg::Hello { pages, .. } => {
            let have = store.manifest();
            let mut missing: Vec<&str> =
                pages.iter().filter(|(id, v)| have.get(*id).is_none_or(|h| h < v)).map(|(id, _)| id.as_str()).collect();
            missing.sort();
            return Ok(want(missing));
        }
        Msg::Notebook { notebook } => {
            store.put_notebook(notebook.clone())?;
            Applied::Ok
        }
        Msg::Page { page } => {
            store.put_page(page.clone())?;
            Applied::Ok
        }
        Msg::Stroke { page, version, stroke } => store.add_stroke(page, *version, stroke.clone())?,
        Msg::Erase { page, version, ids } => store.erase(page, *version, ids)?,
        Msg::DeletePage { page } => {
            store.delete_page(page)?;
            Applied::Ok
        }
        Msg::DeleteNotebook { notebook } => {
            store.delete_notebook(notebook)?;
            Applied::Ok
        }
    };
    match applied {
        Applied::Ok => {
            let _ = s.live.send(raw.to_owned());
            Ok(None)
        }
        Applied::Stale => Ok(None),
        Applied::Gap => {
            let page = match msg {
                Msg::Stroke { page, .. } | Msg::Erase { page, .. } => page.as_str(),
                _ => return Ok(None),
            };
            Ok(want(vec![page]))
        }
    }
}
