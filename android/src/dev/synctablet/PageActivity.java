package dev.synctablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.drawable.GradientDrawable;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;

/**
 * El cuaderno a pantalla completa, con sus páginas una debajo de otra.
 * Encima flotan, en cristal líquido, la barra de herramientas (arriba), la
 * paleta de colores y grosores (izquierda) y, con algo seleccionado, sus
 * acciones (abajo).
 */
public final class PageActivity extends Activity implements InkView.Listener, SyncClient.Listener {
    private static final int[] PEN_COLORS = {0xFF111827, 0xFF2563EB, 0xFFDC2626, 0xFF16A34A, 0xFF7C3AED, 0xFFEA580C};
    private static final int[] HL_COLORS = {0xFFFFD60A, 0xFF4ADE80, 0xFFF472B6, 0xFF60A5FA};
    private static final float[] PEN_WIDTHS = {2f, 3.5f, 6f};
    private static final float[] HL_WIDTHS = {16f, 24f, 36f};
    private static final String[] PEN_KINDS = {Ink.PEN, Ink.PENCIL, Ink.BRUSH, Ink.CALLIGRAPHY};
    private static final String[] PEN_NAMES = {"Pluma", "Lápiz", "Pincel", "Caligrafía"};
    private static final String[] BACKGROUNDS = {Ink.LINES, Ink.GRID, Ink.DOTS, Ink.CORNELL, Ink.TODO, Ink.MUSIC, Ink.PLAIN};
    private static final String[] BACKGROUND_NAMES = {"Rayas", "Cuadros", "Puntos", "Cornell (apuntes)", "Lista de tareas", "Pentagrama", "Lisa"};
    private static final int PICK_IMAGE = 1, PICK_PDF = 2;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable saver = this::save;
    /** Páginas cambiadas que falta guardar. */
    private final LinkedHashSet<Ink.Page> dirty = new LinkedHashSet<>();
    private Store store;
    private SyncClient sync;
    private SharedPreferences prefs;
    private Ink.Notebook notebook;
    private int index;

    private InkView ink;
    private GlassLayout bar, palette, selectionBar;
    private TextView title;
    private IconView pen, highlighter, eraser, lasso, shapes, text, tape, laser, undo, redo, finger;
    private View dot;
    private LinearLayout colors, widths;
    private int customColor;

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
        ink.penKind = prefs.getString("penKind", Ink.PEN);
        ink.highlighterColor = prefs.getInt("hlColor", HL_COLORS[0]);
        ink.highlighterWidth = prefs.getFloat("hlWidth", HL_WIDTHS[1]);
        ink.fingerDraws = prefs.getBoolean("finger", false);
        ink.autoShapes = prefs.getBoolean("shapes", false);
        ink.partialEraser = prefs.getBoolean("partialEraser", false);
        customColor = prefs.getInt("customColor", 0xFF0EA5E9);

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
        selectionBar = selectionBar();
        FrameLayout.LayoutParams selLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                Ui.dp(this, 56), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        root.addView(selectionBar, selLp);
        selectionBar.setVisibility(View.GONE);
        root.setOnApplyWindowInsetsListener((v, in) -> {
            @SuppressWarnings("deprecation") int top = in.getSystemWindowInsetTop();
            @SuppressWarnings("deprecation") int left = in.getSystemWindowInsetLeft();
            @SuppressWarnings("deprecation") int bottom = in.getSystemWindowInsetBottom();
            int gap = Ui.dp(this, 10);
            barLp.topMargin = top + gap;
            palLp.leftMargin = left + Ui.dp(this, 14);
            selLp.bottomMargin = bottom + Ui.dp(this, 18);
            bar.setLayoutParams(barLp);
            palette.setLayoutParams(palLp);
            selectionBar.setLayoutParams(selLp);
            bar.maxWidth = getResources().getDisplayMetrics().widthPixels - 2 * gap;
            ink.topInset = top + gap + Ui.dp(this, 56);
            return in;
        });
        // Cada fotograma de la hoja se ve a través del cristal.
        ink.onFrame = () -> {
            bar.postInvalidateOnAnimation();
            palette.postInvalidateOnAnimation();
            if (selectionBar.getVisibility() == View.VISIBLE) selectionBar.postInvalidateOnAnimation();
        };
        setContentView(root);
        loadPages(index);
        refreshTools();
    }

    private void loadPages(int show) {
        ArrayList<Ink.Page> list = new ArrayList<>();
        for (String id : notebook.pages) {
            Ink.Page p = store.page(id);
            if (p == null) {
                p = new Ink.Page(id, notebook.id);
                store.savePage(p);
            }
            list.add(p);
        }
        index = Math.max(0, Math.min(list.size() - 1, show));
        ink.setPages(list, index);
        showTitle();
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

    // ---- Barras ----

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
        title.setMinHeight(Ui.dp(this, 44));
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setContentDescription("Opciones de la página");
        title.setOnClickListener(v -> pageMenu());
        row.addView(title);
        row.addView(sep(false));

        // Tocar otra vez la herramienta activa abre sus opciones.
        pen = icon(IconView.PEN, "Pluma (toca otra vez para el tipo)", v -> {
            if (ink.tool == InkView.PEN) chooseKind();
            else setTool(InkView.PEN);
        });
        highlighter = icon(IconView.HIGHLIGHTER, "Resaltador", v -> setTool(InkView.HIGHLIGHTER));
        eraser = icon(IconView.ERASER, "Goma (toca otra vez para el modo)", v -> {
            if (ink.tool == InkView.ERASER) chooseEraser();
            else setTool(InkView.ERASER);
        });
        lasso = icon(IconView.LASSO, "Lazo: seleccionar, mover y cambiar tamaño", v -> setTool(InkView.LASSO));
        shapes = icon(IconView.SHAPES, "Convertir en figuras", v -> {
            ink.autoShapes = !ink.autoShapes;
            prefs.edit().putBoolean("shapes", ink.autoShapes).apply();
            refreshTools();
            Ui.toast(this, ink.autoShapes ? "Figuras: cada trazo que lo parezca se convierte"
                    : "Figuras: mantén el lápiz quieto al final del trazo para convertirlo");
        });
        text = icon(IconView.TEXT, "Texto: toca la hoja para escribir", v -> setTool(InkView.TEXT));
        tape = icon(IconView.TAPE, "Cinta: tapa algo; tócala con el dedo para destaparla", v -> setTool(InkView.TAPE));
        laser = icon(IconView.LASER, "Puntero láser (también en el PC)", v -> setTool(InkView.LASER));
        for (View t : new View[] {pen, highlighter, eraser, lasso, shapes, text, tape, laser}) row.addView(t);
        row.addView(sep(false));

        undo = icon(IconView.UNDO, "Deshacer", v -> ink.undo());
        redo = icon(IconView.REDO, "Rehacer", v -> ink.redo());
        row.addView(undo);
        row.addView(redo);
        row.addView(sep(false));

        row.addView(icon(IconView.PREV, "Página anterior", v -> ink.scrollToPage(index - 1, true)));
        row.addView(icon(IconView.NEXT, "Página siguiente", v -> ink.scrollToPage(index + 1, true)));
        row.addView(icon(IconView.PLUS, "Página nueva", v -> addPage()));
        row.addView(icon(IconView.PAGES, "Páginas: ordenar, duplicar, borrar", v -> pageManager()));
        row.addView(icon(IconView.PAGE, "Plantilla de la hoja", v -> chooseTemplate()));
        row.addView(icon(IconView.IMAGE, "Insertar foto o PDF", v -> insertMenu()));
        row.addView(icon(IconView.EXPORT, "Exportar a PDF", v -> exportPdf()));
        row.addView(sep(false));
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
        g.addView(colors, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        g.addView(sep(true));
        g.addView(widths, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return g;
    }

    private GlassLayout selectionBar() {
        GlassLayout g = new GlassLayout(this, ink, Ui.GLASS_LIGHT, Ui.dp(this, 28));
        g.setGravity(Gravity.CENTER_VERTICAL);
        g.setPadding(Ui.dp(this, 10), 0, Ui.dp(this, 10), 0);
        TextView hint = Ui.text(this, "Arrastra para mover · la esquina cambia el tamaño · un color lo recolorea", 13, Ui.ICON_MUTED, false);
        hint.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 8), 0);
        g.addView(hint);
        g.addView(icon(IconView.COPY, "Duplicar", v -> ink.duplicateSelection()));
        g.addView(icon(IconView.TRASH, "Borrar", v -> ink.deleteSelection()));
        g.addView(icon(IconView.CHECK, "Listo", v -> ink.clearSelection()));
        return g;
    }

    private void setTool(int t) {
        ink.tool = t;
        if (t != InkView.LASSO) ink.clearSelection();
        refreshTools();
    }

    private void refreshTools() {
        pen.setActive(ink.tool == InkView.PEN);
        highlighter.setActive(ink.tool == InkView.HIGHLIGHTER);
        eraser.setActive(ink.tool == InkView.ERASER);
        lasso.setActive(ink.tool == InkView.LASSO);
        text.setActive(ink.tool == InkView.TEXT);
        tape.setActive(ink.tool == InkView.TAPE);
        laser.setActive(ink.tool == InkView.LASER);
        shapes.setActive(ink.autoShapes);
        finger.setActive(ink.fingerDraws);
        colors.removeAllViews();
        widths.removeAllViews();
        boolean hl = ink.tool == InkView.HIGHLIGHTER;
        boolean coloring = ink.tool == InkView.PEN || hl || ink.tool == InkView.TEXT || ink.hasSelection();
        palette.setVisibility(coloring ? View.VISIBLE : View.GONE);
        if (!coloring) return;
        int currentColor = hl ? ink.highlighterColor : ink.penColor;
        ArrayList<Integer> list = new ArrayList<>();
        for (int c : hl ? HL_COLORS : PEN_COLORS) list.add(c);
        if (!hl) list.add(customColor);
        for (int c : list) {
            View sw = new View(this);
            int size = Ui.dp(this, 26);
            GradientDrawable d = Ui.round(c, size / 2f);
            boolean on = c == currentColor && !ink.hasSelection();
            d.setStroke(Ui.dp(this, on ? 3 : 1), on ? 0xFFFFFFFF : 0x33111827);
            sw.setBackground(d);
            if (on) sw.setElevation(Ui.dp(this, 3));
            cell(colors, sw, size, "Color " + Ink.hex(c), v -> pickColor(c, hl));
        }
        // «+»: color a medida.
        TextView plus = Ui.text(this, "+", 20, Ui.ICON, true);
        plus.setGravity(Gravity.CENTER);
        FrameLayout f = new FrameLayout(this);
        f.addView(plus, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        f.setContentDescription("Color a medida");
        f.setOnClickListener(v -> customColorDialog(hl));
        colors.addView(f, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
        if (ink.hasSelection() || ink.tool == InkView.TEXT) {
            widths.setVisibility(View.GONE);
            return;
        }
        widths.setVisibility(View.VISIBLE);
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

    private void pickColor(int c, boolean hl) {
        if (ink.hasSelection()) {
            ink.recolorSelection(c);
            return;
        }
        if (hl) ink.highlighterColor = c;
        else ink.penColor = c;
        prefs.edit().putInt(hl ? "hlColor" : "penColor", c).apply();
        refreshTools();
    }

    /** Una muestra centrada en una casilla tocable de 44 dp. */
    private void cell(LinearLayout parent, View swatch, int size, String label, View.OnClickListener click) {
        FrameLayout f = new FrameLayout(this);
        f.addView(swatch, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        f.setContentDescription(label);
        f.setOnClickListener(click);
        parent.addView(f, new LinearLayout.LayoutParams(Ui.dp(this, 44), Ui.dp(this, 44)));
    }

    // ---- Opciones de herramientas ----

    private void chooseKind() {
        int current = 0;
        for (int i = 0; i < PEN_KINDS.length; i++) if (PEN_KINDS[i].equals(ink.penKind)) current = i;
        new AlertDialog.Builder(this)
                .setTitle("Tipo de lápiz")
                .setSingleChoiceItems(PEN_NAMES, current, (d, which) -> {
                    ink.penKind = PEN_KINDS[which];
                    prefs.edit().putString("penKind", ink.penKind).apply();
                    d.dismiss();
                    Ui.toast(this, PEN_NAMES[which]);
                })
                .show();
    }

    private void chooseEraser() {
        new AlertDialog.Builder(this)
                .setTitle("Goma")
                .setSingleChoiceItems(new String[] {"Borra trazos enteros", "Borra sólo lo que toca"}, ink.partialEraser ? 1 : 0, (d, which) -> {
                    ink.partialEraser = which == 1;
                    prefs.edit().putBoolean("partialEraser", ink.partialEraser).apply();
                    d.dismiss();
                })
                .show();
    }

    private void chooseTemplate() {
        Ink.Page p = ink.visiblePage();
        if (p == null) return;
        int current = 0;
        for (int i = 0; i < BACKGROUNDS.length; i++) if (BACKGROUNDS[i].equals(p.background)) current = i;
        new AlertDialog.Builder(this)
                .setTitle("Plantilla de la página " + (index + 1))
                .setSingleChoiceItems(BACKGROUND_NAMES, current, (d, which) -> {
                    ink.setBackground(BACKGROUNDS[which]);
                    d.dismiss();
                })
                .show();
    }

    /** Selector de color a medida: tono, saturación y brillo, con muestra. */
    private void customColorDialog(boolean hl) {
        float[] hsv = new float[3];
        Color.colorToHSV(customColor, hsv);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = Ui.dp(this, 20);
        box.setPadding(pad, pad / 2, pad, 0);
        View preview = new View(this);
        box.addView(preview, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 48)));
        String[] names = {"Tono", "Saturación", "Brillo"};
        int[] max = {360, 100, 100};
        SeekBar[] bars = new SeekBar[3];
        Runnable update = () -> {
            float[] v = {bars[0].getProgress(), bars[1].getProgress() / 100f, bars[2].getProgress() / 100f};
            preview.setBackground(Ui.round(Color.HSVToColor(v), Ui.dp(this, 12)));
        };
        for (int i = 0; i < 3; i++) {
            box.addView(Ui.text(this, names[i], 14, 0xFF9AA9AE, false));
            bars[i] = new SeekBar(this);
            bars[i].setMax(max[i]);
            bars[i].setProgress(Math.round(i == 0 ? hsv[0] : hsv[i] * 100));
            bars[i].setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar s, int v, boolean user) { update.run(); }
                @Override public void onStartTrackingTouch(SeekBar s) {}
                @Override public void onStopTrackingTouch(SeekBar s) {}
            });
            box.addView(bars[i]);
        }
        update.run();
        new AlertDialog.Builder(this)
                .setTitle("Color a medida")
                .setView(box)
                .setPositiveButton("Usar", (d, w) -> {
                    float[] v = {bars[0].getProgress(), bars[1].getProgress() / 100f, bars[2].getProgress() / 100f};
                    customColor = Color.HSVToColor(v);
                    prefs.edit().putInt("customColor", customColor).apply();
                    pickColor(customColor, hl);
                    refreshTools();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    // ---- Texto ----

    @Override
    public void onTextRequest(int page, Ink.Item item, float x, float y) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = Ui.dp(this, 20);
        box.setPadding(pad, pad / 2, pad, 0);
        EditText field = new EditText(this);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        field.setMinLines(3);
        field.setGravity(Gravity.TOP);
        if (item != null) field.setText(item.text);
        box.addView(field);
        float[] sizes = {20, 28, 40, 56};
        String[] sizeNames = {"Pequeño", "Normal", "Grande", "Título"};
        final float[] chosen = {item != null ? item.size : 28};
        LinearLayout row = new LinearLayout(this);
        ArrayList<TextView> buttons = new ArrayList<>();
        for (int i = 0; i < sizes.length; i++) {
            TextView b = Ui.button(this, sizeNames[i]);
            final float s = sizes[i];
            b.setOnClickListener(v -> {
                chosen[0] = s;
                for (TextView o : buttons) Ui.setActive(o, o == v);
            });
            buttons.add(b);
            Ui.setActive(b, Math.abs(s - chosen[0]) < 1);
            row.addView(b);
        }
        box.addView(row);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle(item == null ? "Texto nuevo" : "Editar texto")
                .setView(box)
                .setPositiveButton("Guardar", (d, w) -> ink.putText(page, item, field.getText().toString(), chosen[0],
                        item != null ? item.color : ink.penColor, x, y))
                .setNegativeButton("Cancelar", null);
        if (item != null) b.setNeutralButton("Borrar", (d, w) -> ink.putText(page, item, "", item.size, item.color, x, y));
        b.show();
        field.requestFocus();
    }

    // ---- Páginas ----

    private void showTitle() {
        title.setText(notebook.title + "  " + (index + 1) + "/" + notebook.pages.size());
    }

    private void addPage() {
        save();
        Ink.Page p = store.addPage(notebook);
        sync.sendNotebook(notebook);
        sync.sendPage(p);
        ink.appendPage(p);
        showTitle();
    }

    private void pageMenu() {
        new AlertDialog.Builder(this)
                .setTitle("Página " + (index + 1) + " de " + notebook.pages.size())
                .setItems(new String[] {"Página nueva al final", "Páginas (ordenar, duplicar, borrar)", "Plantilla", "Borrar esta página"}, (d, which) -> {
                    if (which == 0) addPage();
                    else if (which == 1) pageManager();
                    else if (which == 2) chooseTemplate();
                    else confirmDeletePage(index, null);
                })
                .show();
    }

    private void confirmDeletePage(int i, Runnable after) {
        if (notebook.pages.size() <= 1) {
            Ui.toast(this, "Es la única página del cuaderno");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("¿Borrar la página " + (i + 1) + "?")
                .setMessage("Se borra de la tablet y del PC.")
                .setPositiveButton("Borrar", (d, w) -> {
                    save();
                    String id = notebook.pages.get(i);
                    if (!store.deletePage(notebook, id)) return;
                    dirty.removeIf(p -> p.id.equals(id));
                    sync.sendNotebook(notebook);
                    sync.send("{\"t\":\"delete_page\",\"page\":\"" + id + "\"}");
                    ink.removePage(i);
                    showTitle();
                    if (after != null) after.run();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    /** Miniaturas de todas las páginas: tocar una la elige; ir, mover, duplicar o borrar. */
    private void pageManager() {
        save();
        final int[] chosen = {index};
        ScrollView scroll = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        int cols = Math.max(3, getResources().getDisplayMetrics().widthPixels / Ui.dp(this, 170));
        grid.setColumnCount(cols);
        int pad = Ui.dp(this, 12);
        grid.setPadding(pad, pad, pad, pad);
        scroll.addView(grid);
        int tw = Ui.dp(this, 120), th = Math.round(tw * Ink.H / Ink.W);
        ArrayList<View> cells = new ArrayList<>();
        Runnable[] fill = new Runnable[1];
        fill[0] = () -> {
            grid.removeAllViews();
            cells.clear();
            for (int i = 0; i < notebook.pages.size(); i++) {
                Ink.Page p = store.page(notebook.pages.get(i));
                LinearLayout cell = new LinearLayout(this);
                cell.setOrientation(LinearLayout.VERTICAL);
                cell.setGravity(Gravity.CENTER_HORIZONTAL);
                cell.setPadding(pad / 2, pad / 2, pad / 2, pad / 2);
                ImageView img = new ImageView(this);
                if (p != null) img.setImageBitmap(thumbnail(p, tw, th));
                img.setElevation(Ui.dp(this, 2));
                cell.addView(img, new LinearLayout.LayoutParams(tw, th));
                cell.addView(Ui.text(this, String.valueOf(i + 1), 14, 0xFF9AA9AE, false));
                final int at = i;
                cell.setOnClickListener(v -> {
                    chosen[0] = at;
                    for (int k = 0; k < cells.size(); k++) {
                        cells.get(k).setBackground(k == at ? Ui.round(0x332DD4BF, Ui.dp(this, 10)) : null);
                    }
                });
                if (i == chosen[0]) cell.setBackground(Ui.round(0x332DD4BF, Ui.dp(this, 10)));
                cells.add(cell);
                grid.addView(cell);
            }
        };
        fill[0].run();
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        String[] names = {"◀ Mover", "Mover ▶", "Duplicar", "Borrar"};
        for (int k = 0; k < names.length; k++) {
            TextView b = Ui.button(this, names[k]);
            Ui.setActive(b, false);
            b.setTextColor(0xFFEEF3F4);
            final int action = k;
            b.setOnClickListener(v -> {
                int i = chosen[0];
                if (action == 0 && i > 0) {
                    java.util.Collections.swap(notebook.pages, i, i - 1);
                    chosen[0] = i - 1;
                } else if (action == 1 && i < notebook.pages.size() - 1) {
                    java.util.Collections.swap(notebook.pages, i, i + 1);
                    chosen[0] = i + 1;
                } else if (action == 2) {
                    Ink.Page copy = store.duplicatePage(notebook, store.page(notebook.pages.get(i)), i + 1);
                    sync.sendPage(copy);
                    chosen[0] = i + 1;
                } else if (action == 3) {
                    confirmDeletePage(i, () -> {
                        chosen[0] = Math.min(i, notebook.pages.size() - 1);
                        fill[0].run();
                    });
                    return;
                } else {
                    return;
                }
                store.saveNotebooks();
                sync.sendNotebook(notebook);
                fill[0].run();
            });
            actions.addView(b);
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.addView(actions);
        box.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 420)));
        new AlertDialog.Builder(this)
                .setTitle("Páginas de «" + notebook.title + "»")
                .setView(box)
                .setPositiveButton("Ir a la página", (d, w) -> loadPages(chosen[0]))
                .setOnDismissListener(d -> {
                    // Orden o páginas cambiados: recargar la vista.
                    loadPages(Math.min(chosen[0], notebook.pages.size() - 1));
                })
                .show();
    }

    private Bitmap thumbnail(Ink.Page p, int w, int h) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        float k = w / Ink.W;
        c.scale(k, k);
        ink.renderer().drawPage(c, p, k, null, null);
        return b;
    }

    // ---- Fotos y PDF ----

    private void insertMenu() {
        new AlertDialog.Builder(this)
                .setTitle("Insertar")
                .setItems(new String[] {"Foto o imagen", "PDF (sus páginas al final del cuaderno)"}, (d, which) -> {
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType(which == 0 ? "image/*" : "application/pdf");
                    startActivityForResult(pick, which == 0 ? PICK_IMAGE : PICK_PDF);
                })
                .show();
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK_IMAGE) insertImage(uri);
        else if (request == PICK_PDF) importPdf(uri);
    }

    private void insertImage(Uri uri) {
        new Thread(() -> {
            try {
                Bitmap b = loadImage(uri, 1600);
                String id = store.putAsset(b);
                main.post(() -> {
                    ink.insertImage(id, b.getWidth(), b.getHeight());
                    sync.sendAsset(id);
                });
            } catch (IOException | RuntimeException e) {
                main.post(() -> Ui.toast(this, "No se pudo abrir la imagen"));
            }
        }).start();
    }

    /** Lee una imagen reducida a `max` px y girada según su EXIF. */
    private Bitmap loadImage(Uri uri, int max) throws IOException {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, o);
        }
        o.inSampleSize = 1;
        while (Math.max(o.outWidth, o.outHeight) / (o.inSampleSize * 2) >= max) o.inSampleSize *= 2;
        o.inJustDecodeBounds = false;
        Bitmap b;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            b = BitmapFactory.decodeStream(in, null, o);
        }
        if (b == null) throw new IOException("imagen ilegible");
        int rotation = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            rotation = ori == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : ori == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                    : ori == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        } catch (IOException ignored) {
        }
        float k = Math.min(1f, max / (float) Math.max(b.getWidth(), b.getHeight()));
        if (rotation != 0 || k < 1) {
            Matrix m = new Matrix();
            m.postScale(k, k);
            m.postRotate(rotation);
            b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
        }
        return b;
    }

    /** Cada página del PDF, como página nueva con su imagen de fondo para escribir encima. */
    private void importPdf(Uri uri) {
        Ui.toast(this, "Importando el PDF…");
        save();
        new Thread(() -> {
            ArrayList<String> assets = new ArrayList<>();
            try (ParcelFileDescriptor fd = getContentResolver().openFileDescriptor(uri, "r");
                 PdfRenderer pdf = new PdfRenderer(fd)) {
                for (int i = 0; i < pdf.getPageCount(); i++) {
                    try (PdfRenderer.Page page = pdf.openPage(i)) {
                        int w = 1600, h = Math.round(w * page.getHeight() / (float) page.getWidth());
                        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                        b.eraseColor(Color.WHITE);
                        page.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        assets.add(store.putAsset(b));
                        b.recycle();
                    }
                }
            } catch (IOException | RuntimeException e) {
                main.post(() -> Ui.toast(this, "No se pudo abrir el PDF"));
                return;
            }
            main.post(() -> {
                int first = notebook.pages.size();
                for (String a : assets) {
                    Ink.Page p = store.addPage(notebook);
                    p.bgAsset = a;
                    p.background = Ink.PLAIN;
                    store.savePage(p);
                    sync.sendAsset(a);
                    sync.sendPage(p);
                }
                sync.sendNotebook(notebook);
                loadPages(first);
                Ui.toast(this, assets.size() + (assets.size() == 1 ? " página importada" : " páginas importadas"));
            });
        }).start();
    }

    /** El cuaderno entero a PDF en Descargas/SyncTablet, y compartirlo. */
    private void exportPdf() {
        save();
        Ui.toast(this, "Creando el PDF…");
        new Thread(() -> {
            PdfDocument doc = new PdfDocument();
            float pw = 595, ph = 842;
            for (int i = 0; i < notebook.pages.size(); i++) {
                Ink.Page p = store.page(notebook.pages.get(i));
                PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder((int) pw, (int) ph, i + 1).create());
                Canvas c = page.getCanvas();
                float k = Math.min(pw / Ink.W, ph / Ink.H);
                c.translate((pw - Ink.W * k) / 2, (ph - Ink.H * k) / 2);
                c.scale(k, k);
                if (p != null) new PageRenderer(this).drawPage(c, p, 1, null, null);
                doc.finishPage(page);
            }
            String name = notebook.title.replaceAll("[\\\\/:*?\"<>|]", " ").trim() + ".pdf";
            Uri uri = null;
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                if (Build.VERSION.SDK_INT >= 29) v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/SyncTablet");
                uri = getContentResolver().insert(MediaStore.Files.getContentUri("external"), v);
                if (uri == null) throw new IOException("sin acceso a Descargas");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    doc.writeTo(out);
                }
            } catch (IOException | RuntimeException e) {
                main.post(() -> Ui.toast(this, "No se pudo guardar el PDF"));
                return;
            } finally {
                doc.close();
            }
            final Uri done = uri;
            main.post(() -> {
                Ui.toast(this, "Guardado en Descargas/SyncTablet/" + name);
                Intent share = new Intent(Intent.ACTION_SEND).setType("application/pdf")
                        .putExtra(Intent.EXTRA_STREAM, done).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(share, "Compartir el PDF"));
            });
        }).start();
    }

    private void save() {
        main.removeCallbacks(saver);
        for (Ink.Page p : dirty) store.savePage(p);
        dirty.clear();
    }

    // ---- InkView.Listener ----

    @Override
    public void onOp(String json) {
        sync.send(json);
    }

    @Override
    public void onEdited(Ink.Page page) {
        dirty.add(page);
        main.removeCallbacks(saver);
        main.postDelayed(saver, 500);
    }

    @Override
    public void onUndoState(boolean canUndo, boolean canRedo) {
        undo.setEnabled(canUndo);
        redo.setEnabled(canRedo);
    }

    @Override
    public void onPageVisible(int i) {
        index = i;
        showTitle();
    }

    @Override
    public void onPullAddPage() {
        addPage();
        Ui.toast(this, "Página " + notebook.pages.size());
    }

    @Override
    public void onSelection(boolean active) {
        selectionBar.setVisibility(active ? View.VISIBLE : View.GONE);
        refreshTools();
    }

    // ---- SyncClient.Listener ----

    @Override
    public void onStatus(boolean connected, String where) {
        dot.setBackground(Ui.round(connected ? 0xFF10B981 : 0x55111827, Ui.dp(this, 5)));
        dot.setContentDescription(connected ? "Conectado al PC (" + where + ")" : "Sin conexión al PC");
    }
}
