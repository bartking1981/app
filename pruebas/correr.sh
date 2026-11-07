#!/bin/bash
# Reconstruye una base de prueba y corre todas las pruebas
. /home/claude/pgenv
P="psql -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists t" -c "create database t" >/dev/null 2>&1
$P -d t -f 00_stub_supabase.sql || exit 1
$P -d t -f ../supabase/001_esquema.sql || exit 1
sed "s/correo-de-mama@ejemplo.com/mama@x.com/; s/correo-de-papa@ejemplo.com/papa@x.com/; s/Apodo del niño/Carlitos/" ../supabase/002_configuracion_inicial.sql | $P -d t 2>&1 | grep -v NOTICE
psql -q -d t -f 01_pruebas.sql 2>&1 | grep -v -E "set_config|^-+$|^\(1 row\)|^ [0-9a-f-]{36}$|^$"
