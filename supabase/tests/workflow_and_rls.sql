-- Checks that the database is limited to the Department of Mathematics, University of Calabar.
-- Run in the SQL editor after 01-07. Nothing is kept: the final RAISE rolls everything back and shows the results.
do $$
declare
  r text := ''; v_unical uuid; v_fac uuid; v_math uuid; u uuid;
begin
  select id into v_unical from public.institutions where code = 'UNICAL';
  select id into v_fac from public.faculties where institution_id = v_unical and name = 'Faculty of Physical Sciences';
  select id into v_math from public.departments where faculty_id = v_fac and name = 'Mathematics';
  r := r || '0 setup: UNICAL=' || (v_unical is not null) || ', faculty=' || (v_fac is not null) || ', Mathematics=' || (v_math is not null);

  begin insert into public.institutions (code, name, heading) values ('AKSU', 'Other University', 'OTHER UNIVERSITY');
    r := r || ' | FAIL second university allowed';
  exception when others then r := r || ' | 1 other university refused'; end;

  begin insert into public.faculties (institution_id, name) values (v_unical, 'Faculty of Arts');
    r := r || ' | FAIL other faculty allowed';
  exception when others then r := r || ' | 2 other faculty refused'; end;

  begin insert into public.departments (faculty_id, name) values (v_fac, 'Physics');
    r := r || ' | FAIL other department allowed';
  exception when others then r := r || ' | 3 other department refused'; end;

  select id into u from public.profiles where role = 'lecturer' and institution_id = v_unical limit 1;
  if u is null then
    r := r || ' | (4-5 skipped: no lecturer account to test with)';
  else
    begin update public.profiles set role = 'hod', department_id = null where id = u;
      r := r || ' | FAIL HOD without Mathematics';
    exception when others then r := r || ' | 4 HOD must be of Mathematics'; end;
    begin update public.profiles set role = 'exam_officer', department_id = null where id = u;
      r := r || ' | FAIL exam officer without Mathematics';
    exception when others then r := r || ' | 5 exam officer must be of Mathematics'; end;
  end if;

  raise exception 'RESULTS: %', r;
end $$;
