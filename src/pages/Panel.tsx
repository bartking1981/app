import { supabase, datos } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { useDatos } from '../lib/useDatos'
import { hoy, inicioMes, inicioSemana, sumarDias, diaSemana, fechaCorta, fechaLarga, nombreMes, esEntreSemana } from '../lib/fechas'
import { horas, NIVELES } from '../lib/formato'
import { Tarjeta, Cargando, Dato } from '../components/ui'
import { cargarResumenHoras } from './Horas'
import { puntosParaSiguiente } from './Semana'
import type { ResumenMes } from './Mes'

export default function Panel() {
  const { nino, nombreUsuario } = useSesion()
  const n = nino!.id
  const f = hoy()
  const dow = diaSemana(f)
  const semPasada = sumarDias(inicioSemana(f), -7)

  const { valor: d, cargando, error } = useDatos(async () => {
    const [hrs, mes, rep, ev, cal, cierre, inc, cons, prem] = await Promise.all([
      cargarResumenHoras(n, f),
      supabase.rpc('resumen_mes', { p_child: n, p_mes: inicioMes(f) }),
      supabase.from('school_reports').select('estado').eq('child_id', n).eq('dia', f).maybeSingle(),
      supabase.from('daily_evaluations').select('resultado').eq('child_id', n).eq('dia', f).maybeSingle(),
      supabase.from('calendar_days').select('tipo').eq('child_id', n).eq('dia', f).maybeSingle(),
      supabase.from('weekly_closures').select('id').eq('child_id', n).eq('semana', semPasada).maybeSingle(),
      supabase.from('incidents').select('dia, tipo, descripcion').eq('child_id', n).order('dia', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      supabase.from('weekend_consequences').select('descripcion').eq('child_id', n).eq('cumplida', false).limit(1),
      supabase.from('monthly_rewards').select('descripcion, estado').eq('child_id', n).eq('mes', inicioMes(sumarDias(inicioMes(f), -1))),
    ])
    return {
      hrs, mes: datos(mes) as ResumenMes,
      rep: datos(rep) as { estado: string } | null, ev: datos(ev), cal: datos(cal),
      cierrePasado: datos(cierre), inc: (datos(inc) ?? []) as { dia: string; tipo: string; descripcion: string }[],
      cons: (datos(cons) ?? []) as { descripcion: string }[],
      premPasado: (datos(prem) ?? []) as { descripcion: string; estado: string }[],
    }
  }, [n, f])

  if (!d) return cargando ? <Cargando /> : <p className="msg msg-error">{error}</p>
  const m = d.mes
  const faltan = puntosParaSiguiente(m)
  const pendientesHoy: string[] = []
  if (esEntreSemana(f) && !d.cal && (!d.rep || d.rep.estado === 'pendiente')) pendientesHoy.push('Semáforos de la escuela')
  if (!d.ev && (d.cal as { tipo?: string } | null)?.tipo !== 'enfermedad') pendientesHoy.push('Evaluación de casa')
  if (dow === 6) pendientesHoy.push('Catecismo y cierre de la semana (en la noche)')

  return (
    <>
      <p className="saludo">Hola{nombreUsuario ? ', ' + nombreUsuario : ''} · <span className="capital">{fechaLarga(f)}</span></p>

      <div className="accesos">
        <a className="btn btn-primario grande" href="#/hoy">Registrar hoy</a>
        <a className="btn grande" href="#/horas">Registrar tiempo jugado</a>
      </div>

      {d.cons.length > 0 && <Tarjeta tono="peligro" titulo="Consecuencia pendiente"><p>{d.cons[0].descripcion}</p><a href="#/horas">Marcar como cumplida →</a></Tarjeta>}
      {!d.cierrePasado && <Tarjeta tono="aviso"><p>La semana pasada no se ha cerrado. <a href={'#/semana?semana=' + semPasada}>Cerrarla →</a></p></Tarjeta>}

      <div className="rejilla">
        <Tarjeta titulo="Horas de videojuegos" tono={d.hrs.deuda > 0 ? 'peligro' : undefined}>
          <div className="saldo-grande">
            {d.hrs.deuda > 0 ? <span className="c-rojo">Debe {horas(d.hrs.deuda)}</span> : <span>{horas(d.hrs.utilizable)}</span>}
            <small>{d.hrs.deuda > 0 ? 'sin poder jugar' : 'disponibles'}</small>
          </div>
          <div className="datos">
            <Dato etiqueta="Ganadas" valor={horas(d.hrs.ganadas_mes)} tono="verde" />
            <Dato etiqueta="Jugadas" valor={horas(d.hrs.usadas_mes)} />
            <Dato etiqueta="Penalizadas" valor={horas(d.hrs.penalizadas_mes)} tono="rojo" />
          </div>
        </Tarjeta>

        <Tarjeta titulo={<span className="capital">Puntos de {nombreMes(f)}</span>}>
          <div className="porcentaje">
            <strong className="pct">{m.porcentaje != null ? `${m.porcentaje}%` : '—'}</strong>
            <span className={'etiqueta nivel-' + m.nivel}>{NIVELES[m.nivel]}</span>
          </div>
          {faltan && <p className="tenue">Faltan {faltan.puntos} {faltan.puntos === 1 ? 'punto' : 'puntos'} para {NIVELES[faltan.nivel].toLowerCase()}.</p>}
          <div className="datos">
            <Dato etiqueta="Positivos" valor={m.positivos ? '+' + m.positivos : '0'} tono="verde" />
            <Dato etiqueta="Negativos" valor={m.negativos ? '−' + m.negativos : '0'} tono="rojo" />
            <Dato etiqueta="Netos" valor={m.neto} />
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Pendientes">
        {pendientesHoy.length === 0 && m.pendientes_escuela.length === 0 && m.pendientes_casa.length === 0 && <p className="c-verde">✓ Todo al día.</p>}
        <ul className="lista">
          {pendientesHoy.map(p => <li key={p}><span>Hoy: {p}</span><a href="#/hoy">Registrar</a></li>)}
          {m.pendientes_escuela.filter(x => x !== f).length > 0 && <li><span>Reportes escolares de días anteriores: {m.pendientes_escuela.filter(x => x !== f).length}</span><a href="#/mes">Ver</a></li>}
          {m.pendientes_casa.filter(x => x !== f).length > 0 && <li><span>Evaluaciones de casa de días anteriores: {m.pendientes_casa.filter(x => x !== f).length}</span><a href="#/mes">Ver</a></li>}
        </ul>
        <p className="tenue">Los pendientes no cuentan en contra; solo quedan fuera del cálculo hasta que se registren.</p>
      </Tarjeta>

      <Tarjeta titulo="Incidencias recientes">
        {d.inc.length === 0 ? <p className="tenue">Sin incidencias.</p> :
          <ul className="lista">{d.inc.map((i, k) => <li key={k}><span>{fechaCorta(i.dia)} · <strong>{i.tipo === 'mesa' ? 'Mesa' : 'Rutina'}</strong> · {i.descripcion}</span></li>)}</ul>}
      </Tarjeta>

      {d.premPasado.length > 0 && (
        <Tarjeta titulo="Premio del mes pasado">
          {d.premPasado.map((p, k) => <p key={k}>{p.descripcion} · <strong className={p.estado === 'entregado' ? 'c-verde' : 'c-rojo'}>{p.estado === 'entregado' ? 'Entregado' : 'Pendiente de entregar'}</strong></p>)}
        </Tarjeta>
      )}
    </>
  )
}
