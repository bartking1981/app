import { createClient } from '@supabase/supabase-js'

// Estas variables se leen del archivo .env.local (no se sube a GitHub).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const faltaConfiguracion = !url || !llave || llave.startsWith('pega-aqui')

export const supabase = createClient(url ?? 'http://localhost', llave ?? 'sin-llave', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Convierte un error de Supabase en un mensaje entendible. */
export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
  if (/row-level security|permission denied|Sin acceso/i.test(m)) return 'No tienes permiso para hacer esto.'
  if (/duplicate key|unique/i.test(m)) return 'Ese registro ya existe.'
  if (/incidents_check|check constraint.*incidents/i.test(m)) return 'La rutina matutina no se evalúa en domingo.'
  return m
}

/** Lanza el error si la respuesta de Supabase trae uno; si no, regresa los datos. */
export function datos<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error
  return r.data
}
