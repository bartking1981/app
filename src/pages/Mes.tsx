import { useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { useDatos, useAccion } from '../lib/useDatos'
import { hoy, inicioMes, sumarMeses, nombreMes, fechaCorta } from '../lib/fechas'
import { NIVELES } from '../lib/formato'
import { ir } from '../lib/ruta'
import { Tarjeta, Mensajes, Cargando, Navegador, Dato } from '../components/ui'
import { puntosParaSiguiente } from './Semana'

export interface ResumenMes {
  mes: string; cerrado: boolean
  escuela: { dias: number; neto: number; positivos: number; negativos: number; sin_regla: number }
  casa: { dias: number; neto: number; buenos: number; malos: number }
  positivos: number; negativos: number; neto: number; maximo: number
  porcentaje: number | null; nivel: string
  umbrales: { normal: number; especial: number; extraordinario: number }
  pendientes_escuela: string[]; pendientes_casa: string[]
}
interface Premio { id: string; descripcion: string; presupuesto: number | null; fecha_asignacion: string | null; fecha_entrega: string | null; estado: string; nivel: string | null }

export default function Mes({ params }: { params: URLSearchParams }) {
  const { nino } = useSesion()
  const n = nino!.id
  const f = hoy()
  const mes = inicioMes(params.get('mes') ?? f)
  const a = useAccion()

  const { valor: d, cargando, error, recargar } = useDatos(async () => {
    const [res, prem] = await Promise.all([
      supabase.rpc('resumen_mes', { p_child: n, p_mes: mes }),
      supabase.from('monthly_rewards').select('*').eq('child_id', n).eq('mes', mes).order('created_at'),
    ])
    return { mes, res: datos(res) as ResumenMes, premios: (datos(prem) ?? []) as Premio[] }
  }, [n, mes])

  async function cerrar() {
    if (!d || !confirm(`¿Cerrar ${nombreMes(mes)} con ${d.res.porcentaje ?? 0}% (${NIVELES[d.res.nivel]})? Después no se podrán editar los registros de ese mes.`)) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('cerrar_mes', { p_child: n, p_mes: mes })), 'Mes cerrado')) recargar()
  }
  async function reabrir() {
    if (!confirm('¿Reabrir el mes para corregir registros? Quedará registrado.')) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('reabrir_mes', { p_child: n, p_mes: mes })), 'Mes reabierto')) recargar()
  }

  const r = d?.res
  const faltan = r ? puntosParaSiguiente(r) : null
  const terminado = sumarMeses(mes, 1) <= f

  return (
    <>
      <Navegador texto={<strong className="capital">{nombreMes(mes)}</strong>}
        onAnterior={() => ir('mes', { mes: sumarMeses(mes, -1) })}
        onSiguiente={() => ir('mes', { mes: sumarMeses(mes, 1) })}
        siguienteDeshabilitado={sumarMeses(mes, 1) > f} />
      {error && <p className="msg msg-error">{error}</p>}
      {!d || d.mes !== mes || !r ? (cargando ? <Cargando /> : null) : <>
        <Tarjeta titulo="Premio del mes" extra={r.cerrado ? <span className="etiqueta e-ok">Cerrado</span> : null}>
          <div className="porcentaje">
            <div className="barra-prog" role="img" aria-label={`${r.porcentaje ?? 0} por ciento`}>
              <div style={{ width: `${r.porcentaje ?? 0}%` }} className={'nivel-' + r.nivel} />
              {[r.umbrales.normal, r.umbrales.especial, r.umbrales.extraordinario].map(u => <i key={u} style={{ left: `${u}%` }} title={`${u}%`} />)}
            </div>
            <strong className="pct">{r.porcentaje != null ? `${r.porcentaje}%` : '—'}</strong>
            <span className={'etiqueta nivel-' + r.nivel}>{NIVELES[r.nivel]}</span>
          </div>
          {faltan && <p>Faltan <strong>{faltan.puntos} {faltan.puntos === 1 ? 'punto' : 'puntos'}</strong> para {NIVELES[faltan.nivel].toLowerCase()}.</p>}
          <div className="datos">
            <Dato etiqueta="Positivos" valor={r.positivos ? '+' + r.positivos : '0'} tono="verde" />
            <Dato etiqueta="Negativos" valor={r.negativos ? '−' + r.negativos : '0'} tono="rojo" />
            <Dato etiqueta="Netos" valor={r.neto} />
            <Dato etiqueta="Máximo posible" valor={r.maximo} />
          </div>
          <p className="tenue">Escuela: {r.escuela.dias} días evaluados ({r.escuela.neto >= 0 ? '+' : ''}{r.escuela.neto}). Casa: {r.casa.buenos} buenos, {r.casa.malos} malos.
            Niveles: {r.umbrales.normal}% normal · {r.umbrales.especial}% especial · {r.umbrales.extraordinario}% extraordinario.</p>
        </Tarjeta>

        {(r.pendientes_escuela.length > 0 || r.pendientes_casa.length > 0) && (
          <Tarjeta titulo="Pendientes (no cuentan en contra)" tono="aviso">
            {r.pendientes_escuela.length > 0 && <p><strong>Reportes escolares:</strong> {r.pendientes_escuela.map(x => <a key={x} className="chip-link" href={'#/hoy?fecha=' + x}>{fechaCorta(x)}</a>)}</p>}
            {r.pendientes_casa.length > 0 && <p><strong>Evaluación de casa:</strong> {r.pendientes_casa.map(x => <a key={x} className="chip-link" href={'#/hoy?fecha=' + x}>{fechaCorta(x)}</a>)}</p>}
          </Tarjeta>
        )}

        <div className="fila-botones">
          {!r.cerrado && terminado && <button className="btn btn-primario" onClick={cerrar} disabled={a.ocupado}>Cerrar mes</button>}
          {!r.cerrado && !terminado && <p className="tenue">El mes se puede cerrar cuando termine.</p>}
          {r.cerrado && <button className="btn" onClick={reabrir} disabled={a.ocupado}>Reabrir mes</button>}
        </div>
        <Mensajes error={a.error} aviso={a.aviso} />

        <Premios n={n} mes={mes} nivel={r.nivel} lista={d.premios} onCambio={recargar} />
      </>}
    </>
  )
}

function Premios({ n, mes, nivel, lista, onCambio }: { n: string; mes: string; nivel: string; lista: Premio[]; onCambio: () => void }) {
  const a = useAccion()
  const [desc, setDesc] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  async function agregar() {
    if (!desc.trim()) { a.setError('Describe el premio.'); return }
    if (await a.ejecutar(async () => datos(await supabase.from('monthly_rewards').insert({
      child_id: n, mes, nivel, descripcion: desc.trim(), presupuesto: presupuesto ? Number(presupuesto) : null, fecha_asignacion: hoy(),
    })), 'Premio registrado')) { setDesc(''); setPresupuesto(''); onCambio() }
  }
  async function entregar(p: Premio) {
    const entregado = p.estado !== 'entregado'
    if (!confirm(entregado ? '¿Marcar el premio como entregado?' : '¿Regresar el premio a pendiente?')) return
    if (await a.ejecutar(async () => datos(await supabase.from('monthly_rewards').update({ estado: entregado ? 'entregado' : 'pendiente', fecha_entrega: entregado ? hoy() : null }).eq('id', p.id)))) onCambio()
  }
  return (
    <Tarjeta titulo="Premio asignado">
      <ul className="lista">
        {lista.map(p => <li key={p.id}>
          <span><strong>{p.descripcion}</strong>{p.presupuesto != null && ` · $${p.presupuesto}`}{p.nivel && ` · ${NIVELES[p.nivel] ?? p.nivel}`}
            <br /><span className={p.estado === 'entregado' ? 'c-verde' : 'tenue'}>{p.estado === 'entregado' ? `Entregado ${p.fecha_entrega ? fechaCorta(p.fecha_entrega) : ''}` : 'Pendiente de entregar'}</span></span>
          <button className="btn-texto" onClick={() => entregar(p)} disabled={a.ocupado}>{p.estado === 'entregado' ? 'Deshacer' : 'Entregado'}</button>
        </li>)}
      </ul>
      {lista.length === 0 && <p className="tenue">Aún no hay premio registrado para este mes.</p>}
      <input className="campo" placeholder="Descripción del premio" value={desc} onChange={e => setDesc(e.target.value)} />
      <div className="fila-form">
        <input className="campo" inputMode="decimal" placeholder="Presupuesto (opcional)" value={presupuesto} onChange={e => setPresupuesto(e.target.value.replace(/[^0-9.]/g, ''))} />
        <button className="btn" onClick={agregar} disabled={a.ocupado}>Agregar</button>
      </div>
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}
