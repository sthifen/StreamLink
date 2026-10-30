package dev.synctablet;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Locale;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Cuadernos, páginas y trazos, con el mismo JSON que el PC (src/ink.rs).
 * Las páginas miden 1000×1414 unidades (A4); los trazos guardan x, y y
 * presión seguidos.
 */
final class Ink {
    static final float W = 1000f, H = 1414f;
    static final String PEN = "pen", HIGHLIGHTER = "highlighter";
    static final String PLAIN = "plain", LINES = "lines", GRID = "grid";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789".toCharArray();

    static String newId() {
        char[] c = new char[12];
        for (int i = 0; i < c.length; i++) c[i] = ID_CHARS[RANDOM.nextInt(ID_CHARS.length)];
        return new String(c);
    }

    static String hex(int color) {
        return String.format(Locale.ROOT, "#%06X", color & 0xFFFFFF);
    }

    static int parseColor(String s, int fallback) {
        try {
            return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    /** Grosor de un tramo con presión p (igual que el PC). */
    static float pressureWidth(float width, float p) {
        return width * (0.35f + 0.65f * Math.max(0f, Math.min(1f, p)));
    }

    static final class Stroke {
        final String id;
        final String tool;
        final int color;
        final float width;
        float[] pts = new float[3 * 64];
        int n;
        /** Caja que lo contiene, para la goma. */
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;

        Stroke(String id, String tool, int color, float width) {
            this.id = id;
            this.tool = tool;
            this.color = color;
            this.width = width;
        }

        void add(float x, float y, float p) {
            if (3 * n + 3 > pts.length) pts = java.util.Arrays.copyOf(pts, pts.length * 2);
            pts[3 * n] = x;
            pts[3 * n + 1] = y;
            pts[3 * n + 2] = p;
            n++;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }

        float x(int i) { return pts[3 * i]; }
        float y(int i) { return pts[3 * i + 1]; }
        float p(int i) { return pts[3 * i + 2]; }

        /** ¿Pasa a menos de r del punto (x, y)? */
        boolean hits(float x, float y, float r) {
            float reach = r + width;
            if (x < minX - reach || x > maxX + reach || y < minY - reach || y > maxY + reach) return false;
            for (int i = 0; i < n; i++) {
                float ax = x(i), ay = y(i);
                float bx = i + 1 < n ? x(i + 1) : ax, by = i + 1 < n ? y(i + 1) : ay;
                if (segmentDistance(x, y, ax, ay, bx, by) <= r + width / 2) return true;
            }
            return false;
        }

        String toJson() {
            StringBuilder b = new StringBuilder(32 + n * 18);
            b.append("{\"id\":\"").append(id).append("\",\"tool\":\"").append(tool)
                    .append("\",\"color\":\"").append(hex(color)).append("\",\"width\":").append(round(width, 10))
                    .append(",\"points\":[");
            for (int i = 0; i < n; i++) {
                if (i > 0) b.append(',');
                b.append(round(x(i), 10)).append(',').append(round(y(i), 10)).append(',').append(round(p(i), 100));
            }
            return b.append("]}").toString();
        }

        static Stroke fromJson(JSONObject o) throws JSONException {
            Stroke s = new Stroke(o.getString("id"), o.optString("tool", PEN),
                    parseColor(o.optString("color", "#000000"), 0xFF000000), (float) o.optDouble("width", 3));
            JSONArray p = o.getJSONArray("points");
            for (int i = 0; i + 2 < p.length(); i += 3) {
                s.add((float) p.getDouble(i), (float) p.getDouble(i + 1), (float) p.getDouble(i + 2));
            }
            return s;
        }
    }

    static final class Page {
        final String id;
        final String notebook;
        long version;
        String background = LINES;
        final ArrayList<Stroke> strokes = new ArrayList<>();

        Page(String id, String notebook) {
            this.id = id;
            this.notebook = notebook;
        }

        String toJson() {
            StringBuilder b = new StringBuilder();
            b.append("{\"id\":\"").append(id).append("\",\"notebook\":\"").append(notebook)
                    .append("\",\"version\":").append(version).append(",\"background\":\"").append(background)
                    .append("\",\"strokes\":[");
            for (int i = 0; i < strokes.size(); i++) {
                if (i > 0) b.append(',');
                b.append(strokes.get(i).toJson());
            }
            return b.append("]}").toString();
        }

        static Page fromJson(String json) throws JSONException {
            JSONObject o = new JSONObject(json);
            Page p = new Page(o.getString("id"), o.getString("notebook"));
            p.version = o.optLong("version");
            p.background = o.optString("background", LINES);
            JSONArray s = o.optJSONArray("strokes");
            if (s != null) for (int i = 0; i < s.length(); i++) p.strokes.add(Stroke.fromJson(s.getJSONObject(i)));
            return p;
        }
    }

    static final class Notebook {
        final String id;
        String title;
        int color;
        final ArrayList<String> pages = new ArrayList<>();

        Notebook(String id, String title, int color) {
            this.id = id;
            this.title = title;
            this.color = color;
        }

        JSONObject toJsonObject() throws JSONException {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("title", title);
            o.put("color", hex(color));
            o.put("pages", new JSONArray(pages));
            return o;
        }

        static Notebook fromJson(JSONObject o) throws JSONException {
            Notebook n = new Notebook(o.getString("id"), o.optString("title", "Cuaderno"),
                    parseColor(o.optString("color", "#2DD4BF"), 0xFF2DD4BF));
            JSONArray p = o.optJSONArray("pages");
            if (p != null) for (int i = 0; i < p.length(); i++) n.pages.add(p.getString(i));
            return n;
        }
    }

    static float segmentDistance(float px, float py, float ax, float ay, float bx, float by) {
        float dx = bx - ax, dy = by - ay;
        float len2 = dx * dx + dy * dy;
        float t = len2 == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        float cx = ax + t * dx - px, cy = ay + t * dy - py;
        return (float) Math.sqrt(cx * cx + cy * cy);
    }

    /** Redondea a 1/scale y lo escribe sin ceros de más. */
    private static String round(float v, int scale) {
        long r = Math.round(v * scale);
        if (r % scale == 0) return Long.toString(r / scale);
        return Double.toString((double) r / scale);
    }

    private Ink() {}
}
