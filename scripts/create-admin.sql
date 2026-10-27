-- Double H Studio — create the production admin account.
--
-- Paste this whole file into the Supabase SQL editor for project
-- nxtxhaddmhypzqaobrqc and run it once.
--
--   Email:    info@double-h-studio.com
--   Password: DoubleH-Studio-2026
--
-- Change the password after signing in: Settings → Change password.
--
-- The hash below is bcrypt (cost 12) of that password in the same $2b$ format
-- the app writes itself, so server/src/middleware/auth.js verifies it directly.
-- Running the statement again replaces the password and signs out old sessions,
-- which makes this file the recovery path if the password is ever lost.

insert into public.admins (id, email, name, "passwordHash", "createdAt")
values (
  gen_random_uuid(),
  'info@double-h-studio.com',
  'Studio Admin',
  '$2b$12$2.faJsPiw26ieoHMy7IctuxR96IcG5VKKSiYiL72Vnj3QzkS6dw/6',
  now()
)
on conflict (email) do update
  set "passwordHash" = excluded."passwordHash",
      name = excluded.name;

-- Old cookies must not survive the password change.
delete from public.admin_sessions
where "adminId" = (select id from public.admins where email = 'info@double-h-studio.com');
