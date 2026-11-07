\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

create temp table ctx as select (select id from children where not es_prueba) as n, (select id from children where es_prueba) as p;
grant all on ctx to authenticated;

do $$
declare n uuid := (select n from ctx); p uuid := (select p from ctx);
  s int; ok boolean; j jsonb; ing uuid; esp uuid; i int; d date;
begin
  -- 1) Visibilidad
  assert (select count(*) from children) = 2, 'mamá ve 2 niños';

  -- 2) Catecismo (sábado 3 oct 2026)
  insert into catechism_results(child_id,dia,resultado) values (n,'2026-10-03','bien');
  assert (resumen_horas(n,'2026-10-03')->>'saldo')::int = 120, 'catecismo bien +2h';
  update catechism_results set resultado='mal' where child_id=n and dia='2026-10-03';
  assert (resumen_horas(n,'2026-10-03')->>'saldo')::int = -180, 'catecismo mal -3h tras corrección';
  assert (select count(*) from videogame_transactions where child_id=n) = 2, 'una corrección, no duplicado';
  update catechism_results set resultado='regular' where child_id=n and dia='2026-10-03';
  assert (resumen_horas(n,'2026-10-03')->>'saldo')::int = 0, 'regular 0';
  ok := false; begin insert into catechism_results(child_id,dia,resultado) values (n,'2026-10-05','bien'); exception when check_violation then ok := true; end;
  assert ok, 'catecismo solo sábado';

  -- 3) Incidencias
  insert into incidents(child_id,dia,tipo,descripcion) values (n,'2026-10-05','mesa','codos'),(n,'2026-10-05','mesa','parado'),(n,'2026-10-05','rutina','no se vestía');
  assert (resumen_horas(n,'2026-10-05')->>'saldo')::int = -240, 'mesa x2 + rutina = -4h';
  ok := false; begin insert into incidents(child_id,dia,tipo,descripcion) values (n,'2026-10-05','rutina','otra'); exception when unique_violation then ok := true; end;
  assert ok, 'rutina una por día';
  ok := false; begin insert into incidents(child_id,dia,tipo,descripcion) values (n,'2026-10-04','rutina','domingo'); exception when check_violation then ok := true; end;
  assert ok, 'rutina no en domingo';
  delete from incidents where child_id=n and descripcion='parado';
  assert (resumen_horas(n,'2026-10-05')->>'saldo')::int = -180, 'borrar incidencia revierte';

  -- 4) Dientes semana 4–10 oct
  insert into daily_checks(child_id,dia,dientes) values (n,'2026-10-04',3),(n,'2026-10-05',3);
  assert (resumen_horas(n,'2026-10-05')->>'saldo')::int = -180, '6 veces aún no';
  insert into daily_checks(child_id,dia,dientes) values (n,'2026-10-06',2);
  assert (resumen_horas(n,'2026-10-06')->>'saldo')::int = -120, 'al llegar a 8: +1h';
  update daily_checks set dientes = 3 where child_id=n and dia='2026-10-06';
  assert (resumen_horas(n,'2026-10-06')->>'saldo')::int = -120, 'pasar de 8 no suma otra';
  update daily_checks set dientes = 1 where child_id=n and dia='2026-10-06';
  assert (resumen_horas(n,'2026-10-06')->>'saldo')::int = -180, 'bajar de 8 revierte';
  update daily_checks set dientes = 2 where child_id=n and dia='2026-10-06';

  -- 5) Consumo con deuda
  ok := false; begin perform registrar_consumo(n,'2026-10-06',15,null); exception when others then ok := sqlerrm like 'Saldo insuficiente%'; end;
  assert ok, 'sin saldo no juega';

  -- 6) Semana completa y cierre: limpieza 2, alimentación toda la semana, tareas L-V, 1 visita bien
  for i in 0..6 loop
    d := date '2026-10-04' + i;
    insert into daily_checks(child_id,dia,alimentacion,tareas,limpieza) values (n,d,'si',case when i between 1 and 5 then 'si' end, i in (2,4))
    on conflict (child_id,dia) do update set alimentacion=excluded.alimentacion, tareas=excluded.tareas, limpieza=excluded.limpieza;
  end loop;
  insert into family_visits(child_id,dia,familiar,saludo_bien) values (n,'2026-10-07','Abuela',true);
  insert into catechism_results(child_id,dia,resultado) values (n,'2026-10-10','bien');
  j := resumen_semana(n,'2026-10-07');
  assert (j->>'minutos_cierre')::int = 60+120+120+60, 'cierre 6h: ' || (j->>'minutos_cierre');
  assert jsonb_array_length(j->'pendientes') = 0, 'sin pendientes';
  s := (resumen_horas(n,'2026-10-10')->>'saldo')::int;
  j := cerrar_semana(n,'2026-10-04');
  assert (resumen_horas(n,'2026-10-10')->>'saldo')::int = s + 360, 'cierre suma 6h';
  perform reabrir_semana(n,'2026-10-04');
  assert (resumen_horas(n,'2026-10-10')->>'saldo')::int = s, 'reabrir revierte';
  j := cerrar_semana(n,'2026-10-04');
  assert (resumen_horas(n,'2026-10-10')->>'saldo')::int = s + 360, 'volver a cerrar no duplica';

  -- 7) Consumo y límite entre semana (lunes 12 oct)
  perform registrar_consumo(n,'2026-10-12',120,'Minecraft');
  ok := false; begin perform registrar_consumo(n,'2026-10-12',90,null); exception when others then ok := sqlerrm like 'Entre semana%'; end;
  assert ok, 'límite 3h entre semana';
  perform registrar_consumo(n,'2026-10-12',60,null);
  ok := false; begin perform registrar_consumo(n,'2026-10-12',10,null); exception when others then ok := sqlerrm like '%bloques%'; end;
  assert ok, 'bloques de 15';

  -- 8) Deuda y consecuencia
  insert into incidents(child_id,dia,tipo,descripcion) values (n,'2026-10-13','rutina','x'),(n,'2026-10-14','rutina','x'),(n,'2026-10-15','rutina','x'),(n,'2026-10-16','rutina','x');
  s := (resumen_horas(n,'2026-10-17')->>'saldo')::int;
  assert s < 0, 'queda en deuda: ' || s;
  insert into weekend_consequences(child_id,semana,deuda_minutos,descripcion) values (n,'2026-10-11',-s,'Sin salida al parque');
  ok := false; begin update weekend_consequences set cumplida=true where child_id=n; exception when others then ok := true; end;
  assert ok, 'no se marca cumplida directo';
  perform cumplir_consecuencia((select id from weekend_consequences where child_id=n));
  -- la deuda se salda con fecha de hoy (noviembre), así que revisamos el saldo de hoy
  assert (resumen_horas(n, hoy_hmo())->>'saldo')::int >= 0, 'deuda saldada';

  -- 9) Horas caducan: noviembre empieza en 0 (sin contar el saldo de deuda)
  assert (resumen_horas(n,'2026-09-15')->>'saldo')::int = 0, 'otro mes en 0';
end $$;

-- 10) Ejemplos del mes (perfil Prueba, septiembre 2026)
do $$
declare p uuid := (select p from ctx); ing uuid; esp uuid; d date; k int := 0; c1 text; c2 text; j jsonb; nb int;
begin
  select id into ing from school_subjects where child_id=p and nombre='Inglés';
  select id into esp from school_subjects where child_id=p and nombre='Español';
  -- Caso B: 14 VV, 4 VA, 2 AA ; 2 días hábiles no enviados ; casa 26 bien 4 mal
  for d in select g::date from generate_series(date '2026-09-01', date '2026-09-30', interval '1 day') g loop
    if extract(isodow from d) between 1 and 5 then
      k := k + 1;
      if k <= 14 then c1:='verde'; c2:='verde'; elsif k <= 18 then c1:='verde'; c2:='amarillo'; elsif k <= 20 then c1:='amarillo'; c2:='amarillo'; else c1:=null; end if;
      if c1 is null then perform guardar_reporte_escolar(p,d,'no_enviado',null,null);
      else perform guardar_reporte_escolar(p,d,'recibido',jsonb_build_object(ing::text,c1,esp::text,c2),null); end if;
    end if;
    insert into daily_evaluations(child_id,dia,resultado) values (p,d,case when extract(day from d) <= 26 then 'bien' else 'mal' end);
  end loop;
  j := resumen_mes(p,'2026-09-01');
  raise notice 'Caso B: %', j - 'pendientes_escuela' - 'pendientes_casa' - 'umbrales';
  assert (j->>'maximo')::int = 70 and (j->>'neto')::int = 46, 'B neto 46/70';
  assert j->>'nivel' = 'normal', 'B premio normal';
  -- Verde+Rojo = -2
  perform guardar_reporte_escolar(p,'2026-09-01','recibido',jsonb_build_object(ing::text,'rojo',esp::text,'verde'),null);
  j := resumen_mes(p,'2026-09-01');
  assert (j->>'neto')::int = 42, 'VR -2 (46-4=42): ' || (j->>'neto');
  -- falta un semáforo
  begin perform guardar_reporte_escolar(p,'2026-09-02','recibido',jsonb_build_object(ing::text,'verde'),null); assert false, 'debió fallar';
  exception when others then if sqlerrm not like 'Falta%' then raise; end if; end;
  -- cerrar mes y bloquear edición
  j := cerrar_mes(p,'2026-09-01');
  begin update daily_evaluations set resultado='bien' where child_id=p and dia='2026-09-30'; assert false, 'debió bloquear';
  exception when others then if sqlerrm not like '%cerrado%' then raise; end if; end;
  perform reabrir_mes(p,'2026-09-01');
  update daily_evaluations set resultado='bien' where child_id=p and dia='2026-09-30';
  -- pendiente escolar impide cierre
  perform guardar_reporte_escolar(p,'2026-09-03','pendiente',null,null);
  begin perform cerrar_mes(p,'2026-09-01'); assert false, 'debió impedir';
  exception when others then if sqlerrm not like 'Hay 1 día%' then raise; end if; end;
  raise notice 'PRUEBAS DEL MES OK';
end $$;

-- 11) Seguridad: otro usuario no ve nada ni puede escribir
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999', false);
do $$
declare ok boolean := false;
begin
  assert (select count(*) from children) = 0, 'extraño no ve niños';
  assert (select count(*) from videogame_transactions) = 0, 'extraño no ve horas';
  assert (select count(*) from audit_log) = 0, 'extraño no ve auditoría';
  begin perform resumen_mes((select p from ctx),'2026-09-01'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'extraño no puede llamar funciones';
  ok := false;
  begin insert into daily_evaluations(child_id,dia,resultado) values ((select p from ctx),'2026-08-01','bien'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'extraño no puede insertar';
  ok := false;
  begin perform sincronizar_movimiento((select p from ctx),'2026-08-01','x',999,'hack'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'función interna bloqueada';
end $$;
reset role;
set role anon;
do $$ declare ok boolean := false; begin
  begin perform count(*) from children; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anónimo sin acceso';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from children) = 2, 'papá ve lo mismo';
  assert (select count(distinct usuario) from audit_log) = 1, 'auditoría registra a mamá';
end $$;
select 'TODAS LAS PRUEBAS PASARON' as resultado;
