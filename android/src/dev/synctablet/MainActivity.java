package dev.synctablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * Portada: los cuadernos como tarjetas de cristal sobre un fondo de
 * auroras, el estado de la conexión con el PC y el WiFi.
 */
public final class MainActivity extends Activity implements SyncClient.Listener {
    private AuroraView aurora;
    private LinearLayout grid, chips;
    private EditText search;
    /** Filtro: "" todos, "★" favoritos, o el nombre de una carpeta. */
    private String filter = "";
    private GlassLayout statusPill;
    private TextView status;
    private View statusDot;
    private final ArrayList<GlassLayout> glass = new ArrayList<>();
    private SyncClient sync;
    private Store store;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = Store.get(this);
        sync = SyncClient.get(this);
        int pad = Ui.dp(this, 28);

        FrameLayout root = new FrameLayout(this);
        aurora = new AuroraView(this);
        root.addView(aurora, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setClipToPadding(false);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Ui.fitSystemBars(scroll, pad, pad, pad, pad);
        // Al desplazar, lo que hay detrás de cada tarjeta cambia.
        scroll.setOnScrollChangeListener((v, x, y, ox, oy) -> {
            for (GlassLayout g : glass) g.invalidate();
        });

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(Ui.text(this, "Sync Tablet", 32, 0xFFFFFFFF, true));
        titles.addView(Ui.text(this, "Escribe con el lápiz; con el dedo mueves la hoja y haces zoom.", 15, 0xCCFFFFFF, false));
        header.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        GlassLayout pill = glass(Ui.dp(this, 22));
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 6), 0);
        statusDot = new View(this);
        pill.addView(statusDot, new LinearLayout.LayoutParams(Ui.dp(this, 9), Ui.dp(this, 9)));
        status = Ui.text(this, "", 14, 0xFFFFFFFF, false);
        status.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 6), 0);
        pill.addView(status);
        IconView wifi = new IconView(this, IconView.WIFI, 0xFFFFFFFF, "Conectar por WiFi");
        wifi.setOnClickListener(v -> askWifi());
        pill.addView(wifi);
        header.addView(pill, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Ui.dp(this, 48)));
        content.addView(header);
        statusPill = pill;

        // Buscar (títulos y textos de las páginas) y filtrar por favoritos o carpeta.
        LinearLayout tools = new LinearLayout(this);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        GlassLayout field = glass(Ui.dp(this, 22));
        field.setGravity(Gravity.CENTER_VERTICAL);
        field.setPadding(Ui.dp(this, 6), 0, Ui.dp(this, 14), 0);
        IconView lens = new IconView(this, IconView.SEARCH, 0xCCFFFFFF, "Buscar");
        lens.setClickable(false);
        field.addView(lens);
        search = new EditText(this);
        search.setHint("Buscar en tus cuadernos");
        search.setHintTextColor(0x99FFFFFF);
        search.setTextColor(0xFFFFFFFF);
        search.setBackground(null);
        search.setSingleLine(true);
        search.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(android.text.Editable s) { fill(); }
        });
        field.addView(search, new LinearLayout.LayoutParams(Ui.dp(this, 300), ViewGroup.LayoutParams.WRAP_CONTENT));
        tools.addView(field, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Ui.dp(this, 48)));
        chips = new LinearLayout(this);
        chips.setGravity(Gravity.CENTER_VERTICAL);
        android.widget.HorizontalScrollView chipScroll = new android.widget.HorizontalScrollView(this);
        chipScroll.setHorizontalScrollBarEnabled(false);
        chipScroll.addView(chips);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        clp.leftMargin = Ui.dp(this, 14);
        tools.addView(chipScroll, clp);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = Ui.dp(this, 20);
        content.addView(tools, tlp);

        grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        glp.topMargin = Ui.dp(this, 28);
        content.addView(grid, glp);
        setContentView(root);
    }

    private GlassLayout glass(float radius) {
        GlassLayout g = new GlassLayout(this, aurora, Ui.GLASS_DARK, radius);
        glass.add(g);
        return g;
    }

    @Override
    protected void onResume() {
        super.onResume();
        sync.addListener(this);
        grid.post(this::fill);
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

    /** Rejilla: «Nuevo cuaderno» y un cuaderno por tarjeta. */
    /** ¿El cuaderno coincide con la búsqueda (título o textos de sus páginas)? */
    private boolean matches(Ink.Notebook n, String q) {
        if (q.isEmpty() || n.title.toLowerCase().contains(q)) return true;
        for (String id : n.pages) {
            Ink.Page p = store.page(id);
            if (p == null) continue;
            for (Ink.Item it : p.items) if (it.text != null && it.text.toLowerCase().contains(q)) return true;
        }
        return false;
    }

    private void fillChips() {
        chips.removeAllViews();
        java.util.TreeSet<String> folders = new java.util.TreeSet<>();
        for (Ink.Notebook n : store.notebooks()) if (!n.folder.isEmpty()) folders.add(n.folder);
        if (!filter.isEmpty() && !filter.equals("★") && !folders.contains(filter)) filter = "";
        ArrayList<String> all = new ArrayList<>();
        all.add("");
        all.add("★");
        all.addAll(folders);
        for (String f : all) {
            TextView chip = Ui.text(this, f.isEmpty() ? "Todos" : f.equals("★") ? "★ Favoritos" : f, 14, 0xFFFFFFFF, f.equals(filter));
            chip.setGravity(Gravity.CENTER);
            chip.setMinHeight(Ui.dp(this, 40));
            chip.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 16), 0);
            android.graphics.drawable.GradientDrawable d = Ui.round(f.equals(filter) ? 0x4DFFFFFF : 0x1AFFFFFF, Ui.dp(this, 20));
            d.setStroke(Ui.dp(this, 1), 0x40FFFFFF);
            chip.setBackground(d);
            chip.setOnClickListener(v -> {
                filter = f;
                fill();
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = Ui.dp(this, 8);
            chips.addView(chip, lp);
        }
    }

    private void fill() {
        // Las tarjetas de cristal se rehacen; la cápsula y el buscador se quedan.
        glass.removeIf(g -> g != statusPill && g != search.getParent());
        fillChips();
        String q = search.getText().toString().trim().toLowerCase();
        grid.removeAllViews();
        int width = grid.getWidth() > 0 ? grid.getWidth() : getResources().getDisplayMetrics().widthPixels;
        int cols = Math.max(2, width / Ui.dp(this, 220));
        int gap = Ui.dp(this, 18);
        ArrayList<View> tiles = new ArrayList<>();
        if (q.isEmpty() && filter.isEmpty()) tiles.add(newTile());
        for (Ink.Notebook n : store.notebooks()) {
            if (filter.equals("★") && !n.favorite) continue;
            if (!filter.isEmpty() && !filter.equals("★") && !filter.equals(n.folder)) continue;
            if (matches(n, q)) tiles.add(tile(n));
        }
        if (tiles.isEmpty()) {
            TextView none = Ui.text(this, "Nada coincide.", 16, 0xCCFFFFFF, false);
            grid.addView(none);
            return;
        }
        LinearLayout row = null;
        for (int i = 0; i < tiles.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 250));
                lp.bottomMargin = gap;
                grid.addView(row, lp);
            }
            row.addView(tiles.get(i), cellParams(i % cols, cols, gap));
        }
        // Huecos al final de la última fila, para que las tarjetas no se estiren.
        for (int i = tiles.size() % cols; i != 0 && i < cols; i++) row.addView(new View(this), cellParams(i, cols, gap));
    }

    private LinearLayout.LayoutParams cellParams(int col, int cols, int gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        if (col != cols - 1) lp.rightMargin = gap;
        return lp;
    }

    private View newTile() {
        GlassLayout g = glass(Ui.dp(this, 26));
        g.setOrientation(LinearLayout.VERTICAL);
        g.setGravity(Gravity.CENTER);
        IconView plus = new IconView(this, IconView.PLUS, 0xFFFFFFFF, "Nuevo cuaderno");
        plus.setClickable(false);
        LinearLayout.LayoutParams center = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        center.gravity = Gravity.CENTER_HORIZONTAL;
        g.addView(plus, center);
        g.addView(Ui.text(this, "Nuevo cuaderno", 17, 0xFFFFFFFF, true), center);
        g.setOnClickListener(v -> askNew());
        g.setContentDescription("Nuevo cuaderno");
        return g;
    }

    /** Tarjeta de cristal con el lomo del color del cuaderno. */
    private View tile(Ink.Notebook n) {
        GlassLayout g = glass(Ui.dp(this, 26));
        int pad = Ui.dp(this, 18);
        g.setPadding(pad, pad, pad, pad);
        View spine = new View(this);
        spine.setBackground(Ui.round(n.color, Ui.dp(this, 6)));
        spine.setElevation(Ui.dp(this, 2));
        g.addView(spine, new LinearLayout.LayoutParams(Ui.dp(this, 12), ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.BOTTOM);
        col.setPadding(Ui.dp(this, 16), 0, 0, 0);
        col.addView(Ui.text(this, (n.favorite ? "★ " : "") + n.title, 20, 0xFFFFFFFF, true));
        String info = n.pages.size() == 1 ? "1 página" : n.pages.size() + " páginas";
        col.addView(Ui.text(this, n.folder.isEmpty() ? info : info + " · " + n.folder, 14, 0xCCFFFFFF, false));
        g.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        g.setClickable(true);
        g.setOnClickListener(v -> open(n));
        g.setOnLongClickListener(v -> {
            menu(n);
            return true;
        });
        g.setContentDescription("Cuaderno " + n.title);
        return g;
    }

    private void open(Ink.Notebook n) {
        startActivity(new Intent(this, PageActivity.class).putExtra("notebook", n.id));
    }

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
                    sync.sendNotebook(n);
                    sync.sendPage(store.page(n.pages.get(0)));
                    open(n);
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
                    else if (which == 2) {
                        n.favorite = !n.favorite;
                        changed(n);
                    } else if (which == 3) moveToFolder(n);
                    else if (which == 1) {
                        int i = 0;
                        while (i < Ui.COVERS.length && Ui.COVERS[i] != n.color) i++;
                        n.color = Ui.COVERS[(i + 1) % Ui.COVERS.length];
                        changed(n);
                    } else confirmDelete(n);
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
        java.util.TreeSet<String> folders = new java.util.TreeSet<>();
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
