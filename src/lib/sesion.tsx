import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, datos } from './supabase'

export interface Nino { id: string; apodo: string; es_prueba: boolean }

interface Contexto {
  sesion: Session | null
  cargando: boolean
  nombreUsuario: string
  ninos: Nino[]
  nino: Nino | null
  elegirNino: (id: string) => void
  salir: () => Promise<void>
  recuperando: boolean
  terminarRecuperacion: () => void
}

const Ctx = createContext<Contexto | null>(null)
const MINUTOS_INACTIVIDAD = 30
const CLAVE_NINO = 'contrato.nino'

function leerLocal(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }
function guardarLocal(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nombreUsuario, setNombre] = useState('')
  const [ninos, setNinos] = useState<Nino[]>([])
  const [ninoId, setNinoId] = useState<string | null>(leerLocal(CLAVE_NINO))
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); if (!data.session) setCargando(false) })
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSesion(s)
      if (e === 'PASSWORD_RECOVERY') setRecuperando(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Carga familia y niños al iniciar sesión
  useEffect(() => {
    if (!sesion) { setNinos([]); return }
    let vivo = true
    ;(async () => {
      try {
        const m = datos(await supabase.from('household_members').select('nombre').eq('user_id', sesion.user.id).maybeSingle())
        const n = datos(await supabase.from('children').select('id, apodo, es_prueba').order('es_prueba').order('created_at'))
        if (!vivo) return
        setNombre((m as { nombre: string } | null)?.nombre ?? '')
        setNinos((n ?? []) as Nino[])
      } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [sesion?.user.id])

  const salir = useCallback(async () => { await supabase.auth.signOut(); setSesion(null) }, [])

  // Cierra la sesión tras 30 minutos sin actividad
  useEffect(() => {
    if (!sesion) return
    let t: number
    const reiniciar = () => { clearTimeout(t); t = window.setTimeout(salir, MINUTOS_INACTIVIDAD * 60_000) }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'visibilitychange']
    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }))
    reiniciar()
    return () => { clearTimeout(t); eventos.forEach(e => window.removeEventListener(e, reiniciar)) }
  }, [sesion, salir])

  const nino = ninos.find(n => n.id === ninoId) ?? ninos[0] ?? null
  const elegirNino = (id: string) => { setNinoId(id); guardarLocal(CLAVE_NINO, id) }

  return <Ctx.Provider value={{ sesion, cargando, nombreUsuario, ninos, nino, elegirNino, salir, recuperando, terminarRecuperacion: () => setRecuperando(false) }}>{children}</Ctx.Provider>
}

export function useSesion(): Contexto {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSesion fuera del proveedor')
  return c
}
