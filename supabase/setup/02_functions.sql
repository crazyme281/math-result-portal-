-- ResultDesk database - step 2 of 7: helper functions, workflow, audit, save, administration.
-- Run after 01_tables.sql and before 03_policies.sql.

-- ---------- who is calling ----------
create function public.current_institution() returns uuid
language sql stable security definer set search_path = '' as $$
  select institution_id from public.profiles where id = (select auth.uid())
$$;
create function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;
create function public.reviews_department(p_dept uuid, p_inst uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('hod','exam_officer')
      and p.department_id = p_dept and p.institution_id = p_inst)
$$;

-- ---------- triggers ----------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- Sign-up: the institution comes from the form. No institution (older app builds) = UNICAL. Role is always lecturer.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_raw text := nullif(trim(coalesce(new.raw_user_meta_data->>'institution_id','')), ''); v_inst uuid;
begin
  if v_raw is null then
    select id into v_inst from public.institutions where code = 'UNICAL';
  else
    begin v_inst := v_raw::uuid; exception when others then v_inst := null; end;
    if v_inst is null or not exists (select 1 from public.institutions where id = v_inst) then
      raise exception 'Select a valid institution.';
    end if;
  end if;
  insert into public.profiles (id, full_name, institution_id)
  values (new.id, new.raw_user_meta_data->>'full_name', v_inst);
  return new;
end $$;

-- Institution never changes; only administrators change roles or a reviewer's department.
create function public.lock_profile_institution() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is distinct from old.institution_id then
    raise exception 'Institution cannot be changed.';
  end if;
  if (select auth.uid()) is null then return new; end if;  -- SQL editor / service
  if public.app_role() is distinct from 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Only an administrator can change roles.';
    end if;
    if new.department_id is distinct from old.department_id and old.role in ('hod','exam_officer') then
      raise exception 'Only an administrator can change a reviewer''s department.';
    end if;
  end if;
  return new;
end $$;

-- A sheet's status can only change through set_sheet_status().
create function public.guard_sheet_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('app.status_rpc', true), '') <> '1' then
    raise exception 'Change the status with the workflow buttons.';
  end if;
  return new;
end $$;

-- ---------- audit log (only these functions can write to it) ----------
create function public.log_audit(p_sheet uuid, p_code text, p_inst uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_name, institution_id, sheet_id, sheet_code, action, details)
  values ((select auth.uid()), (select full_name from public.profiles where id = (select auth.uid())),
          p_inst, p_sheet, p_code, p_action, coalesce(p_details, '{}'::jsonb))
$$;
create function public.audit_sheet_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_audit(old.id, old.course_code, old.institution_id, 'sheet_deleted', jsonb_build_object('status', old.status));
  return old;
end $$;

-- ---------- status changes ----------
-- UNICAL (uses_approval = false): the owner locks / opens their own sheet at will.
-- Institutions with uses_approval = true (not used by UNICAL): draft -> submitted (owner) -> approved (HOD) -> locked (HOD / exam officer).
create function public.set_sheet_status(p_sheet uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text := public.app_role();
  s public.result_sheets%rowtype;
  v_owner boolean; v_rev boolean; v_hod boolean; v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_count int; v_incomplete int; v_approval boolean;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  select * into s from public.result_sheets where id = p_sheet and institution_id = public.current_institution() for update;
  if not found then raise exception 'Sheet not found.'; end if;
  select uses_approval into v_approval from public.institutions where id = s.institution_id;
  v_owner := s.owner_id = v_uid;

  if not v_approval then
    if not v_owner then raise exception 'Only the owner can lock or open this sheet.'; end if;
    if not ((s.status = 'draft' and p_status = 'locked') or (s.status = 'locked' and p_status = 'draft')) then
      raise exception 'A % sheet cannot be moved to %.', s.status, p_status;
    end if;
  else
    v_rev := public.reviews_department(s.department_id, s.institution_id);
    v_hod := v_rev and v_role = 'hod';
    if s.status = 'draft' and p_status = 'submitted' then
      if not v_owner then raise exception 'Only the owner can submit this sheet.'; end if;
      select count(*), count(*) filter (where trim(matric_no) = '' or trim(name) = '' or jamb_reg_no is null or ca is null or exam is null)
        into v_count, v_incomplete from public.result_students where sheet_id = p_sheet;
      if v_count = 0 then raise exception 'Add at least one student before submitting.'; end if;
      if v_incomplete > 0 then
        raise exception '% record(s) are incomplete (missing matric number, name, JAMB number, CA or exam). Complete them before submitting.', v_incomplete;
      end if;
    elsif s.status = 'submitted' and p_status = 'draft' then
      if not (v_owner or v_hod) then raise exception 'Only the owner or the HOD can return a submitted sheet.'; end if;
      if v_hod and not v_owner and v_note is null then raise exception 'Give a reason when returning a sheet.'; end if;
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
  update public.result_sheets set status = p_status, status_changed_by = v_uid, status_changed_at = now() where id = p_sheet;
  perform set_config('app.status_rpc', '0', true);
  perform public.log_audit(p_sheet, s.course_code, s.institution_id, 'status_changed',
    jsonb_build_object('from', s.status, 'to', p_status, 'note', v_note));
end $$;

-- ---------- save a sheet and all its students in one step ----------
create function public.save_result_sheet(p_sheet jsonb, p_students jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid := nullif(p_sheet->>'id','')::uuid;
  v_fixed text := nullif(trim(coalesce(p_sheet->>'matric_fixed','')),'');
  v_inst uuid := public.current_institution();
  v_fac uuid := (p_sheet->>'faculty_id')::uuid;
  v_dep uuid := (p_sheet->>'department_id')::uuid;
  v_heading text; v_code text := upper(trim(p_sheet->>'course_code'));
  v_old jsonb := '[]'::jsonb; v_changes jsonb; v_added int; v_removed int; v_new boolean := (v_id is null);
  r record; v_m text; v_n numeric; v_dup text; v_re text;
begin
  if v_uid is null or v_inst is null then raise exception 'Not signed in.'; end if;
  select heading into v_heading from public.institutions where id = v_inst;
  if not exists (select 1 from public.faculties where id = v_fac and institution_id = v_inst) then
    raise exception 'The selected faculty does not belong to your institution.';
  end if;
  if not exists (select 1 from public.departments where id = v_dep and faculty_id = v_fac) then
    raise exception 'The selected department does not belong to that faculty.';
  end if;
  if v_fixed is not null and v_fixed !~ '^/[0-9]+$' then
    raise exception 'Matric fixed part must look like /095244.';
  end if;
  if v_fixed is not null then v_re := '^[0-9]{2}/[0-9]{' || (length(v_fixed) - 1) || '}[0-9]{3}$'; end if;

  for r in select t.ord, t.e from jsonb_array_elements(p_students) with ordinality as t(e, ord) loop
    v_m := trim(coalesce(r.e->>'matric_no',''));
    if v_m <> '' and v_re is not null and v_m !~ v_re then
      raise exception 'Row %: Matriculation number must be 2 digits, a %-digit faculty code like %, then 3 digits (e.g. 23%123).',
        r.ord, length(v_fixed) - 1, v_fixed, v_fixed;
    end if;
    if nullif(trim(r.e->>'ca'),'') is not null then
      if trim(r.e->>'ca') !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Row %: CA score must be a number.', r.ord; end if;
      v_n := trim(r.e->>'ca')::numeric;
      if v_n < 0 then raise exception 'Row %: CA score cannot be negative.', r.ord; end if;
      if v_n > 30 then raise exception 'Row %: CA score cannot be greater than 30.', r.ord; end if;
    end if;
    if nullif(trim(r.e->>'exam'),'') is not null then
      if trim(r.e->>'exam') !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Row %: Examination score must be a number.', r.ord; end if;
      v_n := trim(r.e->>'exam')::numeric;
      if v_n < 0 then raise exception 'Row %: Examination score cannot be negative.', r.ord; end if;
      if v_n > 70 then raise exception 'Row %: Examination score cannot be greater than 70.', r.ord; end if;
    end if;
  end loop;

  select upper(trim(t.e->>'matric_no')) into v_dup
  from jsonb_array_elements(p_students) as t(e)
  where trim(coalesce(t.e->>'matric_no','')) <> ''
  group by 1 having count(*) > 1 limit 1;
  if v_dup is not null then raise exception 'Duplicate matriculation number % on this sheet.', v_dup; end if;

  if v_new then
    insert into public.result_sheets
      (owner_id, institution_id, faculty_id, department_id, academic_session, result_title, course_code, course_title,
       semester, level, credit_unit, examiners, hod, released_to, sign_date, university, matric_fixed)
    values
      (v_uid, v_inst, v_fac, v_dep, p_sheet->>'academic_session',
       coalesce(nullif(p_sheet->>'result_title',''),'UNDERGRADUATE RESULT SCORES'),
       v_code, trim(p_sheet->>'course_title'), p_sheet->>'semester', p_sheet->>'level',
       coalesce(nullif(p_sheet->>'credit_unit','')::int, 0), p_sheet->>'examiners', p_sheet->>'hod',
       p_sheet->>'released_to', p_sheet->>'sign_date', v_heading, v_fixed)
    returning id into v_id;
  else
    perform 1 from public.result_sheets
      where id = v_id and owner_id = v_uid and institution_id = v_inst and status = 'draft' for update;
    if not found then raise exception 'Sheet not found, or it cannot be edited (only the owner can edit a draft).'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('matric', matric_no, 'name', name, 'ca', ca, 'exam', exam)), '[]'::jsonb)
      into v_old from public.result_students where sheet_id = v_id;
    update public.result_sheets set
      faculty_id = v_fac, department_id = v_dep, academic_session = p_sheet->>'academic_session',
      result_title = coalesce(nullif(p_sheet->>'result_title',''),'UNDERGRADUATE RESULT SCORES'),
      course_code = v_code, course_title = trim(p_sheet->>'course_title'),
      semester = p_sheet->>'semester', level = p_sheet->>'level',
      credit_unit = coalesce(nullif(p_sheet->>'credit_unit','')::int, 0),
      examiners = p_sheet->>'examiners', hod = p_sheet->>'hod', released_to = p_sheet->>'released_to',
      sign_date = p_sheet->>'sign_date', university = v_heading, matric_fixed = v_fixed
    where id = v_id;
    delete from public.result_students where sheet_id = v_id;
  end if;

  insert into public.result_students (sheet_id, sort_order, matric_no, jamb_reg_no, name, script_no, ca, exam)
  select v_id, (t.ord - 1)::int, trim(coalesce(t.e->>'matric_no','')), nullif(trim(t.e->>'jamb_reg_no'),''),
         trim(coalesce(t.e->>'name','')), nullif(trim(t.e->>'script_no'),''),
         nullif(trim(t.e->>'ca'),'')::numeric, nullif(trim(t.e->>'exam'),'')::numeric
  from jsonb_array_elements(p_students) with ordinality as t(e, ord);

  -- student registry: own records refreshed, other lecturers' records never overwritten
  update public.students st
     set name = x.name, jamb_reg_no = coalesce(x.jamb, st.jamb_reg_no), updated_at = now()
    from (select upper(trim(t.e->>'matric_no')) as norm, trim(t.e->>'name') as name,
                 nullif(trim(t.e->>'jamb_reg_no'),'') as jamb
          from jsonb_array_elements(p_students) as t(e)
          where trim(coalesce(t.e->>'matric_no','')) <> '' and trim(coalesce(t.e->>'name','')) <> '') x
   where st.institution_id = v_inst and st.matric_norm = x.norm and st.created_by = v_uid;
  insert into public.students (institution_id, matric_no, name, jamb_reg_no, faculty_id, created_by)
  select v_inst, trim(t.e->>'matric_no'), trim(t.e->>'name'), nullif(trim(t.e->>'jamb_reg_no'),''), v_fac, v_uid
  from jsonb_array_elements(p_students) as t(e)
  where trim(coalesce(t.e->>'matric_no','')) <> '' and trim(coalesce(t.e->>'name','')) <> ''
  on conflict (institution_id, matric_norm) do nothing;
  -- every result row points at its student record (foreign key, not text matching)
  update public.result_students rs set student_id = st.id
    from public.students st
   where rs.sheet_id = v_id and st.institution_id = v_inst and trim(rs.matric_no) <> ''
     and st.matric_norm = upper(trim(rs.matric_no));

  with o as (select upper(trim(e->>'matric')) as k, e from jsonb_array_elements(v_old) e where trim(coalesce(e->>'matric','')) <> ''),
       n as (select upper(trim(e->>'matric_no')) as k, e from jsonb_array_elements(p_students) e where trim(coalesce(e->>'matric_no','')) <> '')
  select
    coalesce((select jsonb_agg(jsonb_build_object('matric', n.e->>'matric_no', 'name', n.e->>'name',
                'ca', jsonb_build_array(o.e->>'ca', nullif(trim(n.e->>'ca'),'')),
                'exam', jsonb_build_array(o.e->>'exam', nullif(trim(n.e->>'exam'),''))))
              from n join o on o.k = n.k
              where (o.e->>'ca')::numeric is distinct from nullif(trim(n.e->>'ca'),'')::numeric
                 or (o.e->>'exam')::numeric is distinct from nullif(trim(n.e->>'exam'),'')::numeric), '[]'::jsonb),
    (select count(*) from n where not exists (select 1 from o where o.k = n.k)),
    (select count(*) from o where not exists (select 1 from n where n.k = o.k))
  into v_changes, v_added, v_removed;
  perform public.log_audit(v_id, v_code, v_inst, case when v_new then 'sheet_created' else 'sheet_saved' end,
    jsonb_build_object('students', jsonb_array_length(p_students), 'added', v_added, 'removed', v_removed, 'score_changes', v_changes));

  return v_id;
end $$;

-- ---------- administration ----------
create function public.admin_list_users() returns table (
  id uuid, full_name text, email text, role text, faculty_id uuid, department_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Administrators only.'; end if;
  return query
    select p.id, p.full_name, u.email::text, p.role, p.faculty_id, p.department_id, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.institution_id = public.current_institution() order by p.created_at;
end $$;

create function public.admin_set_user(p_user uuid, p_role text, p_department uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inst uuid := public.current_institution(); v_fac uuid;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Administrators only.'; end if;
  if p_role not in ('lecturer','exam_officer','hod','admin') then raise exception 'Invalid role.'; end if;
  if p_user = (select auth.uid()) then raise exception 'You cannot change your own role.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and institution_id = v_inst) then
    raise exception 'User not found in your institution.';
  end if;
  if p_department is not null then
    select d.faculty_id into v_fac from public.departments d join public.faculties f on f.id = d.faculty_id
      where d.id = p_department and f.institution_id = v_inst;
    if v_fac is null then raise exception 'Department not found in your institution.'; end if;
  end if;
  if p_role in ('hod','exam_officer') and p_department is null then
    raise exception 'A department is required for this role.';
  end if;
  begin
    update public.profiles set role = p_role, department_id = coalesce(p_department, department_id),
           faculty_id = coalesce(v_fac, faculty_id) where id = p_user;
  exception when unique_violation then
    raise exception 'This department already has an HOD.';
  end;
  perform public.log_audit(null, null, v_inst, 'user_role_changed',
    jsonb_build_object('user', p_user, 'role', p_role, 'department', p_department));
end $$;

-- ---------- who may call what ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_institution() to authenticated;
grant execute on function public.app_role() to authenticated;
grant execute on function public.reviews_department(uuid, uuid) to authenticated;
grant execute on function public.set_sheet_status(uuid, text, text) to authenticated;
grant execute on function public.save_result_sheet(jsonb, jsonb) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user(uuid, text, uuid) to authenticated;
