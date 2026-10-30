package dev.synctablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.drawable.GradientDrawable;
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

/** Portada: los cuadernos, el estado de la conexión con el PC y el WiFi. */
public final class MainActivity extends Activity implements SyncClient.Listener {
    private LinearLayout grid;
    private TextView status;
    private SyncClient sync;
    private Store store;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = Store.get(this);
        sync = SyncClient.get(this);
        int pad = Ui.dp(this, 24);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        Ui.fitSystemBars(root, pad, pad, pad, 0);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(Ui.text(this, "Sync Tablet", 26, Ui.TEXT, true),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        status = Ui.text(this, "", 14, Ui.MUTED, false);
        status.setPadding(0, 0, Ui.dp(this, 12), 0);
        header.addView(status);
        TextView wifi = Ui.button(this, "WiFi");
        wifi.setOnClickListener(v -> askWifi());
        header.addView(wifi);
        root.addView(header);

        TextView hint = Ui.text(this, "Escribe con el lápiz; con el dedo mueves la hoja y haces zoom. "
                + "Con el PC conectado, lo que escribes aparece al momento en http://localhost:8788.", 14, Ui.MUTED, false);
        hint.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 20));
        root.addView(hint);

        ScrollView scroll = new ScrollView(this);
        grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(0, 0, 0, pad);
        scroll.addView(grid);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        sync.addListener(this);
        root().post(this::fill);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sync.removeListener(this);
    }

    private View root() {
        return grid;
    }

    @Override
    public void onStatus(boolean connected, String where) {
        status.setText(connected ? "● Conectado al PC (" + where + ")" : "○ Sin conexión al PC");
        status.setTextColor(connected ? Ui.ON : Ui.MUTED);
    }

    /** Rejilla de tapas: «Nuevo cuaderno» y un cuaderno por casilla. */
    private void fill() {
        grid.removeAllViews();
        int width = grid.getWidth() > 0 ? grid.getWidth() : getResources().getDisplayMetrics().widthPixels;
        int cols = Math.max(2, width / Ui.dp(this, 200));
        int gap = Ui.dp(this, 16);
        ArrayList<View> tiles = new ArrayList<>();
        tiles.add(newTile());
        for (Ink.Notebook n : store.notebooks()) tiles.add(tile(n));
        LinearLayout row = null;
        for (int i = 0; i < tiles.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 230));
                lp.bottomMargin = gap;
                grid.addView(row, lp);
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            if (i % cols != cols - 1) lp.rightMargin = gap;
            row.addView(tiles.get(i), lp);
        }
        // Huecos al final de la última fila, para que las casillas no se estiren.
        for (int i = tiles.size() % cols; i != 0 && i < cols; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            if (i != cols - 1) lp.rightMargin = gap;
            row.addView(new View(this), lp);
        }
    }

    private View newTile() {
        TextView t = Ui.text(this, "+\nNuevo cuaderno", 17, Ui.TEXT, true);
        t.setGravity(Gravity.CENTER);
        GradientDrawable d = Ui.round(0x00000000, Ui.dp(this, 18));
        d.setStroke(Ui.dp(this, 2), 0x55FFFFFF, Ui.dp(this, 8), Ui.dp(this, 6));
        t.setBackground(d);
        t.setOnClickListener(v -> askNew());
        return t;
    }

    private View tile(Ink.Notebook n) {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(Ui.round(n.color, Ui.dp(this, 18)));
        int pad = Ui.dp(this, 16);
        f.setPadding(pad, pad, pad, pad);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.BOTTOM);
        col.addView(Ui.text(this, n.title, 19, 0xFFFFFFFF, true));
        col.addView(Ui.text(this, n.pages.size() == 1 ? "1 página" : n.pages.size() + " páginas", 14, 0xCCFFFFFF, false));
        f.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        f.setClickable(true);
        f.setOnClickListener(v -> open(n));
        f.setOnLongClickListener(v -> {
            menu(n);
            return true;
        });
        f.setContentDescription("Cuaderno " + n.title);
        return f;
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
                .setItems(new String[] {"Renombrar", "Cambiar color", "Borrar"}, (d, which) -> {
                    if (which == 0) rename(n);
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
