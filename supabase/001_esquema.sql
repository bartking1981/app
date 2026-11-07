-- =====================================================================
-- Mi Contrato de Responsabilidades — Base de datos (versión 1)
-- Ejecutar COMPLETO una sola vez en: Supabase > SQL Editor > New query
-- No contiene datos personales ni contraseñas.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Utilidades
-- ---------------------------------------------------------------------

-- Domingo de la semana a la que pertenece una fecha (semana domingo–sábado)
create or replace function public.inicio_semana(d date) returns date
language sql immutable as $$ select d - extract(dow from d)::int $$;

-- Fecha de hoy en Hermosillo
create or replace function public.hoy_hmo() returns date
language sql stable as $$ select (now() at time zone 'America/Hermosillo')::date $$;

create or replace function public.tg_actualizado() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Familia, usuarios y niño
-- ---------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,                       -- «Mamá» / «Papá»
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  apodo text not null,
  es_prueba boolean not null default false,   -- niño de prueba, separado de los datos reales
  created_at timestamptz not null default now()
);

-- ¿El usuario conectado pertenece a esta familia?
create or replace function public.es_miembro(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                  where household_id = p_household and user_id = auth.uid() and activo)
$$;

-- ¿El usuario conectado pertenece a la familia de este niño?
create or replace function public.puede_ver_nino(p_child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from children c
    join household_members m on m.household_id = c.household_id
    where c.id = p_child and m.user_id = auth.uid() and m.activo
  )
$$;

create or replace function public.exigir_acceso(p_child uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not puede_ver_nino(p_child) then
    raise exception 'Sin acceso a este registro' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Reglas configurables (con versiones)
-- ---------------------------------------------------------------------

create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  vigente_desde date not null,
  reglas jsonb not null,
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (child_id, vigente_desde)
);

-- Horas en MINUTOS. Combinaciones de semáforos: colores en orden alfabético unidos con «+».
create or replace function public.reglas_por_defecto() returns jsonb
language sql immutable as $$
  select '{
    "escuela": {
      "combinaciones": {
        "verde+verde": 2, "amarillo+verde": 0, "rojo+verde": -2,
        "amarillo+amarillo": -2, "amarillo+rojo": -2, "rojo+rojo": -2
      },
      "max_diario": 2
    },
    "casa": {"bien": 1, "mal": -1},
    "premios": {"normal": 60, "especial": 80, "extraordinario": 95},
    "horas": {
      "catecismo": {"bien": 120, "regular": 0, "mal": -180},
      "limpieza": {"veces": 2, "minutos": 60},
      "alimentacion": 120,
      "tareas": 120,
      "saludos": {"bien": 60, "mal": -60},
      "dientes": {"veces": 8, "minutos": 60},
      "mesa": -60,
      "rutina": -120,
      "limite_entre_semana": 180,
      "bloque_consumo": 15
    }
  }'::jsonb
$$;

create or replace function public.reglas(p_child uuid, p_dia date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select reglas from rule_sets
      where child_id = p_child and vigente_desde <= p_dia
      order by vigente_desde desc limit 1),
    reglas_por_defecto())
$$;

-- ---------------------------------------------------------------------
-- 4. Calendario y escuela
-- ---------------------------------------------------------------------

create table public.calendar_days (
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  tipo text not null check (tipo in ('festivo','vacaciones','enfermedad','viaje','otro')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  primary key (child_id, dia)
);

create table public.school_subjects (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.school_reports (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  estado text not null check (estado in ('recibido','no_enviado','pendiente','sin_clases')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  unique (child_id, dia)
);

create table public.school_report_grades (
  report_id uuid not null references public.school_reports(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  subject_id uuid not null references public.school_subjects(id),
  color text not null check (color in ('verde','amarillo','rojo')),
  primary key (report_id, subject_id)
);

-- ---------------------------------------------------------------------
-- 5. Casa, hábitos, visitas, catecismo e incidencias
-- ---------------------------------------------------------------------

create table public.daily_evaluations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  resultado text not null check (resultado in ('bien','mal')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  unique (child_id, dia)
);

create table public.daily_checks (
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  alimentacion text check (alimentacion in ('si','no','na')),
  tareas text check (tareas in ('si','no','na')),
  limpieza boolean not null default false,
  dientes smallint not null default 0 check (dientes between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  primary key (child_id, dia)
);

create table public.family_visits (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  familiar text not null,
  saludo_bien boolean not null,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid
);

create table public.catechism_results (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null check (extract(dow from dia) = 6),   -- solo sábados
  resultado text not null check (resultado in ('bien','regular','mal','no_aplica')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  unique (child_id, dia)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  tipo text not null check (tipo in ('mesa','rutina')),
  descripcion text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  check (not (tipo = 'rutina' and extract(dow from dia) = 0))   -- domingo no aplica
);
-- Rutina matutina: máximo una penalización por día
create unique index incidents_rutina_un_dia on public.incidents (child_id, dia) where tipo = 'rutina';

-- ---------------------------------------------------------------------
-- 6. Libro de horas de videojuegos (no se edita ni se borra)
-- ---------------------------------------------------------------------

create table public.videogame_transactions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  dia date not null,
  tipo text not null check (tipo in ('ganancia','consumo','penalizacion','correccion','deuda_saldada')),
  concepto text not null,
  minutos int not null check (minutos <> 0),
  clave_origen text,                 -- vincula el movimiento con el registro que lo generó
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.videogame_transactions (child_id, dia);
create index on public.videogame_transactions (child_id, clave_origen);

-- Deja el total de movimientos de un origen igual al objetivo, insertando solo la diferencia.
-- Así nunca se duplican horas al editar y todo queda trazable.
create or replace function public.sincronizar_movimiento(
  p_child uuid, p_dia date, p_clave text, p_objetivo int, p_concepto text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actual int;
  v_existe boolean;
begin
  select coalesce(sum(minutos), 0), count(*) > 0 into v_actual, v_existe
    from videogame_transactions where child_id = p_child and clave_origen = p_clave;
  if v_actual = p_objetivo then return; end if;
  insert into videogame_transactions (child_id, dia, tipo, concepto, minutos, clave_origen)
  values (
    p_child, p_dia,
    case when v_existe then 'correccion' when p_objetivo > 0 then 'ganancia' else 'penalizacion' end,
    case when v_existe then 'Corrección: ' || p_concepto else p_concepto end,
    p_objetivo - v_actual, p_clave);
end $$;

-- Saldo del mes (las horas caducan al terminar el mes: cada mes empieza en 0)
create or replace function public.saldo_mes(p_child uuid, p_dia date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(minutos), 0)::int from videogame_transactions
   where child_id = p_child
     and dia >= date_trunc('month', p_dia)::date
     and dia <  (date_trunc('month', p_dia) + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------
-- 7. Cierres, consecuencias y premios
-- ---------------------------------------------------------------------

create table public.weekly_closures (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  semana date not null check (extract(dow from semana) = 0),
  resultado jsonb not null,
  cerrado_at timestamptz not null default now(),
  cerrado_por uuid default auth.uid(),
  unique (child_id, semana)
);

create table public.weekend_consequences (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  semana date not null check (extract(dow from semana) = 0),
  deuda_minutos int not null,
  descripcion text not null,
  cumplida boolean not null default false,
  cumplida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid,
  unique (child_id, semana)
);

create table public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  resultado jsonb not null,
  cerrado_at timestamptz not null default now(),
  cerrado_por uuid default auth.uid(),
  unique (child_id, mes)
);

create table public.monthly_rewards (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  nivel text,
  descripcion text not null,
  presupuesto numeric(10,2),
  fecha_asignacion date,
  fecha_entrega date,
  estado text not null default 'pendiente' check (estado in ('pendiente','entregado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid
);

-- ---------------------------------------------------------------------
-- 8. Auditoría
-- ---------------------------------------------------------------------

create table public.audit_log (
  id bigserial primary key,
  tabla text not null,
  operacion text not null,
  child_id uuid,
  registro jsonb,
  anterior jsonb,
  usuario uuid,
  creado timestamptz not null default now()
);

create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  insert into audit_log (tabla, operacion, child_id, registro, anterior, usuario)
  values (tg_table_name, tg_op,
          coalesce(v_new->>'child_id', v_old->>'child_id')::uuid,
          v_new, v_old, auth.uid());
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 9. Meses cerrados no se editan
-- ---------------------------------------------------------------------

create or replace function public.mes_cerrado(p_child uuid, p_dia date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from monthly_closures
                  where child_id = p_child and mes = date_trunc('month', p_dia)::date)
$$;

create or replace function public.tg_bloquear_mes_cerrado() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  if mes_cerrado(r.child_id, r.dia) then
    raise exception 'El mes de % ya está cerrado. Reábrelo para hacer cambios.', to_char(r.dia, 'MM/YYYY');
  end if;
  if tg_op = 'UPDATE' and mes_cerrado(old.child_id, old.dia) then
    raise exception 'El mes de % ya está cerrado.', to_char(old.dia, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 10. Movimientos automáticos de horas
-- ---------------------------------------------------------------------

-- Catecismo: se aplica en cuanto se registra (sábado)
create or replace function public.tg_catecismo_horas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  v_min int := 0;
  v_txt text;
begin
  if tg_op <> 'DELETE' and new.resultado <> 'no_aplica' then
    v_min := coalesce((reglas(new.child_id, new.dia)->'horas'->'catecismo'->>new.resultado)::int, 0);
  end if;
  v_txt := 'Catecismo ' || to_char(r.dia, 'DD/MM') ||
           case when tg_op = 'DELETE' then ' (eliminado)' else ': ' || new.resultado end;
  perform sincronizar_movimiento(r.child_id, r.dia, 'catecismo:' || r.id, v_min, v_txt);
  return r;
end $$;

-- Incidencias de mesa (−1 h cada vez) y rutina matutina (−2 h por día)
create or replace function public.tg_incidencia_horas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  v_min int := 0;
  v_txt text;
begin
  if tg_op <> 'DELETE' then
    v_min := coalesce((reglas(new.child_id, new.dia)->'horas'->>new.tipo)::int, 0);
  end if;
  v_txt := case r.tipo when 'mesa' then 'Mesa' else 'Rutina matutina' end || ' ' ||
           to_char(r.dia, 'DD/MM') || case when tg_op = 'DELETE' then ' (eliminada)' else ': ' || new.descripcion end;
  perform sincronizar_movimiento(r.child_id, r.dia, 'incidente:' || r.id, v_min, v_txt);
  return r;
end $$;

-- Dientes: la hora se suma en cuanto llega a 8 en la semana
create or replace function public.tg_dientes_horas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  v_sem date := inicio_semana(r.dia);
  v_reg jsonb := reglas(r.child_id, r.dia)->'horas'->'dientes';
  v_total int;
begin
  select coalesce(sum(dientes), 0) into v_total from daily_checks
   where child_id = r.child_id and dia between v_sem and v_sem + 6;
  perform sincronizar_movimiento(
    r.child_id, r.dia, 'dientes:' || v_sem,
    case when v_total >= (v_reg->>'veces')::int then (v_reg->>'minutos')::int else 0 end,
    'Lavado de dientes semana del ' || to_char(v_sem, 'DD/MM') || ' (' || v_total || ' veces)');
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 11. Triggers
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['calendar_days','school_reports','daily_evaluations','daily_checks',
                           'family_visits','catechism_results','incidents',
                           'weekend_consequences','monthly_rewards'] loop
    execute format('create trigger actualizado before update on public.%I for each row execute function public.tg_actualizado()', t);
  end loop;

  foreach t in array array['calendar_days','school_reports','daily_evaluations','daily_checks',
                           'family_visits','catechism_results','incidents','weekend_consequences',
                           'weekly_closures','monthly_closures','monthly_rewards','rule_sets'] loop
    execute format('create trigger auditoria after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t);
  end loop;

  foreach t in array array['school_reports','daily_evaluations','daily_checks','family_visits',
                           'catechism_results','incidents','calendar_days'] loop
    execute format('create trigger mes_cerrado before insert or update or delete on public.%I for each row execute function public.tg_bloquear_mes_cerrado()', t);
  end loop;
end $$;

create trigger horas after insert or update or delete on public.catechism_results
  for each row execute function public.tg_catecismo_horas();
create trigger horas after insert or update or delete on public.incidents
  for each row execute function public.tg_incidencia_horas();
create trigger horas after insert or update of dientes or delete on public.daily_checks
  for each row execute function public.tg_dientes_horas();

-- ---------------------------------------------------------------------
-- 12. Funciones que usa la aplicación
-- ---------------------------------------------------------------------

-- Guardar reporte escolar con sus semáforos en una sola operación
-- p_colores: {"<subject_id>": "verde", ...}
create or replace function public.guardar_reporte_escolar(
  p_child uuid, p_dia date, p_estado text, p_colores jsonb, p_nota text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_faltan int;
begin
  perform exigir_acceso(p_child);
  if p_estado = 'recibido' then
    select count(*) into v_faltan from school_subjects s
     where s.child_id = p_child and s.activa
       and coalesce(p_colores->>s.id::text, '') not in ('verde','amarillo','rojo');
    if v_faltan > 0 then
      raise exception 'Falta capturar el semáforo de % clase(s).', v_faltan;
    end if;
  end if;

  insert into school_reports (child_id, dia, estado, nota)
  values (p_child, p_dia, p_estado, p_nota)
  on conflict (child_id, dia) do update set estado = excluded.estado, nota = excluded.nota
  returning id into v_id;

  delete from school_report_grades where report_id = v_id;
  if p_estado = 'recibido' then
    insert into school_report_grades (report_id, child_id, subject_id, color)
    select v_id, p_child, s.id, p_colores->>s.id::text
      from school_subjects s where s.child_id = p_child and s.activa;
  end if;
  return v_id;
end $$;

-- Puntos de un reporte escolar (null si no es evaluable o la combinación no tiene regla)
create or replace function public.puntos_reporte(p_report uuid) returns int
language sql stable security definer set search_path = public as $$
  select (reglas(r.child_id, r.dia)->'escuela'->'combinaciones'->>
          (select string_agg(g.color, '+' order by g.color)
             from school_report_grades g where g.report_id = r.id))::int
    from school_reports r
   where r.id = p_report and r.estado = 'recibido'
$$;

-- Días hábiles (lunes a viernes) sin marcar en el calendario
create or replace function public.es_dia_escolar(p_child uuid, p_dia date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_dia) between 1 and 5
     and not exists (select 1 from calendar_days where child_id = p_child and dia = p_dia)
$$;

-- Resumen de horas para el panel
create or replace function public.resumen_horas(p_child uuid, p_dia date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_saldo int;
  v_reg jsonb := reglas(p_child, p_dia)->'horas';
  v_usado_hoy int;
  v_ini date := date_trunc('month', p_dia)::date;
  v_fin date := (date_trunc('month', p_dia) + interval '1 month')::date - 1;
  r record;
begin
  perform exigir_acceso(p_child);
  v_saldo := saldo_mes(p_child, p_dia);
  select coalesce(-sum(minutos) filter (where tipo = 'consumo'), 0)
         - coalesce(sum(minutos) filter (where clave_origen like 'anula:%'), 0)
    into v_usado_hoy from videogame_transactions
   where child_id = p_child and dia = p_dia;
  select
    coalesce(sum(minutos) filter (where tipo = 'ganancia'), 0) as ganadas,
    coalesce(-sum(minutos) filter (where tipo = 'consumo'), 0) as usadas,
    coalesce(-sum(minutos) filter (where tipo = 'penalizacion'), 0) as penalizadas,
    coalesce(sum(minutos) filter (where tipo in ('correccion','deuda_saldada')), 0) as ajustes
    into r
    from videogame_transactions where child_id = p_child and dia between v_ini and v_fin;
  return jsonb_build_object(
    'saldo', v_saldo,
    'utilizable', greatest(v_saldo, 0),
    'deuda', greatest(-v_saldo, 0),
    'ganadas_mes', r.ganadas,
    'usadas_mes', r.usadas,
    'penalizadas_mes', r.penalizadas,
    'ajustes_mes', r.ajustes,
    'usado_hoy', v_usado_hoy,
    'limite_hoy', case when extract(isodow from p_dia) between 1 and 5
                       then (v_reg->>'limite_entre_semana')::int else null end,
    'bloque', (v_reg->>'bloque_consumo')::int,
    'caduca', v_fin
  );
end $$;

-- Registrar horas jugadas (valida saldo, bloque y límite entre semana)
create or replace function public.registrar_consumo(
  p_child uuid, p_dia date, p_minutos int, p_nota text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb := reglas(p_child, p_dia)->'horas';
  v_saldo int;
  v_usado int;
  v_lim int;
  v_id uuid;
begin
  perform exigir_acceso(p_child);
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  if p_minutos % (v_reg->>'bloque_consumo')::int <> 0 then
    raise exception 'Registra el tiempo en bloques de % minutos.', v_reg->>'bloque_consumo';
  end if;
  if p_dia > hoy_hmo() then
    raise exception 'No se puede registrar tiempo jugado en una fecha futura.';
  end if;
  -- Bloquea consumos simultáneos para no sobregirar
  perform pg_advisory_xact_lock(hashtext(p_child::text));
  v_saldo := saldo_mes(p_child, p_dia);
  if p_minutos > v_saldo then
    raise exception 'Saldo insuficiente: tiene % min disponibles.', greatest(v_saldo, 0);
  end if;
  if extract(isodow from p_dia) between 1 and 5 then
    v_lim := (v_reg->>'limite_entre_semana')::int;
    select coalesce(-sum(minutos), 0) into v_usado from videogame_transactions
     where child_id = p_child and dia = p_dia and tipo = 'consumo';
    -- Restar consumos anulados
    select v_usado - coalesce(sum(t.minutos), 0) into v_usado
      from videogame_transactions t
     where t.child_id = p_child and t.dia = p_dia and t.clave_origen like 'anula:%';
    if v_usado + p_minutos > v_lim then
      raise exception 'Entre semana el máximo es % min por día (ya lleva % min).', v_lim, v_usado;
    end if;
  end if;
  insert into videogame_transactions (child_id, dia, tipo, concepto, minutos)
  values (p_child, p_dia, 'consumo', coalesce(nullif(trim(p_nota), ''), 'Tiempo de videojuegos'), -p_minutos)
  returning id into v_id;
  return v_id;
end $$;

-- Anular un consumo capturado por error (crea un movimiento contrario)
create or replace function public.anular_consumo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from videogame_transactions where id = p_id;
  if not found then raise exception 'Movimiento no encontrado.'; end if;
  perform exigir_acceso(t.child_id);
  if t.tipo <> 'consumo' then raise exception 'Solo se pueden anular consumos.'; end if;
  if exists (select 1 from videogame_transactions where clave_origen = 'anula:' || p_id) then
    raise exception 'Este consumo ya fue anulado.';
  end if;
  insert into videogame_transactions (child_id, dia, tipo, concepto, minutos, clave_origen)
  values (t.child_id, t.dia, 'correccion', 'Anulación: ' || t.concepto, -t.minutos, 'anula:' || p_id);
end $$;

-- Resultado de una responsabilidad de «toda la semana» a partir de las marcas diarias
create or replace function public.evaluar_semana_diaria(p_valores text[]) returns text
language sql immutable as $$
  select case
    when 'no' = any(p_valores) then 'no_cumple'
    when exists (select 1 from unnest(p_valores) v where v is null) then 'pendiente'
    when not ('si' = any(p_valores)) then 'no_aplica'
    else 'cumple' end
$$;

-- Resumen de la semana (domingo a sábado) para revisar antes del cierre
create or replace function public.resumen_semana(p_child uuid, p_semana date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sem date := inicio_semana(p_semana);
  v_sab date := inicio_semana(p_semana) + 6;
  v_reg jsonb := reglas(p_child, inicio_semana(p_semana) + 6)->'horas';
  v_alim text[]; v_tar text[];
  v_limp int; v_dientes int;
  v_vis int; v_vis_mal int;
  v_cat text;
  r_alim text; r_tar text; r_sal text;
  m_limp int; m_alim int; m_tar int; m_sal int;
  v_inc jsonb;
  v_pend jsonb := '[]'::jsonb;
  v_dias date[];
begin
  perform exigir_acceso(p_child);
  -- días que cuentan: los 7, menos los marcados como enfermedad
  select array_agg(d::date order by d) into v_dias
    from generate_series(v_sem, v_sab, interval '1 day') d
   where not exists (select 1 from calendar_days c where c.child_id = p_child and c.dia = d::date and c.tipo = 'enfermedad');

  -- tareas: sábado y domingo sin marcar cuentan como «no aplica»
  select array_agg(c.alimentacion order by d),
         array_agg(case when c.tareas is null and extract(dow from d) in (0, 6) then 'na' else c.tareas end order by d)
    into v_alim, v_tar
    from unnest(v_dias) d left join daily_checks c on c.child_id = p_child and c.dia = d;
  select count(*) filter (where limpieza), coalesce(sum(dientes), 0) into v_limp, v_dientes
    from daily_checks where child_id = p_child and dia between v_sem and v_sab;
  select count(*), count(*) filter (where not saludo_bien) into v_vis, v_vis_mal
    from family_visits where child_id = p_child and dia between v_sem and v_sab;
  select resultado into v_cat from catechism_results where child_id = p_child and dia = v_sab;

  r_alim := evaluar_semana_diaria(coalesce(v_alim, '{}'));
  r_tar  := evaluar_semana_diaria(coalesce(v_tar, '{}'));
  r_sal  := case when v_vis = 0 then 'no_aplica' when v_vis_mal > 0 then 'no_cumple' else 'cumple' end;

  m_limp := case when v_limp >= (v_reg->'limpieza'->>'veces')::int then (v_reg->'limpieza'->>'minutos')::int else 0 end;
  m_alim := case when r_alim = 'cumple' then (v_reg->>'alimentacion')::int else 0 end;
  m_tar  := case when r_tar  = 'cumple' then (v_reg->>'tareas')::int else 0 end;
  m_sal  := case r_sal when 'cumple' then (v_reg->'saludos'->>'bien')::int
                       when 'no_cumple' then (v_reg->'saludos'->>'mal')::int else 0 end;

  if r_alim = 'pendiente' then v_pend := v_pend || '["Alimentación: faltan días por marcar"]'; end if;
  if r_tar  = 'pendiente' then v_pend := v_pend || '["Tareas: faltan días por marcar"]'; end if;
  if v_cat is null then v_pend := v_pend || '["Catecismo del sábado sin registrar"]'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'tipo', tipo, 'descripcion', descripcion) order by dia), '[]')
    into v_inc from incidents where child_id = p_child and dia between v_sem and v_sab;

  return jsonb_build_object(
    'semana', v_sem, 'sabado', v_sab,
    'cerrada', exists (select 1 from weekly_closures where child_id = p_child and semana = v_sem),
    'responsabilidades', jsonb_build_array(
      jsonb_build_object('clave','limpieza','nombre','Limpieza del cuarto',
        'detalle', v_limp || ' de ' || (v_reg->'limpieza'->>'veces') || ' veces',
        'resultado', case when m_limp > 0 then 'cumple' else 'sin_premio' end, 'minutos', m_limp),
      jsonb_build_object('clave','alimentacion','nombre','Alimentación','detalle', null,
        'resultado', r_alim, 'minutos', m_alim),
      jsonb_build_object('clave','tareas','nombre','Tareas escolares','detalle', null,
        'resultado', r_tar, 'minutos', m_tar),
      jsonb_build_object('clave','saludos','nombre','Saludos a familiares',
        'detalle', v_vis || ' visita(s), ' || v_vis_mal || ' sin saludar bien',
        'resultado', r_sal, 'minutos', m_sal)
    ),
    'informativo', jsonb_build_object(
      'dientes', v_dientes, 'dientes_meta', (v_reg->'dientes'->>'veces')::int,
      'catecismo', v_cat),
    'minutos_cierre', m_limp + m_alim + m_tar + m_sal,
    'incidencias', v_inc,
    'pendientes', v_pend
  );
end $$;

create or replace function public.cerrar_semana(p_child uuid, p_semana date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb := resumen_semana(p_child, p_semana);
  v_sab date := (v_res->>'sabado')::date;
  r jsonb;
begin
  if (v_res->>'cerrada')::boolean then raise exception 'La semana ya está cerrada.'; end if;
  if v_sab > hoy_hmo() then raise exception 'La semana todavía no termina.'; end if;
  insert into weekly_closures (child_id, semana, resultado) values (p_child, (v_res->>'semana')::date, v_res);
  for r in select * from jsonb_array_elements(v_res->'responsabilidades') loop
    perform sincronizar_movimiento(p_child, v_sab, 'semana:' || (v_res->>'semana') || ':' || (r->>'clave'),
      (r->>'minutos')::int, r->>'nombre' || ' — semana del ' || to_char((v_res->>'semana')::date, 'DD/MM'));
  end loop;
  return v_res;
end $$;

create or replace function public.reabrir_semana(p_child uuid, p_semana date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sem date := inicio_semana(p_semana);
  k text;
begin
  perform exigir_acceso(p_child);
  delete from weekly_closures where child_id = p_child and semana = v_sem;
  if not found then raise exception 'La semana no está cerrada.'; end if;
  foreach k in array array['limpieza','alimentacion','tareas','saludos'] loop
    perform sincronizar_movimiento(p_child, v_sem + 6, 'semana:' || v_sem || ':' || k, 0,
      'Reapertura de semana del ' || to_char(v_sem, 'DD/MM') || ' (' || k || ')');
  end loop;
end $$;

-- Consecuencia cumplida: la deuda se borra
create or replace function public.cumplir_consecuencia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_saldo int;
  v_hoy date := hoy_hmo();
begin
  select * into c from weekend_consequences where id = p_id;
  if not found then raise exception 'Consecuencia no encontrada.'; end if;
  perform exigir_acceso(c.child_id);
  if c.cumplida then raise exception 'Ya estaba marcada como cumplida.'; end if;
  perform set_config('app.cumplir', '1', true);
  update weekend_consequences set cumplida = true, cumplida_at = now() where id = p_id;
  perform set_config('app.cumplir', '', true);
  v_saldo := saldo_mes(c.child_id, v_hoy);
  if v_saldo < 0 then
    insert into videogame_transactions (child_id, dia, tipo, concepto, minutos, clave_origen)
    values (c.child_id, v_hoy, 'deuda_saldada', 'Deuda saldada con consecuencia: ' || c.descripcion,
            -v_saldo, 'consecuencia:' || p_id);
  end if;
end $$;

-- Resumen del mes: puntos, porcentaje y nivel de premio
create or replace function public.resumen_mes(p_child uuid, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date - 1;
  v_hasta date := least(v_fin, hoy_hmo());
  v_reg jsonb := reglas(p_child, (date_trunc('month', p_mes) + interval '1 month')::date - 1);
  e record; c record;
  v_max int; v_net int; v_pct numeric; v_nivel text;
  v_pend_esc jsonb; v_pend_casa jsonb;
begin
  perform exigir_acceso(p_child);

  select count(*) filter (where p is not null) as dias,
         count(*) filter (where p is null) as sin_regla,
         coalesce(sum(p), 0) as neto,
         coalesce(sum(p) filter (where p > 0), 0) as pos,
         coalesce(-sum(p) filter (where p < 0), 0) as neg,
         coalesce(sum((reglas(p_child, dia)->'escuela'->>'max_diario')::int) filter (where p is not null), 0) as maximo
    into e
    from (select r.dia, puntos_reporte(r.id) as p from school_reports r
           where r.child_id = p_child and r.dia between v_ini and v_fin and r.estado = 'recibido') x;

  select count(*) as dias,
         coalesce(sum(case resultado when 'bien' then (reglas(p_child, dia)->'casa'->>'bien')::int
                                     else (reglas(p_child, dia)->'casa'->>'mal')::int end), 0) as neto,
         count(*) filter (where resultado = 'bien') as buenos,
         count(*) filter (where resultado = 'mal') as malos,
         coalesce(sum((reglas(p_child, dia)->'casa'->>'bien')::int), 0) as maximo
    into c
    from daily_evaluations where child_id = p_child and dia between v_ini and v_fin;

  v_max := e.maximo + c.maximo;
  v_net := e.neto + c.neto;
  v_pct := case when v_max = 0 then null else greatest(0, least(100, v_net * 100.0 / v_max)) end;
  v_nivel := case
    when v_pct is null then 'sin_datos'
    when v_pct >= (v_reg->'premios'->>'extraordinario')::numeric then 'extraordinario'
    when v_pct >= (v_reg->'premios'->>'especial')::numeric then 'especial'
    when v_pct >= (v_reg->'premios'->>'normal')::numeric then 'normal'
    else 'sin_premio' end;

  -- Pendientes escolares: días hábiles hasta hoy sin reporte o con reporte pendiente
  select coalesce(jsonb_agg(d::date order by d), '[]') into v_pend_esc
    from generate_series(v_ini, v_hasta, interval '1 day') d
   where es_dia_escolar(p_child, d::date)
     and not exists (select 1 from school_reports r where r.child_id = p_child and r.dia = d::date and r.estado <> 'pendiente');

  -- Pendientes de casa: días hasta hoy sin evaluación (excepto enfermedad)
  select coalesce(jsonb_agg(d::date order by d), '[]') into v_pend_casa
    from generate_series(v_ini, v_hasta, interval '1 day') d
   where not exists (select 1 from daily_evaluations x where x.child_id = p_child and x.dia = d::date)
     and not exists (select 1 from calendar_days k where k.child_id = p_child and k.dia = d::date and k.tipo = 'enfermedad');

  return jsonb_build_object(
    'mes', v_ini,
    'cerrado', mes_cerrado(p_child, v_ini),
    'escuela', jsonb_build_object('dias', e.dias, 'neto', e.neto, 'positivos', e.pos, 'negativos', e.neg, 'sin_regla', e.sin_regla),
    'casa', jsonb_build_object('dias', c.dias, 'neto', c.neto, 'buenos', c.buenos, 'malos', c.malos),
    'positivos', e.pos + c.buenos * (v_reg->'casa'->>'bien')::int,
    'negativos', e.neg + c.malos * abs((v_reg->'casa'->>'mal')::int),
    'neto', v_net,
    'maximo', v_max,
    'porcentaje', round(v_pct, 1),
    'porcentaje_exacto', v_pct,
    'nivel', v_nivel,
    'umbrales', v_reg->'premios',
    'pendientes_escuela', v_pend_esc,
    'pendientes_casa', v_pend_casa
  );
end $$;

create or replace function public.cerrar_mes(p_child uuid, p_mes date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb := resumen_mes(p_child, p_mes);
  v_ini date := date_trunc('month', p_mes)::date;
begin
  if (v_res->>'cerrado')::boolean then raise exception 'El mes ya está cerrado.'; end if;
  if (v_ini + interval '1 month')::date > hoy_hmo() then raise exception 'El mes todavía no termina.'; end if;
  if jsonb_array_length(v_res->'pendientes_escuela') > 0 then
    raise exception 'Hay % día(s) con reporte escolar pendiente. Márcalos como recibidos o no enviados.',
      jsonb_array_length(v_res->'pendientes_escuela');
  end if;
  insert into monthly_closures (child_id, mes, resultado)
  values (p_child, v_ini, v_res || jsonb_build_object('reglas', reglas(p_child, (v_ini + interval '1 month')::date - 1)));
  return v_res;
end $$;

create or replace function public.reabrir_mes(p_child uuid, p_mes date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_acceso(p_child);
  delete from monthly_closures where child_id = p_child and mes = date_trunc('month', p_mes)::date;
  if not found then raise exception 'El mes no está cerrado.'; end if;
end $$;

-- Alta de un niño con clases y reglas iniciales (solo desde el script de configuración)
create or replace function public.crear_nino(p_household uuid, p_apodo text, p_prueba boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into children (household_id, apodo, es_prueba) values (p_household, p_apodo, p_prueba) returning id into v_id;
  insert into school_subjects (child_id, nombre, orden) values (v_id, 'Inglés', 1), (v_id, 'Español', 2);
  insert into rule_sets (child_id, vigente_desde, reglas, nota)
  values (v_id, date '2000-01-01', reglas_por_defecto(), 'Reglas iniciales del contrato (v2.1)');
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 13. Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

-- Solo las tablas de esta app (no toca tablas de otros proyectos en el mismo Supabase)
do $$
declare t text;
begin
  foreach t in array array['households','household_members','children','rule_sets','calendar_days',
    'school_subjects','school_reports','school_report_grades','daily_evaluations','daily_checks',
    'family_visits','catechism_results','incidents','videogame_transactions','weekly_closures',
    'weekend_consequences','monthly_closures','monthly_rewards','audit_log'] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
  revoke all on sequence public.audit_log_id_seq from anon;
end $$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.children enable row level security;
alter table public.audit_log enable row level security;

create policy familia on public.households for select to authenticated
  using (public.es_miembro(id));
create policy familia on public.household_members for select to authenticated
  using (public.es_miembro(household_id));
create policy familia on public.children for select to authenticated
  using (public.es_miembro(household_id));
create policy familia on public.audit_log for select to authenticated
  using (child_id is not null and public.puede_ver_nino(child_id));

-- Tablas que los padres capturan directamente
do $$
declare t text;
begin
  foreach t in array array['rule_sets','calendar_days','school_subjects','daily_evaluations','daily_checks',
                           'family_visits','catechism_results','incidents','weekend_consequences','monthly_rewards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy familia on public.%I for all to authenticated using (public.puede_ver_nino(child_id)) with check (public.puede_ver_nino(child_id))', t);
  end loop;
  -- Tablas que solo se leen; se escriben a través de funciones
  foreach t in array array['school_reports','school_report_grades','videogame_transactions',
                           'weekly_closures','monthly_closures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy familia on public.%I for select to authenticated using (public.puede_ver_nino(child_id))', t);
  end loop;
end $$;

-- La consecuencia solo se marca cumplida con la función (que salda la deuda)
create or replace function public.tg_proteger_cumplida() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.cumplir', true), '') <> '1' and
     (new.cumplida or new.cumplida_at is not null) and
     (tg_op = 'INSERT' or new.cumplida is distinct from old.cumplida or new.cumplida_at is distinct from old.cumplida_at) then
    raise exception 'Usa «Marcar como cumplida» para registrar que se cumplió la consecuencia.';
  end if;
  return new;
end $$;
create trigger proteger_cumplida before insert or update on public.weekend_consequences
  for each row execute function public.tg_proteger_cumplida();

-- Funciones internas: nadie las llama directamente
revoke execute on function public.sincronizar_movimiento(uuid, date, text, int, text) from public, anon, authenticated;
revoke execute on function public.crear_nino(uuid, text, boolean) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['saldo_mes(uuid,date)', 'reglas(uuid,date)', 'puntos_reporte(uuid)',
                           'es_dia_escolar(uuid,date)', 'mes_cerrado(uuid,date)', 'exigir_acceso(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- Funciones públicas: solo usuarios con sesión (cada una valida acceso a la familia)
do $$
declare f text;
begin
  foreach f in array array[
    'guardar_reporte_escolar(uuid,date,text,jsonb,text)',
    'resumen_horas(uuid,date)', 'registrar_consumo(uuid,date,int,text)', 'anular_consumo(uuid)',
    'resumen_semana(uuid,date)', 'cerrar_semana(uuid,date)', 'reabrir_semana(uuid,date)',
    'cumplir_consecuencia(uuid)', 'resumen_mes(uuid,date)', 'cerrar_mes(uuid,date)', 'reabrir_mes(uuid,date)',
    'puede_ver_nino(uuid)', 'es_miembro(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Fin del esquema
