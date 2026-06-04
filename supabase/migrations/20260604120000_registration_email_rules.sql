create or replace function public.is_fife_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(email, '')) like '%@fife.ac.uk'
$$;

create or replace function public.is_approved_staff_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(email, '')) = any (array[
    'grahamdeas@fife.ac.uk',
    'neilbethune@fife.ac.uk',
    'traviswhalley@fife.ac.uk',
    'jamesbisset@fife.ac.uk',
    'billthaw@fife.ac.uk'
  ])
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_fife_email(new.email) then
    raise exception 'Use your @fife.ac.uk email address to register.';
  end if;

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
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'course_class', ''),
    nullif(new.raw_user_meta_data ->> 'lecturer', '')
  );

  return new;
end;
$$;

create or replace function public.prevent_unapproved_staff_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('staff', 'admin') and not public.is_approved_staff_email(new.email) then
    raise exception 'Only approved Fife College staff email addresses can be assigned staff or admin access.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_unapproved_staff_role on public.profiles;

create trigger profiles_prevent_unapproved_staff_role
before insert or update on public.profiles
for each row execute function public.prevent_unapproved_staff_role();
