package dev.synctablet;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Una página del cuaderno a pantalla completa, con la barra de herramientas. */
public final class PageActivity extends Activity implements InkView.Listener, SyncClient.Listener {
    private static final int[] PEN_COLORS = {0xFF111827, 0xFF2563EB, 0xFFDC2626, 0xFF16A34A, 0xFF7C3AED, 0xFFEA580C};
    private static final int[] HL_COLORS = {0xFFFFD60A, 0xFF4ADE80, 0xFFF472B6, 0xFF60A5FA};
    private static final float[] PEN_WIDTHS = {2f, 3.5f, 6f};
    private static final float[] HL_WIDTHS = {16f, 24f, 36f};
    private static final String[] BACKGROUNDS = {Ink.LINES, Ink.GRID, Ink.PLAIN};
    private static final String[] BACKGROUND_NAMES = {"Rayas", "Cuadros", "Lisa"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable saver = this::save;
    private Store store;
    private SyncClient sync;
    private SharedPreferences prefs;
    private Ink.Notebook notebook;
    private int index;

    private InkView ink;
    private TextView title, pen, highlighter, eraser, undo, redo, background, finger, dot;
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

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BAR);
        Ui.fitSystemBars(root, 0, 0, 0, 0);
        root.addView(toolbar(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 60)));
        root.addView(ink, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
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

    private View sep() {
        View v = new View(this);
        v.setBackgroundColor(0x22FFFFFF);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 1), Ui.dp(this, 28));
        lp.leftMargin = lp.rightMargin = Ui.dp(this, 8);
        v.setLayoutParams(lp);
        return v;
    }

    private View toolbar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int pad = Ui.dp(this, 8);
        bar.setPadding(pad, 0, pad, 0);

        TextView back = Ui.button(this, "‹ Cuadernos");
        back.setOnClickListener(v -> finish());
        bar.addView(back);
        title = Ui.text(this, "", 15, Ui.MUTED, false);
        title.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 8), 0);
        bar.addView(title);
        bar.addView(sep());

        pen = Ui.button(this, "Pluma");
        pen.setOnClickListener(v -> setTool(InkView.PEN));
        highlighter = Ui.button(this, "Resaltador");
        highlighter.setOnClickListener(v -> setTool(InkView.HIGHLIGHTER));
        eraser = Ui.button(this, "Goma");
        eraser.setOnClickListener(v -> setTool(InkView.ERASER));
        bar.addView(pen);
        bar.addView(highlighter);
        bar.addView(eraser);
        bar.addView(sep());

        // Ancho fijo: al cambiar de herramienta los botones de la derecha no se mueven.
        colors = new LinearLayout(this);
        colors.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(colors, new LinearLayout.LayoutParams(Ui.dp(this, 44) * PEN_COLORS.length, ViewGroup.LayoutParams.MATCH_PARENT));
        widths = new LinearLayout(this);
        widths.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(widths, new LinearLayout.LayoutParams(Ui.dp(this, 44) * PEN_WIDTHS.length, ViewGroup.LayoutParams.MATCH_PARENT));
        bar.addView(sep());

        undo = Ui.button(this, "Deshacer");
        undo.setOnClickListener(v -> ink.undo());
        redo = Ui.button(this, "Rehacer");
        redo.setOnClickListener(v -> ink.redo());
        bar.addView(undo);
        bar.addView(redo);
        bar.addView(sep());

        TextView prev = Ui.button(this, "‹");
        prev.setContentDescription("Página anterior");
        prev.setOnClickListener(v -> go(index - 1));
        TextView next = Ui.button(this, "›");
        next.setContentDescription("Página siguiente");
        next.setOnClickListener(v -> go(index + 1));
        TextView add = Ui.button(this, "+ Página");
        add.setOnClickListener(v -> addPage());
        bar.addView(prev);
        bar.addView(next);
        bar.addView(add);
        background = Ui.button(this, "");
        background.setOnClickListener(v -> cycleBackground());
        bar.addView(background);
        finger = Ui.button(this, "Dibujar con el dedo");
        finger.setOnClickListener(v -> {
            ink.fingerDraws = !ink.fingerDraws;
            prefs.edit().putBoolean("finger", ink.fingerDraws).apply();
            refreshTools();
        });
        bar.addView(finger);
        dot = Ui.text(this, "●", 16, Ui.MUTED, false);
        dot.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 8), 0);
        bar.addView(dot);

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setBackgroundColor(Ui.BAR);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.addView(bar, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return scroll;
    }

    private void setTool(int t) {
        ink.tool = t;
        refreshTools();
    }

    /** Muestras de color y de grosor de la herramienta elegida. */
    private void refreshTools() {
        Ui.setActive(pen, ink.tool == InkView.PEN);
        Ui.setActive(highlighter, ink.tool == InkView.HIGHLIGHTER);
        Ui.setActive(eraser, ink.tool == InkView.ERASER);
        Ui.setActive(finger, ink.fingerDraws);
        colors.removeAllViews();
        widths.removeAllViews();
        if (ink.tool == InkView.ERASER) return;
        boolean hl = ink.tool == InkView.HIGHLIGHTER;
        int[] palette = hl ? HL_COLORS : PEN_COLORS;
        int currentColor = hl ? ink.highlighterColor : ink.penColor;
        for (int c : palette) {
            View sw = new View(this);
            int size = Ui.dp(this, 28);
            android.graphics.drawable.GradientDrawable d = Ui.round(c, size / 2f);
            // Borde claro para que el negro se vea sobre la barra oscura.
            d.setStroke(Ui.dp(this, c == currentColor ? 3 : 1), c == currentColor ? Ui.ACCENT : 0x66FFFFFF);
            sw.setBackground(d);
            FrameWrap.add(colors, sw, size, "Color " + Ink.hex(c), v -> {
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
            int size = Ui.dp(this, 8 + 6 * i);
            sw.setBackground(Ui.round(w == currentWidth ? Ui.ACCENT : Ui.TEXT, size / 2f));
            FrameWrap.add(widths, sw, size, new String[] {"Fino", "Medio", "Grueso"}[i], v -> {
                if (hl) ink.highlighterWidth = w;
                else ink.penWidth = w;
                prefs.edit().putFloat(hl ? "hlWidth" : "penWidth", w).apply();
                refreshTools();
            });
        }
    }

    private void showPage() {
        index = Math.max(0, Math.min(notebook.pages.size() - 1, index));
        Ink.Page p = store.page(notebook.pages.get(index));
        if (p == null) {
            p = new Ink.Page(notebook.pages.get(index), notebook.id);
            store.savePage(p);
        }
        ink.setPage(p);
        title.setText(notebook.title + " · " + (index + 1) + "/" + notebook.pages.size());
        for (int i = 0; i < BACKGROUNDS.length; i++) {
            if (BACKGROUNDS[i].equals(p.background)) background.setText("Hoja: " + BACKGROUND_NAMES[i]);
        }
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
        background.setText("Hoja: " + BACKGROUND_NAMES[next]);
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
        undo.setAlpha(canUndo ? 1f : 0.4f);
        redo.setEnabled(canRedo);
        redo.setAlpha(canRedo ? 1f : 0.4f);
    }

    // ---- SyncClient.Listener ----

    @Override
    public void onStatus(boolean connected, String where) {
        dot.setTextColor(connected ? Ui.ON : Ui.MUTED);
        dot.setContentDescription(connected ? "Conectado al PC" : "Sin conexión al PC");
    }

    /** Una muestra pequeña centrada en una casilla tocable de 44 dp. */
    static final class FrameWrap {
        static void add(LinearLayout parent, View swatch, int size, String label, View.OnClickListener click) {
            android.content.Context c = parent.getContext();
            android.widget.FrameLayout f = new android.widget.FrameLayout(c);
            f.addView(swatch, new android.widget.FrameLayout.LayoutParams(size, size, Gravity.CENTER));
            f.setContentDescription(label);
            f.setOnClickListener(click);
            parent.addView(f, new LinearLayout.LayoutParams(Ui.dp(c, 44), Ui.dp(c, 44)));
        }

        private FrameWrap() {}
    }
}
