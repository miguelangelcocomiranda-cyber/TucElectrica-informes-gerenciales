// lib/importador.ts
//
// Lectura y limpieza de los 4 archivos Excel que se suben cada mes,
// portado tal cual de la lógica ya validada en la app anterior (mismas
// columnas esperadas, mismas exclusiones, mismo criterio de duplicados).
// Este archivo NO toca la base de datos — sólo transforma filas de Excel
// en objetos limpios. Quien llama a estas funciones (app/importar/actions.ts)
// es el que después inserta en Supabase.

import * as XLSX from "xlsx";

export const KNOWN_TIPOS = ["FAC A", "FAC B", "NC A", "NC B"];

// ---------------- Lectura del archivo ----------------

/** Convierte el contenido binario de un .xlsx/.xls en filas crudas (array de arrays). */
export function leerFilasDeExcel(buffer: Buffer): any[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
}

function findHeaderRowIdx(rows: any[][], markerCol: string): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!r) continue;
    if (r.some((c) => c !== null && String(c).trim() === markerCol)) return i;
  }
  return -1;
}
function colIndex(header: any[], name: string): number {
  return header.findIndex((h) => h !== null && String(h).trim() === name);
}
function totalIndices(header: any[]): number[] {
  const idxs: number[] = [];
  header.forEach((h, i) => {
    if (h !== null && String(h).trim() === "Total") idxs.push(i);
  });
  return idxs;
}
function toDate(v: any): Date | null {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
export function mesKeyOf(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function diaKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------- Ventas Detalladas ----------------

export type VentaLimpia = {
  cliCod: number;
  cliNom: string;
  fecha: Date;
  fechaStr: string;
  mes: string;
  tipo: string;
  numero: string;
  artCod: string;
  artNom: string;
  cantidad: number;
  totalLinea: number;
};

export type ResultadoVentas =
  | {
      ok: true;
      clean: VentaLimpia[];
      excluidasPrueba: number;
      excluidasVacias: number;
      duplicadas: number;
      tiposDesconocidos: Record<string, number>;
      totalFilas: number;
    }
  | { ok: false; error: string };

export function procesarVentas(rows: any[][]): ResultadoVentas {
  const hIdx = findHeaderRowIdx(rows, "Cliente Codigo");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Cliente Codigo" en las primeras filas. ¿Es el archivo de Ventas correcto?' };
  const header = rows[hIdx];
  const required = ["Cliente Codigo", "Cliente Nombre", "Fecha", "Tipo", "Número", "Articulo Codigo", "Articulo Nombre", "Cantidad"];
  const missing = required.filter((c) => colIndex(header, c) === -1);
  const tIdx = totalIndices(header);
  if (missing.length || tIdx.length < 2) {
    return { ok: false, error: "Estructura de columnas inesperada (faltan: " + missing.join(", ") + "). No proceso nada para no arriesgar el cálculo." };
  }
  const iCC = colIndex(header, "Cliente Codigo"),
    iCN = colIndex(header, "Cliente Nombre"),
    iF = colIndex(header, "Fecha"),
    iT = colIndex(header, "Tipo"),
    iN = colIndex(header, "Número"),
    iAC = colIndex(header, "Articulo Codigo"),
    iAN = colIndex(header, "Articulo Nombre"),
    iQ = colIndex(header, "Cantidad"),
    iTL = tIdx[1];

  const dataRows = rows.slice(hIdx + 1);
  let excluidasPrueba = 0,
    excluidasVacias = 0,
    duplicadas = 0;
  const tiposDesconocidos: Record<string, number> = {};
  const seen = new Set<string>();
  const clean: VentaLimpia[] = [];

  for (const r of dataRows) {
    if (!r || r.every((c) => c === null || c === "")) continue;
    const cliCod = r[iCC],
      artCod = r[iAC];
    if (cliCod === null || cliCod === "" || artCod === null || artCod === "") {
      excluidasVacias++;
      continue;
    }
    const artCodStr = String(artCod).trim();
    if (artCodStr.toUpperCase() === "PRUEBA") {
      excluidasPrueba++;
      continue;
    }
    const tipo = r[iT] ? String(r[iT]).trim() : "";
    if (!KNOWN_TIPOS.includes(tipo)) {
      tiposDesconocidos[tipo] = (tiposDesconocidos[tipo] || 0) + 1;
      continue;
    }
    const fecha = toDate(r[iF]);
    if (!fecha) continue;
    const key = [tipo, r[iN], artCodStr, r[iQ], r[iTL]].join("|");
    if (seen.has(key)) {
      duplicadas++;
      continue;
    }
    seen.add(key);
    const numeroStr = String(r[iN]).trim();
    clean.push({
      cliCod: Number(cliCod),
      cliNom: r[iCN] ? String(r[iCN]).trim() : "",
      fecha,
      fechaStr: diaKeyOf(fecha),
      mes: mesKeyOf(fecha),
      tipo,
      numero: numeroStr,
      artCod: artCodStr,
      artNom: r[iAN] ? String(r[iAN]).trim() : artCodStr,
      cantidad: Number(r[iQ]) || 0,
      totalLinea: Number(r[iTL]) || 0,
    });
  }
  return { ok: true, clean, excluidasPrueba, excluidasVacias, duplicadas, tiposDesconocidos, totalFilas: dataRows.length };
}

// ---------------- Maestro de Clientes ----------------

export type ResultadoClientes = { ok: true; map: Record<number, string>; n: number } | { ok: false; error: string };

export function procesarClientes(rows: any[][]): ResultadoClientes {
  const hIdx = findHeaderRowIdx(rows, "Código");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Código". ¿Es el archivo de Maestro de Clientes correcto?' };
  const header = rows[hIdx];
  const iCod = colIndex(header, "Código"),
    iNom = colIndex(header, "Nombre");
  if (iCod === -1 || iNom === -1) return { ok: false, error: "Falta la columna Código o Nombre." };
  const map: Record<number, string> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iCod] === null || r[iCod] === "") return;
    map[Number(r[iCod])] = r[iNom] ? String(r[iNom]).trim() : "#" + r[iCod];
    n++;
  });
  return { ok: true, map, n };
}

// ---------------- Costo por Producto ----------------

export type ResultadoCosto =
  | { ok: true; map: Record<string, number>; nombreMap: Record<string, string>; selMap: Record<string, string>; n: number }
  | { ok: false; error: string };

export function procesarCosto(rows: any[][]): ResultadoCosto {
  const hIdx = findHeaderRowIdx(rows, "Articulo Codigo");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Articulo Codigo". ¿Es el archivo de Costo correcto?' };
  const header = rows[hIdx];
  const iAC = colIndex(header, "Articulo Codigo"),
    iCant = colIndex(header, "Cantidad"),
    iCosto = colIndex(header, "Costo");
  if (iAC === -1 || iCant === -1 || iCosto === -1) return { ok: false, error: "Faltan columnas Articulo Codigo / Cantidad / Costo." };
  const iAN = colIndex(header, "Articulo Nombre"),
    iSel = colIndex(header, "Seleccion Nombre");
  const map: Record<string, number> = {},
    nombreMap: Record<string, string> = {},
    selMap: Record<string, string> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iAC] === null || r[iAC] === "") return;
    const cod = String(r[iAC]).trim();
    const cant = Number(r[iCant]) || 0,
      costo = Number(r[iCosto]) || 0;
    if (cant > 0) map[cod] = costo / cant;
    if (iAN !== -1 && r[iAN] !== null && r[iAN] !== "") nombreMap[cod] = String(r[iAN]).trim();
    if (iSel !== -1 && r[iSel] !== null && r[iSel] !== "") selMap[cod] = String(r[iSel]).trim();
    n++;
  });
  return { ok: true, map, nombreMap, selMap, n };
}

// ---------------- Venta por Vendedor (reporte viejo, neto de IVA, sin fecha) ----------------
// Se mantiene por compatibilidad con meses ya cargados con este método antes de
// tener VentaWWExport/NCVentaWWExport. Para meses nuevos, usar procesarVendedorComprobante.

export type ResultadoVendedor = { ok: true; agg: Record<string, number>; n: number } | { ok: false; error: string };

export function procesarVendedor(rows: any[][]): ResultadoVendedor {
  const hIdx = findHeaderRowIdx(rows, "Vendedor Nombre");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Vendedor Nombre". ¿Es el archivo de Venta por Vendedor correcto?' };
  const header = rows[hIdx];
  const iV = colIndex(header, "Vendedor Nombre"),
    iTot = colIndex(header, "Total");
  if (iV === -1 || iTot === -1) return { ok: false, error: "Faltan columnas Vendedor Nombre / Total." };
  const agg: Record<string, number> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iV] === null) return;
    const v = String(r[iV]).trim();
    agg[v] = (agg[v] || 0) + (Number(r[iTot]) || 0);
    n++;
  });
  return { ok: true, agg, n };
}

// ---------------- Vendedor por comprobante (VentaWWExport / NCVentaWWExport) ----------------
// Reporte nuevo: trae Vendedor por cada comprobante (Tipo + Prefijo + Nº Comprob.), con
// fecha real — se cruza contra Ventas Detalladas por Tipo+Número, sin elegir mes a mano,
// y queda en la MISMA base (con IVA) que Facturación Neta. VentaWWExport trae las FAC,
// NCVentaWWExport trae las NC — se suben juntos para cubrir el 100% de los comprobantes.

export type ResultadoVendedorComprobante = { ok: true; map: Record<string, string>; n: number } | { ok: false; error: string };

export function procesarVendedorComprobante(rows: any[][]): ResultadoVendedorComprobante {
  const hIdx = findHeaderRowIdx(rows, "Vendedor");
  if (hIdx === -1) {
    return { ok: false, error: 'No encontré la columna "Vendedor". ¿Es el archivo VentaWWExport o NCVentaWWExport correcto?' };
  }
  const header = rows[hIdx];
  const iTipo = colIndex(header, "Tipo"),
    iPrefijo = colIndex(header, "Prefijo"),
    iNumComp = colIndex(header, "Nº Comprob."),
    iVend = colIndex(header, "Vendedor");
  if (iTipo === -1 || iPrefijo === -1 || iNumComp === -1 || iVend === -1) {
    return { ok: false, error: "Faltan columnas Tipo / Prefijo / Nº Comprob. / Vendedor." };
  }
  const map: Record<string, string> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iTipo] === null || r[iPrefijo] === null || r[iNumComp] === null) return;
    const tipo = String(r[iTipo]).trim();
    const prefijoNum = Number(r[iPrefijo]);
    const numCompNum = Number(r[iNumComp]);
    if (Number.isNaN(prefijoNum) || Number.isNaN(numCompNum)) return;
    const numero = String(Math.trunc(prefijoNum)).padStart(4, "0") + "-" + String(Math.trunc(numCompNum)).padStart(8, "0");
    const vend = r[iVend] ? String(r[iVend]).trim() : "";
    if (!vend) return;
    map[tipo + "|" + numero] = vend;
    n++;
  });
  return { ok: true, map, n };
}

// ---------------- Libro IVA Ventas (corrige el monto a valor CON IVA real) ----------------
//
// Fénix exporta la columna "Total" de Ventas Detalladas (VentaCantClienteDetaExport)
// de forma INCONSISTENTE según el tipo de comprobante:
//   · FAC B (Consumidor Final): "Total" YA viene con IVA incluido (así se
//     factura al público, sin discriminar impuesto) -> está bien tal cual.
//   · FAC A (Responsable Inscripto, con IVA discriminado): "Total" viene
//     NETO, SIN el IVA sumado -> queda subvaluado.
// Esto se detectó comparando contra el Libro IVA Ventas real de Fénix: en
// Punto de Venta 0004 (Facturación Electrónica), donde hay venta a
// Responsable Inscripto, la Facturación Neta de la app daba de menos
// contra el Libro IVA Ventas real (faltaba, en un caso real, ~$1,1M sobre
// ~$16,8M — el IVA de las facturas A que no se estaba sumando).
//
// El Libro IVA Ventas trae, comprobante por comprobante, Neto + IVA
// discriminado. Acá se arma un mapa Tipo+Nº Comprobante -> monto real CON
// IVA (en valor absoluto, mismo criterio que "Total" en Ventas Detalladas).
// Quien llama a esto (aplicarCorreccionLibroIva) cruza cada línea de Ventas
// Detalladas contra este mapa y corrige el comprobante entero con un factor
// (monto real / suma de líneas tal cual las exportó Fénix) — así no importa
// si el comprobante venía neto o con IVA, siempre termina exacto contra el
// Libro IVA. Un comprobante que no aparece en el Libro IVA (no se subió el
// archivo, o el mes todavía no lo tiene) queda sin tocar.

export type ResultadoLibroIva = { ok: true; map: Record<string, number>; n: number } | { ok: false; error: string };

export function procesarLibroIva(rows: any[][]): ResultadoLibroIva {
  const hIdx = findHeaderRowIdx(rows, "Nº Comprob.");
  if (hIdx === -1) return { ok: false, error: 'No encontré la columna "Nº Comprob.". ¿Es el archivo de Libro IVA Ventas correcto?' };
  const header = rows[hIdx];
  const iTipo = colIndex(header, "Tipo"),
    iNum = colIndex(header, "Nº Comprob."),
    iNetoA = colIndex(header, "NetoA"),
    iNetoB = colIndex(header, "NetoB"),
    iExento = colIndex(header, "Exento"),
    iIva21 = colIndex(header, "Iva21"),
    iIva105 = colIndex(header, "Iva10.5");
  if (iTipo === -1 || iNum === -1 || iNetoA === -1 || iNetoB === -1) {
    return { ok: false, error: "Faltan columnas Tipo / Nº Comprob. / NetoA / NetoB en el archivo de Libro IVA Ventas." };
  }
  const rawMap: Record<string, number> = {};
  let n = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    if (!r || r[iTipo] === null || r[iNum] === null) return;
    const tipo = String(r[iTipo]).trim();
    const numero = String(r[iNum]).trim();
    if (!tipo || !numero) return;
    const neto = (Number(r[iNetoA]) || 0) + (Number(r[iNetoB]) || 0) + (iExento !== -1 ? Number(r[iExento]) || 0 : 0);
    const iva = (iIva21 !== -1 ? Number(r[iIva21]) || 0 : 0) + (iIva105 !== -1 ? Number(r[iIva105]) || 0 : 0);
    const key = tipo + "|" + numero;
    rawMap[key] = (rawMap[key] || 0) + neto + iva; // sumado con signo por si un mismo comprobante trae varias filas (ej. 21% y 10.5% separados)
    n++;
  });
  const map: Record<string, number> = {};
  Object.keys(rawMap).forEach((k) => {
    map[k] = Math.abs(rawMap[k]); // Ventas Detalladas siempre trae "Total" en valor absoluto, sin signo
  });
  return { ok: true, map, n };
}

export type ResultadoCorreccionLibroIva = {
  clean: VentaLimpia[];
  comprobantesCorregidos: number;
  comprobantesTotales: number;
  diferenciaTotal: number;
};

/** Corrige, comprobante por comprobante, las líneas de Ventas Detalladas contra el Libro IVA Ventas real. */
export function aplicarCorreccionLibroIva(clean: VentaLimpia[], libroIvaMapa: Record<string, number>): ResultadoCorreccionLibroIva {
  if (Object.keys(libroIvaMapa).length === 0) {
    return { clean, comprobantesCorregidos: 0, comprobantesTotales: 0, diferenciaTotal: 0 };
  }

  const sumaPorComprobante: Record<string, number> = {};
  clean.forEach((v) => {
    const key = v.tipo + "|" + v.numero;
    sumaPorComprobante[key] = (sumaPorComprobante[key] || 0) + v.totalLinea;
  });

  const vistos = new Set<string>();
  let comprobantesCorregidos = 0;
  let diferenciaTotal = 0;

  const nuevo = clean.map((v) => {
    const key = v.tipo + "|" + v.numero;
    const libroTotal = libroIvaMapa[key];
    const sumaRaw = sumaPorComprobante[key];
    if (libroTotal == null || !sumaRaw) return v;
    const factor = libroTotal / sumaRaw;
    if (!vistos.has(key)) {
      vistos.add(key);
      if (Math.abs(factor - 1) > 0.001) comprobantesCorregidos++;
      diferenciaTotal += libroTotal - sumaRaw;
    }
    return { ...v, totalLinea: v.totalLinea * factor };
  });

  return { clean: nuevo, comprobantesCorregidos, comprobantesTotales: vistos.size, diferenciaTotal: round2Local(diferenciaTotal) };
}

function round2Local(n: number) {
  return Math.round(n * 100) / 100;
}
