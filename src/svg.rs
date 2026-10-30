//! Página → SVG, para abrir los apuntes en cualquier programa (visor de
//! imágenes, Obsidian, el navegador) sin Sync Tablet.
//!
//! La pluma varía de grosor con la presión: cada tramo entre dos puntos es
//! una línea con su propio grosor y extremos redondeados, así los tramos se
//! funden sin costuras. Los tramos con el mismo grosor van en el mismo path.

use std::fmt::Write;

use crate::ink::{Background, PAGE_H, PAGE_W, Page, Stroke, Tool};

/// Grosor de un tramo con presión `p`: nunca menos de un 35 % del nominal,
/// para que un toque suave se siga viendo.
pub fn pressure_width(width: f32, p: f32) -> f32 {
    width * (0.35 + 0.65 * p.clamp(0.0, 1.0))
}

pub fn page_svg(page: &Page) -> String {
    let mut s = String::new();
    let _ = write!(
        s,
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PAGE_W} {PAGE_H}" width="{PAGE_W}" height="{PAGE_H}"><rect width="{PAGE_W}" height="{PAGE_H}" fill="#FFFFFF"/>"##
    );
    background(&mut s, page.background);
    for stroke in &page.strokes {
        stroke_svg(&mut s, stroke);
    }
    s.push_str("</svg>");
    s
}

fn background(s: &mut String, bg: Background) {
    let (step, vertical) = match bg {
        Background::Plain => return,
        Background::Lines => (40.0, false),
        Background::Grid => (40.0, true),
    };
    s.push_str(r##"<g stroke="#C9D3E3" stroke-width="1">"##);
    let mut y = step * 2.0;
    while y < PAGE_H {
        let _ = write!(s, r#"<line x1="0" y1="{y}" x2="{PAGE_W}" y2="{y}"/>"#);
        y += step;
    }
    if vertical {
        let mut x = step;
        while x < PAGE_W {
            let _ = write!(s, r#"<line x1="{x}" y1="0" x2="{x}" y2="{PAGE_H}"/>"#);
            x += step;
        }
    }
    s.push_str("</g>");
}

fn color(c: &str) -> &str {
    // Sólo `#RRGGBB`: lo demás no entra en el SVG.
    if c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) { c } else { "#000000" }
}

fn stroke_svg(s: &mut String, stroke: &Stroke) {
    let n = stroke.point_count();
    if n == 0 {
        return;
    }
    let col = color(&stroke.color);
    if stroke.tool == Tool::Highlighter {
        let _ = write!(
            s,
            r#"<path fill="none" stroke="{col}" stroke-opacity="0.35" stroke-width="{:.1}" stroke-linecap="round" stroke-linejoin="round" d=""#,
            stroke.width
        );
        for i in 0..n {
            let (x, y, _) = stroke.point(i);
            let _ = write!(s, "{}{x:.1} {y:.1}", if i == 0 { "M" } else { "L" });
        }
        if n == 1 {
            let (x, y, _) = stroke.point(0);
            let _ = write!(s, "L{x:.1} {y:.1}");
        }
        s.push_str(r#""/>"#);
        return;
    }
    // Pluma: tramos agrupados por grosor (redondeado a 0,1).
    let mut groups: Vec<(i32, String)> = Vec::new();
    let mut seg = |w: f32, x0: f32, y0: f32, x1: f32, y1: f32| {
        let key = (w * 10.0).round() as i32;
        let d = match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, d)) => d,
            None => {
                groups.push((key, String::new()));
                &mut groups.last_mut().unwrap().1
            }
        };
        let _ = write!(d, "M{x0:.1} {y0:.1}L{x1:.1} {y1:.1}");
    };
    if n == 1 {
        let (x, y, p) = stroke.point(0);
        seg(pressure_width(stroke.width, p), x, y, x, y);
    }
    for i in 1..n {
        let (x0, y0, p0) = stroke.point(i - 1);
        let (x1, y1, p1) = stroke.point(i);
        seg(pressure_width(stroke.width, (p0 + p1) / 2.0), x0, y0, x1, y1);
    }
    for (key, d) in groups {
        let _ = write!(
            s,
            r#"<path fill="none" stroke="{col}" stroke-width="{:.1}" stroke-linecap="round" d="{d}"/>"#,
            key as f32 / 10.0
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(strokes: Vec<Stroke>, background: Background) -> Page {
        Page { id: "p".into(), notebook: "n".into(), version: 1, background, strokes }
    }

    #[test]
    fn pen_width_follows_pressure() {
        let st = Stroke {
            id: "a".into(),
            tool: Tool::Pen,
            color: "#112233".into(),
            width: 4.0,
            points: vec![0.0, 0.0, 1.0, 10.0, 0.0, 1.0, 20.0, 0.0, 0.0],
        };
        let svg = page_svg(&page(vec![st], Background::Plain));
        // Presión 1 → 4.0; tramo con presión media 0.5 → 4·(0.35+0.325)=2.7.
        assert!(svg.contains(r##"stroke="#112233" stroke-width="4.0" stroke-linecap="round" d="M0.0 0.0L10.0 0.0""##), "{svg}");
        assert!(svg.contains(r#"stroke-width="2.7" stroke-linecap="round" d="M10.0 0.0L20.0 0.0""#), "{svg}");
    }

    #[test]
    fn highlighter_and_backgrounds() {
        let st = Stroke { id: "h".into(), tool: Tool::Highlighter, color: "#FFD60A".into(), width: 20.0, points: vec![5.0, 5.0, 0.3] };
        let svg = page_svg(&page(vec![st], Background::Grid));
        assert!(svg.contains(r#"stroke-opacity="0.35" stroke-width="20.0""#));
        assert!(svg.contains("M5.0 5.0L5.0 5.0"));
        assert!(svg.contains(r#"<line x1="40" y1="0""#));
        assert!(!page_svg(&page(vec![], Background::Plain)).contains("<line"));
    }

    #[test]
    fn rejects_odd_colors() {
        let st = Stroke { id: "x".into(), tool: Tool::Pen, color: "red\"/><script>".into(), width: 2.0, points: vec![1.0, 1.0, 1.0] };
        let svg = page_svg(&page(vec![st], Background::Plain));
        assert!(!svg.contains("script"));
        assert!(svg.contains(r##"stroke="#000000""##));
    }
}
