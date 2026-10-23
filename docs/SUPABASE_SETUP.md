# Supabase settings that can only be changed in the dashboard

These cannot be set from the application or from SQL. Do them once per Supabase project.

## 1. Password reset links (required for "Forgot password")
Authentication > URL Configuration
- Site URL: the address where the app is hosted (for example https://resultdesk.example.edu.ng/).
- Redirect URLs: add the same address (and http://localhost:5173/ while developing).
- The Electron desktop build loads from a file, so password-reset links open in the browser version of the app.

## 2. Rate limiting (login and registration)
Authentication > Rate Limits: lower the limits for sign-ups, sign-ins and emails sent per hour to values that fit your user count.
Authentication > Attack Protection: enable CAPTCHA (Turnstile or hCaptcha) for sign-up and sign-in.

## 3. Password strength
Authentication > Providers > Email: set a minimum password length of 8 or more.
Authentication > Attack Protection: turn on "Prevent use of leaked passwords" (available on paid plans).

## 4. Email delivery
Authentication > SMTP Settings: use your own SMTP provider for production. The built-in sender is rate-limited and meant for testing.
Turn "Confirm email" on for production.

## 5. Backups and recovery
Database > Backups: confirm daily backups are on. Point-in-time recovery needs a paid add-on.
Restore a backup into a spare project at least once and open the app against it, so recovery is proven.

## 6. Keys
Only the publishable key (sb_publishable_...) belongs in the app's .env file.
Never put the service_role / secret key in the app, in a VITE_ variable, or in the repository.

## 7. Creating administrator and HOD accounts (never through public registration)
Registration always creates a lecturer of the Department of Mathematics. Roles cannot be changed by the user.
1. The person registers normally (this creates a lecturer account).
2. An existing administrator opens Administration > Users of the Department of Mathematics and assigns Exam officer or HOD.
   The department is always Mathematics, and it can have only one HOD.
3. The first administrator is created directly in the SQL editor (this runs with full database rights):

   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'person@example.edu.ng');

## 8. Database tests
supabase/tests/workflow_and_rls.sql runs the role, workflow and access checks inside a transaction that is rolled back.

## 9. Sign-up without email confirmation
The database confirms new accounts itself (trigger auto_confirm_email), and the app signs the user in straight after sign-up.
To stop Supabase from also sending confirmation emails (and hitting its hourly email limit), switch it off:
Authentication > Providers > Email > turn "Confirm email" OFF.

## 10. The default HOD login
unical-hod@resultdesk.dev is the shared login of the Department of Mathematics, used only to register the real HOD account.
Give the HOD the default password in person, change it in 06_default_hod_accounts.sql before real use, and if the default login password is
ever changed by mistake, reset it in the Supabase dashboard (Authentication > Users). A new email address is never confirmed by email,
so the HOD and lecturers must type it carefully. Once the Department of Mathematics has an HOD, no second HOD can be registered.

## 11. Converting an existing project to Mathematics only
Run supabase/setup/07_math_only.sql in the SQL editor. The first run changes no data: it installs the Mathematics-only rules and prints
what the clean-up would delete (other universities and their accounts, sheets outside UNICAL Mathematics, other departments).
Read the notices, then set v_delete to true in Part 2 and run it again to delete that data.

## 12. Settings still to do in the dashboard for project ghnmwozjnyqwtnlkwhuc
Authentication > Providers > Email: turn "Confirm email" OFF (sections 9), and add the app address under URL Configuration (section 1).
These cannot be changed from SQL.
