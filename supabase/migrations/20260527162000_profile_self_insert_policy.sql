-- Allows the app to repair missing public.profiles rows for authenticated users.
-- This is needed when a user existed before the Stage 1 auth trigger was applied.

drop policy if exists "Users can create their own student profile"
on public.profiles;

create policy "Users can create their own student profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'student'
);
