-- ResultDesk database - step 7 of 7: Department of Mathematics, University of Calabar ONLY.
-- Run this after 01-06 on a new project, or on its own on an existing project to convert it.
-- Part 1 is always safe (functions and rules). Part 2 deletes other universities' / departments' data and is OFF by default.

-- =====================================================================================================
-- PART 1: rules that keep the application to ONE university, ONE faculty and ONE department
-- =====================================================================================================

-- Only UNICAL, only the Faculty of Physical Sciences, only the Department of Mathematics can exist.
create or replace function public.only_unical() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.code is distinct from 'UNICAL' then raise exception 'Only the University of Calabar is supported.'; end if;
  return new;
end $$;
drop trigger if exists institutions_only_unical on public.institutions;
create trigger institutions_only_unical before insert or update on public.institutions
  for each row execute function public.only_unical();

create or replace function public.only_math_faculty() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from 'Faculty of Physical Sciences' then
    raise exception 'Only the Faculty of Physical Sciences (home of the Department of Mathematics) is supported.';
  end if;
  return new;
end $$;
drop trigger if exists faculties_only_math on public.faculties;
create trigger faculties_only_math before insert or update on public.faculties
  for each row execute function public.only_math_faculty();

create or replace function public.only_math_department() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from 'Mathematics' then
    raise exception 'Only the Department of Mathematics is supported.';
  end if;
  return new;
end $$;
drop trigger if exists departments_only_math on public.departments;
create trigger departments_only_math before insert or update on public.departments
  for each row execute function public.only_math_department();

-- Every result sheet belongs to the Department of Mathematics.
create or replace function public.sheet_math_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.departments d where d.id = new.department_id and d.name = 'Mathematics') then
    raise exception 'Result sheets can only be created for the Department of Mathematics.';
  end if;
  return new;
end $$;
drop trigger if exists result_sheets_math_only on public.result_sheets;
create trigger result_sheets_math_only before insert or update of department_id on public.result_sheets
  for each row execute function public.sheet_math_only();

-- An HOD (or exam officer) can only be of the Department of Mathematics.
create or replace function public.reviewer_math_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role in ('hod', 'exam_officer') and not exists (
       select 1 from public.departments d where d.id = new.department_id and d.name = 'Mathematics') then
    raise exception 'An HOD or exam officer must belong to the Department of Mathematics.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_reviewer_math_only on public.profiles;
create trigger profiles_reviewer_math_only before insert or update on public.profiles
  for each row execute function public.reviewer_math_only();

-- Sign-up always creates a UNICAL lecturer (no institution is chosen any more).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid;
begin
  select id into v_inst from public.institutions where code = 'UNICAL';
  if v_inst is null then raise exception 'The University of Calabar is not set up (run 04_seed.sql).'; end if;
  insert into public.profiles (id, full_name, institution_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_inst);
  return new;
end $$;

-- Administrator: roles only. HOD / exam officer always means the Department of Mathematics.
drop function if exists public.admin_set_user(uuid, text, uuid);
create function public.admin_set_user(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid := public.current_institution(); v_dep uuid; v_fac uuid;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Administrators only.'; end if;
  if p_role not in ('lecturer','exam_officer','hod','admin') then raise exception 'Invalid role.'; end if;
  if p_user = (select auth.uid()) then raise exception 'You cannot change your own role.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and institution_id = v_inst) then
    raise exception 'User not found.';
  end if;
  select d.id, d.faculty_id into v_dep, v_fac from public.departments d
    join public.faculties f on f.id = d.faculty_id
   where d.name = 'Mathematics' and f.institution_id = v_inst;
  if v_dep is null then raise exception 'The Department of Mathematics is not set up (run 04_seed.sql).'; end if;
  begin
    if p_role in ('hod','exam_officer') then
      update public.profiles set role = p_role, department_id = v_dep, faculty_id = v_fac where id = p_user;
    else
      update public.profiles set role = p_role where id = p_user;
    end if;
  exception when unique_violation then
    raise exception 'The Department of Mathematics already has an HOD.';
  end;
  perform public.log_audit(null, null, v_inst, 'user_role_changed', jsonb_build_object('user', p_user, 'role', p_role));
end $$;

-- HOD registration through the default login: the department is always Mathematics.
create or replace function public.hod_free_departments() returns table (id uuid, name text, faculty_id uuid, faculty_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'hod_setup' then
    raise exception 'Only the default HOD login can register a new HOD.';
  end if;
  return query
    select d.id, d.name, f.id, f.name
    from public.departments d join public.faculties f on f.id = d.faculty_id
    where f.institution_id = public.current_institution() and d.name = 'Mathematics'
      and not exists (select 1 from public.profiles p where p.department_id = d.id and p.role = 'hod');
end $$;

drop function if exists public.hod_register(text, text, text, uuid);
create function public.hod_register(p_email text, p_password text, p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inst uuid := public.current_institution(); v_email text := lower(trim(p_email));
  v_dep uuid; v_fac uuid; v_uid uuid := gen_random_uuid();
begin
  if public.app_role() is distinct from 'hod_setup' then
    raise exception 'Only the default HOD login can register a new HOD.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if v_email like '%@resultdesk.dev' then raise exception 'Use your own email address, not a ResultDesk default one.'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'The password must be at least 8 characters.'; end if;
  if p_password = 'ResultDesk#2026' then raise exception 'Choose a password different from the default one.'; end if;
  if nullif(trim(coalesce(p_full_name,'')),'') is null then raise exception 'Enter your full name.'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'That email address is already registered.'; end if;
  select d.id, d.faculty_id into v_dep, v_fac from public.departments d join public.faculties f on f.id = d.faculty_id
    where d.name = 'Mathematics' and f.institution_id = v_inst;
  if v_dep is null then raise exception 'The Department of Mathematics is not set up (run 04_seed.sql).'; end if;
  if exists (select 1 from public.profiles where department_id = v_dep and role = 'hod') then
    raise exception 'The Department of Mathematics already has an HOD.';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', trim(p_full_name)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  perform set_config('app.role_rpc', '1', true);
  begin
    update public.profiles set role = 'hod', department_id = v_dep, faculty_id = v_fac where id = v_uid;
  exception when unique_violation then
    raise exception 'The Department of Mathematics already has an HOD.';
  end;
  perform set_config('app.role_rpc', '0', true);
  perform public.log_audit(null, null, v_inst, 'hod_registered', jsonb_build_object('user', v_uid, 'department', v_dep));
end $$;

revoke execute on function public.admin_set_user(uuid, text) from public, anon;
revoke execute on function public.hod_register(text, text, text) from public, anon;
grant execute on function public.admin_set_user(uuid, text) to authenticated;
grant execute on function public.hod_free_departments() to authenticated;
grant execute on function public.hod_register(text, text, text) to authenticated;

-- =====================================================================================================
-- PART 2 (existing databases only): remove other universities, faculties and departments.
-- DELETES DATA. Set v_delete to true only after you have checked the counts printed by the first run.
-- =====================================================================================================
do $$
declare
  v_delete constant boolean := false;      -- <== change to true to really delete
  v_unical uuid; v_math uuid; v_mfac uuid;
  n_inst int; n_users int; n_sheets int; n_depts int;
begin
  select id into v_unical from public.institutions where code = 'UNICAL';
  select d.id, d.faculty_id into v_math, v_mfac from public.departments d join public.faculties f on f.id = d.faculty_id
   where f.institution_id = v_unical and d.name = 'Mathematics';

  select count(*) into n_inst  from public.institutions where code <> 'UNICAL';
  select count(*) into n_users from public.profiles p
   where p.institution_id <> v_unical;
  select count(*) into n_sheets from public.result_sheets s
   where s.institution_id <> v_unical or s.department_id is distinct from v_math;
  select count(*) into n_depts from public.departments d join public.faculties f on f.id = d.faculty_id
   where f.institution_id = v_unical and d.id is distinct from v_math;

  raise notice 'Other institutions: %, their user accounts: %, result sheets outside UNICAL Mathematics: %, other UNICAL departments: %',
    n_inst, n_users, n_sheets, n_depts;
  if v_unical is null or v_math is null then
    raise notice 'UNICAL / Mathematics not found: run 04_seed.sql first. Nothing deleted.'; return;
  end if;
  if not v_delete then
    raise notice 'Nothing was deleted (v_delete is false).'; return;
  end if;

  perform set_config('app.role_rpc', '1', true);

  -- sheets (their students go with them) and registry of other institutions / departments
  delete from public.result_sheets where institution_id <> v_unical or department_id is distinct from v_math;
  delete from public.audit_log where institution_id <> v_unical;
  delete from public.students where institution_id <> v_unical;
  -- accounts of other universities (profiles go with them)
  delete from auth.users where id in (select id from public.profiles where institution_id <> v_unical);
  -- UNICAL HODs / exam officers of other departments become ordinary lecturers
  update public.profiles set role = 'lecturer', department_id = null
   where institution_id = v_unical and role in ('hod','exam_officer') and department_id is distinct from v_math;
  update public.profiles set department_id = null where institution_id = v_unical and department_id is distinct from v_math;
  delete from public.departments d using public.faculties f
   where f.id = d.faculty_id and f.institution_id = v_unical and d.id <> v_math;
  delete from public.faculties f where f.institution_id <> v_unical or f.id <> v_mfac;
  update public.faculties set name = 'Faculty of Physical Sciences' where id = v_mfac;
  delete from public.degree_classes where institution_id <> v_unical;
  delete from public.grading_scale where institution_id <> v_unical;
  delete from public.institutions where code <> 'UNICAL';

  perform set_config('app.role_rpc', '0', true);
  raise notice 'Done: only UNICAL / Mathematics remains.';
end $$;
