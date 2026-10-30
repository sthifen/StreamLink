package dev.synctablet;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

/**
 * Botón con icono de trazo (estilo de línea, 24 unidades), tocable en
 * 44 dp. Activo: círculo del color de acento con el icono en blanco.
 */
final class IconView extends View {
    static final int BACK = 0, PEN = 1, HIGHLIGHTER = 2, ERASER = 3, SHAPES = 4, UNDO = 5, REDO = 6,
            PREV = 7, NEXT = 8, PLUS = 9, PAGE = 10, HAND = 11, WIFI = 12;

    private final int icon;
    private final Path path;
    private boolean active;
    private int color;
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);

    IconView(Context c, int icon, int color, String label) {
        super(c);
        this.icon = icon;
        this.color = color;
        this.path = build(icon);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setStrokeWidth(1.8f);
        disc.setColor(Ui.ACCENT_DEEP);
        setContentDescription(label);
        setClickable(true);
        setFocusable(true);
        setMinimumWidth(Ui.dp(c, 44));
        setMinimumHeight(Ui.dp(c, 44));
    }

    void setActive(boolean a) {
        if (active != a) {
            active = a;
            invalidate();
        }
    }

    @Override
    public void setEnabled(boolean enabled) {
        super.setEnabled(enabled);
        setAlpha(enabled ? 1f : 0.35f);
    }

    @Override
    protected void onMeasure(int w, int h) {
        int s = Ui.dp(getContext(), 44);
        setMeasuredDimension(resolveSize(s, w), resolveSize(s, h));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        if (active) c.drawCircle(w / 2, h / 2, Math.min(w, h) / 2 - Ui.dp(getContext(), 3), disc);
        float s = Ui.dp(getContext(), 22) / 24f;
        c.save();
        c.translate((w - 24 * s) / 2, (h - 24 * s) / 2);
        c.scale(s, s);
        stroke.setColor(active ? 0xFFFFFFFF : color);
        c.drawPath(path, stroke);
        c.restore();
    }

    private static Path build(int icon) {
        Path p = new Path();
        switch (icon) {
            case BACK:
            case PREV:
                p.moveTo(15, 5); p.lineTo(8, 12); p.lineTo(15, 19);
                break;
            case NEXT:
                p.moveTo(9, 5); p.lineTo(16, 12); p.lineTo(9, 19);
                break;
            case PEN:
                p.moveTo(4, 20); p.lineTo(5.2f, 15.2f); p.lineTo(15.6f, 4.8f);
                p.cubicTo(16.6f, 3.8f, 18.2f, 3.8f, 19.2f, 4.8f);
                p.cubicTo(20.2f, 5.8f, 20.2f, 7.4f, 19.2f, 8.4f);
                p.lineTo(8.8f, 18.8f); p.close();
                p.moveTo(14, 6.5f); p.lineTo(17.5f, 10);
                break;
            case HIGHLIGHTER:
                p.moveTo(9, 13); p.lineTo(15, 4); p.lineTo(20, 7.5f); p.lineTo(14, 16.5f); p.close();
                p.moveTo(9, 13); p.lineTo(7.5f, 17); p.lineTo(11, 18.5f); p.lineTo(14, 16.5f);
                p.moveTo(4, 21); p.lineTo(12, 21);
                break;
            case ERASER:
                p.moveTo(8, 20); p.lineTo(4.5f, 16.5f); p.lineTo(14, 7); p.lineTo(20, 13); p.lineTo(13, 20); p.close();
                p.moveTo(9.3f, 11.7f); p.lineTo(15.3f, 17.7f);
                p.moveTo(13, 20); p.lineTo(20, 20);
                break;
            case SHAPES:
                p.addCircle(8.5f, 8.5f, 4.5f, Path.Direction.CW);
                p.addRoundRect(new RectF(12.5f, 12.5f, 20.5f, 20.5f), 1.5f, 1.5f, Path.Direction.CW);
                p.moveTo(4, 20.5f); p.lineTo(7.5f, 14); p.lineTo(11, 20.5f); p.close();
                break;
            case UNDO:
                p.moveTo(9, 13); p.lineTo(4, 8); p.lineTo(9, 3);
                p.moveTo(4, 8); p.lineTo(14, 8); p.cubicTo(20.5f, 8, 20.5f, 19, 14, 19); p.lineTo(10, 19);
                break;
            case REDO:
                p.moveTo(15, 13); p.lineTo(20, 8); p.lineTo(15, 3);
                p.moveTo(20, 8); p.lineTo(10, 8); p.cubicTo(3.5f, 8, 3.5f, 19, 10, 19); p.lineTo(14, 19);
                break;
            case PLUS:
                p.moveTo(12, 5); p.lineTo(12, 19); p.moveTo(5, 12); p.lineTo(19, 12);
                break;
            case PAGE:
                p.addRoundRect(new RectF(5, 3, 19, 21), 2, 2, Path.Direction.CW);
                p.moveTo(8, 8); p.lineTo(16, 8); p.moveTo(8, 12); p.lineTo(16, 12); p.moveTo(8, 16); p.lineTo(13, 16);
                break;
            case HAND:
                p.moveTo(9, 13); p.lineTo(9, 5.5f); p.cubicTo(9, 3.8f, 11.5f, 3.8f, 11.5f, 5.5f); p.lineTo(11.5f, 11);
                p.moveTo(11.5f, 10); p.cubicTo(11.5f, 8.5f, 14, 8.5f, 14, 10); p.lineTo(14, 11.5f);
                p.moveTo(14, 11); p.cubicTo(14, 9.5f, 16.5f, 9.5f, 16.5f, 11); p.lineTo(16.5f, 15);
                p.cubicTo(16.5f, 19, 14, 21, 11.5f, 21); p.cubicTo(9, 21, 7.5f, 20, 6.3f, 18);
                p.lineTo(4.3f, 14.6f); p.cubicTo(3.6f, 13.4f, 5.2f, 12.2f, 6.3f, 13.2f); p.lineTo(9, 15.5f);
                break;
            case WIFI:
                p.arcTo(new RectF(2.5f, 8.5f, 21.5f, 27.5f), 225, 90, true);
                p.arcTo(new RectF(6, 12, 18, 24), 225, 90, true);
                p.arcTo(new RectF(9.5f, 15.5f, 14.5f, 20.5f), 225, 90, true);
                p.addCircle(12, 20.5f, 0.6f, Path.Direction.CW);
                break;
        }
        return p;
    }
}
