-- Stage 2 schema for Fife College microphone and DI inventory.
-- Run after 20260527110000_stage_1_schema.sql.
-- This file is retry-safe for SQL Editor use: it tolerates an earlier failed
-- partial run by using IF NOT EXISTS and recreating Stage 2 triggers/policies.

create extension if not exists pgcrypto;

create table if not exists public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.equipment_categories(id) on delete restrict,
  name text not null,
  total_quantity integer not null check (total_quantity >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

create table if not exists public.booking_equipment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  equipment_item_id uuid not null references public.equipment_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'requested' check (
    status in ('requested', 'approved', 'amended', 'rejected', 'cancelled')
  ),
  staff_adjusted_quantity integer check (
    staff_adjusted_quantity is null or staff_adjusted_quantity >= 0
  ),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, equipment_item_id)
);

create index if not exists equipment_items_category_id_idx
on public.equipment_items(category_id);

create index if not exists booking_equipment_booking_id_idx
on public.booking_equipment(booking_id);

create index if not exists booking_equipment_equipment_item_id_idx
on public.booking_equipment(equipment_item_id);

drop trigger if exists equipment_items_set_updated_at on public.equipment_items;
create trigger equipment_items_set_updated_at
before update on public.equipment_items
for each row execute function public.set_updated_at();

drop trigger if exists booking_equipment_set_updated_at on public.booking_equipment;
create trigger booking_equipment_set_updated_at
before update on public.booking_equipment
for each row execute function public.set_updated_at();

create or replace function public.get_equipment_reserved_quantity(
  p_equipment_item_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(be.staff_adjusted_quantity, be.quantity)), 0)::integer
  from public.booking_equipment be
  join public.bookings b on b.id = be.booking_id
  where be.equipment_item_id = p_equipment_item_id
    and be.status in ('requested', 'approved', 'amended')
    and b.status::text in ('pending_approval', 'approved')
    and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
    and b.starts_at < p_ends_at
    and b.ends_at > p_starts_at
$$;

comment on function public.get_equipment_reserved_quantity(uuid, timestamptz, timestamptz, uuid)
is 'Returns the quantity of an equipment item reserved by overlapping Pending Approval or Approved bookings. Rejected and Cancelled bookings, and rejected/cancelled equipment rows, do not reserve stock.';

create or replace function public.validate_booking_equipment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.user_role;
  parent_booking public.bookings%rowtype;
  item_total integer;
  effective_quantity integer;
  reserved_quantity integer;
begin
  actor_role := coalesce(public.current_user_role(), 'student');

  select *
  into parent_booking
  from public.bookings
  where id = new.booking_id;

  if parent_booking.id is null then
    raise exception 'Booking was not found for equipment request.';
  end if;

  if actor_role not in ('staff', 'admin') then
    if parent_booking.user_id <> auth.uid() or parent_booking.status::text <> 'pending_approval' then
      raise exception 'Students can only manage equipment for their own pending bookings.';
    end if;

    if new.status <> 'requested'
       or new.staff_adjusted_quantity is not null
       or new.staff_notes is not null then
      raise exception 'Students cannot approve, amend, reject, or add staff notes to equipment.';
    end if;
  end if;

  select total_quantity
  into item_total
  from public.equipment_items
  where id = new.equipment_item_id
    and (is_active = true or actor_role in ('staff', 'admin'));

  if item_total is null then
    raise exception 'Equipment item is unavailable.';
  end if;

  effective_quantity := coalesce(new.staff_adjusted_quantity, new.quantity);

  if new.status in ('requested', 'approved', 'amended')
     and parent_booking.status::text in ('pending_approval', 'approved') then
    -- Availability calculation:
    -- 1. Look at other bookings that overlap the same time window.
    -- 2. Count only booking statuses that reserve resources: Pending Approval and Approved.
    -- 3. Count only equipment statuses that reserve stock: requested, approved, amended.
    -- 4. Compare requested/amended quantity with total stock minus reserved stock.
    reserved_quantity := public.get_equipment_reserved_quantity(
      new.equipment_item_id,
      parent_booking.starts_at,
      parent_booking.ends_at,
      new.booking_id
    );

    if effective_quantity > item_total - reserved_quantity then
      raise exception
        'Some requested equipment is unavailable at this time. Please choose alternative equipment or contact a member of staff.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_booking_equipment_rules()
is 'Enforces equipment request ownership, prevents student staff-field changes, and rejects requests exceeding stock after overlapping active bookings are counted.';

drop trigger if exists booking_equipment_validate_rules on public.booking_equipment;
create trigger booking_equipment_validate_rules
before insert or update on public.booking_equipment
for each row execute function public.validate_booking_equipment_rules();

alter table public.equipment_categories enable row level security;
alter table public.equipment_items enable row level security;
alter table public.booking_equipment enable row level security;

drop policy if exists "Authenticated users can view equipment categories"
on public.equipment_categories;

create policy "Authenticated users can view equipment categories"
on public.equipment_categories
for select
to authenticated
using (true);

drop policy if exists "Admins can manage equipment categories"
on public.equipment_categories;

create policy "Admins can manage equipment categories"
on public.equipment_categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can view active equipment"
on public.equipment_items;

create policy "Authenticated users can view active equipment"
on public.equipment_items
for select
to authenticated
using (is_active = true or public.is_staff_or_admin());

drop policy if exists "Admins can manage equipment items"
on public.equipment_items;

create policy "Admins can manage equipment items"
on public.equipment_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Booking equipment can be read by owner or staff"
on public.booking_equipment;

create policy "Booking equipment can be read by owner or staff"
on public.booking_equipment
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings
    where bookings.id = booking_equipment.booking_id
      and (bookings.user_id = auth.uid() or public.is_staff_or_admin())
  )
);

drop policy if exists "Students can add equipment to their pending bookings"
on public.booking_equipment;

create policy "Students can add equipment to their pending bookings"
on public.booking_equipment
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings
    where bookings.id = booking_equipment.booking_id
      and bookings.user_id = auth.uid()
      and bookings.status::text = 'pending_approval'
  )
);

drop policy if exists "Students can remove equipment from their pending bookings"
on public.booking_equipment;

create policy "Students can remove equipment from their pending bookings"
on public.booking_equipment
for delete
to authenticated
using (
  exists (
    select 1
    from public.bookings
    where bookings.id = booking_equipment.booking_id
      and bookings.user_id = auth.uid()
      and bookings.status::text = 'pending_approval'
  )
);

drop policy if exists "Staff can amend booking equipment"
on public.booking_equipment;

create policy "Staff can amend booking equipment"
on public.booking_equipment
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "Admins can delete booking equipment"
on public.booking_equipment;

create policy "Admins can delete booking equipment"
on public.booking_equipment
for delete
to authenticated
using (public.is_admin());

insert into public.equipment_categories (name, display_order)
values
  ('Large Diaphragm Condenser', 1),
  ('Small Diaphragm Condenser', 2),
  ('Dynamic', 3),
  ('Ribbon', 4),
  ('Shotgun', 5),
  ('DI Boxes', 6)
on conflict (name) do update
set display_order = excluded.display_order;

insert into public.equipment_items (category_id, name, total_quantity, notes)
values
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'Neumann U67', 2, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'Neumann U87', 4, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'Neumann TLM103', 1, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'Audio Technica AT4050', 4, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'AKG C414 BULS', 2, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'AKG C4000B', 1, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'AKG C3000B', 3, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'SE Electronics 4400a', 2, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'SE Electronics 2200a', 1, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'Rode NT2', 1, null),
  ((select id from public.equipment_categories where name = 'Large Diaphragm Condenser'), 'AKG Solid Tube', 1, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'Schoeps CMC6', 7, 'Capsules: 7 x Cardioid, 2 x Hypercardioid, 2 x Omni'),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'DPA 4006A', 5, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'Neumann KM184', 2, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'Neumann KM183', 2, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'AKG C451E', 1, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'AKG C1000', 2, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'Behringer ECM8000', 1, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'Oktava MK012', 2, 'Capsules: 2 x Cardioid, 2 x Hypercardioid, 2 x Omni'),
  -- The spreadsheet appears to list "SKG SE300B"; this seed intentionally corrects it to "AKG SE300B".
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'AKG SE300B', 3, 'Capsules: 2 x Cardioid, 2 x Hypercardioid, 2 x Omni'),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), 'PZM Mic', 2, null),
  ((select id from public.equipment_categories where name = 'Small Diaphragm Condenser'), '3DIO FS Binaural Mic', 3, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Shure SM7B', 2, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Shure SM57', 5, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Shure Beta 57', 2, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Shure Beta 58', 1, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Shure SM58', 1, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Beyerdynamic M201', 3, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Beyerdynamic TGX10', 5, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Beyerdynamic Opus 65', 1, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Audio Technica ATM25', 1, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Sennheiser MD421', 4, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'Sennheiser E606', 1, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'AKG D130', 3, null),
  ((select id from public.equipment_categories where name = 'Dynamic'), 'AKG D112', 2, null),
  ((select id from public.equipment_categories where name = 'Ribbon'), 'Coles 4038', 2, null),
  ((select id from public.equipment_categories where name = 'Shotgun'), 'Sennheiser MKH416', 2, null),
  ((select id from public.equipment_categories where name = 'Shotgun'), 'Sennheiser MKH418 Mid/Side', 1, null),
  ((select id from public.equipment_categories where name = 'Shotgun'), 'Sennheiser ME66', 1, null),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'BSS AR133', 2, null),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'LD Systems LDI02', 2, null),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'Behringer DI100', 6, null),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'Behringer DI20', 2, 'stereo'),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'Leem DI', 3, null),
  ((select id from public.equipment_categories where name = 'DI Boxes'), 'Palmer Dacapo Reamp Box', 3, null)
on conflict (category_id, name) do update
set
  total_quantity = excluded.total_quantity,
  notes = excluded.notes,
  is_active = true;
