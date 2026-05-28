import {
  CalendarDays,
  Clock,
  DoorOpen,
  Inbox,
  MapPin,
  Mic2,
  ShieldCheck,
  Users
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { BookingCalendar } from "@/components/BookingCalendar";
import { ConfigurationNotice } from "@/components/ConfigurationNotice";
import { SignOutButton } from "@/components/SignOutButton";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type {
  DashboardBooking,
  DashboardEquipmentItem,
  EquipmentCategory,
  Profile,
  Room
} from "@/types/app";

export const dynamic = "force-dynamic";

function getUpcomingBookings(bookings: DashboardBooking[]) {
  const now = Date.now();

  return bookings.filter(
    (booking) =>
      booking.status !== "rejected" &&
      new Date(booking.ends_at).getTime() >= now
  );
}

function isStaffRole(role: Profile["role"]) {
  return role === "staff" || role === "admin";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getNextBusinessSlot() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);

  if (date.getHours() < 9) {
    date.setHours(9);
  }

  if (date.getHours() >= 17 || date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }
    date.setHours(9, 0, 0, 0);
  }

  const end = new Date(date);
  end.setHours(Math.min(date.getHours() + 1, 17));

  return {
    bookingDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    startTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10">
        <ConfigurationNotice />
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const fallbackProfile = {
    id: user.id,
    full_name:
      typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim().length > 0
        ? user.user_metadata.full_name
        : user.email ?? "Student",
    email: user.email ?? "",
    role: "student",
    course_class:
      typeof user.user_metadata?.course_class === "string"
        ? user.user_metadata.course_class
        : null,
    lecturer: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as const;
  let profile = (profileData ?? fallbackProfile) as Profile;

  if (!profileData) {
    const { data: insertedProfile } = await supabase
      .from("profiles")
      .insert({
        course_class: fallbackProfile.course_class,
        email: fallbackProfile.email,
        full_name: fallbackProfile.full_name,
        id: fallbackProfile.id,
        lecturer: fallbackProfile.lecturer,
        role: fallbackProfile.role
      })
      .select("*")
      .maybeSingle();

    if (insertedProfile) {
      profile = insertedProfile as Profile;
    }
  }

  const canReview = isStaffRole(profile.role);
  const isAdmin = profile.role === "admin";
  let bookingsQuery = supabase
    .from("bookings")
    .select(
      "*, rooms(name,color), booking_equipment(id,booking_id,equipment_item_id,quantity,status,staff_adjusted_quantity,staff_notes,created_at,updated_at,equipment_items(id,category_id,name,total_quantity,notes,is_active,created_at,updated_at,equipment_categories(name,display_order))), staff_notes(id,booking_id,staff_id,note,created_at,updated_at,profiles(full_name))"
    )
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  if (!canReview) {
    bookingsQuery = bookingsQuery.eq("user_id", user.id);
  }

  let roomsQuery = supabase.from("rooms").select("*").order("sort_order");

  if (!canReview) {
    roomsQuery = roomsQuery.eq("is_active", true);
  }

  const equipmentCategoriesQuery = supabase
    .from("equipment_categories")
    .select("*")
    .order("display_order");
  let equipmentItemsQuery = supabase
    .from("equipment_items")
    .select("*, equipment_categories(name,display_order)")
    .order("name");

  if (!canReview) {
    equipmentItemsQuery = equipmentItemsQuery.eq("is_active", true);
  }

  const [
    roomsResult,
    bookingsResult,
    profilesResult,
    equipmentCategoriesResult,
    equipmentItemsResult
  ] = await Promise.all([
    roomsQuery,
    bookingsQuery,
    isAdmin
      ? supabase.from("profiles").select("*").order("full_name")
      : Promise.resolve({ data: [] }),
    equipmentCategoriesQuery,
    equipmentItemsQuery
  ]);

  const rooms = (roomsResult.data ?? []) as Room[];
  const bookings = (bookingsResult.data ?? []) as DashboardBooking[];
  const profiles = (profilesResult.data ?? []) as Profile[];
  const equipmentCategories =
    (equipmentCategoriesResult.data ?? []) as EquipmentCategory[];
  const equipmentItems =
    (equipmentItemsResult.data ?? []) as DashboardEquipmentItem[];
  const upcomingBookings = getUpcomingBookings(bookings);
  const pendingBookings = bookings.filter(
    (booking) => booking.status === "pending_approval"
  );
  const nextBooking = upcomingBookings[0];
  const initialSlot = getNextBusinessSlot();

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-navy/10 bg-white px-4 py-4 shadow-soft lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-md bg-white p-2">
              <Image
                alt="Fife College"
                className="h-auto w-full object-contain"
                height={72}
                priority
                src="/branding/fife-college-logo.svg"
                width={180}
              />
            </div>
            <div>
              <p className="text-sm font-bold uppercase text-sky">
                Sound Production Department
              </p>
              <h1 className="mt-1 text-2xl font-black text-navy sm:text-3xl">
                Recording Studio Booking System
              </h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Signed in as {profile.full_name || user.email}
              </p>
            </div>
          </div>

          <SignOutButton />
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="panel flex items-center gap-3 p-4">
            <span className="rounded-md bg-teal/10 p-2 text-teal">
              <DoorOpen size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">
                {rooms.filter((room) => room.is_active).length}
              </p>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Bookable rooms
              </p>
            </div>
          </div>

          <div className="panel flex items-center gap-3 p-4">
            <span className="rounded-md bg-lime/30 p-2 text-navy">
              <Inbox size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">
                {pendingBookings.length}
              </p>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Pending approval
              </p>
            </div>
          </div>

          <div className="panel flex items-center gap-3 p-4">
            <span className="rounded-md bg-sky/10 p-2 text-sky">
              <CalendarDays size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">
                {upcomingBookings.length}
              </p>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Upcoming sessions
              </p>
            </div>
          </div>

          <div className="panel flex items-center gap-3 p-4">
            <span className="rounded-md bg-slate-100 p-2 text-slate-600">
              {canReview ? (
                <ShieldCheck size={20} aria-hidden="true" />
              ) : nextBooking ? (
                <Clock size={20} aria-hidden="true" />
              ) : (
                <Users size={20} aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">
                {canReview
                  ? profile.role.toUpperCase()
                  : nextBooking
                    ? formatDateTime(nextBooking.starts_at)
                    : "No booking queued"}
              </p>
              <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                <MapPin size={13} aria-hidden="true" />
                {nextBooking?.rooms?.name ?? "Access level"}
              </p>
            </div>
          </div>
        </section>

        <section className="panel flex flex-col gap-3 border-navy/10 bg-navy px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black uppercase">
              <Mic2 size={18} aria-hidden="true" />
              Microphone and DI inventory
            </h2>
            <p className="mt-1 text-sm text-white/75">
              {equipmentItems.length} inventory records loaded for booking
              requests and staff review.
            </p>
          </div>
          <span className="rounded-md bg-lime px-3 py-1 text-xs font-black uppercase text-navy">
            Stage 2
          </span>
        </section>

        <BookingCalendar
          bookings={bookings}
          canReview={canReview}
          equipmentCategories={equipmentCategories}
          equipmentItems={equipmentItems}
          initialSlot={initialSlot}
          isAdmin={isAdmin}
          profile={profile}
          profiles={profiles}
          rooms={rooms}
          userEmail={user.email ?? profile.email}
          userId={user.id}
        />
      </div>
    </main>
  );
}
