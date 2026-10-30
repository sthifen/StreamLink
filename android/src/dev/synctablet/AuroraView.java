package dev.synctablet;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

/** Fondo de la portada: noche con manchas de color difusas, detrás del cristal. */
final class AuroraView extends View {
    private static final float[][] BLOBS = {
        // x, y (fracción de la vista), radio (fracción del lado mayor)
        {0.12f, 0.18f, 0.55f}, {0.88f, 0.12f, 0.50f}, {0.70f, 0.92f, 0.60f}, {0.15f, 0.85f, 0.45f},
    };
    private static final int[] COLORS = {0xFF14B8A6, 0xFF6366F1, 0xFFDB2777, 0xFF0EA5E9};
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    AuroraView(Context c) {
        super(c);
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), big = Math.max(w, h);
        c.drawColor(0xFF0A1114);
        for (int i = 0; i < BLOBS.length; i++) {
            float x = BLOBS[i][0] * w, y = BLOBS[i][1] * h, r = BLOBS[i][2] * big;
            int col = COLORS[i];
            paint.setShader(new RadialGradient(x, y, r, new int[] {(col & 0xFFFFFF) | 0x8C000000,
                    (col & 0xFFFFFF) | 0x2E000000, col & 0xFFFFFF}, new float[] {0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
            c.drawCircle(x, y, r, paint);
        }
    }
}
