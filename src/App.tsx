import { ProveedorSesion, useSesion } from './lib/sesion'
import { useRuta } from './lib/ruta'
import { faltaConfiguracion } from './lib/supabase'
import Login, { CambiarClave } from './pages/Login'
import Panel from './pages/Panel'
import Hoy from './pages/Hoy'
import Horas from './pages/Horas'
import Semana from './pages/Semana'
import Mes from './pages/Mes'
import { Cargando } from './components/ui'

const MENU = [
  { pagina: 'inicio', texto: 'Inicio', icono: '⌂' },
  { pagina: 'hoy', texto: 'Registrar', icono: '✎' },
  { pagina: 'horas', texto: 'Horas', icono: '◷' },
  { pagina: 'semana', texto: 'Semana', icono: '▦' },
  { pagina: 'mes', texto: 'Mes', icono: '★' },
]

function Contenido() {
  const { sesion, cargando, ninos, nino, elegirNino, salir, nombreUsuario, recuperando, terminarRecuperacion } = useSesion()
  const ruta = useRuta()

  if (faltaConfiguracion) return (
    <main className="centro"><div className="tarjeta tarjeta-peligro">
      <h2>Falta configurar la conexión</h2>
      <p>Crea el archivo <code>.env.local</code> con la dirección y la llave pública de Supabase (ver <code>LEEME.md</code>) y vuelve a iniciar la app.</p>
    </div></main>
  )
  if (cargando) return <main className="centro"><Cargando /></main>
  if (!sesion) return <Login />
  if (recuperando) return <CambiarClave alTerminar={terminarRecuperacion} />
  if (!nino) return (
    <main className="centro"><div className="tarjeta tarjeta-aviso">
      <h2>Tu usuario todavía no está asignado a la familia</h2>
      <p>Ejecuta el script <code>002_configuracion_inicial.sql</code> en Supabase con tu correo y vuelve a entrar.</p>
      <button className="btn" onClick={salir}>Cerrar sesión</button>
    </div></main>
  )

  const Pagina = { inicio: Panel, hoy: Hoy, horas: Horas, semana: Semana, mes: Mes }[ruta.pagina] ?? Panel

  return (
    <div className={'app' + (nino.es_prueba ? ' modo-prueba' : '')}>
      <header className="barra no-imprimir">
        <a href="#/inicio" className="marca">Mi Contrato</a>
        {ninos.length > 1 && (
          <select aria-label="Perfil" value={nino.id} onChange={e => elegirNino(e.target.value)} className="selector-nino">
            {ninos.map(n => <option key={n.id} value={n.id}>{n.es_prueba ? 'Perfil de prueba' : n.apodo}</option>)}
          </select>
        )}
        <button className="btn-texto" onClick={() => { if (confirm('¿Cerrar sesión?')) salir() }} title={nombreUsuario}>Salir</button>
      </header>
      {nino.es_prueba && <div className="banda-prueba no-imprimir">Estás en el PERFIL DE PRUEBA. Nada de esto cuenta para los datos reales.</div>}
      <main className="contenido"><Pagina key={nino.id} params={ruta.params} /></main>
      <nav className="menu no-imprimir" aria-label="Menú principal">
        {MENU.map(m => (
          <a key={m.pagina} href={'#/' + m.pagina} className={ruta.pagina === m.pagina || (m.pagina === 'inicio' && !MENU.some(x => x.pagina === ruta.pagina)) ? 'activo' : ''}
            aria-current={ruta.pagina === m.pagina ? 'page' : undefined}>
            <span aria-hidden="true">{m.icono}</span>{m.texto}
          </a>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return <ProveedorSesion><Contenido /></ProveedorSesion>
}
