-- ResultDesk database - step 6 of 7: the default HOD login (run once, in the SQL editor).
-- The HOD of the Department of Mathematics signs in with its default login and then registers their own HOD account
-- (name, email, password, department). The default login stays available for the next HOD.
-- Change the default password below before real use, and tell the HODs the new one.
do $$
declare
  v_pw constant text := 'ResultDesk#2026';
  v record; u uuid;
begin
  perform set_config('app.role_rpc', '1', true);
  for v in select * from (values
      ('unical-hod@resultdesk.dev', 'Default HOD login (Mathematics, UNICAL)', 'UNICAL')) x(email, full_name, code) loop
    if exists (select 1 from auth.users where email = v.email) then continue; end if;
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', v.email, crypt(v_pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      json_build_object('full_name', v.full_name, 'institution_id', (select id from public.institutions where code = v.code)), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), u, u::text, json_build_object('sub', u::text, 'email', v.email, 'email_verified', true), 'email', now(), now(), now());
    update public.profiles set role = 'hod_setup' where id = u;
  end loop;
  perform set_config('app.role_rpc', '0', true);
end $$;
