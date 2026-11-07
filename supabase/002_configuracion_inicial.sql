-- =====================================================================
-- Mi Contrato de Responsabilidades — Configuración inicial
-- Ejecutar UNA sola vez, DESPUÉS de 001_esquema.sql y DESPUÉS de crear
-- los dos usuarios (mamá y papá) en Supabase > Authentication > Users.
--
-- ANTES DE EJECUTAR: cambia los 3 valores marcados con  <<< CAMBIAR
-- =====================================================================

do $$
declare
  v_correo_mama text := 'mama@carlitos.org';   -- <<< CAMBIAR
  v_correo_papa text := 'papa@carlitos.org';   -- <<< CAMBIAR
  v_apodo       text := 'Carlitos';               -- <<< CAMBIAR (solo apodo, sin apellidos)
  v_mama uuid;
  v_papa uuid;
  v_casa uuid;
begin
  select id into v_mama from auth.users where lower(email) = lower(v_correo_mama);
  if v_mama is null then raise exception 'No existe un usuario con el correo %', v_correo_mama; end if;
  select id into v_papa from auth.users where lower(email) = lower(v_correo_papa);
  if v_papa is null then raise exception 'No existe un usuario con el correo %', v_correo_papa; end if;

  if exists (select 1 from public.households) then
    raise exception 'La configuración inicial ya se había ejecutado.';
  end if;

  insert into public.households (nombre) values ('Familia') returning id into v_casa;
  insert into public.household_members (household_id, user_id, nombre)
  values (v_casa, v_mama, 'Mamá'), (v_casa, v_papa, 'Papá');

  perform public.crear_nino(v_casa, v_apodo, false);     -- datos reales
  perform public.crear_nino(v_casa, 'Prueba', true);     -- para practicar sin afectar los datos reales

  raise notice 'Listo: familia creada con 2 usuarios, el niño y un perfil de prueba.';
end $$;
