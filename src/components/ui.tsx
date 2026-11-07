import type { ReactNode } from 'react'

export function Tarjeta({ titulo, children, extra, tono }: { titulo?: ReactNode; children: ReactNode; extra?: ReactNode; tono?: 'aviso' | 'peligro' | 'ok' }) {
  return (
    <section className={'tarjeta' + (tono ? ' tarjeta-' + tono : '')}>
      {(titulo || extra) && <header className="tarjeta-cab">{titulo && <h2>{titulo}</h2>}{extra}</header>}
      {children}
    </section>
  )
}

export interface Opcion<T extends string> { valor: T; texto: string; tono?: 'verde' | 'amarillo' | 'rojo' | 'gris' | 'azul'; icono?: string }

/** Botones grandes de opción única (uso táctil). */
export function Opciones<T extends string>({ opciones, valor, onCambio, deshabilitado, etiqueta }: {
  opciones: Opcion<T>[]; valor: T | null | undefined; onCambio: (v: T) => void; deshabilitado?: boolean; etiqueta: string
}) {
  return (
    <div className="opciones" role="radiogroup" aria-label={etiqueta}>
      {opciones.map(o => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor}
          className={'opcion' + (o.tono ? ' t-' + o.tono : '') + (valor === o.valor ? ' activa' : '')}
          disabled={deshabilitado} onClick={() => onCambio(o.valor)}>
          {o.icono && <span className="opcion-icono" aria-hidden="true">{o.icono}</span>}
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function Mensajes({ error, aviso }: { error?: string | null; aviso?: string | null }) {
  return <>
    {error && <p className="msg msg-error" role="alert">{error}</p>}
    {aviso && <p className="msg msg-ok" role="status">{aviso}</p>}
  </>
}

export function Cargando() { return <p className="cargando">Cargando…</p> }

export function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: ReactNode; tono?: 'verde' | 'rojo' | 'azul' }) {
  return <div className="dato"><span className="dato-etq">{etiqueta}</span><strong className={tono ? 'c-' + tono : ''}>{valor}</strong></div>
}

export function Semaforo({ color }: { color: string }) {
  const letra = color === 'verde' ? 'V' : color === 'amarillo' ? 'A' : 'R'
  return <span className={'semaforo s-' + color} title={color} aria-label={color}>{letra}</span>
}

export function Navegador({ texto, onAnterior, onSiguiente, siguienteDeshabilitado, extra }: {
  texto: ReactNode; onAnterior: () => void; onSiguiente: () => void; siguienteDeshabilitado?: boolean; extra?: ReactNode
}) {
  return (
    <div className="navegador">
      <button type="button" className="btn-icono" onClick={onAnterior} aria-label="Anterior">‹</button>
      <div className="navegador-texto">{texto}{extra}</div>
      <button type="button" className="btn-icono" onClick={onSiguiente} disabled={siguienteDeshabilitado} aria-label="Siguiente">›</button>
    </div>
  )
}
