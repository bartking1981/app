import { useState, type FormEvent } from 'react'
import { supabase, mensajeError } from '../lib/supabase'

export default function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    if (error) setError(mensajeError(error))
    setOcupado(false)
  }

  async function olvide() {
    if (!correo.trim()) { setError('Escribe tu correo y vuelve a presionar «Olvidé mi contraseña».'); return }
    setOcupado(true); setError(null)
    await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: window.location.origin + window.location.pathname })
    // Mismo mensaje exista o no el correo, para no revelar cuentas
    setAviso('Si el correo está registrado, te llegará un enlace para cambiar la contraseña.')
    setOcupado(false)
  }

  return (
    <main className="centro">
      <form className="tarjeta login" onSubmit={entrar}>
        <div className="login-logo" aria-hidden="true"><i className="l-r" /><i className="l-a" /><i className="l-v" /></div>
        <h1>Mi Contrato de Responsabilidades</h1>
        <p className="tenue">Acceso solo para mamá y papá.</p>
        <label>Correo
          <input type="email" autoComplete="username" required value={correo} onChange={e => setCorreo(e.target.value)} />
        </label>
        <label>Contraseña
          <input type="password" autoComplete="current-password" required value={clave} onChange={e => setClave(e.target.value)} />
        </label>
        {error && <p className="msg msg-error" role="alert">{error}</p>}
        {aviso && <p className="msg msg-ok" role="status">{aviso}</p>}
        <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn-texto" onClick={olvide} disabled={ocupado}>Olvidé mi contraseña</button>
      </form>
    </main>
  )
}

/** Se muestra al abrir el enlace de «Olvidé mi contraseña». */
export function CambiarClave({ alTerminar }: { alTerminar: () => void }) {
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (clave.length < 12) { setError('La contraseña debe tener al menos 12 caracteres.'); return }
    if (clave !== clave2) { setError('Las contraseñas no coinciden.'); return }
    setOcupado(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setOcupado(false)
    if (error) setError(mensajeError(error)); else alTerminar()
  }

  return (
    <main className="centro">
      <form className="tarjeta login" onSubmit={guardar}>
        <h1>Nueva contraseña</h1>
        <p className="tenue">Mínimo 12 caracteres.</p>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" required value={clave} onChange={e => setClave(e.target.value)} /></label>
        <label>Repítela<input type="password" autoComplete="new-password" required value={clave2} onChange={e => setClave2(e.target.value)} /></label>
        {error && <p className="msg msg-error" role="alert">{error}</p>}
        <button className="btn btn-primario" disabled={ocupado}>Guardar contraseña</button>
      </form>
    </main>
  )
}
