# Mi Contrato de Responsabilidades — Guía de instalación local

Sigue los pasos en orden. Tiempo aproximado: 20 minutos.

> **Regla de oro:** nunca compartas ni subas a GitHub la llave `service_role` ni el archivo `.env.local`.

---

## Parte 1 — Preparar Supabase (una sola vez)

Entra a https://supabase.com, abre tu proyecto (`dxshzqfbbzfpoqmyjxub`).

> **Si tu Supabase ya tiene otro proyecto o usuarios:** la configuración de *Authentication* es compartida. Antes de desactivar el registro público, confirma que tu otro proyecto no dependa de que la gente se registre sola. Los usuarios de otros proyectos **no** pueden ver datos de esta app.

### 1.1 Cerrar el registro público

1. Menú izquierdo: **Authentication** → **Sign In / Providers** (en algunas versiones: *Authentication → Settings*).
2. Desactiva **Allow new users to sign up** y guarda.
3. En **Email**, si existe la opción **Minimum password length**, ponla en **12**.

Así nadie más puede crear cuentas.

### 1.2 Crear los usuarios de mamá y papá

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe el correo y una contraseña de al menos 12 caracteres.
3. Marca **Auto Confirm User**.
4. Repite para el segundo usuario.

### 1.3 Crear la base de datos

1. Menú izquierdo: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/001_esquema.sql` con el Bloc de notas, copia **todo** y pégalo.
3. Presiona **Run**. Debe decir *Success*.
   - Si aparece un error que diga **already exists**, **detente** y avísame: significa que tu proyecto ya tiene tablas con esos nombres.
4. Nueva consulta (**New query**). Abre `supabase/002_configuracion_inicial.sql`, cambia los 3 valores marcados con `<<< CAMBIAR` (correo de mamá, correo de papá y el apodo del niño), pega y presiona **Run**.

### 1.4 Dirección para recuperar contraseña

**Authentication** → **URL Configuration** → **Redirect URLs** → **Add URL**: `http://localhost:5173`

**No cambies el Site URL** si ya lo usa tu otro proyecto.

---

## Parte 2 — Instalar y abrir la app en tu computadora

### 2.1 Abrir la terminal en la carpeta

1. Abre la carpeta `app` en el Explorador de Windows.
2. Haz clic en la barra de dirección, escribe `cmd` y presiona **Enter**. Se abre una ventana negra ya ubicada en la carpeta.

> Usa esta ventana (`cmd`). En PowerShell a veces aparece el error *"la ejecución de scripts está deshabilitada"*.

### 2.2 Crear el archivo con la llave pública

En la ventana escribe:

```
copy .env.example .env.local
notepad .env.local
```

En el Bloc de notas reemplaza `pega-aqui-tu-llave-publica` por tu llave **anon** (o *publishable*). La encuentras en Supabase → **Project Settings** → **API** (o *API Keys*). Guarda y cierra.

### 2.3 Instalar y arrancar

```
npm install
npm run dev
```

- `npm install` descarga las librerías (solo la primera vez; tarda 1–2 minutos).
- `npm run dev` abre la app en el navegador en **http://localhost:5173**.
- Para detenerla: en la ventana negra presiona **Ctrl + C**.
- La próxima vez solo necesitas `npm run dev`.

> **Nota:** la carpeta está en OneDrive. `npm install` crea una carpeta `node_modules` grande que OneDrive intentará sincronizar. No pasa nada, pero si notas lentitud puedes pausar la sincronización mientras instalas.

### 2.4 Probar

1. Entra con el correo y contraseña de mamá o papá.
2. Arriba, en el selector, elige **Perfil de prueba** para practicar sin afectar los datos reales (aparece una franja amarilla).
3. Cuando estés listo, cambia al perfil con el apodo de tu hijo.

---

## Qué incluye esta primera versión

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Saldo de horas, porcentaje del mes, pendientes, incidencias y avisos (consecuencia, semana sin cerrar). |
| **Registrar** | Todo el día en una pantalla: tipo de día, semáforos de Inglés y Español, casa, catecismo (sábados), alimentación, tareas, limpieza, dientes, incidencias y visitas. Se puede navegar a días anteriores. |
| **Horas** | Saldo, registrar tiempo jugado (límite de 3 h entre semana, sugerencia del sábado), consecuencia de fin de semana y movimientos del mes. |
| **Semana** | Resultado de cada responsabilidad, cerrar / reabrir semana y **resumen para el niño** (imprimir o guardar PDF). |
| **Mes** | Porcentaje, nivel de premio, puntos que faltan, pendientes, cerrar / reabrir mes y premio asignado. |

Seguridad incluida: acceso solo con usuario y contraseña, datos protegidos por familia (RLS), cierre de sesión tras 30 minutos sin uso, registro de quién hizo cada cambio, meses cerrados bloqueados.

### Siguiente etapa

- Historial con filtros y exportación a Excel.
- Configuración de reglas desde la app y manual de reglas para imprimir generado por la app.
- Publicar en GitHub Pages.

---

## Estructura de archivos

```
app/
├─ supabase/            Scripts SQL para Supabase (ejecutar en orden)
├─ pruebas/             Pruebas automáticas de la base de datos
├─ src/                 Código de la app
│  ├─ pages/            Pantallas
│  ├─ lib/              Conexión, fechas, sesión
│  └─ components/       Botones y tarjetas
├─ .env.example         Plantilla de configuración (sí se sube a GitHub)
├─ .env.local           Tu llave pública (NO se sube; lo creas tú)
└─ package.json         Lista de librerías
```
