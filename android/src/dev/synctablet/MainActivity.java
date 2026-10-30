package dev.synctablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Portada al estilo de Obsidian y Notion, en cristal líquido: barra lateral
 * (buscar, Inicio, Recientes, Favoritos, carpetas, conexión) y, a la
 * derecha, los cuadernos como tarjetas con la vista previa de su primera
 * página.
 */
public final class MainActivity extends Activity implements SyncClient.Listener {
    /** Secciones de la barra lateral; una carpeta es su nombre. */
    private static final String HOME = "\u0000inicio", RECENT = "\u0000recientes", FAVORITES = "\u0000favoritos";

    private AuroraView aurora;
    private LinearLayout nav, content;
    private TextView status;
    private View statusDot;
    private EditText search;
    private String section = HOME;
    private final ArrayList<GlassLayout> glass = new ArrayList<>();
    private SyncClient sync;
    private Store store;
    private PageRenderer renderer;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService thumbs = Executors.newSingleThreadExecutor();
    /** Vista previa de cada cuaderno, con la versión de la página con que se hizo. */
    private final HashMap<String, Bitmap> previews = new HashMap<>();
    private final HashMap<String, Long> previewVersions = new HashMap<>();

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = Store.get(this);
        sync = SyncClient.get(this);
        renderer = new PageRenderer(this);
        int pad = Ui.dp(this, 16);

        FrameLayout root = new FrameLayout(this);
        aurora = new AuroraView(this);
        root.addView(aurora, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout split = new LinearLayout(this);
        root.addView(split, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Ui.fitSystemBars(split, pad, pad, pad, pad);

        split.addView(sidebar(), new LinearLayout.LayoutParams(Ui.dp(this, 270), ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setClipToPadding(false);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this, 28), Ui.dp(this, 12), Ui.dp(this, 12), Ui.dp(this, 28));
        scroll.addView(content);
        split.addView(scroll, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        // Al desplazar, cambia lo que hay detrás de cada tarjeta.
        scroll.setOnScrollChangeListener((v, x, y, ox, oy) -> {
            for (GlassLayout g : glass) g.invalidate();
        });
        setContentView(root);
    }

    private GlassLayout glass(float radius) {
        GlassLayout g = new GlassLayout(this, aurora, Ui.GLASS_DARK, radius);
        glass.add(g);
        return g;
    }

    // ---- Barra lateral ----

    private View sidebar() {
        GlassLayout side = new GlassLayout(this, aurora, 0x30FFFFFF, Ui.dp(this, 26));
        side.setOrientation(LinearLayout.VERTICAL);
        int pad = Ui.dp(this, 14);
        side.setPadding(pad, Ui.dp(this, 18), pad, pad);

        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_launcher);
        logo.setClipToOutline(true);
        logo.setBackground(Ui.round(0xFF0F766E, Ui.dp(this, 10)));
        brand.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 34), Ui.dp(this, 34)));
        TextView name = Ui.text(this, "Sync Tablet", 20, 0xFFFFFFFF, true);
        name.setPadding(Ui.dp(this, 10), 0, 0, 0);
        brand.addView(name);
        side.addView(brand);

        LinearLayout field = new LinearLayout(this);
        field.setGravity(Gravity.CENTER_VERTICAL);
        field.setBackground(Ui.round(0x1FFFFFFF, Ui.dp(this, 14)));
        IconView lens = new IconView(this, IconView.SEARCH, 0xCCFFFFFF, "Buscar");
        lens.setClickable(false);
        field.addView(lens);
        search = new EditText(this);
        search.setHint("Buscar");
        search.setHintTextColor(0x99FFFFFF);
        search.setTextColor(0xFFFFFFFF);
        search.setBackground(null);
        search.setSingleLine(true);
        search.setTextSize(15);
        search.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(android.text.Editable s) { fill(); }
        });
        field.addView(search, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 44));
        flp.topMargin = Ui.dp(this, 16);
        flp.bottomMargin = Ui.dp(this, 10);
        side.addView(field, flp);

        ScrollView navScroll = new ScrollView(this);
        nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.VERTICAL);
        navScroll.addView(nav);
        side.addView(navScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        TextView add = navItem(IconView.PLUS, "Nuevo cuaderno", false);
        add.setOnClickListener(v -> askNew());
        side.addView(add);

        LinearLayout foot = new LinearLayout(this);
        foot.setGravity(Gravity.CENTER_VERTICAL);
        foot.setPadding(Ui.dp(this, 10), Ui.dp(this, 8), 0, 0);
        statusDot = new View(this);
        foot.addView(statusDot, new LinearLayout.LayoutParams(Ui.dp(this, 9), Ui.dp(this, 9)));
        status = Ui.text(this, "", 13, 0xCCFFFFFF, false);
        status.setPadding(Ui.dp(this, 8), 0, 0, 0);
        foot.addView(status, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        IconView wifi = new IconView(this, IconView.WIFI, 0xFFFFFFFF, "Conectar por WiFi");
        wifi.setOnClickListener(v -> askWifi());
        foot.addView(wifi);
        side.addView(foot);
        return side;
    }

    /** Fila de la barra lateral: icono y nombre; resaltada si es la sección actual. */
    private TextView navItem(int icon, String label, boolean active) {
        TextView t = Ui.text(this, label, 15, 0xFFFFFFFF, active);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setMinHeight(Ui.dp(this, 44));
        t.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 10), 0);
        t.setCompoundDrawablePadding(Ui.dp(this, 10));
        t.setCompoundDrawablesRelative(iconDrawable(icon), null, null, null);
        t.setBackground(active ? Ui.round(0x33FFFFFF, Ui.dp(this, 12)) : null);
        return t;
    }

    /** Un IconView pintado como drawable, para las filas de texto. */
    private android.graphics.drawable.Drawable iconDrawable(int icon) {
        int s = Ui.dp(this, 26);
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        IconView v = new IconView(this, icon, 0xFFFFFFFF, "");
        v.measure(View.MeasureSpec.makeMeasureSpec(s, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(s, View.MeasureSpec.EXACTLY));
        v.layout(0, 0, s, s);
        v.draw(new Canvas(b));
        android.graphics.drawable.BitmapDrawable d = new android.graphics.drawable.BitmapDrawable(getResources(), b);
        d.setBounds(0, 0, s, s);
        return d;
    }

    private void fillNav() {
        nav.removeAllViews();
        String[][] fixed = {{HOME, "Inicio"}, {RECENT, "Recientes"}, {FAVORITES, "Favoritos"}};
        int[] icons = {IconView.PAGE, IconView.UNDO, IconView.STAR};
        for (int i = 0; i < fixed.length; i++) {
            String key = fixed[i][0];
            TextView t = navItem(icons[i], fixed[i][1], key.equals(section));
            t.setOnClickListener(v -> open(key));
            nav.addView(t);
        }
        TreeSet<String> folders = new TreeSet<>();
        for (Ink.Notebook n : store.notebooks()) if (!n.folder.isEmpty()) folders.add(n.folder);
        TextView head = Ui.text(this, "CARPETAS", 12, 0x99FFFFFF, true);
        head.setPadding(Ui.dp(this, 12), Ui.dp(this, 18), 0, Ui.dp(this, 6));
        nav.addView(head);
        if (folders.isEmpty()) {
            TextView none = Ui.text(this, "Mantén pulsado un cuaderno → «Mover a carpeta»", 12, 0x80FFFFFF, false);
            none.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 8), 0);
            nav.addView(none);
        }
        for (String f : folders) {
            int count = 0;
            for (Ink.Notebook n : store.notebooks()) if (f.equals(n.folder)) count++;
            TextView t = navItem(IconView.PAGES, f + "  ·  " + count, f.equals(section));
            t.setOnClickListener(v -> open(f));
            nav.addView(t);
        }
    }

    private void open(String key) {
        section = key;
        fill();
    }

    // ---- Contenido ----

    @Override
    protected void onResume() {
        super.onResume();
        sync.addListener(this);
        content.post(this::fill);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sync.removeListener(this);
    }

    @Override
    public void onStatus(boolean connected, String where) {
        status.setText(connected ? "Conectado al PC · " + where : "Sin conexión al PC");
        statusDot.setBackground(Ui.round(connected ? 0xFF34D399 : 0x80FFFFFF, Ui.dp(this, 5)));
    }

    /** ¿El cuaderno coincide con la búsqueda (título o textos de sus páginas)? */
    private boolean matches(Ink.Notebook n, String q) {
        if (q.isEmpty() || n.title.toLowerCase().contains(q) || n.folder.toLowerCase().contains(q)) return true;
        for (String id : n.pages) {
            Ink.Page p = store.page(id);
            if (p == null) continue;
            for (Ink.Item it : p.items) {
                if (it.text != null && it.text.toLowerCase().contains(q)) return true;
                if (it.isTable()) for (String v : it.values) if (v != null && v.toLowerCase().contains(q)) return true;
            }
        }
        return false;
    }

    private void fill() {
        fillNav();
        glass.clear();
        content.removeAllViews();
        String q = search.getText().toString().trim().toLowerCase();
        ArrayList<Ink.Notebook> list = new ArrayList<>();
        for (Ink.Notebook n : store.notebooks()) {
            if (section.equals(FAVORITES) && !n.favorite) continue;
            if (!section.startsWith("\u0000") && !section.equals(n.folder)) continue;
            if (matches(n, q)) list.add(n);
        }
        if (section.equals(RECENT) || section.equals(HOME)) list.sort((a, b) -> Long.compare(b.updated, a.updated));

        String title = !q.isEmpty() ? "Resultados" : section.equals(HOME) ? "Inicio" : section.equals(RECENT) ? "Recientes"
                : section.equals(FAVORITES) ? "Favoritos" : section;
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(Ui.text(this, title, 30, 0xFFFFFFFF, true));
        titles.addView(Ui.text(this, list.size() == 1 ? "1 cuaderno" : list.size() + " cuadernos", 14, 0xB3FFFFFF, false));
        header.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        GlassLayout add = glass(Ui.dp(this, 22));
        add.setGravity(Gravity.CENTER_VERTICAL);
        add.setPadding(Ui.dp(this, 6), 0, Ui.dp(this, 18), 0);
        IconView plus = new IconView(this, IconView.PLUS, 0xFFFFFFFF, "");
        plus.setClickable(false);
        add.addView(plus);
        add.addView(Ui.text(this, "Nuevo cuaderno", 15, 0xFFFFFFFF, true));
        add.setOnClickListener(v -> askNew());
        header.addView(add, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Ui.dp(this, 48)));
        content.addView(header);

        if (list.isEmpty()) {
            TextView none = Ui.text(this, q.isEmpty() ? "Aún no hay cuadernos aquí." : "Nada coincide con «" + q + "».", 16, 0xCCFFFFFF, false);
            none.setPadding(0, Ui.dp(this, 30), 0, 0);
            content.addView(none);
            return;
        }
        // Inicio: los recientes en una fila, y después todos.
        if (section.equals(HOME) && q.isEmpty() && list.size() > 3) {
            sectionTitle("Recientes");
            HorizontalScrollView hs = new HorizontalScrollView(this);
            hs.setHorizontalScrollBarEnabled(false);
            hs.setClipToPadding(false);
            LinearLayout row = new LinearLayout(this);
            for (int i = 0; i < Math.min(4, list.size()); i++) {
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 230), Ui.dp(this, 250));
                lp.rightMargin = Ui.dp(this, 16);
                row.addView(card(list.get(i)), lp);
            }
            hs.addView(row);
            hs.setOnScrollChangeListener((v, x, y, ox, oy) -> {
                for (GlassLayout g : glass) g.invalidate();
            });
            content.addView(hs);
            sectionTitle("Todos los cuadernos");
            list.sort((a, b) -> a.title.compareToIgnoreCase(b.title));
        }
        grid(list);
    }

    private void sectionTitle(String s) {
        TextView t = Ui.text(this, s, 17, 0xFFFFFFFF, true);
        t.setPadding(0, Ui.dp(this, 26), 0, Ui.dp(this, 12));
        content.addView(t);
    }

    private void grid(ArrayList<Ink.Notebook> list) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = Ui.dp(this, 20);
        content.addView(box, blp);
        int width = content.getWidth() - content.getPaddingLeft() - content.getPaddingRight();
        if (width <= 0) width = getResources().getDisplayMetrics().widthPixels - Ui.dp(this, 340);
        int gap = Ui.dp(this, 16);
        int cols = Math.max(2, (width + gap) / (Ui.dp(this, 210) + gap));
        LinearLayout row = null;
        for (int i = 0; i < list.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 250));
                lp.bottomMargin = gap;
                box.addView(row, lp);
            }
            row.addView(card(list.get(i)), cell(i % cols, cols, gap));
        }
        for (int i = list.size() % cols; i != 0 && i < cols; i++) row.addView(new View(this), cell(i, cols, gap));
    }

    private LinearLayout.LayoutParams cell(int col, int cols, int gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        if (col != cols - 1) lp.rightMargin = gap;
        return lp;
    }

    /** Tarjeta: vista previa de la primera página (como la portada de Notion), título y datos. */
    private View card(Ink.Notebook n) {
        GlassLayout g = glass(Ui.dp(this, 22));
        g.setOrientation(LinearLayout.VERTICAL);
        int pad = Ui.dp(this, 10);
        g.setPadding(pad, pad, pad, Ui.dp(this, 12));
        FrameLayout cover = new FrameLayout(this);
        cover.setBackground(Ui.round(0xF2FFFFFF, Ui.dp(this, 14)));
        cover.setClipToOutline(true);
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.addView(img, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View band = new View(this);
        band.setBackground(Ui.round(n.color, Ui.dp(this, 3)));
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 6), Gravity.TOP);
        cover.addView(band, blp);
        g.addView(cover, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        preview(n, img);

        TextView t = Ui.text(this, (n.favorite ? "★ " : "") + n.title, 17, 0xFFFFFFFF, true);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        t.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4), 0);
        g.addView(t);
        String info = n.pages.size() == 1 ? "1 página" : n.pages.size() + " páginas";
        if (!n.folder.isEmpty()) info += " · " + n.folder;
        if (n.updated > 0) info += " · " + DateUtils.getRelativeTimeSpanString(n.updated, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS);
        TextView sub = Ui.text(this, info, 12, 0xB3FFFFFF, false);
        sub.setSingleLine(true);
        sub.setEllipsize(android.text.TextUtils.TruncateAt.END);
        sub.setPadding(Ui.dp(this, 4), Ui.dp(this, 2), Ui.dp(this, 4), 0);
        g.addView(sub);
        g.setClickable(true);
        g.setOnClickListener(v -> startActivity(new Intent(this, PageActivity.class).putExtra("notebook", n.id)));
        g.setOnLongClickListener(v -> {
            menu(n);
            return true;
        });
        g.setContentDescription("Cuaderno " + n.title);
        return g;
    }

    /** Vista previa de la primera página, hecha en otro hilo y guardada mientras no cambie. */
    private void preview(Ink.Notebook n, ImageView into) {
        if (n.pages.isEmpty()) return;
        Ink.Page p = store.page(n.pages.get(0));
        if (p == null) return;
        Bitmap have = previews.get(n.id);
        Long v = previewVersions.get(n.id);
        if (have != null && v != null && v == p.version) {
            into.setImageBitmap(have);
            return;
        }
        String json = p.toJson();
        thumbs.execute(() -> {
            Ink.Page copy;
            try {
                copy = Ink.Page.fromJson(json);
            } catch (org.json.JSONException e) {
                return;
            }
            int w = Ui.dp(this, 230), h = Math.round(w * Ink.H / Ink.W);
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            float k = w / Ink.W;
            c.scale(k, k);
            renderer.drawPage(c, copy, k, null, null);
            main.post(() -> {
                previews.put(n.id, b);
                previewVersions.put(n.id, copy.version);
                into.setImageBitmap(b);
            });
        });
    }

    // ---- Cuadernos ----

    private EditText field(String value) {
        EditText e = new EditText(this);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        e.setText(value);
        e.setSelectAllOnFocus(true);
        return e;
    }

    private void askNew() {
        EditText e = field("Cuaderno " + (store.notebooks().size() + 1));
        new AlertDialog.Builder(this)
                .setTitle("Nuevo cuaderno")
                .setView(e)
                .setPositiveButton("Crear", (d, w) -> {
                    String title = e.getText().toString().trim();
                    int color = Ui.COVERS[store.notebooks().size() % Ui.COVERS.length];
                    Ink.Notebook n = store.createNotebook(title.isEmpty() ? "Cuaderno" : title, color);
                    // Creado dentro de una carpeta abierta: va a esa carpeta.
                    if (!section.startsWith("\u0000")) {
                        n.folder = section;
                        store.saveNotebooks();
                    }
                    sync.sendNotebook(n);
                    sync.sendPage(store.page(n.pages.get(0)));
                    startActivity(new Intent(this, PageActivity.class).putExtra("notebook", n.id));
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void menu(Ink.Notebook n) {
        new AlertDialog.Builder(this)
                .setTitle(n.title)
                .setItems(new String[] {"Renombrar", "Cambiar color", n.favorite ? "Quitar de favoritos" : "Marcar como favorito",
                        "Mover a carpeta…", "Borrar"}, (d, which) -> {
                    if (which == 0) rename(n);
                    else if (which == 1) {
                        int i = 0;
                        while (i < Ui.COVERS.length && Ui.COVERS[i] != n.color) i++;
                        n.color = Ui.COVERS[(i + 1) % Ui.COVERS.length];
                        changed(n);
                    } else if (which == 2) {
                        n.favorite = !n.favorite;
                        changed(n);
                    } else if (which == 3) moveToFolder(n);
                    else confirmDelete(n);
                })
                .show();
    }

    private void rename(Ink.Notebook n) {
        EditText e = field(n.title);
        new AlertDialog.Builder(this)
                .setTitle("Renombrar")
                .setView(e)
                .setPositiveButton("Guardar", (d, w) -> {
                    String title = e.getText().toString().trim();
                    if (!title.isEmpty()) {
                        n.title = title;
                        changed(n);
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void moveToFolder(Ink.Notebook n) {
        TreeSet<String> folders = new TreeSet<>();
        for (Ink.Notebook o : store.notebooks()) if (!o.folder.isEmpty()) folders.add(o.folder);
        ArrayList<String> items = new ArrayList<>(folders);
        items.add("Nueva carpeta…");
        items.add("Sin carpeta");
        new AlertDialog.Builder(this)
                .setTitle("Mover «" + n.title + "» a")
                .setItems(items.toArray(new String[0]), (d, which) -> {
                    String choice = items.get(which);
                    if (choice.equals("Sin carpeta")) {
                        n.folder = "";
                        changed(n);
                    } else if (choice.equals("Nueva carpeta…")) {
                        EditText e = field("");
                        e.setHint("Universidad, Proyectos…");
                        new AlertDialog.Builder(this)
                                .setTitle("Carpeta nueva")
                                .setView(e)
                                .setPositiveButton("Mover", (d2, w) -> {
                                    String name = e.getText().toString().trim();
                                    if (!name.isEmpty()) {
                                        n.folder = name;
                                        changed(n);
                                    }
                                })
                                .setNegativeButton("Cancelar", null)
                                .show();
                    } else {
                        n.folder = choice;
                        changed(n);
                    }
                })
                .show();
    }

    private void changed(Ink.Notebook n) {
        store.saveNotebooks();
        sync.sendNotebook(n);
        fill();
    }

    private void confirmDelete(Ink.Notebook n) {
        new AlertDialog.Builder(this)
                .setTitle("¿Borrar «" + n.title + "»?")
                .setMessage("Se borra de la tablet y del PC. No se puede deshacer.")
                .setPositiveButton("Borrar", (d, w) -> {
                    store.deleteNotebook(n);
                    sync.send("{\"t\":\"delete_notebook\",\"notebook\":\"" + n.id + "\"}");
                    previews.remove(n.id);
                    fill();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void askWifi() {
        EditText e = field(sync.wifiHost());
        e.setHint("192.168.1.20");
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        new AlertDialog.Builder(this)
                .setTitle("IP del PC")
                .setMessage("Por cable USB no hace falta. Por WiFi, escribe la IP del PC donde corre synctablet "
                        + "(mírala en el PC con «ip addr»).")
                .setView(e)
                .setPositiveButton("Guardar", (d, w) -> sync.setWifiHost(e.getText().toString()))
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
