package dev.synctablet;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import java.util.ArrayDeque;
import java.util.ArrayList;

/**
 * La hoja: el lápiz dibuja, los dedos mueven y hacen zoom.
 *
 * Rechazo de la palma: mientras el lápiz toca, los dedos se ignoran, y los
 * dedos sólo dibujan si se activa «Dibujar con el dedo» (tablets sin lápiz).
 * La punta de goma o el botón del lápiz borran.
 *
 * Para que el trazo vaya pegado al lápiz:
 * - lo ya dibujado vive en un bitmap (`layer`) y sólo se rehace al cambiar
 *   el zoom o al borrar; durante un gesto se estira ese bitmap;
 * - cada tramo nuevo de pluma se pinta directamente en el bitmap;
 * - se usan los puntos intermedios de cada MotionEvent y
 *   `requestUnbufferedDispatch` para recibirlos sin esperar al vsync.
 */
final class InkView extends View {
    static final int PEN = 0, HIGHLIGHTER = 1, ERASER = 2;

    interface Listener {
        /** Una operación para el PC (trazo, borrado o página entera). */
        void onOp(String json);
        /** La página cambió: hay que guardarla. */
        void onEdited();
        void onUndoState(boolean canUndo, boolean canRedo);
    }

    private static final int DESK = 0xFFDDE2E8;
    private static final float MARGIN_DP = 24;

    int tool = PEN;
    int penColor = 0xFF111827;
    float penWidth = 3f;
    int highlighterColor = 0xFFFFD60A;
    float highlighterWidth = 24f;
    boolean fingerDraws;

    private Ink.Page page;
    private Listener listener;

    // Pantalla = página · scale + (ox, oy).
    private float scale = 1, ox, oy, fitScale = 1;
    private boolean fitted;

    private Bitmap layer;
    private Canvas layerCanvas;
    private float layerScale, layerOx, layerOy;

    private final ScaleGestureDetector scaler;
    private float focusX = Float.NaN, focusY = Float.NaN;
    private int fingers;

    private Ink.Stroke current;
    private int pointerId = -1;
    private boolean erasing;
    private final ArrayList<Ink.Stroke> erased = new ArrayList<>();
    private final Path highlighterPath = new Path();

    private final ArrayDeque<Object[]> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();

    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint lines = new Paint();
    private final Paint sheet = new Paint();
    private final Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);

    InkView(Context c) {
        super(c);
        ink.setStyle(Paint.Style.STROKE);
        ink.setStrokeCap(Paint.Cap.ROUND);
        ink.setStrokeJoin(Paint.Join.ROUND);
        lines.setColor(0xFFC9D3E3);
        lines.setStrokeWidth(1);
        sheet.setColor(Color.WHITE);
        shade.setColor(0x33000000);
        scaler = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector d) {
                zoomAround(d.getFocusX(), d.getFocusY(), d.getScaleFactor());
                return true;
            }
        });
        setFocusable(true);
    }

    void setListener(Listener l) {
        listener = l;
    }

    void setPage(Ink.Page p) {
        page = p;
        current = null;
        pointerId = -1;
        erasing = false;
        undo.clear();
        redo.clear();
        fitted = false;
        layout();
        notifyUndo();
    }

    Ink.Page page() {
        return page;
    }

    void setBackground(String bg) {
        if (page == null || bg.equals(page.background)) return;
        page.background = bg;
        page.version++;
        listener.onOp("{\"t\":\"page\",\"page\":" + page.toJson() + "}");
        listener.onEdited();
        renderLayer();
    }

    // ---- Vista: encajar, zoom y desplazamiento ----

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        layout();
    }

    private void layout() {
        int w = getWidth(), h = getHeight();
        if (w == 0 || h == 0) return;
        float margin = MARGIN_DP * getResources().getDisplayMetrics().density;
        fitScale = (w - 2 * margin) / Ink.W;
        if (!fitted) {
            scale = fitScale;
            ox = (w - Ink.W * scale) / 2;
            oy = margin;
            fitted = true;
        }
        clampView();
        if (layer == null || layer.getWidth() != w || layer.getHeight() != h) {
            if (layer != null) layer.recycle();
            layer = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            layerCanvas = new Canvas(layer);
        }
        renderLayer();
    }

    private void zoomAround(float fx, float fy, float factor) {
        float s = Math.max(fitScale * 0.5f, Math.min(fitScale * 6f, scale * factor));
        ox = fx - (fx - ox) * s / scale;
        oy = fy - (fy - oy) * s / scale;
        scale = s;
        clampView();
        invalidate();
    }

    /** Que la hoja nunca se vaya del todo de la pantalla. */
    private void clampView() {
        float w = getWidth(), h = getHeight(), pw = Ink.W * scale, ph = Ink.H * scale, keep = 120;
        ox = Math.max(keep - pw, Math.min(w - keep, ox));
        oy = Math.max(keep - ph, Math.min(h - keep, oy));
    }

    /** Página → pantalla en el canvas dado. */
    private void toPage(Canvas c, float s, float x, float y) {
        c.translate(x, y);
        c.scale(s, s);
    }

    // ---- Dibujo ----

    /** Rehace el bitmap con todo lo dibujado, con la vista actual. */
    private void renderLayer() {
        if (layer == null) return;
        Canvas c = layerCanvas;
        c.drawColor(DESK);
        layerScale = scale;
        layerOx = ox;
        layerOy = oy;
        if (page == null) {
            invalidate();
            return;
        }
        c.save();
        toPage(c, scale, ox, oy);
        c.drawRect(4, 6, Ink.W + 4, Ink.H + 6, shade);
        c.drawRect(0, 0, Ink.W, Ink.H, sheet);
        drawBackground(c);
        for (Ink.Stroke s : page.strokes) drawStroke(c, s);
        c.restore();
        invalidate();
    }

    private void drawBackground(Canvas c) {
        if (Ink.PLAIN.equals(page.background)) return;
        lines.setStrokeWidth(1 / Math.max(scale, 0.01f));
        for (float y = 80; y < Ink.H; y += 40) c.drawLine(0, y, Ink.W, y, lines);
        if (Ink.GRID.equals(page.background)) for (float x = 40; x < Ink.W; x += 40) c.drawLine(x, 0, x, Ink.H, lines);
    }

    private void drawStroke(Canvas c, Ink.Stroke s) {
        if (s.n == 0) return;
        ink.setColor(s.color);
        if (Ink.HIGHLIGHTER.equals(s.tool)) {
            ink.setAlpha(90);
            ink.setStrokeWidth(s.width);
            Path p = new Path();
            p.moveTo(s.x(0), s.y(0));
            for (int i = 1; i < s.n; i++) p.lineTo(s.x(i), s.y(i));
            if (s.n == 1) p.lineTo(s.x(0) + 0.01f, s.y(0));
            c.drawPath(p, ink);
            ink.setAlpha(255);
            return;
        }
        if (s.n == 1) {
            ink.setStrokeWidth(Ink.pressureWidth(s.width, s.p(0)));
            c.drawPoint(s.x(0), s.y(0), ink);
            return;
        }
        for (int i = 1; i < s.n; i++) drawSegment(c, s, i);
    }

    private void drawSegment(Canvas c, Ink.Stroke s, int i) {
        ink.setColor(s.color);
        ink.setStrokeWidth(Ink.pressureWidth(s.width, (s.p(i - 1) + s.p(i)) / 2));
        c.drawLine(s.x(i - 1), s.y(i - 1), s.x(i), s.y(i), ink);
    }

    @Override
    protected void onDraw(Canvas c) {
        if (layer == null) return;
        if (layerScale == scale && layerOx == ox && layerOy == oy) {
            c.drawBitmap(layer, 0, 0, null);
        } else {
            // En pleno gesto: estirar lo que había; se rehace al soltar.
            c.drawColor(DESK);
            float k = scale / layerScale;
            c.save();
            c.translate(ox - layerOx * k, oy - layerOy * k);
            c.scale(k, k);
            c.drawBitmap(layer, 0, 0, null);
            c.restore();
        }
        if (current != null && Ink.HIGHLIGHTER.equals(current.tool) && current.n > 0) {
            c.save();
            toPage(c, scale, ox, oy);
            ink.setColor(current.color);
            ink.setAlpha(90);
            ink.setStrokeWidth(current.width);
            c.drawPath(highlighterPath, ink);
            ink.setAlpha(255);
            c.restore();
        }
    }

    // ---- Entrada ----

    private boolean draws(MotionEvent e, int idx) {
        int t = e.getToolType(idx);
        return t == MotionEvent.TOOL_TYPE_STYLUS || t == MotionEvent.TOOL_TYPE_ERASER
                || t == MotionEvent.TOOL_TYPE_MOUSE
                || (fingerDraws && t == MotionEvent.TOOL_TYPE_FINGER && fingers == 0);
    }

    private boolean erases(MotionEvent e, int idx) {
        return tool == ERASER || e.getToolType(idx) == MotionEvent.TOOL_TYPE_ERASER
                || (e.getButtonState() & MotionEvent.BUTTON_STYLUS_PRIMARY) != 0;
    }

    private float pressure(MotionEvent e, int idx, int h) {
        int t = e.getToolType(idx);
        if (t != MotionEvent.TOOL_TYPE_STYLUS && t != MotionEvent.TOOL_TYPE_ERASER) return 0.6f;
        return h < 0 ? e.getPressure(idx) : e.getHistoricalPressure(idx, h);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (page == null) return false;
        int action = e.getActionMasked();
        int idx = e.getActionIndex();
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (pointerId == -1 && draws(e, idx)) {
                    requestUnbufferedDispatch(e);
                    pointerId = e.getPointerId(idx);
                    erasing = erases(e, idx);
                    if (erasing) erased.clear();
                    else startStroke();
                    addPoint(e, idx, -1);
                    return true;
                }
                break;
            case MotionEvent.ACTION_MOVE:
                if (pointerId != -1) {
                    int i = e.findPointerIndex(pointerId);
                    if (i >= 0) {
                        for (int h = 0; h < e.getHistorySize(); h++) addPoint(e, i, h);
                        addPoint(e, i, -1);
                    }
                    return true;
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
                if (pointerId == e.getPointerId(idx)) {
                    finish();
                    return true;
                }
                break;
            case MotionEvent.ACTION_CANCEL:
                if (pointerId != -1) {
                    // El sistema lo anuló (p. ej. era la palma): fuera el trazo.
                    current = null;
                    pointerId = -1;
                    if (erasing) finish();
                    renderLayer();
                }
                break;
        }
        // Mientras el lápiz dibuja, los dedos no hacen nada.
        if (pointerId != -1) return true;
        return gesture(e);
    }

    /** Dedos: uno mueve, dos mueven y hacen zoom. */
    private boolean gesture(MotionEvent e) {
        scaler.onTouchEvent(e);
        int action = e.getActionMasked();
        int skip = action == MotionEvent.ACTION_POINTER_UP || action == MotionEvent.ACTION_UP ? e.getActionIndex() : -1;
        float sx = 0, sy = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skip || e.getToolType(i) != MotionEvent.TOOL_TYPE_FINGER) continue;
            sx += e.getX(i);
            sy += e.getY(i);
            n++;
        }
        if (n != fingers) {
            focusX = Float.NaN;
            fingers = n;
        }
        if (n == 0) {
            if (layerScale != scale || layerOx != ox || layerOy != oy) renderLayer();
            return true;
        }
        float fx = sx / n, fy = sy / n;
        if (!Float.isNaN(focusX) && action == MotionEvent.ACTION_MOVE) {
            ox += fx - focusX;
            oy += fy - focusY;
            clampView();
            invalidate();
        }
        focusX = fx;
        focusY = fy;
        return true;
    }

    private void startStroke() {
        boolean hl = tool == HIGHLIGHTER;
        current = new Ink.Stroke(Ink.newId(), hl ? Ink.HIGHLIGHTER : Ink.PEN,
                hl ? highlighterColor : penColor, hl ? highlighterWidth : penWidth);
        highlighterPath.reset();
    }

    private void addPoint(MotionEvent e, int idx, int h) {
        float sx = h < 0 ? e.getX(idx) : e.getHistoricalX(idx, h);
        float sy = h < 0 ? e.getY(idx) : e.getHistoricalY(idx, h);
        float x = Math.max(0, Math.min(Ink.W, (sx - ox) / scale));
        float y = Math.max(0, Math.min(Ink.H, (sy - oy) / scale));
        if (erasing) {
            eraseAt(x, y);
            return;
        }
        Ink.Stroke s = current;
        if (s == null) return;
        if (s.n > 0) {
            float dx = x - s.x(s.n - 1), dy = y - s.y(s.n - 1);
            if (dx * dx + dy * dy < 0.25f) return;
        }
        s.add(x, y, pressure(e, idx, h));
        if (Ink.HIGHLIGHTER.equals(s.tool)) {
            if (s.n == 1) highlighterPath.moveTo(x, y);
            else highlighterPath.lineTo(x, y);
            invalidate();
        } else if (s.n > 1 && layerScale == scale && layerOx == ox && layerOy == oy) {
            layerCanvas.save();
            toPage(layerCanvas, scale, ox, oy);
            drawSegment(layerCanvas, s, s.n - 1);
            layerCanvas.restore();
            invalidate();
        }
    }

    private void eraseAt(float x, float y) {
        float r = 10;
        boolean any = false;
        for (int i = page.strokes.size() - 1; i >= 0; i--) {
            Ink.Stroke s = page.strokes.get(i);
            if (s.hits(x, y, r)) {
                page.strokes.remove(i);
                erased.add(s);
                any = true;
            }
        }
        if (any) renderLayer();
    }

    private void finish() {
        pointerId = -1;
        if (erasing) {
            erasing = false;
            if (erased.isEmpty()) return;
            ArrayList<Ink.Stroke> list = new ArrayList<>(erased);
            erased.clear();
            sendErase(list);
            push(undo, new Object[] {"erase", list});
            redo.clear();
        } else {
            Ink.Stroke s = current;
            current = null;
            if (s == null || s.n == 0) return;
            page.strokes.add(s);
            if (Ink.HIGHLIGHTER.equals(s.tool) || s.n == 1) {
                layerCanvas.save();
                toPage(layerCanvas, scale, ox, oy);
                drawStroke(layerCanvas, s);
                layerCanvas.restore();
                invalidate();
            }
            sendStroke(s);
            ArrayList<Ink.Stroke> one = new ArrayList<>();
            one.add(s);
            push(undo, new Object[] {"add", one});
            redo.clear();
        }
        listener.onEdited();
        notifyUndo();
    }

    private void sendStroke(Ink.Stroke s) {
        page.version++;
        listener.onOp("{\"t\":\"stroke\",\"page\":\"" + page.id + "\",\"version\":" + page.version
                + ",\"stroke\":" + s.toJson() + "}");
    }

    private void sendErase(ArrayList<Ink.Stroke> list) {
        page.version++;
        StringBuilder ids = new StringBuilder();
        for (Ink.Stroke s : list) ids.append(ids.length() > 0 ? "," : "").append('"').append(s.id).append('"');
        listener.onOp("{\"t\":\"erase\",\"page\":\"" + page.id + "\",\"version\":" + page.version
                + ",\"ids\":[" + ids + "]}");
    }

    // ---- Deshacer ----

    private static void push(ArrayDeque<Object[]> stack, Object[] a) {
        stack.push(a);
        while (stack.size() > 200) stack.removeLast();
    }

    void undo() {
        step(undo, redo);
    }

    void redo() {
        step(redo, undo);
    }

    /**
     * Deshace (o rehace) la última acción y manda al PC su contraria. Cada
     * acción es «se añadieron estos trazos» o «se borraron estos trazos».
     */
    @SuppressWarnings("unchecked")
    private void step(ArrayDeque<Object[]> from, ArrayDeque<Object[]> to) {
        if (page == null || from.isEmpty() || pointerId != -1) return;
        Object[] a = from.pop();
        ArrayList<Ink.Stroke> list = (ArrayList<Ink.Stroke>) a[1];
        if ("add".equals(a[0])) {
            page.strokes.removeAll(list);
            sendErase(list);
            push(to, new Object[] {"erase", list});
        } else {
            for (Ink.Stroke s : list) {
                page.strokes.add(s);
                sendStroke(s);
            }
            push(to, new Object[] {"add", list});
        }
        renderLayer();
        listener.onEdited();
        notifyUndo();
    }

    private void notifyUndo() {
        if (listener != null) listener.onUndoState(!undo.isEmpty(), !redo.isEmpty());
    }
}
