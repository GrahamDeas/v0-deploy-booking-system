"use server";

import { revalidatePath } from "next/cache";

import { COURSE_CLASS_OPTIONS } from "@/lib/booking-options";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingEquipmentStatus,
  BookingStatus,
  Profile,
  UserRole
} from "@/types/app";

type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "pending_approval",
  "approved"
];
const ACTIVE_EQUIPMENT_STATUSES: BookingEquipmentStatus[] = [
  "requested",
  "approved",
  "amended"
];
const STAFF_ROLES: UserRole[] = ["staff", "admin"];
const EQUIPMENT_UNAVAILABLE_MESSAGE =
  "Some requested equipment is unavailable at this time. Please choose alternative equipment or contact a member of staff.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EquipmentRequestInput = {
  equipmentItemId: string;
  quantity: number;
};

type EquipmentReviewInput = {
  id: string;
  staffAdjustedQuantity: number | null;
  staffNotes: string | null;
  status: BookingEquipmentStatus;
};

function getRequiredValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function getOptionalValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getOptionalInteger(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function isStaffRole(role: UserRole) {
  return STAFF_ROLES.includes(role);
}

function parseLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function isHalfHourTime(time: string) {
  return /^([01]\d|2[0-3]):(00|30)$/.test(time);
}

function validateBookingWindow(date: string, startTime: string, endTime: string) {
  const startsAt = parseLocalDateTime(date, startTime);
  const endsAt = parseLocalDateTime(date, endTime);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Choose a valid booking date and time." };
  }

  if (endsAt <= startsAt) {
    return { error: "The end time must be after the start time." };
  }

  const day = startsAt.getDay();

  if (day === 0 || day === 6) {
    return { error: "Bookings are only available Monday to Friday." };
  }

  if (!isHalfHourTime(startTime) || !isHalfHourTime(endTime)) {
    return { error: "Bookings can only start or end on the hour or half-hour." };
  }

  if (startTime < "09:00" || endTime > "17:00") {
    return { error: "Bookings must be between 9:00am and 5:00pm." };
  }

  if (startsAt.toDateString() !== endsAt.toDateString()) {
    return { error: "Bookings must start and end on the same day." };
  }

  return { startsAt, endsAt };
}

async function getCurrentProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in before managing bookings." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

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
    lecturer: null
  } as const;

  if (!data) {
    const { data: insertedProfile, error: insertError } = await supabase
      .from("profiles")
      .insert(fallbackProfile)
      .select("*")
      .maybeSingle();

    if (insertError) {
      return {
        error:
          "Your account profile is missing in Supabase. Apply the profile repair migration, then try again. " +
          insertError.message
      };
    }

    return { profile: insertedProfile as Profile, user };
  }

  const profile = data as Profile;

  return { profile, user };
}

async function ensureNoRoomConflict({
  endsAt,
  excludeBookingId,
  roomId,
  startsAt,
  supabase
}: {
  endsAt: Date;
  excludeBookingId?: string | null;
  roomId: string;
  startsAt: Date;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  let query = supabase
    .from("bookings")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ACTIVE_BOOKING_STATUSES)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);

  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  const { data, error } = await query;

  if (error) {
    return error.message;
  }

  if (data && data.length > 0) {
    return "That room already has a pending or approved booking during the selected time.";
  }

  return null;
}

async function resolveRoomId({
  roomName,
  roomValue,
  supabase
}: {
  roomName: string | null;
  roomValue: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (UUID_PATTERN.test(roomValue)) {
    return roomValue;
  }

  const nameToFind = roomName ?? roomValue;
  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("name", nameToFind)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Selected room is not available. Ask an admin to check the room seed data."
    );
  }

  return data.id;
}

function readBookingForm(formData: FormData) {
  const bookingDate = getRequiredValue(formData, "booking_date");
  const startTime = getRequiredValue(formData, "start_time");
  const endTime = getRequiredValue(formData, "end_time");
  const description = getRequiredValue(formData, "description");
  const courseClass = getRequiredValue(formData, "course_class");
  const window = validateBookingWindow(bookingDate, startTime, endTime);

  if ("error" in window) {
    throw new Error(window.error);
  }

  if (!(COURSE_CLASS_OPTIONS as readonly string[]).includes(courseClass)) {
    throw new Error("Choose a valid course / class.");
  }

  return {
    room_id: getRequiredValue(formData, "room_id"),
    student_name: getRequiredValue(formData, "student_name"),
    student_email: getRequiredValue(formData, "student_email"),
    course_class: courseClass,
    lecturer: getOptionalValue(formData, "lecturer") ?? "",
    starts_at: window.startsAt.toISOString(),
    ends_at: window.endsAt.toISOString(),
    description,
    additional_notes: getOptionalValue(formData, "additional_notes")
  };
}

function readEquipmentRequests(formData: FormData): EquipmentRequestInput[] {
  const noEquipmentRequired =
    formData.get("no_equipment_required") === "on" ||
    formData.get("no_equipment_required") === "true";
  const rawRequests = formData.get("equipment_requests");

  if (noEquipmentRequired) {
    return [];
  }

  if (typeof rawRequests !== "string" || rawRequests.trim().length === 0) {
    throw new Error("Select equipment or choose No equipment required.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawRequests);
  } catch {
    throw new Error("Equipment request data could not be read.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Equipment request data could not be read.");
  }

  const byItem = new Map<string, number>();

  parsed.forEach((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { equipmentItemId?: unknown }).equipmentItemId !== "string"
    ) {
      return;
    }

    const equipmentItemId = (item as { equipmentItemId: string }).equipmentItemId;
    const quantity = Number((item as { quantity?: unknown }).quantity);

    if (!equipmentItemId || !Number.isInteger(quantity) || quantity <= 0) {
      return;
    }

    byItem.set(equipmentItemId, (byItem.get(equipmentItemId) ?? 0) + quantity);
  });

  const requests = Array.from(byItem, ([equipmentItemId, quantity]) => ({
    equipmentItemId,
    quantity
  }));

  if (requests.length === 0) {
    throw new Error("Select equipment or choose No equipment required.");
  }

  return requests;
}

async function ensureEquipmentAvailable({
  endsAt,
  excludeBookingId,
  requests,
  startsAt,
  supabase
}: {
  endsAt: Date;
  excludeBookingId?: string | null;
  requests: EquipmentRequestInput[];
  startsAt: Date;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (requests.length === 0) {
    return null;
  }

  const itemIds = requests.map((request) => request.equipmentItemId);
  const { data: items, error: itemsError } = await supabase
    .from("equipment_items")
    .select("id,total_quantity,is_active")
    .in("id", itemIds);

  if (itemsError) {
    return itemsError.message;
  }

  const itemsById = new Map(
    (items ?? []).map((item) => [
      item.id,
      {
        isActive: Boolean(item.is_active),
        totalQuantity: Number(item.total_quantity)
      }
    ])
  );

  for (const request of requests) {
    const item = itemsById.get(request.equipmentItemId);

    if (!item || !item.isActive || request.quantity > item.totalQuantity) {
      return EQUIPMENT_UNAVAILABLE_MESSAGE;
    }

    const { data: reservedQuantity, error: reservedError } = await supabase.rpc(
      "get_equipment_reserved_quantity",
      {
        p_ends_at: endsAt.toISOString(),
        p_equipment_item_id: request.equipmentItemId,
        p_exclude_booking_id: excludeBookingId ?? null,
        p_starts_at: startsAt.toISOString()
      }
    );

    if (reservedError) {
      return reservedError.message;
    }

    const availableQuantity = item.totalQuantity - Number(reservedQuantity ?? 0);

    if (request.quantity > availableQuantity) {
      return EQUIPMENT_UNAVAILABLE_MESSAGE;
    }
  }

  return null;
}

function readEquipmentReviewInputs(formData: FormData) {
  const ids = formData
    .getAll("booking_equipment_id")
    .filter((value): value is string => typeof value === "string");
  const inputs = new Map<string, EquipmentReviewInput>();

  ids.forEach((id) => {
    const rawStatus = formData.get(`equipment_status_${id}`);
    const status =
      typeof rawStatus === "string" &&
      ACTIVE_EQUIPMENT_STATUSES.concat(["rejected", "cancelled"]).includes(
        rawStatus as BookingEquipmentStatus
      )
        ? (rawStatus as BookingEquipmentStatus)
        : "approved";
    const staffAdjustedQuantity = getOptionalInteger(
      formData,
      `equipment_quantity_${id}`
    );

    inputs.set(id, {
      id,
      staffAdjustedQuantity,
      staffNotes: getOptionalValue(formData, `equipment_staff_notes_${id}`),
      status
    });
  });

  return inputs;
}

export async function createBookingAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  try {
    const values = readBookingForm(formData);
    values.room_id = await resolveRoomId({
      roomName: getOptionalValue(formData, "room_name"),
      roomValue: values.room_id,
      supabase
    });
    const equipmentRequests = readEquipmentRequests(formData);
    const conflictError = await ensureNoRoomConflict({
      endsAt: new Date(values.ends_at),
      roomId: values.room_id,
      startsAt: new Date(values.starts_at),
      supabase
    });

    if (conflictError) {
      return { ok: false, error: conflictError };
    }

    const equipmentConflictError = await ensureEquipmentAvailable({
      endsAt: new Date(values.ends_at),
      requests: equipmentRequests,
      startsAt: new Date(values.starts_at),
      supabase
    });

    if (equipmentConflictError) {
      return { ok: false, error: equipmentConflictError };
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        ...values,
        user_id: auth.user.id,
        status: "pending_approval"
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (equipmentRequests.length > 0) {
      const { error: equipmentError } = await supabase
        .from("booking_equipment")
        .insert(
          equipmentRequests.map((request) => ({
            booking_id: booking.id,
            equipment_item_id: request.equipmentItemId,
            quantity: request.quantity,
            status: "requested" as BookingEquipmentStatus
          }))
        );

      if (equipmentError) {
        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id)
          .eq("user_id", auth.user.id);

        return { ok: false, error: equipmentError.message };
      }
    }

    revalidatePath("/dashboard");

    return { ok: true, message: "Booking request submitted for approval." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to create booking request."
    };
  }
}

export async function updateBookingAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  try {
    const bookingId = getRequiredValue(formData, "booking_id");
    const values = readBookingForm(formData);
    values.room_id = await resolveRoomId({
      roomName: getOptionalValue(formData, "room_name"),
      roomValue: values.room_id,
      supabase
    });
    const equipmentRequests = readEquipmentRequests(formData);
    const conflictError = await ensureNoRoomConflict({
      endsAt: new Date(values.ends_at),
      excludeBookingId: bookingId,
      roomId: values.room_id,
      startsAt: new Date(values.starts_at),
      supabase
    });

    if (conflictError) {
      return { ok: false, error: conflictError };
    }

    const equipmentConflictError = await ensureEquipmentAvailable({
      endsAt: new Date(values.ends_at),
      excludeBookingId: bookingId,
      requests: equipmentRequests,
      startsAt: new Date(values.starts_at),
      supabase
    });

    if (equipmentConflictError) {
      return { ok: false, error: equipmentConflictError };
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(values)
      .eq("id", bookingId)
      .eq("user_id", auth.user.id)
      .eq("status", "pending_approval")
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "Only your pending requests can be edited." };
    }

    const { error: deleteEquipmentError } = await supabase
      .from("booking_equipment")
      .delete()
      .eq("booking_id", bookingId);

    if (deleteEquipmentError) {
      return { ok: false, error: deleteEquipmentError.message };
    }

    if (equipmentRequests.length > 0) {
      const { error: equipmentError } = await supabase
        .from("booking_equipment")
        .insert(
          equipmentRequests.map((request) => ({
            booking_id: bookingId,
            equipment_item_id: request.equipmentItemId,
            quantity: request.quantity,
            status: "requested" as BookingEquipmentStatus
          }))
        );

      if (equipmentError) {
        return { ok: false, error: equipmentError.message };
      }
    }

    revalidatePath("/dashboard");

    return { ok: true, message: "Pending booking request updated." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to update booking request."
    };
  }
}

export async function cancelBookingAction(bookingId: string): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  const isStaff = isStaffRole(auth.profile.role);
  let query = supabase
    .from("bookings")
    .update({
      status: "cancelled",
      reviewed_by: isStaff ? auth.user.id : null,
      reviewed_at: isStaff ? new Date().toISOString() : null
    })
    .eq("id", bookingId);

  if (!isStaff) {
    query = query.eq("user_id", auth.user.id).eq("status", "pending_approval");
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return {
      ok: false,
      error: isStaff
        ? "No cancellable booking was found."
        : "Only your pending requests can be cancelled."
    };
  }

  await supabase
    .from("booking_equipment")
    .update({ status: "cancelled" })
    .eq("booking_id", bookingId);

  revalidatePath("/dashboard");

  return { ok: true, message: "Booking cancelled." };
}

export async function reviewBookingAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (!isStaffRole(auth.profile.role)) {
    return { ok: false, error: "Only staff and admins can review bookings." };
  }

  const bookingId = getRequiredValue(formData, "booking_id");
  const status = getRequiredValue(formData, "status") as BookingStatus;
  const note = getOptionalValue(formData, "staff_note");

  if (!["approved", "rejected", "cancelled"].includes(status)) {
    return { ok: false, error: "Choose a valid review decision." };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,starts_at,ends_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return { ok: false, error: bookingError.message };
  }

  if (!booking) {
    return { ok: false, error: "Booking request was not found." };
  }

  if (status === "approved") {
    const reviewInputs = readEquipmentReviewInputs(formData);
    const { data: equipmentRows, error: equipmentError } = await supabase
      .from("booking_equipment")
      .select("id,equipment_item_id,quantity,status")
      .eq("booking_id", bookingId);

    if (equipmentError) {
      return { ok: false, error: equipmentError.message };
    }

    const plannedUpdates = (equipmentRows ?? []).map((row) => {
      const input = reviewInputs.get(row.id);
      const requestedQuantity = Number(row.quantity);
      const adjustedQuantity =
        input?.staffAdjustedQuantity === null ||
        input?.staffAdjustedQuantity === undefined
          ? requestedQuantity
          : input.staffAdjustedQuantity;
      const selectedStatus = input?.status ?? "approved";
      const statusForRow: BookingEquipmentStatus =
        selectedStatus === "rejected" || selectedStatus === "cancelled"
          ? selectedStatus
          : adjustedQuantity === requestedQuantity
            ? "approved"
            : "amended";

      return {
        id: row.id,
        equipmentItemId: row.equipment_item_id,
        quantity: Math.max(0, adjustedQuantity),
        staffNotes: input?.staffNotes ?? null,
        status: statusForRow
      };
    });

    const reservingRequests = plannedUpdates
      .filter((update) => ACTIVE_EQUIPMENT_STATUSES.includes(update.status))
      .map((update) => ({
        equipmentItemId: update.equipmentItemId,
        quantity: update.quantity
      }));

    const equipmentConflictError = await ensureEquipmentAvailable({
      endsAt: new Date(booking.ends_at),
      excludeBookingId: bookingId,
      requests: reservingRequests,
      startsAt: new Date(booking.starts_at),
      supabase
    });

    if (equipmentConflictError) {
      return { ok: false, error: equipmentConflictError };
    }

    for (const update of plannedUpdates) {
      if (ACTIVE_EQUIPMENT_STATUSES.includes(update.status) && update.quantity <= 0) {
        return { ok: false, error: "Approved equipment quantities must be greater than zero." };
      }

      const { error: updateEquipmentError } = await supabase
        .from("booking_equipment")
        .update({
          staff_adjusted_quantity:
            update.status === "amended" ? update.quantity : null,
          staff_notes: update.staffNotes,
          status: update.status
        })
        .eq("id", update.id);

      if (updateEquipmentError) {
        return { ok: false, error: updateEquipmentError.message };
      }
    }
  } else {
    const equipmentStatus: BookingEquipmentStatus =
      status === "cancelled" ? "cancelled" : "rejected";
    const { error: updateEquipmentError } = await supabase
      .from("booking_equipment")
      .update({ status: equipmentStatus })
      .eq("booking_id", bookingId);

    if (updateEquipmentError) {
      return { ok: false, error: updateEquipmentError.message };
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", bookingId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "Booking request was not found." };
  }

  if (note) {
    const { error: noteError } = await supabase.from("staff_notes").insert({
      booking_id: bookingId,
      staff_id: auth.user.id,
      note
    });

    if (noteError) {
      return { ok: false, error: noteError.message };
    }
  }

  revalidatePath("/dashboard");

  return { ok: true, message: `Booking ${status.replace("_", " ")}.` };
}

export async function addStaffNoteAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (!isStaffRole(auth.profile.role)) {
    return { ok: false, error: "Only staff and admins can add staff notes." };
  }

  const { error } = await supabase.from("staff_notes").insert({
    booking_id: getRequiredValue(formData, "booking_id"),
    staff_id: auth.user.id,
    note: getRequiredValue(formData, "staff_note")
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");

  return { ok: true, message: "Staff note added." };
}

export async function saveRoomAction(formData: FormData): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (auth.profile.role !== "admin") {
    return { ok: false, error: "Only admins can manage rooms." };
  }

  const roomId = getOptionalValue(formData, "room_id");
  const capacity = Number(getRequiredValue(formData, "capacity"));
  const sortOrder = Number(getRequiredValue(formData, "sort_order"));
  const values = {
    name: getRequiredValue(formData, "name"),
    location: getRequiredValue(formData, "location"),
    description: getOptionalValue(formData, "description"),
    capacity: Number.isFinite(capacity) ? capacity : 1,
    color: getRequiredValue(formData, "color"),
    is_active: formData.get("is_active") === "on",
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
  };

  const { error } = roomId
    ? await supabase.from("rooms").update(values).eq("id", roomId)
    : await supabase.from("rooms").insert(values);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");

  return { ok: true, message: roomId ? "Room updated." : "Room created." };
}

export async function saveUserAction(formData: FormData): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (auth.profile.role !== "admin") {
    return { ok: false, error: "Only admins can manage users." };
  }

  const userId = getRequiredValue(formData, "user_id");
  const role = getRequiredValue(formData, "role") as UserRole;

  if (!["student", "staff", "admin"].includes(role)) {
    return { ok: false, error: "Choose a valid user role." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: getRequiredValue(formData, "full_name"),
      role,
      course_class: getOptionalValue(formData, "course_class"),
      lecturer: getOptionalValue(formData, "lecturer")
    })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");

  return { ok: true, message: "User updated." };
}

export async function saveEquipmentCategoryAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (auth.profile.role !== "admin") {
    return { ok: false, error: "Only admins can manage equipment categories." };
  }

  const categoryId = getOptionalValue(formData, "category_id");
  const displayOrder = Number(getRequiredValue(formData, "display_order"));
  const values = {
    display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
    name: getRequiredValue(formData, "name")
  };

  const { error } = categoryId
    ? await supabase
        .from("equipment_categories")
        .update(values)
        .eq("id", categoryId)
    : await supabase.from("equipment_categories").insert(values);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");

  return {
    ok: true,
    message: categoryId ? "Equipment category updated." : "Equipment category added."
  };
}

export async function saveEquipmentItemAction(
  formData: FormData
): Promise<ActionResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase environment variables are not configured." };
  }

  const supabase = await createClient();
  const auth = await getCurrentProfile(supabase);

  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (auth.profile.role !== "admin") {
    return { ok: false, error: "Only admins can manage equipment inventory." };
  }

  const equipmentItemId = getOptionalValue(formData, "equipment_item_id");
  const totalQuantity = Number(getRequiredValue(formData, "total_quantity"));
  const values = {
    category_id: getRequiredValue(formData, "category_id"),
    is_active: formData.get("is_active") === "on",
    name: getRequiredValue(formData, "name"),
    notes: getOptionalValue(formData, "notes"),
    total_quantity:
      Number.isInteger(totalQuantity) && totalQuantity >= 0 ? totalQuantity : 0
  };

  const { error } = equipmentItemId
    ? await supabase
        .from("equipment_items")
        .update(values)
        .eq("id", equipmentItemId)
    : await supabase.from("equipment_items").insert(values);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");

  return {
    ok: true,
    message: equipmentItemId ? "Equipment item updated." : "Equipment item added."
  };
}
