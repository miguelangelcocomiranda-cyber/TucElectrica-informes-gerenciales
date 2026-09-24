import { createClient } from "@supabase/supabase-js";

// Usa la Secret Key: solo se llama del lado del servidor
// (Server Components, Server Actions, Route Handlers). Nunca la
// importes en un componente marcado "use client".
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan las variables de entorno SUPABASE_URL / SUPABASE_SECRET_KEY en Vercel."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
