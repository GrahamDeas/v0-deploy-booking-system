-- Stage 1 schema for the College Sound Production room booking system.
-- Use on a fresh Supabase project, or reset the earlier scaffold schema first.

drop table if exists public.staff_notes cascade;
drop table if exists public.approval_history cascade;
drop table if exists public.bookings cascade;
drop table if exists public.rooms cascade;
drop table if exists public.studios cascade;
drop table if exists public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop type if exists public.booking_status cascade;
drop type if exists public.user_role cascade;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('student', 'staff', 'admin');
create type public.booking_status as enum (
  'pending_approval',
  'approved',
  'rejected',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.user_role not null default 'student',
  course_class text,
  lecturer text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null default 'Sound Production Department',
  description text,
  capacity integer not null default 4 check (capacity > 0),
  color text not null default '#177a68',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  student_name text not null,
  student_email text not null,
  course_class text not null,
  lecturer text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text not null check (length(trim(description)) > 0),
  additional_notes text,
  status public.booking_status not null default 'pending_approval',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at)
);

-- Conflict-prevention logic:
-- The exclusion constraint below rejects any overlapping time ranges for the
-- same room while either booking is Pending Approval or Approved. Rejected and
-- Cancelled rows are excluded so historical decisions do not block new work.
alter table public.bookings
  add constraint bookings_no_overlapping_active_room_sessions
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('pending_approval', 'approved'));

comment on constraint bookings_no_overlapping_active_room_sessions
on public.bookings
is 'Prevents overlapping Pending Approval or Approved bookings for the same room.';

create table public.approval_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status public.booking_status,
  to_status public.booking_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_user_id_idx on public.bookings(user_id);
create index bookings_room_id_idx on public.bookings(room_id);
create index bookings_starts_at_idx on public.bookings(starts_at);
create index bookings_status_idx on public.bookings(status);
create index staff_notes_booking_id_idx on public.staff_notes(booking_id);
create index approval_history_booking_id_idx on public.approval_history(booking_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

create trigger staff_notes_set_updated_at
before update on public.staff_notes
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('staff', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    course_class,
    lecturer
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'course_class', ''),
    nullif(new.raw_user_meta_data ->> 'lecturer', '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change user roles.';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_profile_role_escalation();

create or replace function public.validate_booking_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.user_role;
  local_start timestamp;
  local_end timestamp;
begin
  actor_role := coalesce(public.current_user_role(), 'student');
  local_start := new.starts_at at time zone 'Europe/London';
  local_end := new.ends_at at time zone 'Europe/London';

  if extract(isodow from local_start) not between 1 and 5
     or extract(isodow from local_end) not between 1 and 5 then
    raise exception 'Bookings are only available Monday to Friday.';
  end if;

  if local_start::date <> local_end::date then
    raise exception 'Bookings must start and end on the same day.';
  end if;

  if local_start::time < time '09:00'
     or local_end::time > time '17:00' then
    raise exception 'Bookings must be between 9:00am and 5:00pm.';
  end if;

  if length(trim(new.description)) = 0 then
    raise exception 'Description of planned tasks is required.';
  end if;

  if tg_op = 'INSERT' and new.status <> 'pending_approval' then
    raise exception 'New student bookings must be Pending Approval.';
  end if;

  if tg_op = 'UPDATE' and actor_role not in ('staff', 'admin') then
    if old.user_id <> auth.uid()
       or old.status <> 'pending_approval'
       or new.status not in ('pending_approval', 'cancelled') then
      raise exception 'Students can only edit or cancel their own pending requests.';
    end if;

    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

comment on function public.validate_booking_rules()
is 'Rejects weekend bookings, bookings outside 09:00-17:00 Europe/London, blank descriptions, non-pending student inserts, and disallowed student status changes.';

create trigger bookings_validate_rules
before insert or update on public.bookings
for each row execute function public.validate_booking_rules();

create or replace function public.record_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.approval_history (
      booking_id,
      actor_id,
      from_status,
      to_status,
      note
    )
    values (
      new.id,
      auth.uid(),
      null,
      new.status,
      'Booking request created'
    );
  elsif old.status is distinct from new.status then
    insert into public.approval_history (
      booking_id,
      actor_id,
      from_status,
      to_status
    )
    values (
      new.id,
      auth.uid(),
      old.status,
      new.status
    );
  end if;

  return new;
end;
$$;

create trigger bookings_record_status_change
after insert or update on public.bookings
for each row execute function public.record_booking_status_change();

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.approval_history enable row level security;
alter table public.staff_notes enable row level security;

create policy "Profiles can be read by owner or staff"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_staff_or_admin());

create policy "Profiles can be updated by owner or admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "Admins can delete profiles"
on public.profiles
for delete
to authenticated
using (public.is_admin());

create policy "Authenticated users can view active rooms"
on public.rooms
for select
to authenticated
using (is_active = true or public.is_staff_or_admin());

create policy "Admins can manage rooms"
on public.rooms
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Bookings can be read by owner or staff"
on public.bookings
for select
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin());

create policy "Students can create their own pending bookings"
on public.bookings
for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending_approval');

create policy "Students can update their own pending bookings"
on public.bookings
for update
to authenticated
using (
  user_id = auth.uid()
  and status = 'pending_approval'
)
with check (user_id = auth.uid());

create policy "Staff can update bookings"
on public.bookings
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

create policy "Admins can delete bookings"
on public.bookings
for delete
to authenticated
using (public.is_admin());

create policy "Approval history can be read by owner or staff"
on public.approval_history
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings
    where bookings.id = approval_history.booking_id
      and (bookings.user_id = auth.uid() or public.is_staff_or_admin())
  )
);

create policy "Staff can add approval history"
on public.approval_history
for insert
to authenticated
with check (public.is_staff_or_admin());

create policy "Staff notes are staff only"
on public.staff_notes
for select
to authenticated
using (public.is_staff_or_admin());

create policy "Staff can create notes"
on public.staff_notes
for insert
to authenticated
with check (public.is_staff_or_admin() and staff_id = auth.uid());

create policy "Staff can update their notes and admins can update all"
on public.staff_notes
for update
to authenticated
using (staff_id = auth.uid() or public.is_admin())
with check (staff_id = auth.uid() or public.is_admin());

create policy "Admins can delete notes"
on public.staff_notes
for delete
to authenticated
using (public.is_admin());

insert into public.rooms (name, location, description, capacity, color, sort_order)
values
  ('Studio 1', 'Sound Production Department', 'Primary recording studio for band, vocal, and ensemble sessions.', 8, '#177a68', 1),
  ('Studio 2', 'Sound Production Department', 'Secondary studio for overdubs, voice work, and smaller recording sessions.', 6, '#2563eb', 2),
  ('Edit Suite 1', 'Sound Production Department', 'Post-production suite for editing, comping, and session preparation.', 2, '#b7791f', 3),
  ('Edit Suite 2', 'Sound Production Department', 'Editing and production workstation for student project work.', 2, '#7c3aed', 4),
  ('Edit Suite 3', 'Sound Production Department', 'Editing suite for coursework, podcast assembly, and mix preparation.', 2, '#0891b2', 5),
  ('Dolby Atmos Suite', 'Sound Production Department', 'Immersive audio suite for spatial mixing and Dolby Atmos project work.', 4, '#c2413d', 6);
