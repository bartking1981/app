// Todas las fechas se manejan como texto 'AAAA-MM-DD' en la zona horaria de Hermosillo.
const ZONA = 'America/Hermosillo'

export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function aFecha(s: string): Date {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(s: string, n: number): string {
  const d = aFecha(s)
  d.setUTCDate(d.getUTCDate() + n)
  return aTexto(d)
}
/** 0 = domingo … 6 = sábado */
export const diaSemana = (s: string) => aFecha(s).getUTCDay()
/** Domingo que inicia la semana (semana de domingo a sábado) */
export const inicioSemana = (s: string) => sumarDias(s, -diaSemana(s))
export const inicioMes = (s: string) => s.slice(0, 8) + '01'
export function sumarMeses(s: string, n: number): string {
  const d = aFecha(inicioMes(s))
  d.setUTCMonth(d.getUTCMonth() + n)
  return aTexto(d)
}
export const esEntreSemana = (s: string) => diaSemana(s) >= 1 && diaSemana(s) <= 5

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fechaLarga(s: string): string {
  const d = aFecha(s)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}
export function fechaCorta(s: string): string {
  const d = aFecha(s)
  return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}
export function nombreMes(s: string): string {
  const d = aFecha(s)
  return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
export function rangoSemana(domingo: string): string {
  const a = aFecha(domingo), b = aFecha(sumarDias(domingo, 6))
  const ma = MESES[a.getUTCMonth()], mb = MESES[b.getUTCMonth()]
  return ma === mb ? `${a.getUTCDate()} al ${b.getUTCDate()} de ${mb}` : `${a.getUTCDate()} de ${ma} al ${b.getUTCDate()} de ${mb}`
}
