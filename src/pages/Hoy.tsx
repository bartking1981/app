import { useState } from 'react'
import { supabase, datos } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { useDatos, useAccion } from '../lib/useDatos'
import { hoy, sumarDias, fechaLarga, diaSemana, esEntreSemana, inicioSemana } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { Tarjeta, Opciones, Mensajes, Cargando, Navegador, type Opcion } from '../components/ui'

type Color = 'verde' | 'amarillo' | 'rojo'
type SiNo = 'si' | 'no' | 'na'
interface Materia { id: string; nombre: string }
interface Incidencia { id: string; tipo: 'mesa' | 'rutina'; descripcion: string }
interface Visita { id: string; familiar: string; saludo_bien: boolean; nota: string | null }

const COLORES: Opcion<Color>[] = [
  { valor: 'verde', texto: 'Verde', tono: 'verde', icono: 'V' },
  { valor: 'amarillo', texto: 'Amarillo', tono: 'amarillo', icono: 'A' },
  { valor: 'rojo', texto: 'Rojo', tono: 'rojo', icono: 'R' },
]
const SINO: Opcion<SiNo>[] = [
  { valor: 'si', texto: 'Sí', tono: 'verde' }, { valor: 'no', texto: 'No', tono: 'rojo' }, { valor: 'na', texto: 'No aplica', tono: 'gris' },
]
const TIPOS_DIA = [
  { valor: '', texto: 'Día normal' }, { valor: 'festivo', texto: 'Día festivo' }, { valor: 'vacaciones', texto: 'Vacaciones' },
  { valor: 'enfermedad', texto: 'Enfermedad' }, { valor: 'viaje', texto: 'Viaje' }, { valor: 'otro', texto: 'Otro (sin clases)' },
]

export default function Hoy({ params }: { params: URLSearchParams }) {
  const { nino } = useSesion()
  const n = nino!.id
  const hoyStr = hoy()
  const fecha = params.get('fecha') ?? hoyStr
  const dow = diaSemana(fecha)
  const sem = inicioSemana(fecha)

  const { valor: d, cargando, error, recargar } = useDatos(async () => {
    const q = (t: string) => supabase.from(t).select('*').eq('child_id', n).eq('dia', fecha).maybeSingle()
    const [cal, rep, mat, ev, chk, cat, inc, vis, sem7] = await Promise.all([
      q('calendar_days'),
      supabase.from('school_reports').select('*, school_report_grades(subject_id, color)').eq('child_id', n).eq('dia', fecha).maybeSingle(),
      supabase.from('school_subjects').select('id, nombre').eq('child_id', n).eq('activa', true).order('orden'),
      q('daily_evaluations'), q('daily_checks'), q('catechism_results'),
      supabase.from('incidents').select('id, tipo, descripcion').eq('child_id', n).eq('dia', fecha).order('created_at'),
      supabase.from('family_visits').select('id, familiar, saludo_bien, nota').eq('child_id', n).eq('dia', fecha).order('created_at'),
      supabase.from('daily_checks').select('dia, dientes').eq('child_id', n).gte('dia', sem).lte('dia', sumarDias(sem, 6)),
    ])
    return {
      fecha,
      cal: datos(cal) as { tipo: string } | null,
      rep: datos(rep) as { estado: string; nota: string | null; school_report_grades: { subject_id: string; color: Color }[] } | null,
      materias: (datos(mat) ?? []) as Materia[],
      ev: datos(ev) as { resultado: 'bien' | 'mal'; nota: string | null } | null,
      chk: datos(chk) as { alimentacion: SiNo | null; tareas: SiNo | null; limpieza: boolean; dientes: number } | null,
      cat: datos(cat) as { resultado: string } | null,
      inc: (datos(inc) ?? []) as Incidencia[],
      vis: (datos(vis) ?? []) as Visita[],
      dientesSemana: ((datos(sem7) ?? []) as { dia: string; dientes: number }[]).filter(x => x.dia !== fecha).reduce((a, x) => a + x.dientes, 0),
    }
  }, [n, fecha])

  const cambiarFecha = (f: string) => ir('hoy', f === hoyStr ? undefined : { fecha: f })

  return (
    <>
      <Navegador
        texto={<><strong className="capital">{fechaLarga(fecha)}</strong>{fecha === hoyStr && <span className="etiqueta">Hoy</span>}</>}
        onAnterior={() => cambiarFecha(sumarDias(fecha, -1))}
        onSiguiente={() => cambiarFecha(sumarDias(fecha, 1))}
        siguienteDeshabilitado={fecha >= hoyStr}
        extra={fecha !== hoyStr ? <button className="btn-texto" onClick={() => cambiarFecha(hoyStr)}>Ir a hoy</button> : null}
      />
      {error && <p className="msg msg-error">{error}</p>}
      {!d || d.fecha !== fecha ? (cargando ? <Cargando /> : null) : <div key={d.fecha}>
        <DiaEspecial n={n} fecha={fecha} tipo={d.cal?.tipo ?? ''} onCambio={recargar} />
        {esEntreSemana(fecha) && !d.cal && <Escuela n={n} fecha={fecha} rep={d.rep} materias={d.materias} onCambio={recargar} />}
        {d.cal?.tipo === 'enfermedad'
          ? <Tarjeta titulo="Casa"><p className="tenue">Día de enfermedad: no se evalúa el comportamiento en casa.</p></Tarjeta>
          : <Casa n={n} fecha={fecha} ev={d.ev} onCambio={recargar} />}
        {dow === 6 && <Catecismo n={n} fecha={fecha} actual={d.cat?.resultado ?? null} onCambio={recargar} />}
        <Habitos n={n} fecha={fecha} chk={d.chk} dientesOtrosDias={d.dientesSemana} onCambio={recargar} />
        <Incidencias n={n} fecha={fecha} lista={d.inc} onCambio={recargar} />
        <Visitas n={n} fecha={fecha} lista={d.vis} onCambio={recargar} />
      </div>}
    </>
  )
}

function DiaEspecial({ n, fecha, tipo, onCambio }: { n: string; fecha: string; tipo: string; onCambio: () => void }) {
  const a = useAccion()
  async function cambiar(v: string) {
    await a.ejecutar(async () => {
      if (v) datos(await supabase.from('calendar_days').upsert({ child_id: n, dia: fecha, tipo: v }, { onConflict: 'child_id,dia' }))
      else datos(await supabase.from('calendar_days').delete().eq('child_id', n).eq('dia', fecha))
    })
    onCambio()
  }
  return (
    <div className="dia-especial">
      <label>Tipo de día{' '}
        <select value={tipo} onChange={e => cambiar(e.target.value)} disabled={a.ocupado}>
          {TIPOS_DIA.map(t => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
        </select>
      </label>
      <Mensajes error={a.error} />
    </div>
  )
}

function Escuela({ n, fecha, rep, materias, onCambio }: {
  n: string; fecha: string; materias: Materia[]
  rep: { estado: string; school_report_grades: { subject_id: string; color: Color }[] } | null; onCambio: () => void
}) {
  const a = useAccion()
  const inicial = Object.fromEntries((rep?.school_report_grades ?? []).map(g => [g.subject_id, g.color])) as Record<string, Color>
  const [estado, setEstado] = useState<string>(rep?.estado ?? 'pendiente')
  const [colores, setColores] = useState<Record<string, Color>>(inicial)

  async function guardar(est: string, cols: Record<string, Color>) {
    const ok = await a.ejecutar(async () => datos(await supabase.rpc('guardar_reporte_escolar', {
      p_child: n, p_dia: fecha, p_estado: est, p_colores: est === 'recibido' ? cols : null, p_nota: null,
    })), 'Guardado')
    if (ok) onCambio()
  }
  function elegirEstado(v: string) { setEstado(v); if (v !== 'recibido') guardar(v, {}) }
  function elegirColor(id: string, c: Color) {
    const nuevos = { ...colores, [id]: c }
    setColores(nuevos)
    if (materias.every(m => nuevos[m.id])) guardar('recibido', nuevos)
  }

  return (
    <Tarjeta titulo="Escuela: semáforos" extra={!rep && <span className="etiqueta e-aviso">Pendiente</span>}>
      <Opciones etiqueta="Estado del reporte" valor={estado} onCambio={elegirEstado} deshabilitado={a.ocupado} opciones={[
        { valor: 'recibido', texto: 'Recibido', tono: 'azul' }, { valor: 'pendiente', texto: 'Pendiente', tono: 'gris' },
        { valor: 'no_enviado', texto: 'No lo enviaron', tono: 'gris' }, { valor: 'sin_clases', texto: 'Sin clases', tono: 'gris' },
      ]} />
      {estado === 'recibido' && materias.map(m => (
        <div key={m.id} className="fila-materia">
          <span className="materia">{m.nombre}</span>
          <Opciones etiqueta={'Semáforo de ' + m.nombre} valor={colores[m.id]} onCambio={c => elegirColor(m.id, c)} opciones={COLORES} deshabilitado={a.ocupado} />
        </div>
      ))}
      {estado === 'recibido' && !materias.every(m => colores[m.id]) && <p className="tenue">Elige el color de cada clase; se guarda al completar las dos.</p>}
      {estado === 'no_enviado' && <p className="tenue">Este día no suma ni resta puntos.</p>}
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}

function Casa({ n, fecha, ev, onCambio }: { n: string; fecha: string; ev: { resultado: 'bien' | 'mal'; nota: string | null } | null; onCambio: () => void }) {
  const a = useAccion()
  const [nota, setNota] = useState(ev?.nota ?? '')
  async function guardar(r: 'bien' | 'mal') {
    if (r === 'mal' && !nota.trim()) { a.setError('Escribe brevemente el motivo del mal comportamiento.'); return }
    if (await a.ejecutar(async () => datos(await supabase.from('daily_evaluations').upsert(
      { child_id: n, dia: fecha, resultado: r, nota: nota.trim() || null }, { onConflict: 'child_id,dia' })), 'Guardado')) onCambio()
  }
  async function quitar() {
    if (!confirm('¿Quitar la evaluación de este día? Quedará como pendiente.')) return
    if (await a.ejecutar(async () => datos(await supabase.from('daily_evaluations').delete().eq('child_id', n).eq('dia', fecha)))) { setNota(''); onCambio() }
  }
  return (
    <Tarjeta titulo="Casa: ¿cómo se portó hoy?" extra={!ev && <span className="etiqueta e-aviso">Pendiente</span>}>
      <Opciones etiqueta="Comportamiento en casa" valor={ev?.resultado} onCambio={guardar} deshabilitado={a.ocupado} opciones={[
        { valor: 'bien', texto: 'Bien  +1', tono: 'verde', icono: '✓' }, { valor: 'mal', texto: 'Mal  −1', tono: 'rojo', icono: '✗' },
      ]} />
      <input className="campo" placeholder="Observación o motivo (obligatorio si fue mal)" value={nota} onChange={e => setNota(e.target.value)} />
      <div className="fila-botones">
        {ev && nota !== (ev.nota ?? '') && <button className="btn" onClick={() => guardar(ev.resultado)} disabled={a.ocupado}>Guardar observación</button>}
        {ev && <button className="btn-texto" onClick={quitar} disabled={a.ocupado}>Quitar evaluación</button>}
      </div>
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}

function Catecismo({ n, fecha, actual, onCambio }: { n: string; fecha: string; actual: string | null; onCambio: () => void }) {
  const a = useAccion()
  async function guardar(r: string) {
    if (await a.ejecutar(async () => datos(await supabase.from('catechism_results').upsert(
      { child_id: n, dia: fecha, resultado: r }, { onConflict: 'child_id,dia' })), 'Guardado; las horas ya se aplicaron')) onCambio()
  }
  return (
    <Tarjeta titulo="Catecismo (sábado)" extra={!actual && <span className="etiqueta e-aviso">Pendiente</span>}>
      <Opciones etiqueta="Resultado del catecismo" valor={actual} onCambio={guardar} deshabilitado={a.ocupado} opciones={[
        { valor: 'bien', texto: 'Bien +2 h', tono: 'verde' }, { valor: 'regular', texto: 'Regular 0 h', tono: 'amarillo' },
        { valor: 'mal', texto: 'Mal −3 h', tono: 'rojo' }, { valor: 'no_aplica', texto: 'No hubo', tono: 'gris' },
      ]} />
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}

function Habitos({ n, fecha, chk, dientesOtrosDias, onCambio }: {
  n: string; fecha: string; dientesOtrosDias: number
  chk: { alimentacion: SiNo | null; tareas: SiNo | null; limpieza: boolean; dientes: number } | null; onCambio: () => void
}) {
  const a = useAccion()
  const actual = { alimentacion: chk?.alimentacion ?? null, tareas: chk?.tareas ?? null, limpieza: chk?.limpieza ?? false, dientes: chk?.dientes ?? 0 }
  async function guardar(cambio: Partial<typeof actual>) {
    if (await a.ejecutar(async () => datos(await supabase.from('daily_checks').upsert(
      { child_id: n, dia: fecha, ...actual, ...cambio }, { onConflict: 'child_id,dia' })))) onCambio()
  }
  const totalDientes = dientesOtrosDias + actual.dientes
  const finde = diaSemana(fecha) === 0 || diaSemana(fecha) === 6
  return (
    <Tarjeta titulo="Hábitos del día">
      <p className="sub">¿Comió bien desayuno, comida y cena?</p>
      <Opciones etiqueta="Alimentación" valor={actual.alimentacion} onCambio={v => guardar({ alimentacion: v })} opciones={SINO} deshabilitado={a.ocupado} />
      <p className="sub">¿Hizo la tarea sin pelear, llorar ni alegar?{finde && <span className="tenue"> (fin de semana: si no se marca, cuenta como «no aplica»)</span>}</p>
      <Opciones etiqueta="Tareas" valor={actual.tareas} onCambio={v => guardar({ tareas: v })} opciones={SINO} deshabilitado={a.ocupado} />
      <p className="sub">¿Limpió su cuarto hoy?</p>
      <Opciones etiqueta="Limpieza del cuarto" valor={actual.limpieza ? 'si' : 'no'} onCambio={v => guardar({ limpieza: v === 'si' })} deshabilitado={a.ocupado}
        opciones={[{ valor: 'si', texto: 'Sí limpió', tono: 'verde' }, { valor: 'no', texto: 'No', tono: 'gris' }]} />
      <p className="sub">¿Cuántas veces se lavó los dientes hoy?</p>
      <div className="contador">
        <button className="btn-icono" onClick={() => guardar({ dientes: Math.max(0, actual.dientes - 1) })} disabled={a.ocupado || actual.dientes === 0} aria-label="Una vez menos">−</button>
        <strong aria-live="polite">{actual.dientes}</strong>
        <button className="btn-icono" onClick={() => guardar({ dientes: Math.min(3, actual.dientes + 1) })} disabled={a.ocupado || actual.dientes >= 3} aria-label="Una vez más">+</button>
        <span className={totalDientes >= 8 ? 'c-verde' : 'tenue'}>Semana: {totalDientes} de 8{totalDientes >= 8 ? ' ✓ +1 h ganada' : ''}</span>
      </div>
      <Mensajes error={a.error} />
    </Tarjeta>
  )
}

function Incidencias({ n, fecha, lista, onCambio }: { n: string; fecha: string; lista: Incidencia[]; onCambio: () => void }) {
  const a = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'mesa' | 'rutina' | null>(null)
  const [desc, setDesc] = useState('')
  const domingo = diaSemana(fecha) === 0
  const yaRutina = lista.some(i => i.tipo === 'rutina')
  function cerrar() { setAbierto(false); setTipo(null); setDesc(''); a.setError(null) }
  async function agregar() {
    if (!tipo) { a.setError('Elige el tipo de incidencia.'); return }
    if (!desc.trim()) { a.setError('Describe brevemente lo que pasó.'); return }
    const txt = tipo === 'mesa' ? 'Se descontará 1 hora.' : 'Se descontarán 2 horas.'
    if (!confirm('¿Registrar la incidencia? ' + txt)) return
    if (await a.ejecutar(async () => datos(await supabase.from('incidents').insert({ child_id: n, dia: fecha, tipo, descripcion: desc.trim() })), 'Incidencia registrada')) { cerrar(); onCambio() }
  }
  async function borrar(i: Incidencia) {
    if (!confirm('¿Eliminar esta incidencia? Se le regresarán las horas descontadas.')) return
    if (await a.ejecutar(async () => datos(await supabase.from('incidents').delete().eq('id', i.id)))) onCambio()
  }
  return (
    <Tarjeta titulo="Incidencias">
      {lista.length === 0 && !abierto && <p className="c-verde">✓ Sin incidencias este día. No hay que hacer nada.</p>}
      <ul className="lista">
        {lista.map(i => <li key={i.id}>
          <span><strong>{i.tipo === 'mesa' ? 'Mesa −1 h' : 'Rutina matutina −2 h'}</strong> · {i.descripcion}</span>
          <button className="btn-texto peligro" onClick={() => borrar(i)}>Eliminar</button>
        </li>)}
      </ul>
      {!abierto ? (
        <button className="btn" onClick={() => setAbierto(true)}>+ Registrar una incidencia</button>
      ) : <>
        <p className="sub">¿Qué tipo de incidencia?</p>
        <Opciones etiqueta="Tipo de incidencia" valor={tipo} onCambio={setTipo} opciones={[
          { valor: 'mesa', texto: 'Mesa (−1 h)', tono: 'rojo' },
          ...(!domingo && !yaRutina ? [{ valor: 'rutina' as const, texto: 'Rutina matutina (−2 h)', tono: 'rojo' as const }] : []),
        ]} />
        <input className="campo" placeholder="¿Qué pasó?" value={desc} onChange={e => setDesc(e.target.value)} />
        <div className="fila-botones">
          <button className="btn btn-primario" onClick={agregar} disabled={a.ocupado}>Guardar incidencia</button>
          <button className="btn-texto" onClick={cerrar} disabled={a.ocupado}>Cancelar</button>
        </div>
        {domingo && <p className="tenue">La rutina matutina no se evalúa en domingo.</p>}
        {yaRutina && <p className="tenue">La rutina matutina ya se registró hoy (máximo una por día).</p>}
      </>}
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}

function Visitas({ n, fecha, lista, onCambio }: { n: string; fecha: string; lista: Visita[]; onCambio: () => void }) {
  const a = useAccion()
  const [familiar, setFamiliar] = useState('')
  async function agregar(bien: boolean) {
    if (!familiar.trim()) { a.setError('Escribe a quién visitó.'); return }
    if (await a.ejecutar(async () => datos(await supabase.from('family_visits').insert({ child_id: n, dia: fecha, familiar: familiar.trim(), saludo_bien: bien })), 'Visita registrada')) { setFamiliar(''); onCambio() }
  }
  async function borrar(v: Visita) {
    if (!confirm('¿Eliminar esta visita?')) return
    if (await a.ejecutar(async () => datos(await supabase.from('family_visits').delete().eq('id', v.id)))) onCambio()
  }
  return (
    <Tarjeta titulo="Visitas a familiares">
      <ul className="lista">
        {lista.map(v => <li key={v.id}>
          <span>{v.familiar} · <strong className={v.saludo_bien ? 'c-verde' : 'c-rojo'}>{v.saludo_bien ? 'Saludó bien' : 'No saludó bien'}</strong></span>
          <button className="btn-texto peligro" onClick={() => borrar(v)}>Eliminar</button>
        </li>)}
      </ul>
      <input className="campo" placeholder="¿A quién visitó? (abuela, tío…)" value={familiar} onChange={e => setFamiliar(e.target.value)} />
      <div className="fila-botones">
        <button className="btn t-verde" onClick={() => agregar(true)} disabled={a.ocupado}>Saludó bien</button>
        <button className="btn t-rojo" onClick={() => agregar(false)} disabled={a.ocupado}>No saludó bien</button>
      </div>
      <p className="tenue">El premio o descuento de saludos se aplica en el cierre del sábado.</p>
      <Mensajes error={a.error} aviso={a.aviso} />
    </Tarjeta>
  )
}
