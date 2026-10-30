package dev.synctablet;

import java.util.ArrayList;

/**
 * Reconoce figuras dibujadas a mano y devuelve su versión perfecta: línea,
 * círculo, elipse, rectángulo, triángulo o polígono de 4 lados.
 *
 * Java puro (sin Android) para poder probarlo en el PC.
 *
 * 1. Se remuestrea el trazo a puntos equidistantes.
 * 2. Abierto y casi recto → línea (horizontal/vertical si está a menos de 6°).
 * 3. Cerrado: se buscan las esquinas (Douglas-Peucker sobre el contorno).
 *    Contorno suave que se ajusta a una elipse → círculo o elipse;
 *    3 esquinas → triángulo; 4 → rectángulo (si los ángulos son rectos) o
 *    cuadrilátero.
 */
final class ShapeRecognizer {
    static final String LINE = "línea", CIRCLE = "círculo", ELLIPSE = "elipse",
            RECTANGLE = "rectángulo", TRIANGLE = "triángulo", QUAD = "cuadrilátero";

    static final class Shape {
        final String kind;
        /** x, y seguidos, en orden de dibujo. */
        final float[] xy;

        Shape(String kind, float[] xy) {
            this.kind = kind;
            this.xy = xy;
        }
    }

    private static final int N = 64;

    /** `xy`: x, y seguidos (n puntos). Null si no parece ninguna figura. */
    static Shape recognize(float[] xy, int n) {
        if (n < 2) return null;
        float length = pathLength(xy, n);
        if (length < 24) return null;
        float[] p = resample(xy, n, N);
        float gap = dist(p[0], p[1], p[2 * N - 2], p[2 * N - 1]);

        // Línea: casi recta y abierta.
        float dev = maxDeviation(p, N, 0, N - 1);
        if (gap > 0.6f * length && dev < 0.05f * length) return line(p[0], p[1], p[2 * N - 2], p[2 * N - 1]);
        if (gap > 0.22f * length) return null;

        // Contorno cerrado: esquinas por Douglas-Peucker.
        ArrayList<Integer> corners = closedCorners(p, N, 0.045f * length);
        float ellipseError = ellipseError(p, N);
        if (ellipseError < 0.11f && corners.size() >= 5) return ellipse(p, N);
        // Polígono sólo si sus esquinas son afiladas: los extremos de una
        // elipse alargada también salen como «esquinas», pero suaves.
        boolean sharp = true;
        for (int c : corners) sharp &= turn(p, N, c) < 125;
        if (sharp && corners.size() == 3) return polygon(TRIANGLE, p, corners);
        if (sharp && corners.size() == 4) return quad(p, corners);
        // Con 3 o 4 esquinas dudosas, elipse sólo si lo es claramente; si no,
        // mejor no tocar el trazo que convertirlo en otra cosa.
        boolean fewCorners = corners.size() == 3 || corners.size() == 4;
        if (ellipseError < (fewCorners ? 0.08f : 0.2f)) return ellipse(p, N);
        return null;
    }

    // ---- Figuras ----

    private static Shape line(float x0, float y0, float x1, float y1) {
        double angle = Math.toDegrees(Math.atan2(y1 - y0, x1 - x0));
        double a = ((angle % 90) + 90) % 90;
        if (a < 6 || a > 84) {
            if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) y1 = y0 = (y0 + y1) / 2;
            else x1 = x0 = (x0 + x1) / 2;
        }
        return new Shape(LINE, densify(new float[] {x0, y0, x1, y1}, false));
    }

    private static Shape ellipse(float[] p, int n) {
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (int i = 0; i < n; i++) {
            minX = Math.min(minX, p[2 * i]); maxX = Math.max(maxX, p[2 * i]);
            minY = Math.min(minY, p[2 * i + 1]); maxY = Math.max(maxY, p[2 * i + 1]);
        }
        float cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
        String kind = ELLIPSE;
        if (Math.abs(rx - ry) < 0.15f * Math.max(rx, ry)) {
            rx = ry = (rx + ry) / 2;
            kind = CIRCLE;
        }
        // Empieza donde empezó el trazo y gira en el mismo sentido.
        double start = Math.atan2(p[1] - cy, p[0] - cx);
        double dir = signedArea(p, n) >= 0 ? 1 : -1;
        int m = 72;
        float[] out = new float[2 * (m + 1)];
        for (int i = 0; i <= m; i++) {
            double t = start + dir * 2 * Math.PI * i / m;
            out[2 * i] = cx + rx * (float) Math.cos(t);
            out[2 * i + 1] = cy + ry * (float) Math.sin(t);
        }
        return new Shape(kind, out);
    }

    private static Shape polygon(String kind, float[] p, ArrayList<Integer> corners) {
        float[] v = new float[2 * corners.size() + 2];
        for (int i = 0; i < corners.size(); i++) {
            v[2 * i] = p[2 * corners.get(i)];
            v[2 * i + 1] = p[2 * corners.get(i) + 1];
        }
        v[v.length - 2] = v[0];
        v[v.length - 1] = v[1];
        return new Shape(kind, densify(v, true));
    }

    /** Cuatro esquinas: rectángulo si los ángulos son casi rectos. */
    private static Shape quad(float[] p, ArrayList<Integer> corners) {
        float[] c = new float[8];
        for (int i = 0; i < 4; i++) {
            c[2 * i] = p[2 * corners.get(i)];
            c[2 * i + 1] = p[2 * corners.get(i) + 1];
        }
        for (int i = 0; i < 4; i++) {
            int a = (i + 3) % 4, b = (i + 1) % 4;
            double ang = angle(c[2 * a] - c[2 * i], c[2 * a + 1] - c[2 * i + 1], c[2 * b] - c[2 * i], c[2 * b + 1] - c[2 * i + 1]);
            if (Math.abs(ang - 90) > 18) return polygon(QUAD, p, corners);
        }
        // ¿Alineado con los ejes? Entonces su caja, exacta.
        double rot = Math.toDegrees(Math.atan2(c[3] - c[1], c[2] - c[0]));
        double r = ((rot % 90) + 90) % 90;
        if (r < 10 || r > 80) {
            float minX = Math.min(Math.min(c[0], c[2]), Math.min(c[4], c[6]));
            float maxX = Math.max(Math.max(c[0], c[2]), Math.max(c[4], c[6]));
            float minY = Math.min(Math.min(c[1], c[3]), Math.min(c[5], c[7]));
            float maxY = Math.max(Math.max(c[1], c[3]), Math.max(c[5], c[7]));
            float x0 = c[0] < (minX + maxX) / 2 ? minX : maxX, y0 = c[1] < (minY + maxY) / 2 ? minY : maxY;
            float x1 = x0 == minX ? maxX : minX, y1 = y0 == minY ? maxY : minY;
            // Mismo sentido de giro que el trazo.
            boolean ccw = signedArea(p, N) >= 0;
            float[] v = ccw == ((x0 == minX) == (y0 == minY))
                    ? new float[] {x0, y0, x1, y0, x1, y1, x0, y1, x0, y0}
                    : new float[] {x0, y0, x0, y1, x1, y1, x1, y0, x0, y0};
            return new Shape(RECTANGLE, densify(v, true));
        }
        return polygon(RECTANGLE, p, corners);
    }

    // ---- Geometría ----

    private static ArrayList<Integer> closedCorners(float[] p, int n, float eps) {
        // El punto más lejano al inicio parte el contorno en dos tramos abiertos.
        int far = 0;
        float best = -1;
        for (int i = 0; i < n; i++) {
            float d = dist(p[0], p[1], p[2 * i], p[2 * i + 1]);
            if (d > best) { best = d; far = i; }
        }
        boolean[] keep = new boolean[n];
        keep[0] = keep[far] = true;
        simplify(p, 0, far, eps, keep);
        simplify(p, far, n - 1, eps, keep);
        ArrayList<Integer> out = new ArrayList<>();
        for (int i = 0; i < n - 1; i++) if (keep[i]) out.add(i);
        // Quitar «esquinas» casi rectas (180°) que deja Douglas-Peucker.
        for (boolean changed = true; changed && out.size() > 2; ) {
            changed = false;
            for (int k = 0; k < out.size(); k++) {
                int a = out.get((k + out.size() - 1) % out.size()), i = out.get(k), b = out.get((k + 1) % out.size());
                double ang = angle(p[2 * a] - p[2 * i], p[2 * a + 1] - p[2 * i + 1], p[2 * b] - p[2 * i], p[2 * b + 1] - p[2 * i + 1]);
                if (ang > 150) {
                    out.remove(k);
                    changed = true;
                    break;
                }
            }
        }
        return out;
    }

    private static void simplify(float[] p, int a, int b, float eps, boolean[] keep) {
        if (b <= a + 1) return;
        int idx = -1;
        float best = eps;
        for (int i = a + 1; i < b; i++) {
            float d = segmentDistance(p[2 * i], p[2 * i + 1], p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
            if (d > best) { best = d; idx = i; }
        }
        if (idx < 0) return;
        keep[idx] = true;
        simplify(p, a, idx, eps, keep);
        simplify(p, idx, b, eps, keep);
    }

    /** Ángulo en el punto i del contorno cerrado, mirando 4 puntos a cada lado. */
    private static double turn(float[] p, int n, int i) {
        int m = n - 1; // el último repite el primero
        int a = (i - 4 + m) % m, b = (i + 4) % m;
        return angle(p[2 * a] - p[2 * i], p[2 * a + 1] - p[2 * i + 1], p[2 * b] - p[2 * i], p[2 * b + 1] - p[2 * i + 1]);
    }

    /** Error medio respecto a la elipse de la caja (0 = perfecta). */
    private static float ellipseError(float[] p, int n) {
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (int i = 0; i < n; i++) {
            minX = Math.min(minX, p[2 * i]); maxX = Math.max(maxX, p[2 * i]);
            minY = Math.min(minY, p[2 * i + 1]); maxY = Math.max(maxY, p[2 * i + 1]);
        }
        float cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, rx = Math.max(1, (maxX - minX) / 2), ry = Math.max(1, (maxY - minY) / 2);
        if (Math.min(rx, ry) / Math.max(rx, ry) < 0.15f) return 1;
        float sum = 0;
        for (int i = 0; i < n; i++) {
            float dx = (p[2 * i] - cx) / rx, dy = (p[2 * i + 1] - cy) / ry;
            sum += Math.abs((float) Math.sqrt(dx * dx + dy * dy) - 1);
        }
        return sum / n;
    }

    private static float signedArea(float[] p, int n) {
        float a = 0;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
        }
        return a / 2;
    }

    private static double angle(float ax, float ay, float bx, float by) {
        double d = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
        if (d == 0) return 180;
        return Math.toDegrees(Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / d))));
    }

    private static float maxDeviation(float[] p, int n, int a, int b) {
        float best = 0;
        for (int i = a; i <= b; i++) {
            best = Math.max(best, segmentDistance(p[2 * i], p[2 * i + 1], p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]));
        }
        return best;
    }

    private static float pathLength(float[] xy, int n) {
        float l = 0;
        for (int i = 1; i < n; i++) l += dist(xy[2 * i - 2], xy[2 * i - 1], xy[2 * i], xy[2 * i + 1]);
        return l;
    }

    /** m puntos a la misma distancia unos de otros a lo largo del trazo. */
    static float[] resample(float[] xy, int n, int m) {
        float total = pathLength(xy, n);
        float step = total / (m - 1);
        float[] out = new float[2 * m];
        out[0] = xy[0];
        out[1] = xy[1];
        int k = 1;
        float acc = 0, px = xy[0], py = xy[1];
        for (int i = 1; i < n && k < m; i++) {
            float qx = xy[2 * i], qy = xy[2 * i + 1];
            float d = dist(px, py, qx, qy);
            while (acc + d >= step && k < m && d > 0) {
                float t = (step - acc) / d;
                px = px + t * (qx - px);
                py = py + t * (qy - py);
                out[2 * k] = px;
                out[2 * k + 1] = py;
                k++;
                d = dist(px, py, qx, qy);
                acc = 0;
            }
            acc += d;
            px = qx;
            py = qy;
        }
        for (; k < m; k++) {
            out[2 * k] = xy[2 * n - 2];
            out[2 * k + 1] = xy[2 * n - 1];
        }
        return out;
    }

    /** Puntos cada ~8 unidades sobre los lados (el grosor sale uniforme). */
    private static float[] densify(float[] v, boolean closed) {
        ArrayList<Float> out = new ArrayList<>();
        int verts = v.length / 2;
        for (int i = 0; i + 1 < verts; i++) {
            float x0 = v[2 * i], y0 = v[2 * i + 1], x1 = v[2 * i + 2], y1 = v[2 * i + 3];
            int steps = Math.max(1, (int) (dist(x0, y0, x1, y1) / 8));
            for (int s = 0; s < steps; s++) {
                out.add(x0 + (x1 - x0) * s / steps);
                out.add(y0 + (y1 - y0) * s / steps);
            }
        }
        out.add(v[v.length - 2]);
        out.add(v[v.length - 1]);
        float[] r = new float[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }

    static float dist(float ax, float ay, float bx, float by) {
        float dx = bx - ax, dy = by - ay;
        return (float) Math.sqrt(dx * dx + dy * dy);
    }

    static float segmentDistance(float px, float py, float ax, float ay, float bx, float by) {
        float dx = bx - ax, dy = by - ay;
        float len2 = dx * dx + dy * dy;
        float t = len2 == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        return dist(px, py, ax + t * dx, ay + t * dy);
    }

    private ShapeRecognizer() {}
}
