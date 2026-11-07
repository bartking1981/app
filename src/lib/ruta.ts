import { useEffect, useState } from 'react'

// Enrutador mínimo con «#» (funciona en GitHub Pages sin configuración extra).
export interface Ruta { pagina: string; params: URLSearchParams }

function leer(): Ruta {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [pagina, qs] = h.split('?')
  return { pagina: pagina || 'inicio', params: new URLSearchParams(qs ?? '') }
}

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState(leer)
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return ruta
}

export function ir(pagina: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  window.location.hash = `/${pagina}${qs}`
}
