// app/Sidebar.tsx
// Menú lateral, réplica del que tenía la app anterior: fondo azul noche,
// secciones GENERAL / COMERCIAL / GESTIÓN, ítems que todavía no están
// migrados a este stack se muestran deshabilitados con un badge "PRÓX."
// en vez de desaparecer, para que el menú se vea completo.
//
// En desktop (md hacia arriba) queda fijo a la izquierda, como siempre.
// En celular NO se muestra fijo (antes ocupaba 256px de un ancho de
// pantalla típico de ~375px, dejando casi sin lugar al contenido) — se
// reemplaza por una barra superior angosta con el logo y un botón de
// menú (☰) que abre el mismo menú como un panel deslizante encima del
// contenido, con fondo oscuro atrás para cerrarlo tocando afuera. Se
// cierra solo al navegar a una sección.
//
// El logo es un archivo estático en /public (no va embebido en base64
// acá: un data-URI tan largo pegado a mano en GitHub se corrompe fácil).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { label: string; href?: string };
type Seccion = { titulo: string; items: Item[] };

const SECCIONES: Seccion[] = [
  {
    titulo: "GENERAL",
    items: [{ label: "Dashboard Ejecutivo", href: "/" }, { label: "Resumen Gerencial" }, { label: "Alertas" }],
  },
  {
    titulo: "COMERCIAL",
    items: [
      { label: "Informe Comercial", href: "/informe-comercial" },
      { label: "Análisis de Clientes", href: "/analisis-clientes" },
      { label: "Curva de Maduración" },
    ],
  },
  {
    titulo: "GESTIÓN",
    items: [{ label: "Importador Mensual", href: "/importar" }, { label: "Rentabilidad" }, { label: "Calidad de Datos" }],
  },
];

function Menu({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="rounded-lg bg-white px-3 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tucuman-electrica.png" alt="Tucumán Eléctrica" className="h-auto w-full" />
        </div>
        <div className="mt-2 truncate text-xs text-slate-400">Informes Gerenciales</div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {SECCIONES.map((sec) => (
          <div key={sec.titulo}>
            <div className="px-3 text-[11px] font-semibold tracking-wider text-slate-500">{sec.titulo}</div>
            <div className="mt-2 space-y-0.5">
              {sec.items.map((item) => {
                if (!item.href) {
                  return (
                    <div key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">PRÓX.</span>
                    </div>
                  );
                }
                const activo = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={
                      "block rounded-lg px-3 py-2 text-sm font-medium transition " +
                      (activo ? "bg-indigo-500/15 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-500">Tucumán Eléctrica</div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Si se navega a otra sección (con el panel mobile abierto), se cierra solo.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  return (
    <>
      {/* Barra superior — sólo en celular/tablet angosto */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tucuman-electrica.png" alt="Tucumán Eléctrica" className="h-7 w-auto shrink-0 rounded bg-white px-1 py-0.5" />
          <span className="truncate text-sm font-medium text-white">Informes Gerenciales</span>
        </div>
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Menú fijo — sólo de tablet ancho (md) hacia arriba */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 md:flex">
        <Menu pathname={pathname} />
      </aside>

      {/* Panel deslizante — sólo en celular/tablet angosto, mientras está abierto */}
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAbierto(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col bg-slate-900 shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <Menu pathname={pathname} />
          </aside>
        </div>
      )}
    </>
  );
}