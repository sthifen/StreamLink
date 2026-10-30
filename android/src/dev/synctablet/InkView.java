package dev.synctablet;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.VelocityTracker;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * El cuaderno: todas sus páginas una debajo de otra. El lápiz dibuja; los
 * dedos desplazan (con inercia) y hacen zoom. Al final del cuaderno, seguir
 * tirando hacia arriba crea una página nueva.
 *
 * Rechazo de la palma: mientras el lápiz toca, los dedos se ignoran, y los
 * dedos sólo dibujan si se activa «Dibujar con el dedo» (tablets sin lápiz).
 * La punta de goma o el botón del lápiz borran.
 *
 * Para que el trazo vaya pegado al lápiz:
 * - lo ya dibujado vive en un bitmap (`layer`) que cubre la pantalla y media
 *   pantalla más por arriba y por abajo; al desplazar se mueve ese bitmap y
 *   sólo se rehace al salirse de ese margen, al hacer zoom o al borrar;
 * - cada tramo nuevo de pluma se pinta directamente en el bitmap;
 * - se usan los puntos intermedios de cada MotionEvent y
 *   `requestUnbufferedDispatch` para recibirlos sin esperar al vsync.
 */
final class InkView extends View {
    static final int PEN = 0, HIGHLIGHTER = 1, ERASER = 2;

    interface Listener {
        /** Una operación para el PC (trazo, borrado o página entera). */
        void onOp(String json);
        /** Esa página cambió: hay que guardarla. */
        void onEdited(Ink.Page page);
        void onUndoState(boolean canUndo, boolean canRedo);
        /** La página que más se ve ahora. */
        void onPageVisible(int index);
        /** Se tiró hacia arriba al final del cuaderno: crear una página. */
        void onPullAddPage();
    }

    private static final int DESK = 0xFFDDE2E8;
    private static final float MARGIN_DP = 24;
    /** Separación entre páginas, en unidades de página. */
    private static final float GAP = 36;
    private static final float PULL_DP = 110, PULL_MAX_DP = 260;

    int tool = PEN;
    int penColor = 0xFF111827;
    float penWidth = 3f;
    int highlighterColor = 0xFFFFD60A;
    float highlighterWidth = 24f;
    boolean fingerDraws;
    /** Convertir cada trazo en figura si lo parece (sin tener que esperar). */
    boolean autoShapes;
    /** Alto de la barra flotante: la primera página empieza debajo. */
    float topInset;
    /** Tras cada fotograma (para que el cristal de encima se actualice). */
    Runnable onFrame;

    private final ArrayList<Ink.Page> pages = new ArrayList<>();
    private Listener listener;
    private int visible = -1;

    // Pantalla = documento · scale + (ox, oy). El documento son las páginas
    // apiladas: la página i empieza en y = i · (H + GAP).
    private float scale = 1, ox, oy, fitScale = 1;
    private boolean fitted;
    private int pendingScroll = -1;

    private Bitmap layer;
    private Canvas layerCanvas;
    private float layerScale, layerOx, layerOy;
    private int pad;

    private final ScaleGestureDetector scaler;
    private VelocityTracker velocity;
    private ValueAnimator scroller;
    private float focusX = Float.NaN, focusY = Float.NaN;
    private int fingers;
    private boolean pulled;
    /** El gesto empezó ya al final: sólo entonces se puede tirar por una página nueva. */
    private boolean atEnd;
    /** Cuándo pasó del umbral (un tirón rápido de paso no crea páginas). */
    private long readySince;
    private static final long PULL_HOLD_MS = 220;

    private Ink.Stroke current;
    private int currentPage;
    private int pointerId = -1;
    private boolean erasing;
    private final LinkedHashMap<Ink.Page, ArrayList<Ink.Stroke>> erased = new LinkedHashMap<>();
    private final Path highlighterPath = new Path();
    // Mantener el lápiz quieto al final de un trazo lo convierte en figura.
    private static final long HOLD_MS = 550;
    private final Runnable holdCheck = this::snapIfHeld;
    private boolean snapped;
    private float holdX, holdY;

    /** Cada acción: {"add" | "erase", página → trazos}. */
    private final ArrayDeque<Object[]> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();

    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint lines = new Paint();
    private final Paint sheet = new Paint();
    private final Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dashed = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);

    InkView(Context c) {
        super(c);
        ink.setStyle(Paint.Style.STROKE);
        ink.setStrokeCap(Paint.Cap.ROUND);
        ink.setStrokeJoin(Paint.Join.ROUND);
        lines.setColor(0xFFC9D3E3);
        lines.setStrokeWidth(1);
        sheet.setColor(Color.WHITE);
        shade.setColor(0x26000000);
        float d = c.getResources().getDisplayMetrics().density;
        dashed.setStyle(Paint.Style.STROKE);
        dashed.setStrokeWidth(2 * d);
        dashed.setColor(0xFF9CA3AF);
        dashed.setPathEffect(new DashPathEffect(new float[] {10 * d, 8 * d}, 0));
        label.setColor(0xFF4B5563);
        label.setTextSize(16 * c.getResources().getDisplayMetrics().scaledDensity);
        label.setTextAlign(Paint.Align.CENTER);
        scaler = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector det) {
                zoomAround(det.getFocusX(), det.getFocusY(), det.getScaleFactor());
                return true;
            }
        });
        setFocusable(true);
    }

    void setListener(Listener l) {
        listener = l;
    }

    /** Las páginas del cuaderno, empezando por la `show`. */
    void setPages(List<Ink.Page> list, int show) {
        pages.clear();
        pages.addAll(list);
        current = null;
        pointerId = -1;
        erasing = false;
        undo.clear();
        redo.clear();
        visible = -1;
        pendingScroll = show;
        fitted = false;
        layout();
        notifyUndo();
    }

    /** Página nueva al final, y desplazarse hasta ella. */
    void appendPage(Ink.Page p) {
        pages.add(p);
        scrollToPage(pages.size() - 1, true);
    }

    /** Quita la página i de la vista (ya borrada del cuaderno). */
    void removePage(int i) {
        if (i < 0 || i >= pages.size()) return;
        Ink.Page gone = pages.remove(i);
        // Sus acciones ya no se pueden deshacer.
        undo.removeIf(a -> ((Map<?, ?>) a[1]).containsKey(gone));
        redo.removeIf(a -> ((Map<?, ?>) a[1]).containsKey(gone));
        notifyUndo();
        visible = -1;
        clampView(false);
        renderLayer();
    }

    int pageCount() {
        return pages.size();
    }

    Ink.Page visiblePage() {
        return visible >= 0 && visible < pages.size() ? pages.get(visible) : null;
    }

    void setBackground(String bg) {
        Ink.Page page = visiblePage();
        if (page == null || bg.equals(page.background)) return;
        page.background = bg;
        page.version++;
        listener.onOp("{\"t\":\"page\",\"page\":" + page.toJson() + "}");
        listener.onEdited(page);
        renderLayer();
    }

    // ---- Vista: encajar, zoom y desplazamiento ----

    private static float pageTop(int i) {
        return i * (Ink.H + GAP);
    }

    private float docHeight() {
        return pages.isEmpty() ? Ink.H : pageTop(pages.size()) - GAP;
    }

    /** La página en la altura y del documento (la más cercana). */
    private int pageAt(float docY) {
        int i = (int) Math.floor((docY + GAP / 2) / (Ink.H + GAP));
        return Math.max(0, Math.min(pages.size() - 1, i));
    }

    private float margin() {
        return MARGIN_DP * getResources().getDisplayMetrics().density;
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        // Al girar la tablet: volver a encajar, en la misma página.
        if (fitted && visible >= 0) pendingScroll = visible;
        fitted = false;
        layout();
    }

    private void layout() {
        int w = getWidth(), h = getHeight();
        if (w == 0 || h == 0) return;
        fitScale = (w - 2 * margin()) / Ink.W;
        if (!fitted) {
            scale = fitScale;
            ox = (w - Ink.W * scale) / 2;
            oy = topInset + margin();
            fitted = true;
        }
        if (pendingScroll >= 0) {
            oy = topInset + margin() - pageTop(pendingScroll) * scale;
            pendingScroll = -1;
        }
        clampView(false);
        pad = h / 2;
        if (layer == null || layer.getWidth() != w || layer.getHeight() != h + 2 * pad) {
            if (layer != null) layer.recycle();
            layer = Bitmap.createBitmap(w, h + 2 * pad, Bitmap.Config.ARGB_8888);
            layerCanvas = new Canvas(layer);
        }
        renderLayer();
    }

    private void zoomAround(float fx, float fy, float factor) {
        float s = Math.max(fitScale * 0.5f, Math.min(fitScale * 6f, scale * factor));
        ox = fx - (fx - ox) * s / scale;
        oy = fy - (fy - oy) * s / scale;
        scale = s;
        clampView(false);
        invalidate();
    }

    /** Límite de arriba y de abajo de oy (sin contar el tirón del final). */
    private float minOy() {
        float h = getHeight();
        return Math.min(topInset + margin(), h - margin() - docHeight() * scale);
    }

    private float maxOy() {
        return topInset + margin();
    }

    /** Cuánto se ha tirado más allá del final del cuaderno, en px. */
    private float overscroll() {
        return Math.max(0, minOy() - oy);
    }

    /** Dentro de límites; con `pulling`, deja tirar más allá del final. */
    private void clampView(boolean pulling) {
        float w = getWidth(), pw = Ink.W * scale, m = margin();
        if (pw <= w - 2 * m) ox = (w - pw) / 2;
        else ox = Math.max(w - m - pw, Math.min(m, ox));
        float pullMax = pulling ? PULL_MAX_DP * getResources().getDisplayMetrics().density : 0;
        oy = Math.max(minOy() - pullMax, Math.min(maxOy(), oy));
        notifyVisible();
    }

    private void notifyVisible() {
        if (pages.isEmpty() || getHeight() == 0) return;
        int v = pageAt((getHeight() / 2f - oy) / scale);
        if (v != visible) {
            visible = v;
            if (listener != null) listener.onPageVisible(v);
        }
    }

    void scrollToPage(int i, boolean animate) {
        if (i < 0 || i >= pages.size()) return;
        float target = topInset + margin() - pageTop(i) * scale;
        float save = oy;
        oy = target;
        clampView(false);
        target = oy;
        oy = save;
        if (animate) animateOy(target, 380);
        else {
            oy = target;
            afterScroll();
        }
    }

    private void animateOy(float target, long ms) {
        if (scroller != null) scroller.cancel();
        scroller = ValueAnimator.ofFloat(oy, target);
        scroller.setDuration(ms);
        scroller.setInterpolator(new DecelerateInterpolator(1.6f));
        scroller.addUpdateListener(a -> {
            oy = (float) a.getAnimatedValue();
            notifyVisible();
            afterScroll();
        });
        scroller.start();
    }

    /** Tras desplazar: si el bitmap ya no cubre lo que se ve, rehacerlo. */
    private void afterScroll() {
        if (layerScale != scale || Math.abs(ox - layerOx) > 1 || Math.abs(oy - layerOy) > pad * 0.7f) renderLayer();
        else invalidate();
    }

    private boolean layerAligned() {
        return layerScale == scale && layerOx == ox && layerOy == oy;
    }

    // ---- Dibujo ----

    /** Prepara el canvas del bitmap para dibujar en la página i. */
    private void onLayerPage(int i) {
        layerCanvas.save();
        layerCanvas.translate(layerOx, layerOy + pad);
        layerCanvas.scale(layerScale, layerScale);
        layerCanvas.translate(0, pageTop(i));
    }

    /** Rehace el bitmap con todo lo dibujado, con la vista actual. */
    private void renderLayer() {
        if (layer == null) return;
        Canvas c = layerCanvas;
        c.drawColor(DESK);
        layerScale = scale;
        layerOx = ox;
        layerOy = oy;
        float top = (-pad - oy) / scale, bottom = (getHeight() + pad - oy) / scale;
        for (int i = 0; i < pages.size(); i++) {
            float y = pageTop(i);
            if (y > bottom || y + Ink.H < top) continue;
            Ink.Page p = pages.get(i);
            onLayerPage(i);
            c.drawRect(3, 5, Ink.W + 3, Ink.H + 5, shade);
            c.drawRect(0, 0, Ink.W, Ink.H, sheet);
            drawBackground(c, p);
            for (Ink.Stroke s : p.strokes) drawStroke(c, s);
            c.restore();
        }
        invalidate();
    }

    private void drawBackground(Canvas c, Ink.Page p) {
        if (Ink.PLAIN.equals(p.background)) return;
        lines.setStrokeWidth(1 / Math.max(scale, 0.01f));
        for (float y = 80; y < Ink.H; y += 40) c.drawLine(0, y, Ink.W, y, lines);
        if (Ink.GRID.equals(p.background)) for (float x = 40; x < Ink.W; x += 40) c.drawLine(x, 0, x, Ink.H, lines);
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
        if (layerScale == scale) {
            c.drawBitmap(layer, ox - layerOx, oy - layerOy - pad, null);
        } else {
            // En pleno zoom: estirar lo que había; se rehace al soltar.
            c.drawColor(DESK);
            float k = scale / layerScale;
            c.save();
            c.translate(ox - layerOx * k, oy - (layerOy + pad) * k);
            c.scale(k, k);
            c.drawBitmap(layer, 0, 0, null);
            c.restore();
        }
        if (current != null && Ink.HIGHLIGHTER.equals(current.tool) && current.n > 0) {
            c.save();
            c.translate(ox, oy);
            c.scale(scale, scale);
            c.translate(0, pageTop(currentPage));
            ink.setColor(current.color);
            ink.setAlpha(90);
            ink.setStrokeWidth(current.width);
            c.drawPath(highlighterPath, ink);
            ink.setAlpha(255);
            c.restore();
        }
        drawPull(c);
        // Sólo el dibujo de verdad, no las copias que hace el cristal.
        if (onFrame != null && c.isHardwareAccelerated()) onFrame.run();
    }

    /** Debajo de la última página: la página nueva que aparece al tirar. */
    private void drawPull(Canvas c) {
        float over = overscroll();
        if (over <= 0 || pages.isEmpty()) return;
        float top = oy + (pageTop(pages.size()) ) * scale;
        float left = ox, right = ox + Ink.W * scale, bottom = Math.min(getHeight() - margin() / 2, top + Ink.H * scale);
        if (bottom <= top + 8) return;
        float r = 6 * getResources().getDisplayMetrics().density;
        c.drawRoundRect(new RectF(left, top, right, bottom), r, r, dashed);
        boolean ready = over >= PULL_DP * getResources().getDisplayMetrics().density;
        float cy = (top + bottom) / 2;
        label.setFakeBoldText(ready);
        c.drawText(ready ? "Suelta para una página nueva" : "Tira para una página nueva", (left + right) / 2,
                cy + label.getTextSize() / 3, label);
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
        if (pages.isEmpty()) return false;
        int action = e.getActionMasked();
        int idx = e.getActionIndex();
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (pointerId == -1 && draws(e, idx)) {
                    requestUnbufferedDispatch(e);
                    if (scroller != null) scroller.cancel();
                    if (!layerAligned()) renderLayer();
                    pointerId = e.getPointerId(idx);
                    erasing = erases(e, idx);
                    if (erasing) erased.clear();
                    else startStroke(pageAt((e.getY(idx) - oy) / scale));
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

    /** Dedos: uno desplaza (con inercia), dos desplazan y hacen zoom. */
    private boolean gesture(MotionEvent e) {
        scaler.onTouchEvent(e);
        int action = e.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            if (scroller != null) scroller.cancel();
            if (velocity != null) velocity.recycle();
            velocity = VelocityTracker.obtain();
            pulled = false;
            atEnd = oy <= minOy() + 2;
        }
        if (velocity != null) velocity.addMovement(e);
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
            release();
            return true;
        }
        float fx = sx / n, fy = sy / n;
        if (!Float.isNaN(focusX) && action == MotionEvent.ACTION_MOVE) {
            float dy = fy - focusY;
            // Más allá del final cuesta más tirar (como una goma).
            if (dy < 0 && overscroll() > 0) dy *= 0.45f;
            ox += fx - focusX;
            oy += dy;
            clampView(atEnd);
            boolean ready = overscroll() >= PULL_DP * getResources().getDisplayMetrics().density;
            if (ready && !pulled) {
                performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                readySince = android.os.SystemClock.uptimeMillis();
            }
            pulled = ready;
            if (layerScale == scale) afterScroll();
            else invalidate();
        }
        focusX = fx;
        focusY = fy;
        return true;
    }

    /** Dedos fuera: página nueva si se tiró bastante; si no, inercia o volver al sitio. */
    private void release() {
        float over = overscroll();
        boolean held = pulled && android.os.SystemClock.uptimeMillis() - readySince >= PULL_HOLD_MS;
        pulled = false;
        if (held && over >= PULL_DP * getResources().getDisplayMetrics().density) {
            listener.onPullAddPage();
            return;
        }
        if (over > 0) {
            animateOy(minOy(), 260);
            return;
        }
        float vy = 0;
        if (velocity != null) {
            velocity.computeCurrentVelocity(1000);
            vy = velocity.getYVelocity();
            velocity.recycle();
            velocity = null;
        }
        if (Math.abs(vy) > 600 && layerScale == scale) {
            float target = Math.max(minOy(), Math.min(maxOy(), oy + vy * 0.35f));
            animateOy(target, 520);
        } else if (!layerAligned()) {
            renderLayer();
        }
    }

    private void startStroke(int page) {
        currentPage = page;
        boolean hl = tool == HIGHLIGHTER;
        current = new Ink.Stroke(Ink.newId(), hl ? Ink.HIGHLIGHTER : Ink.PEN,
                hl ? highlighterColor : penColor, hl ? highlighterWidth : penWidth);
        highlighterPath.reset();
        snapped = false;
        holdX = holdY = Float.NaN;
    }

    private void addPoint(MotionEvent e, int idx, int h) {
        float sx = h < 0 ? e.getX(idx) : e.getHistoricalX(idx, h);
        float sy = h < 0 ? e.getY(idx) : e.getHistoricalY(idx, h);
        float docX = (sx - ox) / scale, docY = (sy - oy) / scale;
        if (erasing) {
            int p = pageAt(docY);
            eraseAt(pages.get(p), docX, docY - pageTop(p));
            return;
        }
        Ink.Stroke s = current;
        if (s == null || snapped) return;
        float x = Math.max(0, Math.min(Ink.W, docX));
        float y = Math.max(0, Math.min(Ink.H, docY - pageTop(currentPage)));
        // Se movió: vuelve a contar el tiempo quieto.
        if (Float.isNaN(holdX) || Math.hypot(x - holdX, y - holdY) > 4) {
            holdX = x;
            holdY = y;
            removeCallbacks(holdCheck);
            postDelayed(holdCheck, HOLD_MS);
        }
        if (s.n > 0) {
            float dx = x - s.x(s.n - 1), dy = y - s.y(s.n - 1);
            if (dx * dx + dy * dy < 0.25f) return;
        }
        s.add(x, y, pressure(e, idx, h));
        if (Ink.HIGHLIGHTER.equals(s.tool)) {
            if (s.n == 1) highlighterPath.moveTo(x, y);
            else highlighterPath.lineTo(x, y);
            invalidate();
        } else if (s.n > 1 && layerAligned()) {
            onLayerPage(currentPage);
            drawSegment(layerCanvas, s, s.n - 1);
            layerCanvas.restore();
            invalidate();
        }
    }

    /** El lápiz lleva quieto un rato sin levantarse: ¿era una figura? */
    private void snapIfHeld() {
        if (current == null || pointerId == -1 || snapped || erasing) return;
        if (toShape(current)) {
            snapped = true;
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            redrawCurrent();
        }
    }

    /** Sustituye el trazo por su figura perfecta, si la reconoce. */
    private boolean toShape(Ink.Stroke s) {
        if (s.n < 3) return false;
        float[] xy = new float[2 * s.n];
        float pressure = 0;
        for (int i = 0; i < s.n; i++) {
            xy[2 * i] = s.x(i);
            xy[2 * i + 1] = s.y(i);
            pressure += s.p(i);
        }
        ShapeRecognizer.Shape shape = ShapeRecognizer.recognize(xy, s.n);
        if (shape == null) return false;
        s.replace(shape.xy, Math.max(0.5f, pressure / s.n));
        return true;
    }

    /** Tras cambiar el trazo en curso: quitar lo pintado y pintarlo de nuevo. */
    private void redrawCurrent() {
        renderLayer();
        Ink.Stroke s = current;
        if (s == null) return;
        if (Ink.HIGHLIGHTER.equals(s.tool)) {
            highlighterPath.reset();
            for (int i = 0; i < s.n; i++) {
                if (i == 0) highlighterPath.moveTo(s.x(i), s.y(i));
                else highlighterPath.lineTo(s.x(i), s.y(i));
            }
        } else {
            onLayerPage(currentPage);
            drawStroke(layerCanvas, s);
            layerCanvas.restore();
        }
        invalidate();
    }

    private void eraseAt(Ink.Page page, float x, float y) {
        float r = 10;
        boolean any = false;
        for (int i = page.strokes.size() - 1; i >= 0; i--) {
            Ink.Stroke s = page.strokes.get(i);
            if (s.hits(x, y, r)) {
                page.strokes.remove(i);
                ArrayList<Ink.Stroke> list = erased.get(page);
                if (list == null) erased.put(page, list = new ArrayList<>());
                list.add(s);
                any = true;
            }
        }
        if (any) renderLayer();
    }

    private void finish() {
        pointerId = -1;
        removeCallbacks(holdCheck);
        if (erasing) {
            erasing = false;
            if (erased.isEmpty()) return;
            LinkedHashMap<Ink.Page, ArrayList<Ink.Stroke>> done = new LinkedHashMap<>(erased);
            erased.clear();
            for (Map.Entry<Ink.Page, ArrayList<Ink.Stroke>> e : done.entrySet()) {
                sendErase(e.getKey(), e.getValue());
                listener.onEdited(e.getKey());
            }
            push(undo, new Object[] {"erase", done});
            redo.clear();
        } else {
            Ink.Stroke s = current;
            if (s != null && !snapped && autoShapes && toShape(s)) redrawCurrent();
            current = null;
            if (s == null || s.n == 0) return;
            Ink.Page page = pages.get(currentPage);
            page.strokes.add(s);
            if (Ink.HIGHLIGHTER.equals(s.tool) || s.n == 1) {
                onLayerPage(currentPage);
                drawStroke(layerCanvas, s);
                layerCanvas.restore();
                invalidate();
            }
            sendStroke(page, s);
            LinkedHashMap<Ink.Page, ArrayList<Ink.Stroke>> one = new LinkedHashMap<>();
            ArrayList<Ink.Stroke> list = new ArrayList<>();
            list.add(s);
            one.put(page, list);
            push(undo, new Object[] {"add", one});
            redo.clear();
            listener.onEdited(page);
        }
        notifyUndo();
    }

    private void sendStroke(Ink.Page page, Ink.Stroke s) {
        page.version++;
        listener.onOp("{\"t\":\"stroke\",\"page\":\"" + page.id + "\",\"version\":" + page.version
                + ",\"stroke\":" + s.toJson() + "}");
    }

    private void sendErase(Ink.Page page, ArrayList<Ink.Stroke> list) {
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
     * acción es «se añadieron estos trazos» o «se borraron estos trazos»,
     * por página.
     */
    @SuppressWarnings("unchecked")
    private void step(ArrayDeque<Object[]> from, ArrayDeque<Object[]> to) {
        if (pages.isEmpty() || from.isEmpty() || pointerId != -1) return;
        Object[] a = from.pop();
        LinkedHashMap<Ink.Page, ArrayList<Ink.Stroke>> byPage = (LinkedHashMap<Ink.Page, ArrayList<Ink.Stroke>>) a[1];
        boolean add = "add".equals(a[0]);
        for (Map.Entry<Ink.Page, ArrayList<Ink.Stroke>> e : byPage.entrySet()) {
            Ink.Page page = e.getKey();
            if (add) {
                page.strokes.removeAll(e.getValue());
                sendErase(page, e.getValue());
            } else {
                for (Ink.Stroke s : e.getValue()) {
                    page.strokes.add(s);
                    sendStroke(page, s);
                }
            }
            listener.onEdited(page);
        }
        push(to, new Object[] {add ? "erase" : "add", byPage});
        renderLayer();
        notifyUndo();
    }

    private void notifyUndo() {
        if (listener != null) listener.onUndoState(!undo.isEmpty(), !redo.isEmpty());
    }
}
