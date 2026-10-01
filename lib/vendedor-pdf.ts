// lib/vendedor-pdf.ts
//
// Parsea el reporte de Fénix "Listado de Comprobantes de Ventas por Vendedor
// (Totalizado)" en PDF — un renglón por vendedor, ya totalizado por Fénix,
// con columnas Código / Nombre / Neto / Total. Es el método NUEVO (y mucho
// más simple) de cargar Comisiones: reemplaza la planilla línea por línea,
// y de paso trae el monto CON IVA además del neto (sin IVA), en un solo
// archivo — no hace falta cruzar nada.
//
// El PDF no tiene una tabla "real" (no es un PDF con estructura de tabla):
// es texto posicionado en x/y, como cualquier reporte impreso. Se usa
// pdfjs-dist (sólo para extraer texto, sin su dependencia opcional de
// canvas) y se reconstruyen los renglones agrupando los fragmentos de texto
// por su coordenada Y (con una tolerancia, porque Fénix no siempre alinea
// perfecto los números con el nombre en la misma línea exacta).

export type FilaVendedorPDF = { vendedor: string; neto: number; total: number };
export type ResultadoVendedorPDF = { ok: true; filas: FilaVendedorPDF[] } | { ok: false; error: string };

function parseNumeroAr(s: string): number {
  // Fénix no usa separador de miles en este reporte (ej. "23272746,72"),
  // pero por las dudas se sacan los puntos antes de convertir la coma a punto
  // (así también funciona si algún día aparecen con separador de miles).
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export async function extraerListadoVendedorPDF(buffer: Buffer): Promise<ResultadoVendedorPDF> {
  let lineas: string[];
  try {
    const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

    const todasLasLineas: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .map((it) => ({ x: it.transform[4] as number, y: it.transform[5] as number, str: it.str as string }))
        .filter((it) => it.str.trim() !== "");
      items.sort((a, b) => b.y - a.y || a.x - b.x);

      const TOL = 4; // px de tolerancia en Y para considerar que dos fragmentos están en el mismo renglón
      const grupos: { y: number; items: typeof items }[] = [];
      let actual: { y: number; items: typeof items } | null = null;
      for (const it of items) {
        if (!actual || Math.abs(it.y - actual.y) > TOL) {
          actual = { y: it.y, items: [] };
          grupos.push(actual);
        }
        actual.items.push(it);
      }
      for (const g of grupos) {
        g.items.sort((a, b) => a.x - b.x);
        todasLasLineas.push(g.items.map((i) => i.str).join(" "));
      }
    }
    lineas = todasLasLineas;
  } catch (e: any) {
    return { ok: false, error: "No pude leer el PDF: " + (e?.message || String(e)) };
  }

  const filas: FilaVendedorPDF[] = [];
  for (const linea of lineas) {
    const tokens = linea.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 4) continue;
    if (!/^\d+$/.test(tokens[0])) continue; // sólo renglones que arrancan con el Código numérico del vendedor
    const total = parseNumeroAr(tokens[tokens.length - 1]);
    const neto = parseNumeroAr(tokens[tokens.length - 2]);
    if (!Number.isFinite(total) || !Number.isFinite(neto)) continue;
    const vendedor = tokens
      .slice(1, tokens.length - 2)
      .join(" ")
      .trim();
    if (!vendedor) continue;
    filas.push({ vendedor, neto, total });
  }

  if (filas.length === 0) {
    return {
      ok: false,
      error: 'No encontré filas de vendedores en el PDF. ¿Es el reporte "Listado de Comprobantes de Ventas por Vendedor (Totalizado)" de Fénix?',
    };
  }
  return { ok: true, filas };
}
