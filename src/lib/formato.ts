/** 90 → "1 h 30 min"; -60 → "−1 h" */
export function horas(minutos: number, conSigno = false): string {
  const signo = minutos < 0 ? '−' : conSigno && minutos > 0 ? '+' : ''
  const m = Math.abs(minutos)
  const h = Math.floor(m / 60), r = m % 60
  const txt = h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`
  return m === 0 ? '0 h' : signo + txt
}

export const NIVELES: Record<string, string> = {
  extraordinario: 'Premio extraordinario',
  especial: 'Premio especial',
  normal: 'Premio normal',
  sin_premio: 'Sin premio',
  sin_datos: 'Sin datos todavía',
}

export const RESULTADOS: Record<string, string> = {
  cumple: 'Cumple', no_cumple: 'No cumple', no_aplica: 'No aplica', pendiente: 'Pendiente', sin_premio: 'Sin premio',
}

export const TIPOS_MOV: Record<string, string> = {
  ganancia: 'Ganancia', consumo: 'Jugó', penalizacion: 'Penalización', correccion: 'Corrección', deuda_saldada: 'Deuda saldada',
}
