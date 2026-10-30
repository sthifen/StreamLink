package dev.synctablet;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Una página a pantalla completa. Encima flotan, en cristal líquido, la
 * barra de herramientas (arriba) y la paleta de colores y grosores (a la
 * izquierda); al ser flotantes, cambiar de herramienta no mueve nada.
 */
public final class PageActivity extends Activity implements InkView.Listener, SyncClient.Listener {
    private static final int[] PEN_COLORS = {0xFF111827, 0xFF2563EB, 0xFFDC2626, 0xFF16A34A, 0xFF7C3AED, 0xFFEA580C};
    private static final int[] HL_COLORS = {0xFFFFD60A, 0xFF4ADE80, 0xFFF472B6, 0xFF60A5FA};
    private static final float[] PEN_WIDTHS = {2f, 3.5f, 6f};
    private static final float[] HL_WIDTHS = {16f, 24f, 36f};
    private static final String[] BACKGROUNDS = {Ink.LINES, Ink.GRID, Ink.PLAIN};
    private static final String[] BACKGROUND_NAMES = {"rayas", "cuadros", "lisa"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable saver = this::save;
    private Store store;
    private SyncClient sync;
    private SharedPreferences prefs;
    private Ink.Notebook notebook;
    private int index;

    private InkView ink;
    private GlassLayout bar, palette;
    private TextView title;
    private IconView pen, highlighter, eraser, shapes, undo, redo, finger;
    private View dot;
    private LinearLayout colors, widths;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = Store.get(this);
        sync = SyncClient.get(this);
        prefs = getSharedPreferences("tools", MODE_PRIVATE);
        notebook = store.notebook(getIntent().getStringExtra("notebook"));
        if (notebook == null) {
            finish();
            return;
        }
        index = saved != null ? saved.getInt("index", notebook.pages.size() - 1) : notebook.pages.size() - 1;

        ink = new InkView(this);
        ink.setListener(this);
        ink.penColor = prefs.getInt("penColor", PEN_COLORS[0]);
        ink.penWidth = prefs.getFloat("penWidth", PEN_WIDTHS[1]);
        ink.highlighterColor = prefs.getInt("hlColor", HL_COLORS[0]);
        ink.highlighterWidth = prefs.getFloat("hlWidth", HL_WIDTHS[1]);
        ink.fingerDraws = prefs.getBoolean("finger", false);
        ink.autoShapes = prefs.getBoolean("shapes", false);

        FrameLayout root = new FrameLayout(this);
        root.addView(ink, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = toolbar();
        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                Ui.dp(this, 56), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        root.addView(bar, barLp);
        palette = palette();
        FrameLayout.LayoutParams palLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.START | Gravity.CENTER_VERTICAL);
        root.addView(palette, palLp);
        // Las barras del sistema quedan sobre la hoja; los paneles, debajo de ellas.
        root.setOnApplyWindowInsetsListener((v, in) -> {
            @SuppressWarnings("deprecation") int top = in.getSystemWindowInsetTop();
            @SuppressWarnings("deprecation") int left = in.getSystemWindowInsetLeft();
            int gap = Ui.dp(this, 10);
            barLp.topMargin = top + gap;
            palLp.leftMargin = left + Ui.dp(this, 14);
            bar.setLayoutParams(barLp);
            palette.setLayoutParams(palLp);
            bar.maxWidth = getResources().getDisplayMetrics().widthPixels - 2 * gap;
            ink.topInset = top + gap + Ui.dp(this, 56);
            return in;
        });
        // Cada fotograma de la hoja se ve a través del cristal.
        ink.onFrame = () -> {
            bar.postInvalidateOnAnimation();
            palette.postInvalidateOnAnimation();
        };
        setContentView(root);
        showPage();
        refreshTools();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("index", index);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (sync != null) sync.addListener(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (sync == null) return;
        sync.removeListener(this);
        save();
    }

    private IconView icon(int which, String label, View.OnClickListener click) {
        IconView v = new IconView(this, which, Ui.ICON, label);
        v.setOnClickListener(click);
        return v;
    }

    private View sep(boolean vertical) {
        View v = new View(this);
        v.setBackgroundColor(0x26111827);
        LinearLayout.LayoutParams lp = vertical
                ? new LinearLayout.LayoutParams(Ui.dp(this, 26), Ui.dp(this, 1))
                : new LinearLayout.LayoutParams(Ui.dp(this, 1), Ui.dp(this, 26));
        if (vertical) lp.topMargin = lp.bottomMargin = Ui.dp(this, 6);
        else lp.leftMargin = lp.rightMargin = Ui.dp(this, 6);
        lp.gravity = Gravity.CENTER;
        v.setLayoutParams(lp);
        return v;
    }

    private GlassLayout toolbar() {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(this, 6), 0, Ui.dp(this, 16), 0);

        row.addView(icon(IconView.BACK, "Volver a los cuadernos", v -> finish()));
        title = Ui.text(this, "", 15, Ui.ICON, true);
        title.setPadding(Ui.dp(this, 2), 0, Ui.dp(this, 8), 0);
        row.addView(title);
        row.addView(sep(false));

        pen = icon(IconView.PEN, "Pluma", v -> setTool(InkView.PEN));
        highlighter = icon(IconView.HIGHLIGHTER, "Resaltador", v -> setTool(InkView.HIGHLIGHTER));
        eraser = icon(IconView.ERASER, "Goma", v -> setTool(InkView.ERASER));
        shapes = icon(IconView.SHAPES, "Convertir en figuras", v -> {
            ink.autoShapes = !ink.autoShapes;
            prefs.edit().putBoolean("shapes", ink.autoShapes).apply();
            refreshTools();
            Ui.toast(this, ink.autoShapes ? "Figuras: cada trazo que lo parezca se convierte"
                    : "Figuras: mantén el lápiz quieto al final del trazo para convertirlo");
        });
        row.addView(pen);
        row.addView(highlighter);
        row.addView(eraser);
        row.addView(shapes);
        row.addView(sep(false));

        undo = icon(IconView.UNDO, "Deshacer", v -> ink.undo());
        redo = icon(IconView.REDO, "Rehacer", v -> ink.redo());
        row.addView(undo);
        row.addView(redo);
        row.addView(sep(false));

        row.addView(icon(IconView.PREV, "Página anterior", v -> go(index - 1)));
        row.addView(icon(IconView.NEXT, "Página siguiente", v -> go(index + 1)));
        row.addView(icon(IconView.PLUS, "Página nueva", v -> addPage()));
        row.addView(icon(IconView.PAGE, "Fondo de la hoja", v -> cycleBackground()));
        finger = icon(IconView.HAND, "Dibujar con el dedo", v -> {
            ink.fingerDraws = !ink.fingerDraws;
            prefs.edit().putBoolean("finger", ink.fingerDraws).apply();
            refreshTools();
            Ui.toast(this, ink.fingerDraws ? "El dedo dibuja (dos dedos mueven la hoja)" : "El dedo mueve la hoja; dibuja el lápiz");
        });
        row.addView(finger);

        dot = new View(this);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(Ui.dp(this, 10), Ui.dp(this, 10));
        dlp.leftMargin = Ui.dp(this, 8);
        row.addView(dot, dlp);

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.addView(row, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        GlassLayout g = new GlassLayout(this, ink, Ui.GLASS_LIGHT, Ui.dp(this, 28));
        g.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return g;
    }

    private GlassLayout palette() {
        GlassLayout g = new GlassLayout(this, ink, Ui.GLASS_LIGHT, Ui.dp(this, 28));
        g.setOrientation(LinearLayout.VERTICAL);
        g.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = Ui.dp(this, 6);
        g.setPadding(pad, Ui.dp(this, 8), pad, Ui.dp(this, 8));
        colors = new LinearLayout(this);
        colors.setOrientation(LinearLayout.VERTICAL);
        widths = new LinearLayout(this);
        widths.setOrientation(LinearLayout.VERTICAL);
        // Con su propio ancho: si no, toman el de la línea separadora.
        ViewGroup.LayoutParams wrap = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        g.addView(colors, wrap);
        g.addView(sep(true));
        g.addView(widths, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return g;
    }

    private void setTool(int t) {
        ink.tool = t;
        refreshTools();
    }

    private void refreshTools() {
        pen.setActive(ink.tool == InkView.PEN);
        highlighter.setActive(ink.tool == InkView.HIGHLIGHTER);
        eraser.setActive(ink.tool == InkView.ERASER);
        shapes.setActive(ink.autoShapes);
        finger.setActive(ink.fingerDraws);
        colors.removeAllViews();
        widths.removeAllViews();
        palette.setVisibility(ink.tool == InkView.ERASER ? View.GONE : View.VISIBLE);
        if (ink.tool == InkView.ERASER) return;
        boolean hl = ink.tool == InkView.HIGHLIGHTER;
        int currentColor = hl ? ink.highlighterColor : ink.penColor;
        for (int c : hl ? HL_COLORS : PEN_COLORS) {
            View sw = new View(this);
            int size = Ui.dp(this, 26);
            GradientDrawable d = Ui.round(c, size / 2f);
            boolean on = c == currentColor;
            d.setStroke(Ui.dp(this, on ? 3 : 1), on ? 0xFFFFFFFF : 0x33111827);
            sw.setBackground(d);
            if (on) sw.setElevation(Ui.dp(this, 3));
            cell(colors, sw, size, "Color " + Ink.hex(c), v -> {
                if (hl) ink.highlighterColor = c;
                else ink.penColor = c;
                prefs.edit().putInt(hl ? "hlColor" : "penColor", c).apply();
                refreshTools();
            });
        }
        float[] sizes = hl ? HL_WIDTHS : PEN_WIDTHS;
        float currentWidth = hl ? ink.highlighterWidth : ink.penWidth;
        for (int i = 0; i < sizes.length; i++) {
            final float w = sizes[i];
            View sw = new View(this);
            int size = Ui.dp(this, 6 + 6 * i);
            sw.setBackground(Ui.round(w == currentWidth ? Ui.ACCENT_DEEP : 0x66111827, size / 2f));
            cell(widths, sw, size, new String[] {"Fino", "Medio", "Grueso"}[i], v -> {
                if (hl) ink.highlighterWidth = w;
                else ink.penWidth = w;
                prefs.edit().putFloat(hl ? "hlWidth" : "penWidth", w).apply();
                refreshTools();
            });
        }
    }

    /** Una muestra centrada en una casilla tocable de 44 dp. */
    private void cell(LinearLayout parent, View swatch, int size, String label, View.OnClickListener click) {
        FrameLayout f = new FrameLayout(this);
        f.addView(swatch, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        f.setContentDescription(label);
        f.setOnClickListener(click);
        parent.addView(f, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
    }

    private void showPage() {
        index = Math.max(0, Math.min(notebook.pages.size() - 1, index));
        Ink.Page p = store.page(notebook.pages.get(index));
        if (p == null) {
            p = new Ink.Page(notebook.pages.get(index), notebook.id);
            store.savePage(p);
        }
        ink.setPage(p);
        title.setText(notebook.title + "  " + (index + 1) + "/" + notebook.pages.size());
    }

    private void go(int i) {
        if (i < 0 || i >= notebook.pages.size() || i == index) return;
        save();
        index = i;
        showPage();
    }

    private void addPage() {
        save();
        Ink.Page p = store.addPage(notebook);
        sync.sendNotebook(notebook);
        sync.sendPage(p);
        index = notebook.pages.size() - 1;
        showPage();
    }

    private void cycleBackground() {
        Ink.Page p = ink.page();
        int i = 0;
        while (i < BACKGROUNDS.length && !BACKGROUNDS[i].equals(p.background)) i++;
        int next = (i + 1) % BACKGROUNDS.length;
        ink.setBackground(BACKGROUNDS[next]);
        Ui.toast(this, "Hoja " + BACKGROUND_NAMES[next]);
    }

    private void save() {
        main.removeCallbacks(saver);
        if (ink != null && ink.page() != null) store.savePage(ink.page());
    }

    // ---- InkView.Listener ----

    @Override
    public void onOp(String json) {
        sync.send(json);
    }

    @Override
    public void onEdited() {
        main.removeCallbacks(saver);
        main.postDelayed(saver, 500);
    }

    @Override
    public void onUndoState(boolean canUndo, boolean canRedo) {
        undo.setEnabled(canUndo);
        redo.setEnabled(canRedo);
    }

    // ---- SyncClient.Listener ----

    @Override
    public void onStatus(boolean connected, String where) {
        dot.setBackground(Ui.round(connected ? 0xFF10B981 : 0x55111827, Ui.dp(this, 5)));
        dot.setContentDescription(connected ? "Conectado al PC (" + where + ")" : "Sin conexión al PC");
    }
}
