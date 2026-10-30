package dev.synctablet;

import java.util.ArrayList;
import java.util.List;

/**
 * Figuras para insertar (Java puro): cada una es una lista de trazos
 * (x, y seguidos) en un recuadro de 0 a 1, y su proporción ancho/alto.
 * Las líneas ocultas de las figuras 3D van aparte (se dibujan más finas).
 */
final class ShapeLibrary {
    static final class Shape {
        final String name;
        final float aspect;
        final List<float[]> lines = new ArrayList<>();
        /** Aristas ocultas (3D) o rejilla: más finas y claras. */
        final List<float[]> faint = new ArrayList<>();

        Shape(String name, float aspect) {
            this.name = name;
            this.aspect = aspect;
        }

        Shape line(float... xy) {
            lines.add(xy);
            return this;
        }

        Shape faint(float... xy) {
            faint.add(xy);
            return this;
        }
    }

    static final String[] GROUPS = {"Geométricas", "Cartesianas", "3D", "Ondas y funciones"};

    static List<Shape> group(int g) {
        ArrayList<Shape> out = new ArrayList<>();
        switch (g) {
            case 0:
                out.add(new Shape("Línea", 1).line(0, 1, 1, 0));
                out.add(new Shape("Flecha", 1).line(0, 1, 1, 0).line(0.62f, 0, 1, 0, 1, 0.38f));
                out.add(new Shape("Doble flecha", 1).line(0, 1, 1, 0).line(0.62f, 0, 1, 0, 1, 0.38f).line(0, 0.62f, 0, 1, 0.38f, 1));
                out.add(new Shape("Rectángulo", 1.5f).line(0, 0, 1, 0, 1, 1, 0, 1, 0, 0));
                out.add(new Shape("Cuadrado", 1).line(0, 0, 1, 0, 1, 1, 0, 1, 0, 0));
                out.add(new Shape("Círculo", 1).line(ellipse(0.5f, 0.5f, 0.5f, 0.5f, 0, 360)));
                out.add(new Shape("Elipse", 1.6f).line(ellipse(0.5f, 0.5f, 0.5f, 0.5f, 0, 360)));
                out.add(new Shape("Triángulo", 1.15f).line(0.5f, 0, 1, 1, 0, 1, 0.5f, 0));
                out.add(new Shape("Triángulo rectángulo", 1).line(0, 0, 0, 1, 1, 1, 0, 0).line(0, 0.88f, 0.12f, 0.88f, 0.12f, 1));
                out.add(new Shape("Rombo", 1).line(0.5f, 0, 1, 0.5f, 0.5f, 1, 0, 0.5f, 0.5f, 0));
                out.add(new Shape("Pentágono", 1).line(polygon(5, 0)));
                out.add(new Shape("Hexágono", 1).line(polygon(6, 30)));
                out.add(new Shape("Estrella", 1).line(star()));
                out.add(new Shape("Paralelogramo", 1.6f).line(0.25f, 0, 1, 0, 0.75f, 1, 0, 1, 0.25f, 0));
                out.add(new Shape("Trapecio", 1.6f).line(0.25f, 0, 0.75f, 0, 1, 1, 0, 1, 0.25f, 0));
                break;
            case 1: {
                Shape axes = new Shape("Ejes X e Y", 1)
                        .line(0, 0.5f, 1, 0.5f).line(0.96f, 0.47f, 1, 0.5f, 0.96f, 0.53f)
                        .line(0.5f, 1, 0.5f, 0).line(0.47f, 0.04f, 0.5f, 0, 0.53f, 0.04f);
                for (int i = 1; i < 10; i++) {
                    if (i == 5) continue;
                    float t = i / 10f;
                    axes.line(t, 0.49f, t, 0.51f).line(0.49f, t, 0.51f, t);
                }
                out.add(axes);
                Shape plane = new Shape("Plano con cuadrícula", 1);
                for (int i = 0; i <= 10; i++) {
                    float t = i / 10f;
                    if (i != 5) plane.faint(t, 0, t, 1).faint(0, t, 1, t);
                }
                plane.line(0, 0.5f, 1, 0.5f).line(0.5f, 1, 0.5f, 0)
                        .line(0.97f, 0.48f, 1, 0.5f, 0.97f, 0.52f).line(0.48f, 0.03f, 0.5f, 0, 0.52f, 0.03f);
                out.add(plane);
                out.add(new Shape("Primer cuadrante", 1).line(0, 0, 0, 1, 1, 1)
                        .line(0.97f, 0.97f, 1, 1, 0.97f, 1.03f).line(-0.03f, 0.03f, 0, 0, 0.03f, 0.03f));
                Shape axes3 = new Shape("Ejes X, Y, Z", 1).line(0.4f, 0.6f, 0.4f, 0).line(0.4f, 0.6f, 1, 0.6f).line(0.4f, 0.6f, 0, 1)
                        .line(0.37f, 0.04f, 0.4f, 0, 0.43f, 0.04f).line(0.96f, 0.57f, 1, 0.6f, 0.96f, 0.63f)
                        .line(0.02f, 0.94f, 0, 1, 0.06f, 0.99f);
                out.add(axes3);
                out.add(new Shape("Recta numérica", 4).line(0, 0.5f, 1, 0.5f).line(0.985f, 0.3f, 1, 0.5f, 0.985f, 0.7f)
                        .line(0.1f, 0.35f, 0.1f, 0.65f).line(0.3f, 0.35f, 0.3f, 0.65f).line(0.5f, 0.2f, 0.5f, 0.8f)
                        .line(0.7f, 0.35f, 0.7f, 0.65f).line(0.9f, 0.35f, 0.9f, 0.65f));
                break;
            }
            case 2: {
                float d = 0.3f;
                out.add(new Shape("Cubo", 1).line(0, d, 1 - d, d, 1 - d, 1, 0, 1, 0, d).line(0, d, d, 0, 1, 0, 1, 1 - d, 1 - d, 1)
                        .line(1 - d, d, 1, 0).faint(d, 0, d, 1 - d, 0, 1).faint(d, 1 - d, 1, 1 - d));
                out.add(new Shape("Prisma", 1.4f).line(0, 0.35f, 0.75f, 0.35f, 0.75f, 1, 0, 1, 0, 0.35f)
                        .line(0, 0.35f, 0.25f, 0, 1, 0, 1, 0.65f, 0.75f, 1).line(0.75f, 0.35f, 1, 0)
                        .faint(0.25f, 0, 0.25f, 0.65f, 0, 1).faint(0.25f, 0.65f, 1, 0.65f));
                Shape cyl = new Shape("Cilindro", 0.75f).line(ellipse(0.5f, 0.12f, 0.5f, 0.12f, 0, 360))
                        .line(0, 0.12f, 0, 0.88f).line(1, 0.12f, 1, 0.88f).line(ellipse(0.5f, 0.88f, 0.5f, 0.12f, 0, 180))
                        .faint(ellipse(0.5f, 0.88f, 0.5f, 0.12f, 180, 360));
                out.add(cyl);
                out.add(new Shape("Cono", 0.8f).line(0, 0.88f, 0.5f, 0, 1, 0.88f).line(ellipse(0.5f, 0.88f, 0.5f, 0.12f, 0, 180))
                        .faint(ellipse(0.5f, 0.88f, 0.5f, 0.12f, 180, 360)));
                out.add(new Shape("Esfera", 1).line(ellipse(0.5f, 0.5f, 0.5f, 0.5f, 0, 360))
                        .line(ellipse(0.5f, 0.5f, 0.5f, 0.15f, 0, 180)).faint(ellipse(0.5f, 0.5f, 0.5f, 0.15f, 180, 360)));
                out.add(new Shape("Pirámide", 1.1f).line(0, 0.8f, 0.62f, 1, 0.5f, 0, 0, 0.8f).line(0.62f, 1, 1, 0.72f, 0.5f, 0)
                        .faint(0, 0.8f, 0.38f, 0.6f, 1, 0.72f).faint(0.38f, 0.6f, 0.5f, 0));
                out.add(new Shape("Tetraedro", 1.1f).line(0, 0.85f, 0.55f, 1, 1, 0.75f, 0.45f, 0, 0, 0.85f).line(0.45f, 0, 0.55f, 1)
                        .faint(0, 0.85f, 1, 0.75f));
                break;
            }
            case 3:
                out.add(new Shape("Seno", 2.5f).line(wave(0, 2, false)).faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Coseno", 2.5f).line(wave(0, 2, true)).faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Onda amortiguada", 2.5f).line(damped()).faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Onda cuadrada", 2.5f).line(0, 0.8f, 0.125f, 0.8f, 0.125f, 0.2f, 0.375f, 0.2f, 0.375f, 0.8f,
                        0.625f, 0.8f, 0.625f, 0.2f, 0.875f, 0.2f, 0.875f, 0.8f, 1, 0.8f).faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Diente de sierra", 2.5f).line(0, 0.8f, 0.25f, 0.2f, 0.25f, 0.8f, 0.5f, 0.2f, 0.5f, 0.8f,
                        0.75f, 0.2f, 0.75f, 0.8f, 1, 0.2f).faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Triangular", 2.5f).line(0, 0.5f, 0.125f, 0.2f, 0.375f, 0.8f, 0.625f, 0.2f, 0.875f, 0.8f, 1, 0.5f)
                        .faint(0, 0.5f, 1, 0.5f));
                out.add(new Shape("Parábola", 1).line(function(x -> x * x, -1, 1, 0, 1)).faint(0.5f, 0, 0.5f, 1));
                out.add(new Shape("Exponencial", 1).line(function(x -> (float) Math.exp(x), -2, 1.5f, 0, (float) Math.exp(1.5f))));
                out.add(new Shape("Campana de Gauss", 2).line(function(x -> (float) Math.exp(-x * x), -3, 3, 0, 1)).faint(0, 1, 1, 1));
                break;
        }
        return out;
    }

    interface Fn {
        float at(float x);
    }

    /** y = f(x) en [x0, x1], con y de y0 (abajo) a y1 (arriba). */
    static float[] function(Fn f, float x0, float x1, float y0, float y1) {
        int n = 80;
        float[] out = new float[2 * (n + 1)];
        for (int i = 0; i <= n; i++) {
            float x = x0 + (x1 - x0) * i / n;
            out[2 * i] = i / (float) n;
            out[2 * i + 1] = 1 - (f.at(x) - y0) / (y1 - y0);
        }
        return out;
    }

    static float[] wave(float phase, float periods, boolean cosine) {
        int n = 120;
        float[] out = new float[2 * (n + 1)];
        for (int i = 0; i <= n; i++) {
            double t = 2 * Math.PI * periods * i / n + phase;
            out[2 * i] = i / (float) n;
            out[2 * i + 1] = 0.5f - 0.42f * (float) (cosine ? Math.cos(t) : Math.sin(t));
        }
        return out;
    }

    static float[] damped() {
        int n = 160;
        float[] out = new float[2 * (n + 1)];
        for (int i = 0; i <= n; i++) {
            double t = i / (double) n;
            out[2 * i] = (float) t;
            out[2 * i + 1] = 0.5f - 0.45f * (float) (Math.exp(-3 * t) * Math.sin(2 * Math.PI * 5 * t));
        }
        return out;
    }

    static float[] ellipse(float cx, float cy, float rx, float ry, float fromDeg, float toDeg) {
        int n = Math.max(8, Math.round(Math.abs(toDeg - fromDeg) / 5));
        float[] out = new float[2 * (n + 1)];
        for (int i = 0; i <= n; i++) {
            double a = Math.toRadians(fromDeg + (toDeg - fromDeg) * i / n);
            out[2 * i] = cx + rx * (float) Math.cos(a);
            out[2 * i + 1] = cy + ry * (float) Math.sin(a);
        }
        return out;
    }

    static float[] polygon(int sides, float rotDeg) {
        float[] out = new float[2 * (sides + 1)];
        for (int i = 0; i <= sides; i++) {
            double a = Math.toRadians(-90 + rotDeg + 360.0 * i / sides);
            out[2 * i] = 0.5f + 0.5f * (float) Math.cos(a);
            out[2 * i + 1] = 0.5f + 0.5f * (float) Math.sin(a);
        }
        return out;
    }

    static float[] star() {
        float[] out = new float[22];
        for (int i = 0; i <= 10; i++) {
            double a = Math.toRadians(-90 + 36 * i);
            float r = i % 2 == 0 ? 0.5f : 0.2f;
            out[2 * i] = 0.5f + r * (float) Math.cos(a);
            out[2 * i + 1] = 0.53f + r * (float) Math.sin(a);
        }
        return out;
    }

    private ShapeLibrary() {}
}
