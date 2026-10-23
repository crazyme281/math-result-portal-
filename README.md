# ResultDesk - Department of Mathematics, University of Calabar

Result sheet manager for the **Department of Mathematics, University of Calabar (UNICAL)** only.
There is one university, one faculty (Physical Sciences) and one department (Mathematics). "DEPARTMENT OF MATHEMATICS" is written at the
top of every page, on every printed analysis page, and at the top of the PDF, Word and Excel exports.
Ionic React app (browser or Windows/macOS/Linux desktop window) on Supabase (sign-in) and PostgreSQL (data).

## Run it
    npm install
    npm run dev          browser, http://localhost:5173
    npm run desktop      build, then open the desktop window
    npm run dist         build an installer into /release (Windows .exe, macOS .dmg, Linux AppImage)
    npm test             automated tests (grading, matric numbers, scores, GPA/CGPA, import, HOD analysis, sheet search)
    npm run typecheck    TypeScript check

`.env` points to the Supabase project `ghnmwozjnyqwtnlkwhuc` (https://ghnmwozjnyqwtnlkwhuc.supabase.co) and holds only the public key.

## What the application does
- **Result sheets** (lecturers): one sheet per course, total = CA + exam, grade, pass/fail; record, print, export to Excel, PDF and Word.
- **Lock:** the lecturer locks and opens their own sheets at will.
- **Matric number:** optional faculty code (for example `/095244`) is checked as 2-digit year + code + 3 digits; leave it empty to type full matric numbers.
- **Sign-up:** anyone registering is a lecturer of the Department of Mathematics. No university or department is chosen.

## HOD (Head of the Department of Mathematics only)
- **Default HOD login, then your own account.** The HOD first signs in with the default HOD login, then registers their own account
  (name, email, password). The department is always Mathematics. Once the department has an HOD, no second HOD can be registered.
- **Student Performance Analysis** (HOD only): semester pass / failure rate report and five buttons:
  Course (all courses), Semester (bar chart), GPA (classification, carryover and withdrawal lists, level and course filters),
  Graduation List (final year, best CGPA first, carryover courses shown), Courses (pie chart for one course code).
  Every analysis page has a Print button; the print-out starts with the university logo and "DEPARTMENT OF MATHEMATICS".
- **Withdrawal GPA:** the HOD sets it on the GPA page (default 1.00).
- **Submit to HOD** (lecturers) and **Profile** (change email and password) for everyone.
- Sign-up needs no email confirmation: a new account can log in at once.
- The database enforces all of this: an HOD or exam officer can only be of Mathematics, and no other university, faculty or department can be added.

## Logo
`public/logos/unical.png` is installed. It appears in the header, on printed analysis pages and at the top of the PDF, Word and Excel exports.
To change it, replace the PNG file.

## Database
Already applied (01 to 07) to the connected Supabase project. To rebuild on a new, empty project, run in the Supabase SQL editor, in order, on a new empty project:
1. `supabase/setup/01_tables.sql`
2. `supabase/setup/02_functions.sql`
3. `supabase/setup/03_policies.sql`
4. `supabase/setup/04_seed.sql` (UNICAL, Faculty of Physical Sciences, Mathematics)
5. `supabase/setup/05_hod_features.sql`
6. `supabase/setup/06_default_hod_accounts.sql` (creates the default HOD login)
7. `supabase/setup/07_math_only.sql` (Mathematics-only rules and the Mathematics HOD functions)

**Older project that still has other universities or departments:** run only `07_math_only.sql`. The first run changes no data and prints what
would be deleted; set `v_delete` to `true` in Part 2 and run it again to remove it.

Dashboard-only settings (password-reset address, rate limits, backups, "Confirm email" off): `docs/SUPABASE_SETUP.md`.
Database test: `supabase/tests/workflow_and_rls.sql`.

## Default login (password: ResultDesk#2026) - change it before real use
| Email | Role |
|---|---|
| unical-hod@resultdesk.dev | Default HOD login (registers the real HOD of Mathematics) |

The new project has no lecturers or administrator yet: lecturers register in the app; the first administrator is created with the SQL in `docs/SUPABASE_SETUP.md` section 7. To try the HOD pages, sign in with the default HOD login, register with your own email, then ask a lecturer to use "Submit to HOD" on a complete sheet.

## Folder
    src/App.tsx, main.tsx             routes
    src/pages/                        Login, ResetPassword, Sheets, SheetEditor, HodSetup, Profile, Admin
    src/pages/analysis/               Student Performance Analysis pages (HOD)
    src/components/                   department banner, dropdown with search, charts, university logo
    src/lib/config.ts                 the one university / faculty / department names
    src/lib/                          grading rules, validation, import, exports (Excel/PDF/Word), auth, HOD analysis, logo
    src/lib/__tests__/                automated tests
    supabase/setup/                   the 7 database scripts
    supabase/tests/                   database test
    docs/SUPABASE_SETUP.md            dashboard settings
    electron/main.cjs                 desktop window

## To confirm before official use
UNICAL grade boundaries; the class-of-degree bands; the faculty code (if any) used in Mathematics matric numbers; the CA/exam split (30/70 is applied); which student fields are required.
