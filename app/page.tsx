import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function getCounts() {
  const supabase = supabaseAdmin();
  const tablas = [
    "ventas",
    "costos",
    "vendedores",
    "taxonomia",
    "clientes_maestro",
    "meses_cargados",
  ] as const;
  const resultados: Record<string, number | string> = {};
  for (const tabla of tablas) {
    const { count, error } = await supabase
      .from(tabla)
      .select("*", { count: "exact", head: true });
    resultados[tabla] = error ? `error: ${error.message}` : count ?? 0;
  }
  return resultados;
}

export default async function Home() {
  const counts = await getCounts();
  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">App de Informes Gerenciales</h1>
      <p className="text-gray-600 mb-6">
        Chequeo de conexión a Supabase — filas por tabla.
      </p>
      <div className="rounded-lg border border-gray-200 divide-y">
        {Object.entries(counts).map(([tabla, valor]) => (
          <div key={tabla} className="flex justify-between px-4 py-3">
            <span className="font-medium">{tabla}</span>
            <span className="tabular-nums">{String(valor)}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
