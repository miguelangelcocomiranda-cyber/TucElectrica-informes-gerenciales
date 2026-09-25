// lib/periodo.ts
// Resuelve qué meses y punto de venta usar a partir de los searchParams de
// la URL (?meses=2026-08,2026-09&pv=0004). Mismo criterio en todas las
// pantallas (Dashboard, Informe Comercial, Análisis de Clientes): si no se
// especifica nada, usa el último mes cargado.
export function resolverPeriodo(
  sp: { meses?: string; pv?: string },
  todosLosMeses: string[]
): { mesesSeleccionados: string[]; puntoVenta: string } {
  const pedidos = sp.meses ? sp.meses.split(",").filter((m) => todosLosMeses.includes(m)) : [];
  const mesesSeleccionados = pedidos.length > 0 ? pedidos : todosLosMeses.slice(-1);
  const puntoVenta = sp.pv || "all";
  return { mesesSeleccionados, puntoVenta };
}
