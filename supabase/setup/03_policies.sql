-- ResultDesk database - step 3 of 7: row-level security, policies, grade view, triggers.

alter table public.audit_log enable row level security;
alter table public.degree_classes enable row level security;
alter table public.departments enable row level security;
alter table public.faculties enable row level security;
alter table public.grading_scale enable row level security;
alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.result_sheets enable row level security;
alter table public.result_students enable row level security;
alter table public.students enable row level security;

-- institutions are public (needed by the sign-up dropdown)
create policy institutions_read on public.institutions for select to anon, authenticated using (true);

-- everything else is limited to the signed-in user's own institution
create policy faculties_read on public.faculties for select to authenticated using (institution_id = public.current_institution());
create policy faculties_admin_insert on public.faculties for insert to authenticated with check (institution_id = public.current_institution() and public.app_role() = 'admin');
create policy faculties_admin_update on public.faculties for update to authenticated using (institution_id = public.current_institution() and public.app_role() = 'admin') with check (institution_id = public.current_institution() and public.app_role() = 'admin');
create policy faculties_admin_delete on public.faculties for delete to authenticated using (institution_id = public.current_institution() and public.app_role() = 'admin');
create policy departments_read on public.departments for select to authenticated using (exists (select 1 from public.faculties f where f.id = departments.faculty_id));
create policy departments_add on public.departments for insert to authenticated with check (verified = false and created_by = (select auth.uid()));
create policy departments_admin_update on public.departments for update to authenticated using (public.app_role() = 'admin' and exists (select 1 from public.faculties f where f.id = departments.faculty_id)) with check (public.app_role() = 'admin' and exists (select 1 from public.faculties f where f.id = departments.faculty_id));
create policy departments_admin_delete on public.departments for delete to authenticated using (public.app_role() = 'admin' and exists (select 1 from public.faculties f where f.id = departments.faculty_id));
create policy grading_read on public.grading_scale for select to authenticated using (institution_id = public.current_institution());
create policy degree_classes_read on public.degree_classes for select to authenticated using (institution_id = public.current_institution());

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_select_staff on public.profiles for select to authenticated using (institution_id = public.current_institution() and public.app_role() in ('hod', 'exam_officer', 'admin'));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy students_registry_read on public.students for select to authenticated using (institution_id = public.current_institution());
create policy students_registry_add on public.students for insert to authenticated with check (created_by = (select auth.uid()) and institution_id = public.current_institution());
create policy students_registry_edit on public.students for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

create policy sheets_select on public.result_sheets for select to authenticated using (owner_id = (select auth.uid()));
create policy sheets_select_reviewer on public.result_sheets for select to authenticated using (public.reviews_department(department_id, institution_id));
create policy sheets_insert on public.result_sheets for insert to authenticated with check (owner_id = (select auth.uid()) and institution_id = public.current_institution());
create policy sheets_update on public.result_sheets for update to authenticated using (owner_id = (select auth.uid()) and status = 'draft') with check (owner_id = (select auth.uid()));
create policy sheets_delete on public.result_sheets for delete to authenticated using (owner_id = (select auth.uid()) and status = 'draft');

create policy students_select on public.result_students for select to authenticated using (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and s.owner_id = (select auth.uid())));
create policy students_select_reviewer on public.result_students for select to authenticated using (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and public.reviews_department(s.department_id, s.institution_id)));
create policy students_insert on public.result_students for insert to authenticated with check (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and s.owner_id = (select auth.uid()) and s.status = 'draft'));
create policy students_update on public.result_students for update to authenticated using (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and s.owner_id = (select auth.uid()) and s.status = 'draft')) with check (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and s.owner_id = (select auth.uid()) and s.status = 'draft'));
create policy students_delete on public.result_students for delete to authenticated using (exists (select 1 from public.result_sheets s where s.id = result_students.sheet_id and s.owner_id = (select auth.uid()) and s.status = 'draft'));

create policy audit_read on public.audit_log for select to authenticated using (
  institution_id = public.current_institution() and (
    actor_id = (select auth.uid()) or public.app_role() = 'admin'
    or exists (select 1 from public.result_sheets s where s.id = audit_log.sheet_id)));
-- audit_log has no insert/update/delete policy: it can only be written by the functions in step 2.

create view public.result_students_graded with (security_invoker = true) as
select s.id, s.sheet_id, s.sort_order, s.matric_no, s.jamb_reg_no, s.name, s.script_no, s.ca, s.exam, s.total,
       g.grade, g.status, g.grade_point
from public.result_students s
join public.result_sheets sh on sh.id = s.sheet_id
left join lateral (
  select gs.grade, gs.status, gs.grade_point from public.grading_scale gs
  where gs.institution_id = sh.institution_id and s.ca is not null and s.exam is not null and gs.min_score <= s.total
  order by gs.min_score desc limit 1) g on true;

create trigger profiles_lock_institution before update on public.profiles for each row execute function public.lock_profile_institution();
create trigger result_sheets_audit_delete before delete on public.result_sheets for each row execute function public.audit_sheet_delete();
create trigger result_sheets_status_guard before update on public.result_sheets for each row execute function public.guard_sheet_status();
create trigger result_sheets_updated before update on public.result_sheets for each row execute function public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
