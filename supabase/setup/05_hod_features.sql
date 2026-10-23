-- ResultDesk database - step 5 of 7: HOD features (run after 01-04).
-- Default HOD login, HOD registration, Submit to HOD, analysis settings, immediate sign-in after sign-up.

-- ===== roles: the default HOD login ("hod_setup") registers real HODs =====
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('lecturer','exam_officer','hod','hod_setup','admin'));

-- ===== submission to the HOD (UNICAL, Department of Mathematics) =====
alter table public.result_sheets add column submitted_to_hod_at timestamptz;

-- HODs / exam officers only see what lecturers have submitted
drop policy sheets_select_reviewer on public.result_sheets;
create policy sheets_select_reviewer on public.result_sheets for select to authenticated
  using (submitted_to_hod_at is not null and public.reviews_department(department_id, institution_id));
drop policy students_select_reviewer on public.result_students;
create policy students_select_reviewer on public.result_students for select to authenticated
  using (exists (select 1 from public.result_sheets s
                 where s.id = result_students.sheet_id and s.submitted_to_hod_at is not null
                   and public.reviews_department(s.department_id, s.institution_id)));

-- ===== analysis settings per institution =====
-- UNICAL grade points, read from the UNICAL exams portal (A = 5, B = 4, C = 3, E = 1 are shown; D = 2 and F = 0 follow the same scale).
alter table public.institutions add column withdrawal_below_gpa numeric not null default 1.00;
update public.grading_scale g set grade_point = case g.grade when 'A' then 5 when 'B' then 4 when 'C' then 3 when 'D' then 2 when 'E' then 1 else 0 end
 where g.institution_id in (select id from public.institutions where code = 'UNICAL');
insert into public.degree_classes (institution_id, min_cgpa, name)
select i.id, v.m, v.n from public.institutions i,
  (values (4.50,'First Class'),(3.50,'Second Class Upper'),(2.40,'Second Class Lower'),(1.50,'Third Class'),(1.00,'Pass')) v(m,n)
where i.code = 'UNICAL';

-- ===== no email confirmation: new accounts are confirmed by the database, so they can log in at once =====
create or replace function public.auto_confirm_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  return new;
end $$;
drop trigger if exists auto_confirm_email on auth.users;
create trigger auto_confirm_email before insert on auth.users
  for each row execute function public.auto_confirm_email();

-- the default HOD login can never create sheets
create function public.guard_setup_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.app_role() = 'hod_setup' then raise exception 'Complete your HOD registration first.'; end if;
  return new;
end $$;
create trigger result_sheets_guard_setup before insert on public.result_sheets
  for each row execute function public.guard_setup_role();

-- role / institution guard: the HOD registration function may set the role
create or replace function public.lock_profile_institution() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is distinct from old.institution_id then
    raise exception 'Institution cannot be changed.';
  end if;
  if (select auth.uid()) is null or coalesce(current_setting('app.role_rpc', true), '') = '1' then return new; end if;
  if public.app_role() is distinct from 'admin' then
    if new.role is distinct from old.role then raise exception 'Only an administrator can change roles.'; end if;
    if new.department_id is distinct from old.department_id and old.role in ('hod','exam_officer') then
      raise exception 'Only an administrator can change a reviewer''s department.';
    end if;
  end if;
  return new;
end $$;

-- ===== status changes, including "Submit to HOD" =====
-- UNICAL: owner locks / opens, submits to the HOD, or withdraws. (Approval workflow, uses_approval = true, is not used.)
create or replace function public.set_sheet_status(p_sheet uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text := public.app_role();
  s public.result_sheets%rowtype;
  v_owner boolean; v_rev boolean; v_hod boolean; v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_count int; v_incomplete int; v_approval boolean; v_submit timestamptz;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  select * into s from public.result_sheets where id = p_sheet and institution_id = public.current_institution() for update;
  if not found then raise exception 'Sheet not found.'; end if;
  select uses_approval into v_approval from public.institutions where id = s.institution_id;
  v_owner := s.owner_id = v_uid;
  v_rev := public.reviews_department(s.department_id, s.institution_id);
  v_hod := v_rev and v_role = 'hod';
  v_submit := s.submitted_to_hod_at;

  if p_status = 'submitted' then
    if s.status not in ('draft','locked') or (v_approval and s.status = 'locked') then
      raise exception 'A % sheet cannot be submitted.', s.status;
    end if;
    if not v_owner then raise exception 'Only the owner can submit this sheet.'; end if;
    select count(*), count(*) filter (where trim(matric_no) = '' or trim(name) = '' or jamb_reg_no is null or ca is null or exam is null)
      into v_count, v_incomplete from public.result_students where sheet_id = p_sheet;
    if v_count = 0 then raise exception 'Add at least one student before submitting.'; end if;
    if v_incomplete > 0 then
      raise exception '% record(s) are incomplete (missing matric number, name, JAMB number, CA or exam). Complete them before submitting.', v_incomplete;
    end if;
    v_submit := now();
  elsif not v_approval then
    if not v_owner then raise exception 'Only the owner can change this sheet.'; end if;
    if s.status = 'draft' and p_status = 'locked' then null;
    elsif s.status = 'locked' and p_status = 'draft' then null;
    elsif s.status = 'submitted' and p_status = 'draft' then v_submit := null;
    else raise exception 'A % sheet cannot be moved to %.', s.status, p_status;
    end if;
  else
    if s.status = 'submitted' and p_status = 'draft' then
      if not (v_owner or v_hod) then raise exception 'Only the owner or the HOD can return a submitted sheet.'; end if;
      if v_hod and not v_owner and v_note is null then raise exception 'Give a reason when returning a sheet.'; end if;
      v_submit := null;
    elsif s.status = 'submitted' and p_status = 'approved' then
      if not v_hod then raise exception 'Only the HOD of this department can approve a sheet.'; end if;
    elsif s.status = 'approved' and p_status = 'locked' then
      if not v_rev then raise exception 'Only the HOD or exam officer of this department can lock a sheet.'; end if;
    elsif s.status = 'locked' and p_status = 'approved' then
      if not v_hod then raise exception 'Only the HOD can unlock a sheet.'; end if;
      if v_note is null then raise exception 'Give a reason for unlocking.'; end if;
    else
      raise exception 'A % sheet cannot be moved to %.', s.status, p_status;
    end if;
  end if;

  perform set_config('app.status_rpc', '1', true);
  update public.result_sheets set status = p_status, status_changed_by = v_uid, status_changed_at = now(),
         submitted_to_hod_at = v_submit where id = p_sheet;
  perform set_config('app.status_rpc', '0', true);
  perform public.log_audit(p_sheet, s.course_code, s.institution_id, 'status_changed',
    jsonb_build_object('from', s.status, 'to', p_status, 'note', v_note));
end $$;

-- ===== HOD registration through the default login (07_math_only.sql replaces these two functions: Mathematics only) =====
create function public.hod_free_departments() returns table (id uuid, name text, faculty_id uuid, faculty_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'hod_setup' then
    raise exception 'Only the default HOD login can register a new HOD.';
  end if;
  return query
    select d.id, d.name, f.id, f.name
    from public.departments d join public.faculties f on f.id = d.faculty_id
    where f.institution_id = public.current_institution()
      and not exists (select 1 from public.profiles p where p.department_id = d.id and p.role = 'hod')
    order by f.sort_order, d.name;
end $$;

create function public.hod_register(p_email text, p_password text, p_full_name text, p_department uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inst uuid := public.current_institution(); v_email text := lower(trim(p_email));
  v_fac uuid; v_uid uuid := gen_random_uuid();
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
  select d.faculty_id into v_fac from public.departments d join public.faculties f on f.id = d.faculty_id
    where d.id = p_department and f.institution_id = v_inst;
  if v_fac is null then raise exception 'Select your department.'; end if;
  if exists (select 1 from public.profiles where department_id = p_department and role = 'hod') then
    raise exception 'This department already has an HOD.';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', trim(p_full_name), 'institution_id', v_inst), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  perform set_config('app.role_rpc', '1', true);
  begin
    update public.profiles set role = 'hod', department_id = p_department, faculty_id = v_fac where id = v_uid;
  exception when unique_violation then
    raise exception 'This department already has an HOD.';
  end;
  perform set_config('app.role_rpc', '0', true);
  perform public.log_audit(null, null, v_inst, 'hod_registered',
    jsonb_build_object('user', v_uid, 'department', p_department));
end $$;

-- ===== change my own email (no confirmation email is sent) =====
create function public.change_my_email(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_email text := lower(trim(p_email));
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if public.app_role() = 'hod_setup' then raise exception 'The default HOD login cannot be changed.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> v_uid) then
    raise exception 'That email address is already in use.';
  end if;
  update auth.users set email = v_email, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = v_uid;
  update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)), updated_at = now()
   where user_id = v_uid and provider = 'email';
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_institution() to authenticated;
grant execute on function public.app_role() to authenticated;
grant execute on function public.reviews_department(uuid, uuid) to authenticated;
grant execute on function public.set_sheet_status(uuid, text, text) to authenticated;
grant execute on function public.save_result_sheet(jsonb, jsonb) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user(uuid, text, uuid) to authenticated;
grant execute on function public.hod_free_departments() to authenticated;
grant execute on function public.hod_register(text, text, text, uuid) to authenticated;
grant execute on function public.change_my_email(text) to authenticated;

-- ===== withdrawal GPA: at UNICAL the HOD of each department sets it =====
alter table public.institutions add column hod_sets_withdrawal boolean not null default false;
update public.institutions set hod_sets_withdrawal = true where code = 'UNICAL';

create table public.department_settings (
  department_id uuid primary key references public.departments(id) on delete cascade,
  withdrawal_below_gpa numeric not null check (withdrawal_below_gpa >= 0 and withdrawal_below_gpa <= 5),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index department_settings_updated_by_idx on public.department_settings(updated_by);
alter table public.department_settings enable row level security;

create policy dept_settings_read on public.department_settings for select to authenticated
  using (exists (select 1 from public.departments d where d.id = department_settings.department_id));
create policy dept_settings_hod_insert on public.department_settings for insert to authenticated
  with check (public.app_role() = 'hod' and public.reviews_department(department_id, public.current_institution()));
create policy dept_settings_hod_update on public.department_settings for update to authenticated
  using (public.app_role() = 'hod' and public.reviews_department(department_id, public.current_institution()))
  with check (public.app_role() = 'hod' and public.reviews_department(department_id, public.current_institution()));
