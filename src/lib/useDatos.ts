import { useCallback, useEffect, useState } from 'react'
import { mensajeError } from './supabase'

/** Carga datos de forma asíncrona y permite recargar. */
export function useDatos<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [valor, setValor] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    cargar()
      .then(v => { if (vivo) { setValor(v); setError(null) } })
      .catch(e => { if (vivo) setError(mensajeError(e)) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const recargar = useCallback(() => setVersion(v => v + 1), [])
  return { valor, error, cargando, recargar }
}

/** Ejecuta una acción mostrando «guardando» y errores. */
export function useAccion() {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const ejecutar = useCallback(async (f: () => Promise<unknown>, ok?: string) => {
    setOcupado(true); setError(null); setAviso(null)
    try {
      await f()
      if (ok) { setAviso(ok); window.setTimeout(() => setAviso(null), 2500) }
      return true
    } catch (e) { setError(mensajeError(e)); return false }
    finally { setOcupado(false) }
  }, [])
  return { ocupado, error, aviso, ejecutar, setError }
}
