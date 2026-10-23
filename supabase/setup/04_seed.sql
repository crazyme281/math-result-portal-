-- ResultDesk database - step 4 of 7: the institution, grading rules, faculty and department.
-- ResultDesk serves ONE department only: the Department of Mathematics, Faculty of Physical Sciences, University of Calabar.

-- ---------- institution ----------
-- UNICAL only records and prints results: the lecturer locks / opens their own sheets (uses_approval = false).
insert into public.institutions (code, name, heading, uses_gpa, uses_approval, sort_order) values
  ('UNICAL', 'University of Calabar (UNICAL)', 'UNIVERSITY OF CALABAR, CALABAR', false, false, 1);

-- ---------- grading scale (UNICAL boundaries come from the sample result sheet: confirm with the university) ----------
insert into public.grading_scale (institution_id, min_score, grade, status, grade_point)
select i.id, v.m, v.g, v.s, null
from public.institutions i,
  (values (70,'A','PASS'),(60,'B','PASS'),(50,'C','PASS'),(45,'D','PASS'),(40,'E','PASS'),(0,'F','FAIL')) v(m,g,s);

-- ---------- the one faculty and the one department ----------
insert into public.faculties (institution_id, name, source, sort_order)
select i.id, 'Faculty of Physical Sciences', 'secondary', 1 from public.institutions i where i.code = 'UNICAL';

insert into public.departments (faculty_id, name, verified)
select f.id, 'Mathematics', true from public.faculties f
join public.institutions i on i.id = f.institution_id and i.code = 'UNICAL'
where f.name = 'Faculty of Physical Sciences';
