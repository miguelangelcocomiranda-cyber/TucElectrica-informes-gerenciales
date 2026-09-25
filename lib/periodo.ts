// build trigger 2026-09-25
// lib/periodo.ts
export function resolverPeriodo(
  sp: { meses?: string; pv?: string },
  todosLosMeses: string[]
): { mesesSeleccionados: string[]; puntoVenta: string } {
  const pedidos = sp.meses ? sp.meses.split(",").filter((m) => todosLosMeses.includes(m)) : [];
  const mesesSeleccionados = pedidos.length > 0 ? pedidos : todosLosMeses.slice(-1);
  const puntoVenta = sp.pv || "all";
  return { mesesSeleccionados, puntoVenta };
}
