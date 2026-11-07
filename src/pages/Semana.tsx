import { useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { useDatos, useAccion } from '../lib/useDatos'
import { hoy, sumarDias, inicioSemana, rangoSemana, fechaCorta, DIAS_CORTOS, inicioMes } from '../lib/fechas'
import { horas, RESULTADOS, NIVELES } from '../lib/formato'
import { ir } from '../lib/ruta'
import { Tarjeta, Mensajes, Cargando, Navegador, Semaforo } from '../components/ui'
import { cargarResumenHoras } from './Horas'
import type { ResumenMes } from './Mes'

interface Resp { clave: string; nombre: string; detalle: string | null; resultado: string; minutos: number }
interface ResumenSemana {
  semana: string; sabado: string; cerrada: boolean; responsabilidades: Resp[]
  informativo: { dientes: number; dientes_meta: number; catecismo: string | null }
  minutos_cierre: number; incidencias: { dia: string; tipo: string; descripcion: string }[]; pendientes: string[]
}

export default function Semana({ params }: { params: URLSearchParams }) {
  const { nino } = useSesion()
  const n = nino!.id
  const f = hoy()
  const sem = inicioSemana(params.get('semana') ?? f)
  const a = useAccion()
  const [confirmarIncompleta, setConfirmar] = useState(false)

  const { valor: d, cargando, error, recargar } = useDatos(async () => {
    const [res, reps, evs, mes, hrs] = await Promise.all([
      supabase.rpc('resumen_semana', { p_child: n, p_semana: sem }),
      supabase.from('school_reports').select('dia, estado, school_report_grades(color)').eq('child_id', n).gte('dia', sem).lte('dia', sumarDias(sem, 6)),
      supabase.from('daily_evaluations').select('dia, resultado').eq('child_id', n).gte('dia', sem).lte('dia', sumarDias(sem, 6)),
      supabase.rpc('resumen_mes', { p_child: n, p_mes: inicioMes(sumarDias(sem, 6) > f ? f : sumarDias(sem, 6)) }),
      cargarResumenHoras(n, sumarDias(sem, 6) > f ? f : sumarDias(sem, 6)),
    ])
    return {
      sem,
      res: datos(res) as ResumenSemana,
      reps: (datos(reps) ?? []) as { dia: string; estado: string; school_report_grades: { color: string }[] }[],
      evs: (datos(evs) ?? []) as { dia: string; resultado: string }[],
      mes: datos(mes) as ResumenMes,
      hrs,
    }
  }, [n, sem])

  async function cerrar() {
    if (!d) return
    if (d.res.pendientes.length && !confirmarIncompleta) { setConfirmar(true); return }
    if (!confirm(`¿Cerrar la semana? Se aplicarán ${horas(d.res.minutos_cierre, true)} al saldo.`)) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('cerrar_semana', { p_child: n, p_semana: sem })), 'Semana cerrada')) { setConfirmar(false); recargar() }
  }
  async function reabrir() {
    if (!confirm('¿Reabrir la semana? Las horas del cierre se revertirán hasta que la vuelvas a cerrar.')) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('reabrir_semana', { p_child: n, p_semana: sem })), 'Semana reabierta')) recargar()
  }

  const sabado = sumarDias(sem, 6)
  return (
    <>
      <div className="no-imprimir">
        <Navegador texto={<strong>Semana del {rangoSemana(sem)}</strong>}
          onAnterior={() => ir('semana', { semana: sumarDias(sem, -7) })}
          onSiguiente={() => ir('semana', { semana: sumarDias(sem, 7) })}
          siguienteDeshabilitado={sumarDias(sem, 7) > f} />
      </div>
      {error && <p className="msg msg-error">{error}</p>}
      {!d || d.sem !== sem ? (cargando ? <Cargando /> : null) : <>
        <div className="no-imprimir">
          <Tarjeta titulo="Responsabilidades" extra={d.res.cerrada ? <span className="etiqueta e-ok">Cerrada</span> : <span className="etiqueta e-aviso">Abierta</span>}>
            <table className="tabla">
              <tbody>
                {d.res.responsabilidades.map(r => (
                  <tr key={r.clave}>
                    <td><strong>{r.nombre}</strong>{r.detalle && <div className="tenue">{r.detalle}</div>}</td>
                    <td><span className={'etiqueta e-' + r.resultado}>{RESULTADOS[r.resultado] ?? r.resultado}</span></td>
                    <td className={'der ' + (r.minutos > 0 ? 'c-verde' : r.minutos < 0 ? 'c-rojo' : '')}>{horas(r.minutos, true)}</td>
                  </tr>
                ))}
                <tr className="total"><td colSpan={2}>Horas del cierre</td><td className="der">{horas(d.res.minutos_cierre, true)}</td></tr>
              </tbody>
            </table>
            <p className="tenue">Ya aplicadas al momento: lavado de dientes ({d.res.informativo.dientes} de {d.res.informativo.dientes_meta}){d.res.informativo.catecismo ? `, catecismo (${d.res.informativo.catecismo})` : ''} e incidencias.</p>
          </Tarjeta>

          {d.res.incidencias.length > 0 && (
            <Tarjeta titulo={`Incidencias (${d.res.incidencias.length})`}>
              <ul className="lista">{d.res.incidencias.map((i, k) => <li key={k}><span>{fechaCorta(i.dia)} · <strong>{i.tipo === 'mesa' ? 'Mesa' : 'Rutina'}</strong> · {i.descripcion}</span></li>)}</ul>
            </Tarjeta>
          )}

          {d.res.pendientes.length > 0 && !d.res.cerrada && (
            <Tarjeta titulo="Pendientes" tono="aviso">
              <ul>{d.res.pendientes.map(p => <li key={p}>{p}</li>)}</ul>
              <p className="tenue">Los pendientes se cuentan como «sin premio» al cerrar. Puedes completarlos en «Registrar».</p>
            </Tarjeta>
          )}

          <div className="fila-botones">
            {!d.res.cerrada && sabado <= f && <button className="btn btn-primario" onClick={cerrar} disabled={a.ocupado}>
              {confirmarIncompleta ? 'Cerrar de todos modos' : 'Cerrar semana'}</button>}
            {!d.res.cerrada && sabado > f && <p className="tenue">La semana se cierra el sábado en la noche.</p>}
            {d.res.cerrada && <button className="btn" onClick={reabrir} disabled={a.ocupado}>Reabrir semana</button>}
            <button className="btn" onClick={() => window.print()}>Resumen para el niño (imprimir / PDF)</button>
          </div>
          {confirmarIncompleta && <p className="msg msg-aviso">Hay información incompleta. Revisa los pendientes; si estás seguro, presiona «Cerrar de todos modos».</p>}
          <Mensajes error={a.error} aviso={a.aviso} />
        </div>

        <ResumenNino d={d} apodo={nino!.es_prueba ? 'Prueba' : nino!.apodo} />
      </>}
    </>
  )
}

/** Hoja para imprimir o guardar como PDF y enseñarle al niño (sin observaciones privadas). */
function ResumenNino({ d, apodo }: { d: { res: ResumenSemana; reps: { dia: string; estado: string; school_report_grades: { color: string }[] }[]; evs: { dia: string; resultado: string }[]; mes: ResumenMes; hrs: { saldo: number; utilizable: number; deuda: number } }; apodo: string }) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(d.res.semana, i))
  const faltan = puntosParaSiguiente(d.mes)
  return (
    <div className="solo-imprimir hoja-nino">
      <h1>¡Así me fue esta semana, {apodo}!</h1>
      <p className="sub">Semana del {rangoSemana(d.res.semana)}</p>
      <table className="tabla-nino">
        <thead><tr><th></th>{dias.map(x => <th key={x}>{DIAS_CORTOS[new Date(x + 'T12:00').getDay()]}</th>)}</tr></thead>
        <tbody>
          <tr><th>Escuela</th>{dias.map(x => {
            const r = d.reps.find(r => r.dia === x)
            return <td key={x}>{r?.estado === 'recibido' ? r.school_report_grades.map((g, i) => <Semaforo key={i} color={g.color} />) : '—'}</td>
          })}</tr>
          <tr><th>Casa</th>{dias.map(x => {
            const e = d.evs.find(e => e.dia === x)
            return <td key={x}>{e ? (e.resultado === 'bien' ? '✓ +1' : '✗ −1') : '—'}</td>
          })}</tr>
        </tbody>
      </table>
      <h2>Mis responsabilidades</h2>
      <ul className="lista-nino">
        {d.res.responsabilidades.map(r => <li key={r.clave}>{r.nombre}: <strong>{RESULTADOS[r.resultado]}</strong> ({horas(r.minutos, true)})</li>)}
        <li>Lavado de dientes: <strong>{d.res.informativo.dientes} de {d.res.informativo.dientes_meta}</strong>{d.res.informativo.dientes >= d.res.informativo.dientes_meta ? ' (+1 h)' : ''}</li>
        {d.res.informativo.catecismo && <li>Catecismo: <strong>{d.res.informativo.catecismo}</strong></li>}
        {d.res.incidencias.length > 0 && <li>Incidencias: <strong>{d.res.incidencias.length}</strong></li>}
      </ul>
      <h2>Mis horas de videojuegos</h2>
      <p className="grande">{d.hrs.deuda > 0 ? `Debo ${horas(d.hrs.deuda)}` : `Tengo ${horas(d.hrs.utilizable)} para jugar`}</p>
      <h2>Mi premio del mes</h2>
      <p className="grande">{d.mes.porcentaje != null ? `${d.mes.porcentaje}% · ${NIVELES[d.mes.nivel]}` : 'Todavía sin datos'}</p>
      {faltan && <p>Me faltan <strong>{faltan.puntos} {faltan.puntos === 1 ? 'punto' : 'puntos'}</strong> para llegar a <strong>{NIVELES[faltan.nivel]}</strong>.</p>}
      <p className="pie-nino">Mi Contrato de Responsabilidades</p>
    </div>
  )
}

export function puntosParaSiguiente(m: ResumenMes): { nivel: string; puntos: number } | null {
  if (!m.maximo) return null
  const orden: [string, number][] = [['normal', m.umbrales.normal], ['especial', m.umbrales.especial], ['extraordinario', m.umbrales.extraordinario]]
  for (const [nivel, pct] of orden) {
    const necesarios = Math.ceil((pct * m.maximo) / 100 - 1e-9)
    if (m.neto < necesarios) return { nivel, puntos: necesarios - m.neto }
  }
  return null
}
