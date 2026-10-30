package dev.synctablet;

/** Prueba de las fórmulas y de las figuras, en el PC (tests/sheet.sh). */
public class SheetTest {
    static int fails = 0;
    static void eq(String name, String got, String want) {
        boolean ok = want.equals(got);
        if (!ok) fails++;
        System.out.printf("%s %-34s → %s%s%n", ok ? "✓" : "✗", name, got, ok ? "" : "  (esperaba " + want + ")");
    }
    public static void main(String[] a) {
        // 3 filas × 3 columnas.
        String[] c = {
            "Producto", "Precio", "Cant.",
            "Lápiz", "1,5", "4",
            "Total", "=B2*C2", "=SUMA(B2:C2)",
        };
        String[] v = Sheet.evaluate(c, 3, 3);
        eq("texto", v[0], "Producto");
        eq("decimal con coma", v[4], "1,5");
        eq("multiplicar celdas", v[7], "6");
        eq("SUMA de rango", v[8], "5.5");
        // A1 usa una celda vacía; A3 y B3 se usan entre sí (ciclo de verdad).
        String[] d = {"=C3+1", "=(2+3)*4-10/4", "=PROMEDIO(A1:B1)", "=MAX(A1;B1;C1)", "=A1/0", "=C2", "=B3", "=A3", ""};
        String[] w = Sheet.evaluate(d, 3, 3);
        eq("referencia vacía = 0", w[0], "1");
        eq("paréntesis y precedencia", w[1], "17.5");
        eq("PROMEDIO", w[2], "9.25");
        eq("MAX varios", w[3], "17.5");
        eq("división por cero", w[4], "#DIV/0");
        eq("se usa a sí misma", w[5], "#CICLO");
        eq("ciclo entre dos", w[6], "#CICLO");
        eq("ciclo (la otra)", w[7], "#CICLO");
        eq("fórmula rota", Sheet.evaluate(new String[] {"=hola"}, 1, 1)[0], "#ERROR");
        eq("COUNT", Sheet.evaluate(new String[] {"1", "x", "3", "=CONTAR(A1:C1)"}, 1, 4)[3], "2");
        eq("fuera de la tabla", Sheet.evaluate(new String[] {"=Z9"}, 1, 1)[0], "#ERROR");
        // Figuras: todas dentro de su recuadro (con margen para las puntas de flecha).
        int shapes = 0;
        for (int g = 0; g < ShapeLibrary.GROUPS.length; g++) for (ShapeLibrary.Shape s : ShapeLibrary.group(g)) {
            shapes++;
            for (java.util.List<float[]> l : java.util.List.of(s.lines, s.faint)) for (float[] p : l) for (float f : p) {
                if (f < -0.05f || f > 1.05f || Float.isNaN(f)) { fails++; System.out.println("✗ figura fuera: " + s.name + " " + f); }
            }
            if (s.lines.isEmpty()) { fails++; System.out.println("✗ figura vacía: " + s.name); }
        }
        System.out.println(shapes + " figuras revisadas");
        System.out.println(fails == 0 ? "TODO BIEN" : fails + " FALLOS");
        if (fails > 0) System.exit(1);
    }
}
