package dev.synctablet;
import java.util.*;
public class ShapeTest {
    static Random r = new Random(Long.getLong("seed", 7));
    static float[] poly(float[][] v, float noise) { // contorno por vértices, con temblor
        List<Float> o = new ArrayList<>();
        for (int i = 0; i + 1 < v.length; i++) for (int s = 0; s < 20; s++) {
            float t = s / 20f;
            o.add(v[i][0] + (v[i+1][0]-v[i][0])*t + (float) r.nextGaussian()*noise);
            o.add(v[i][1] + (v[i+1][1]-v[i][1])*t + (float) r.nextGaussian()*noise);
        }
        o.add(v[v.length-1][0]); o.add(v[v.length-1][1]);
        float[] a = new float[o.size()]; for (int i = 0; i < a.length; i++) a[i] = o.get(i); return a;
    }
    static float[] ell(float cx, float cy, float rx, float ry, float noise, double sweep) {
        int n = 80; float[] a = new float[2*n];
        for (int i = 0; i < n; i++) { double t = sweep*i/(n-1); a[2*i] = cx + rx*(float)Math.cos(t) + (float) r.nextGaussian()*noise; a[2*i+1] = cy + ry*(float)Math.sin(t) + (float) r.nextGaussian()*noise; }
        return a;
    }
    static int fails = 0;
    static void check(String name, float[] xy, String want) {
        ShapeRecognizer.Shape s = ShapeRecognizer.recognize(xy, xy.length/2);
        String got = s == null ? null : s.kind;
        boolean ok = Objects.equals(got, want);
        if (!ok) fails++;
        System.out.printf("%s %-28s → %s%n", ok ? "✓" : "✗", name, got == null ? "(nada)" : got);
    }
    public static void main(String[] a) {
        check("círculo", ell(300,300,100,100,3,2*Math.PI*1.03), ShapeRecognizer.CIRCLE);
        check("elipse", ell(300,300,180,90,3,2*Math.PI*1.02), ShapeRecognizer.ELLIPSE);
        check("rectángulo", poly(new float[][]{{100,100},{400,100},{400,300},{100,300},{102,104}},2.5f), ShapeRecognizer.RECTANGLE);
        check("cuadrado girado 30°", poly(new float[][]{{200,100},{373,200},{273,373},{100,273},{198,103}},2.5f), ShapeRecognizer.RECTANGLE);
        check("triángulo", poly(new float[][]{{100,400},{250,120},{400,400},{104,398}},2.5f), ShapeRecognizer.TRIANGLE);
        check("línea", poly(new float[][]{{100,100},{500,180}},2f), ShapeRecognizer.LINE);
        check("línea casi horizontal", poly(new float[][]{{100,300},{600,318}},2f), ShapeRecognizer.LINE);
        check("rombo", poly(new float[][]{{250,100},{400,250},{250,400},{100,250},{248,104}},2f), ShapeRecognizer.RECTANGLE);
        check("trapecio", poly(new float[][]{{150,100},{350,100},{450,300},{50,300},{148,104}},2f), ShapeRecognizer.QUAD);
        check("arco en C (abierto)", ell(300,300,100,100,2,Math.PI*1.3), null);
        check("letra S", poly(new float[][]{{300,100},{150,120},{160,220},{300,250},{310,360},{150,380}},2f), null);
        check("zigzag", poly(new float[][]{{100,100},{150,200},{200,100},{250,200},{300,100},{350,200}},1f), null);
        check("garabato", ell(300,300,60,40,25,2*Math.PI*3), null);
        float[] tiny = poly(new float[][]{{100,100},{108,104}},0.3f);
        check("punto/trazo diminuto", tiny, null);
        System.out.println(fails == 0 ? "TODO BIEN" : fails + " FALLOS");
    }
}
