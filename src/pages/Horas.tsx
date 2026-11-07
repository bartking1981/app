import { useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { useDatos, useAccion } from '../lib/useDatos'
import { hoy, sumarDias, diaSemana, inicioMes, fechaCorta, fechaLarga, inicioSemana, nombreMes } from '../lib/fechas'
import { horas, TIPOS_MOV } from '../lib/formato'
import { Tarjeta, Mensajes, Cargando, Dato } from '../components/ui'

export interface ResumenHoras {
  saldo: number; utilizable: number; deuda: number; ganadas_mes: number; usadas_mes: number; penalizadas_mes: number
  usado_hoy: number; limite_hoy: number | null; bloque: number; caduca: string
}
interface Movimiento { id: string; dia: string; tipo: string; concepto: string; minutos: number; clave_origen: string | null; created_at: string }
interface Consecuencia { id: string; semana: string; deuda_minutos: number; descripcion: string; cumplida: boolean }

export async function cargarResumenHoras(n: string, dia: string): Promise<ResumenHoras> {
  return datos(await supabase.rpc('resumen_horas', { p_child: n, p_dia: dia })) as ResumenHoras
}

export default function Horas() {
  const { nino } = useSesion()
  const n = nino!.id
  const f = hoy()
  const dow = diaSemana(f)
  // Semana de la consecuencia: la que termina el sábado (el domingo cuenta la del día anterior)
  const semanaConsecuencia = inicioSemana(dow === 0 ? sumarDias(f, -1) : f)

  const { valor: d, cargando, error, recargar } = useDatos(async () => {
    const [res, movs, cons] = await Promise.all([
      cargarResumenHoras(n, f),
      supabase.from('videogame_transactions').select('*').eq('child_id', n).gte('dia', inicioMes(f)).order('dia').order('created_at'),
      supabase.from('weekend_consequences').select('*').eq('child_id', n).order('semana', { ascending: false }).limit(6),
    ])
    const lista = (datos(movs) ?? []) as Movimiento[]
    let acum = 0
    const conSaldo = lista.map(m => ({ ...m, saldo: (acum += m.minutos) }))
    const anulados = new Set(lista.filter(m => m.clave_origen?.startsWith('anula:')).map(m => m.clave_origen!.slice(6)))
    return { res, movs: conSaldo.reverse(), anulados, cons: (datos(cons) ?? []) as Consecuencia[] }
  }, [n, f])

  if (!d) return cargando ? <Cargando /> : <p className="msg msg-error">{error}</p>
  const { res } = d
  const consSemana = d.cons.find(c => c.semana === semanaConsecuencia)

  return (
    <>
      <Tarjeta titulo="Saldo de videojuegos" tono={res.deuda > 0 ? 'peligro' : undefined}>
        <div className="saldo-grande">
          {res.deuda > 0 ? <><span className="c-rojo">Debe {horas(res.deuda)}</span><small>No puede jugar hasta pagar la deuda</small></>
            : <><span>{horas(res.utilizable)}</span><small>disponibles</small></>}
        </div>
        <div className="datos">
          <Dato etiqueta="Ganadas en el mes" valor={horas(res.ganadas_mes)} tono="verde" />
          <Dato etiqueta="Jugadas" valor={horas(res.usadas_mes)} />
          <Dato etiqueta="Penalizadas" valor={horas(res.penalizadas_mes)} tono="rojo" />
        </div>
        <p className="tenue">Las horas se borran al terminar {nombreMes(f)} (último día: {fechaCorta(res.caduca)}).</p>
      </Tarjeta>

      <Consumo n={n} res={res} dow={dow} onCambio={recargar} />

      {(res.deuda > 0 || consSemana) && (dow === 6 || dow === 0 || consSemana) && (
        <ConsecuenciaFinde n={n} semana={semanaConsecuencia} deuda={res.deuda} actual={consSemana} onCambio={recargar} />
      )}
      {res.deuda > 0 && dow >= 1 && dow <= 5 && (
        <Tarjeta tono="aviso"><p><strong>Aviso:</strong> si el sábado en la tarde sigue debiendo horas, habrá una consecuencia el fin de semana.</p></Tarjeta>
      )}

      <Tarjeta titulo={'Movimientos de ' + nombreMes(f)}>
        {d.movs.length === 0 && <p className="tenue">Sin movimientos este mes. El saldo inicia en 0 cada mes.</p>}
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th className="der">Horas</th><th className="der">Saldo</th></tr></thead>
          <tbody>
            {d.movs.map(m => (
              <tr key={m.id}>
                <td>{fechaCorta(m.dia)}</td>
                <td>
                  <span className="tipo-mov">{TIPOS_MOV[m.tipo] ?? m.tipo}</span> {m.concepto}
                  {m.tipo === 'consumo' && !d.anulados.has(m.id) && <AnularConsumo id={m.id} onCambio={recargar} />}
                  {d.anulados.has(m.id) && <span className="etiqueta">anulado</span>}
                </td>
                <td className={'der ' + (m.minutos > 0 ? 'c-verde' : 'c-rojo')}>{horas(m.minutos, true)}</td>
                <td className="der">{horas(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </>
  )
}

function Consumo({ n, res, dow, onCambio }: { n: string; res: ResumenHoras; dow: number; onCambio: () => void }) {
  const a = useAccion()
  const f = hoy()
  const [dia, setDia] = useState(f)
  const [min, setMin] = useState(res.bloque * 4)
  const [nota, setNota] = useState('')
  const bloques = [15, 30, 45, 60, 90, 120, 180].filter(x => x % res.bloque === 0)
  const sugeridoSabado = Math.floor(res.utilizable / 2 / res.bloque) * res.bloque

  async function registrar() {
    if (!confirm(`¿Registrar ${horas(min)} jugadas el ${fechaLarga(dia)}?`)) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('registrar_consumo', { p_child: n, p_dia: dia, p_minutos: min, p_nota: nota })), 'Tiempo registrado')) { setNota(''); onCambio() }
  }

  return (
    <Tarjeta titulo="Registrar tiempo jugado">
      {dow === 6 && res.utilizable > 0 && <p className="nota-info">Sábado: se sugiere usar hasta <strong>{horas(sugeridoSabado)}</strong> hoy (la mitad) y dejar el resto para el domingo.</p>}
      {dow === 0 && res.utilizable > 0 && <p className="nota-info">Domingo: puede usar lo que le quedó del sábado más lo ganado en el cierre semanal.</p>}
      {res.limite_hoy != null && <p className="tenue">Entre semana máximo {horas(res.limite_hoy)} por día. Hoy lleva {horas(res.usado_hoy)}.</p>}
      <label className="etq">Día
        <select value={dia} onChange={e => setDia(e.target.value)}>
          <option value={f}>Hoy</option>
          <option value={sumarDias(f, -1)}>Ayer</option>
        </select>
      </label>
      <div className="chips" role="radiogroup" aria-label="Tiempo jugado">
        {bloques.map(b => <button key={b} type="button" role="radio" aria-checked={min === b} className={'chip' + (min === b ? ' activa' : '')} onClick={() => setMin(b)}>{horas(b)}</button>)}
      </div>
      <input className="campo" placeholder="Nota (opcional): juego, consola…" value={nota} onChange={e => setNota(e.target.value)} />
      <button className="btn btn-primario" onClick={registrar} disabled={a.ocupado || res.utilizable <= 0}>
        {res.utilizable <= 0 ? 'Sin saldo disponible' : 'Registrar ' + horas(min)}
      </button>
      {dow === 6 && min > sugeridoSabado && res.utilizable > 0 && <p className="msg msg-aviso">Esto rebasa la mitad sugerida para el sábado.</p>}
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}

function AnularConsumo({ id, onCambio }: { id: string; onCambio: () => void }) {
  const a = useAccion()
  async function anular() {
    if (!confirm('¿Anular este registro de tiempo jugado? Se regresarán las horas al saldo.')) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('anular_consumo', { p_id: id })))) onCambio()
  }
  return <>{' '}<button className="btn-texto peligro" onClick={anular} disabled={a.ocupado}>Anular</button>{a.error && <span className="c-rojo"> {a.error}</span>}</>
}

function ConsecuenciaFinde({ n, semana, deuda, actual, onCambio }: { n: string; semana: string; deuda: number; actual?: Consecuencia; onCambio: () => void }) {
  const a = useAccion()
  const [desc, setDesc] = useState('')
  async function registrar() {
    if (!desc.trim()) { a.setError('Escribe cuál será la consecuencia.'); return }
    if (await a.ejecutar(async () => datos(await supabase.from('weekend_consequences').insert({ child_id: n, semana, deuda_minutos: deuda, descripcion: desc.trim() })))) onCambio()
  }
  async function cumplir() {
    if (!actual || !confirm('¿Marcar la consecuencia como cumplida? La deuda de horas se borrará.')) return
    if (await a.ejecutar(async () => datos(await supabase.rpc('cumplir_consecuencia', { p_id: actual.id })), 'Deuda borrada')) onCambio()
  }
  return (
    <Tarjeta titulo="Consecuencia de fin de semana" tono={actual?.cumplida ? 'ok' : 'peligro'}>
      {actual ? <>
        <p><strong>{actual.descripcion}</strong></p>
        <p className="tenue">Deuda que la causó: {horas(actual.deuda_minutos)}</p>
        {actual.cumplida ? <p className="c-verde">✓ Cumplida. La deuda se borró.</p>
          : <button className="btn btn-primario" onClick={cumplir} disabled={a.ocupado}>Marcar como cumplida</button>}
      </> : <>
        <p>Llega al fin de semana debiendo <strong>{horas(deuda)}</strong>. Registren la consecuencia que decidieron (se revisa el sábado por la tarde, después del catecismo).</p>
        <input className="campo" placeholder="Consecuencia decidida" value={desc} onChange={e => setDesc(e.target.value)} />
        <button className="btn btn-primario" onClick={registrar} disabled={a.ocupado}>Registrar consecuencia</button>
      </>}
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}
