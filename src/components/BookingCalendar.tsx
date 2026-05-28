"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventInput
} from "@fullcalendar/core";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  DoorOpen,
  Edit3,
  FileText,
  Filter,
  MapPin,
  MessageSquare,
  Mic2,
  PackageCheck,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addStaffNoteAction,
  cancelBookingAction,
  createBookingAction,
  reviewBookingAction,
  saveEquipmentCategoryAction,
  saveEquipmentItemAction,
  saveRoomAction,
  saveUserAction,
  updateBookingAction
} from "@/app/dashboard/actions";
import { StatusPill } from "@/components/StatusPill";
import {
  BOOKABLE_ROOM_NAMES,
  COURSE_CLASS_OPTIONS,
  DEFAULT_COURSE_CLASS
} from "@/lib/booking-options";
import { cn, formatDateTime, formatDisplayDate } from "@/lib/utils";
import type {
  BookingEquipmentStatus,
  BookingStatus,
  DashboardBooking,
  DashboardBookingEquipment,
  DashboardEquipmentItem,
  EquipmentCategory,
  EquipmentItem,
  Profile,
  Room,
  UserRole
} from "@/types/app";

type BookingCalendarProps = {
  bookings: DashboardBooking[];
  canReview: boolean;
  equipmentCategories: EquipmentCategory[];
  equipmentItems: DashboardEquipmentItem[];
  initialSlot: {
    bookingDate: string;
    endTime: string;
    startTime: string;
  };
  isAdmin: boolean;
  profile: Profile;
  profiles: Profile[];
  rooms: Room[];
  userEmail: string;
  userId: string;
};

type BookingFormState = {
  additionalNotes: string;
  bookingDate: string;
  courseClass: string;
  description: string;
  endTime: string;
  roomId: string;
  startTime: string;
  studentEmail: string;
  studentName: string;
};

type EquipmentQuantityState = Record<string, number>;

type RoomOption = Pick<
  Room,
  "color" | "id" | "is_active" | "location" | "name" | "sort_order"
> & {
  isSeededFallback?: boolean;
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

const statusEventColors: Record<BookingStatus, string> = {
  pending_approval: "#8a8f1d",
  approved: "#18B0C0",
  rejected: "#c2413d",
  cancelled: "#64748b"
};

const equipmentStatusStyles: Record<BookingEquipmentStatus, string> = {
  amended: "border-sky/30 bg-sky/10 text-blue",
  approved: "border-teal/30 bg-teal/10 text-teal",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  rejected: "border-red-200 bg-red-50 text-red-700",
  requested: "border-lime/70 bg-lime/20 text-navy"
};

const equipmentStatusLabels: Record<BookingEquipmentStatus, string> = {
  amended: "Amended",
  approved: "Approved",
  cancelled: "Cancelled",
  rejected: "Rejected",
  requested: "Requested"
};

const TIME_OPTIONS = Array.from({ length: 17 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${pad(hours)}:${pad(minutes)}`;
});

const START_TIME_OPTIONS = TIME_OPTIONS.filter((time) => time < "17:00");
const END_TIME_OPTIONS = TIME_OPTIONS.filter((time) => time > "09:00");

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function isHalfHourTime(time: string) {
  return TIME_OPTIONS.includes(time);
}

function formatTimeOption(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${pad(minutes)}${period}`;
}

function getNextEndTime(startTime: string) {
  return END_TIME_OPTIONS.find((time) => time > startTime) ?? "17:00";
}

function getWeekdayDateOptions(selectedDate: string) {
  const dates: string[] = [];
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 120; dayOffset += 1) {
    const candidate = new Date(date);
    candidate.setDate(date.getDate() + dayOffset);

    if (candidate.getDay() >= 1 && candidate.getDay() <= 5) {
      dates.push(toDateInputValue(candidate));
    }
  }

  if (selectedDate && !dates.includes(selectedDate)) {
    dates.unshift(selectedDate);
  }

  return dates;
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startsAt))}-${formatter.format(
    new Date(endsAt)
  )}`;
}

function formatCalendarTitle(dateInfo: DatesSetArg) {
  if (dateInfo.view.type === "dayGridMonth") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric"
    }).format(dateInfo.view.currentStart);
  }

  const inclusiveEnd = new Date(dateInfo.end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

  if (dateInfo.start.toDateString() === inclusiveEnd.toDateString()) {
    return formatDisplayDate(dateInfo.start);
  }

  return `${formatDisplayDate(dateInfo.start)} - ${formatDisplayDate(
    inclusiveEnd
  )}`;
}

function getStatusLabel(status: BookingStatus) {
  const labels: Record<BookingStatus, string> = {
    pending_approval: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled"
  };

  return labels[status];
}

function buildInitialForm(
  profile: Profile,
  userEmail: string,
  rooms: Room[],
  initialSlot: BookingCalendarProps["initialSlot"]
) {
  const roomOptions = getOrderedRoomOptions(rooms);

  return {
    additionalNotes: "",
    bookingDate: initialSlot.bookingDate,
    courseClass: COURSE_CLASS_OPTIONS.includes(
      profile.course_class as (typeof COURSE_CLASS_OPTIONS)[number]
    )
      ? profile.course_class ?? DEFAULT_COURSE_CLASS
      : DEFAULT_COURSE_CLASS,
    description: "",
    endTime: initialSlot.endTime,
    roomId: roomOptions[0]?.id ?? "",
    startTime: initialSlot.startTime,
    studentEmail: profile.email || userEmail,
    studentName: profile.full_name || "Student"
  };
}

function getOrderedRoomOptions(rooms: Room[]): RoomOption[] {
  const activeRooms = rooms.filter((room) => room.is_active);
  const byName = new Map(activeRooms.map((room) => [room.name, room]));
  const orderedRooms = BOOKABLE_ROOM_NAMES.map((name, index) => {
    const room = byName.get(name);

    return (
      room ?? {
        color: "#18B0C0",
        id: name,
        is_active: true,
        isSeededFallback: true,
        location: "Sound Production Department",
        name,
        sort_order: index + 1
      }
    );
  });
  const extraRooms = activeRooms
    .filter((room) => !(BOOKABLE_ROOM_NAMES as readonly string[]).includes(room.name))
    .sort((left, right) => left.sort_order - right.sort_order);

  return [...orderedRooms, ...extraRooms];
}

function isWorkingWindow(date: string, startTime: string, endTime: string) {
  const startsAt = parseLocalDateTime(date, startTime);
  const endsAt = parseLocalDateTime(date, endTime);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return "Choose a valid booking date and time.";
  }

  if (endsAt <= startsAt) {
    return "The end time must be after the start time.";
  }

  if (startsAt.getDay() === 0 || startsAt.getDay() === 6) {
    return "Bookings are only available Monday to Friday.";
  }

  if (!isHalfHourTime(startTime) || !isHalfHourTime(endTime)) {
    return "Bookings can only start or end on the hour or half-hour.";
  }

  if (startTime < "09:00" || endTime > "17:00") {
    return "Bookings must be between 9:00am and 5:00pm.";
  }

  return null;
}

function hasConflict(
  bookings: DashboardBooking[],
  form: BookingFormState,
  editingBookingId: string | null
) {
  const startsAt = parseLocalDateTime(form.bookingDate, form.startTime);
  const endsAt = parseLocalDateTime(form.bookingDate, form.endTime);

  return bookings.some((booking) => {
    if (booking.id === editingBookingId) {
      return false;
    }

    if (booking.room_id !== form.roomId && booking.rooms?.name !== form.roomId) {
      return false;
    }

    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      return false;
    }

    return (
      new Date(booking.starts_at) < endsAt && new Date(booking.ends_at) > startsAt
    );
  });
}

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function overlapsWindow(
  booking: Pick<DashboardBooking, "ends_at" | "starts_at">,
  startsAt: Date,
  endsAt: Date
) {
  return new Date(booking.starts_at) < endsAt && new Date(booking.ends_at) > startsAt;
}

function getReservedEquipmentQuantity({
  bookings,
  editingBookingId,
  endsAt,
  equipmentItemId,
  startsAt
}: {
  bookings: DashboardBooking[];
  editingBookingId: string | null;
  endsAt: Date;
  equipmentItemId: string;
  startsAt: Date;
}) {
  return bookings.reduce((total, booking) => {
    if (booking.id === editingBookingId) {
      return total;
    }

    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      return total;
    }

    if (!overlapsWindow(booking, startsAt, endsAt)) {
      return total;
    }

    return (
      total +
      getBookingEquipment(booking)
        .filter(
          (row) =>
            row.equipment_item_id === equipmentItemId &&
            ACTIVE_EQUIPMENT_STATUSES.includes(row.status)
        )
        .reduce((rowTotal, row) => rowTotal + getEffectiveEquipmentQuantity(row), 0)
    );
  }, 0);
}

function getSelectedEquipmentRequests(equipmentQuantities: EquipmentQuantityState) {
  return Object.entries(equipmentQuantities)
    .map(([equipmentItemId, quantity]) => ({
      equipmentItemId,
      quantity: Number(quantity)
    }))
    .filter((request) => Number.isInteger(request.quantity) && request.quantity > 0);
}

function createBookingFormData(
  form: BookingFormState,
  editingBookingId: string | null,
  equipmentRequests: Array<{ equipmentItemId: string; quantity: number }>,
  noEquipmentRequired: boolean,
  roomName: string
) {
  const formData = new FormData();

  if (editingBookingId) {
    formData.set("booking_id", editingBookingId);
  }

  formData.set("student_name", form.studentName);
  formData.set("student_email", form.studentEmail);
  formData.set("course_class", form.courseClass);
  formData.set("lecturer", "");
  formData.set("room_id", form.roomId);
  formData.set("room_name", roomName);
  formData.set("booking_date", form.bookingDate);
  formData.set("start_time", form.startTime);
  formData.set("end_time", form.endTime);
  formData.set("description", form.description);
  formData.set("additional_notes", form.additionalNotes);
  formData.set("equipment_requests", JSON.stringify(equipmentRequests));
  formData.set(
    "no_equipment_required",
    noEquipmentRequired ? "true" : "false"
  );

  return formData;
}

function getEffectiveEquipmentQuantity(row: DashboardBookingEquipment) {
  return row.staff_adjusted_quantity ?? row.quantity;
}

function getBookingEquipment(booking: DashboardBooking | null) {
  return booking?.booking_equipment ?? [];
}

function summarizeEquipment(booking: DashboardBooking) {
  const rows = getBookingEquipment(booking).filter(
    (row) => row.status !== "cancelled"
  );

  if (rows.length === 0) {
    return "No equipment required";
  }

  return rows
    .map(
      (row) =>
        `${getEffectiveEquipmentQuantity(row)} x ${
          row.equipment_items?.name ?? "Equipment"
        }`
    )
    .join(", ");
}

function equipmentStatusPill(status: BookingEquipmentStatus) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[0.7rem] font-black uppercase",
        equipmentStatusStyles[status]
      )}
    >
      {equipmentStatusLabels[status]}
    </span>
  );
}

export function BookingCalendar({
  bookings,
  canReview,
  equipmentCategories,
  equipmentItems,
  initialSlot,
  isAdmin,
  profile,
  profiles,
  rooms,
  userEmail,
  userId
}: BookingCalendarProps) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const roomOptions = useMemo(
    () => getOrderedRoomOptions(rooms),
    [rooms]
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [form, setForm] = useState<BookingFormState>(() =>
    buildInitialForm(profile, userEmail, rooms, initialSlot)
  );
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [staffNote, setStaffNote] = useState("");
  const [equipmentQuantities, setEquipmentQuantities] =
    useState<EquipmentQuantityState>({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState("all");
  const [noEquipmentRequired, setNoEquipmentRequired] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState("");

  useEffect(() => {
    function applyResponsiveView() {
      const api = calendarRef.current?.getApi();

      if (!api) {
        return;
      }

      api.changeView(window.innerWidth < 820 ? "listWeek" : "timeGridWeek");
    }

    applyResponsiveView();
    window.addEventListener("resize", applyResponsiveView);

    return () => window.removeEventListener("resize", applyResponsiveView);
  }, []);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  );

  const pendingBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "pending_approval"),
    [bookings]
  );

  const selectedEquipmentRequests = useMemo(
    () => getSelectedEquipmentRequests(equipmentQuantities),
    [equipmentQuantities]
  );
  const equipmentItemCount = equipmentItems.length;

  const equipmentItemLookup = useMemo(
    () => new Map(equipmentItems.map((item) => [item.id, item])),
    [equipmentItems]
  );

  const equipmentWindow = useMemo(() => {
    const startsAt = parseLocalDateTime(form.bookingDate, form.startTime);
    const endsAt = parseLocalDateTime(form.bookingDate, form.endTime);

    return { endsAt, startsAt };
  }, [form.bookingDate, form.endTime, form.startTime]);
  const dateOptions = useMemo(
    () => getWeekdayDateOptions(form.bookingDate),
    [form.bookingDate]
  );
  const endTimeOptions = useMemo(
    () => END_TIME_OPTIONS.filter((time) => time > form.startTime),
    [form.startTime]
  );

  const groupedEquipmentItems = useMemo(() => {
    const search = equipmentSearch.trim().toLowerCase();
    const compactSearch = normalizeSearchValue(equipmentSearch);
    const derivedCategoryMap = new Map<string, EquipmentCategory>();

    equipmentItems.forEach((item) => {
      const categoryName =
        item.equipment_categories?.name ?? "Equipment inventory";

      if (!derivedCategoryMap.has(item.category_id)) {
        derivedCategoryMap.set(item.category_id, {
          created_at: "",
          display_order:
            item.equipment_categories?.display_order ??
            derivedCategoryMap.size + 1,
          id: item.category_id,
          name: categoryName
        });
      }
    });

    const categories =
      equipmentCategories.length > 0
        ? equipmentCategories
        : Array.from(derivedCategoryMap.values());

    return categories
      .slice()
      .sort((left, right) => left.display_order - right.display_order)
      .map((category) => ({
        category,
        items: equipmentItems
          .filter((item) => item.category_id === category.id)
          .filter((item) => {
            if (search.length === 0) {
              return true;
            }

            const haystack = [item.name, item.notes ?? "", category.name]
              .join(" ")
              .toLowerCase();

            return (
              haystack.includes(search) ||
              normalizeSearchValue(haystack).includes(compactSearch)
            );
          })
          .sort((left, right) => left.name.localeCompare(right.name))
      }))
      .filter((group) => group.items.length > 0);
  }, [equipmentCategories, equipmentItems, equipmentSearch]);
  const visibleEquipmentItemCount = groupedEquipmentItems.reduce(
    (total, group) => total + group.items.length,
    0
  );

  const events = useMemo<EventInput[]>(
    () =>
      bookings.map((booking) => {
        const roomName = booking.rooms?.name ?? "Room";
        const eventColor =
          booking.status === "approved" && booking.rooms?.color
            ? booking.rooms.color
            : statusEventColors[booking.status];

        return {
          id: booking.id,
          title: `${roomName} • ${booking.student_name} • ${getStatusLabel(
            booking.status
          )}`,
          start: booking.starts_at,
          end: booking.ends_at,
          backgroundColor: eventColor,
          borderColor: "transparent",
          textColor: "#ffffff",
          extendedProps: {
            roomName,
            status: booking.status,
            studentName: booking.student_name,
            timeRange: formatTimeRange(booking.starts_at, booking.ends_at)
          }
        };
      }),
    [bookings]
  );

  function updateField(key: keyof BookingFormState, value: string) {
    setForm((current) => {
      if (key === "startTime") {
        return {
          ...current,
          endTime: current.endTime > value ? current.endTime : getNextEndTime(value),
          startTime: value
        };
      }

      if (key === "endTime" && value <= current.startTime) {
        return {
          ...current,
          endTime: getNextEndTime(current.startTime)
        };
      }

      return { ...current, [key]: value };
    });
  }

  function updateEquipmentQuantity(equipmentItemId: string, quantity: number) {
    const item = equipmentItemLookup.get(equipmentItemId);
    const safeQuantity = Math.max(
      0,
      Math.min(Number.isFinite(quantity) ? Math.floor(quantity) : 0, item?.total_quantity ?? 0)
    );

    setEquipmentQuantities((current) => {
      const next = { ...current };

      if (safeQuantity <= 0) {
        delete next[equipmentItemId];
      } else {
        next[equipmentItemId] = safeQuantity;
      }

      return next;
    });

    if (safeQuantity > 0) {
      setNoEquipmentRequired(false);
    }
  }

  function getAvailableForItem(item: EquipmentItem) {
    if (
      Number.isNaN(equipmentWindow.startsAt.getTime()) ||
      Number.isNaN(equipmentWindow.endsAt.getTime())
    ) {
      return item.total_quantity;
    }

    const reservedQuantity = getReservedEquipmentQuantity({
      bookings,
      editingBookingId,
      endsAt: equipmentWindow.endsAt,
      equipmentItemId: item.id,
      startsAt: equipmentWindow.startsAt
    });

    return Math.max(0, item.total_quantity - reservedQuantity);
  }

  function getAvailableForBookingEquipment(
    booking: DashboardBooking,
    row: DashboardBookingEquipment
  ) {
    const item = equipmentItemLookup.get(row.equipment_item_id) ?? row.equipment_items;

    if (!item) {
      return 0;
    }

    const reservedQuantity = getReservedEquipmentQuantity({
      bookings,
      editingBookingId: booking.id,
      endsAt: new Date(booking.ends_at),
      equipmentItemId: row.equipment_item_id,
      startsAt: new Date(booking.starts_at)
    });

    return Math.max(0, item.total_quantity - reservedQuantity);
  }

  function resetForm() {
    setEditingBookingId(null);
    setForm(buildInitialForm(profile, userEmail, rooms, initialSlot));
    setEquipmentQuantities({});
    setEquipmentSearch("");
    setNoEquipmentRequired(false);
  }

  function handleDateSelect(selection: DateSelectArg) {
    const start = selection.start;
    const end = selection.end > selection.start ? selection.end : new Date(start);

    if (selection.allDay) {
      start.setHours(9, 0, 0, 0);
      end.setTime(start.getTime());
      end.setHours(10, 0, 0, 0);
    }

    const selectedStartTime = START_TIME_OPTIONS.includes(toTimeInputValue(start))
      ? toTimeInputValue(start)
      : "09:00";
    const selectedEndTime =
      END_TIME_OPTIONS.includes(toTimeInputValue(end)) &&
      toTimeInputValue(end) > selectedStartTime
        ? toTimeInputValue(end)
        : getNextEndTime(selectedStartTime);

    setForm((current) => ({
      ...current,
      bookingDate: toDateInputValue(start),
      endTime: selectedEndTime,
      startTime: selectedStartTime
    }));
    setFeedback(null);
  }

  function handleEventClick(event: EventClickArg) {
    setSelectedBookingId(event.event.id);
    setStaffNote("");
  }

  function canSelectWindow(start: Date, end: Date) {
    const startTime = toTimeInputValue(start);
    const endTime = toTimeInputValue(end);

    return (
      start.getDay() >= 1 &&
      start.getDay() <= 5 &&
      start.toDateString() === end.toDateString() &&
      startTime >= "09:00" &&
      endTime <= "17:00" &&
      isHalfHourTime(startTime) &&
      isHalfHourTime(endTime) &&
      end > start
    );
  }

  function loadSelectedBookingForEdit() {
    if (!selectedBooking) {
      return;
    }

    setEditingBookingId(selectedBooking.id);
    setForm({
      additionalNotes: selectedBooking.additional_notes ?? "",
      bookingDate: toDateInputValue(new Date(selectedBooking.starts_at)),
      courseClass: COURSE_CLASS_OPTIONS.includes(
        selectedBooking.course_class as (typeof COURSE_CLASS_OPTIONS)[number]
      )
        ? selectedBooking.course_class
        : DEFAULT_COURSE_CLASS,
      description: selectedBooking.description,
      endTime: toTimeInputValue(new Date(selectedBooking.ends_at)),
      roomId: selectedBooking.room_id,
      startTime: toTimeInputValue(new Date(selectedBooking.starts_at)),
      studentEmail: selectedBooking.student_email,
      studentName: selectedBooking.student_name
    });
    setEquipmentQuantities(
      Object.fromEntries(
        getBookingEquipment(selectedBooking)
          .filter((row) => row.status !== "rejected" && row.status !== "cancelled")
          .map((row) => [row.equipment_item_id, getEffectiveEquipmentQuantity(row)])
      )
    );
    setNoEquipmentRequired(getBookingEquipment(selectedBooking).length === 0);
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const windowError = isWorkingWindow(
      form.bookingDate,
      form.startTime,
      form.endTime
    );

    if (windowError) {
      setFeedback({ type: "error", text: windowError });
      return;
    }

    if (!form.description.trim()) {
      setFeedback({
        type: "error",
        text: "Description of planned tasks is required."
      });
      return;
    }

    if (hasConflict(bookings, form, editingBookingId)) {
      setFeedback({
        type: "error",
        text: "This room already has a pending or approved booking at that time."
      });
      return;
    }

    if (!noEquipmentRequired && selectedEquipmentRequests.length === 0) {
      setFeedback({
        type: "error",
        text: "Select equipment or choose No equipment required."
      });
      return;
    }

    const unavailableRequest = selectedEquipmentRequests.find((request) => {
      const item = equipmentItemLookup.get(request.equipmentItemId);

      return !item || request.quantity > getAvailableForItem(item);
    });

    if (unavailableRequest) {
      setFeedback({
        type: "error",
        text: "Some requested equipment is unavailable at this time. Please choose alternative equipment or contact a member of staff."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = createBookingFormData(
        form,
        editingBookingId,
        selectedEquipmentRequests,
        noEquipmentRequired,
        roomOptions.find((room) => room.id === form.roomId)?.name ?? form.roomId
      );
      const result = editingBookingId
        ? await updateBookingAction(formData)
        : await createBookingAction(formData);

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to save booking request."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Booking saved." });
      resetForm();
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelBooking(bookingId: string) {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const result = await cancelBookingAction(bookingId);

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to cancel booking."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Booking cancelled." });
      setSelectedBookingId(null);
      setEditingBookingId(null);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReview(bookingId: string, status: BookingStatus, note = "") {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("booking_id", bookingId);
      formData.set("status", status);
      formData.set("staff_note", note);
      const result = await reviewBookingAction(formData);

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to review booking."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Booking reviewed." });
      setStaffNote("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await reviewBookingAction(formData);

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to review booking."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Booking reviewed." });
      setStaffNote("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddStaffNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBooking) {
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await addStaffNoteAction(formData);

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to add staff note."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Staff note added." });
      setStaffNote("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdminSubmit(
    event: FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>
  ) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const result = await action(new FormData(event.currentTarget));

      if (!result.ok) {
        setFeedback({
          type: "error",
          text: result.error ?? "Unable to save changes."
        });
        return;
      }

      setFeedback({ type: "ok", text: result.message ?? "Changes saved." });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedIsOwnPending =
    selectedBooking?.user_id === userId &&
    selectedBooking.status === "pending_approval";

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="panel min-w-0 p-3 sm:p-4">
          {calendarTitle ? (
            <h2 className="mb-3 text-lg font-black text-navy">{calendarTitle}</h2>
          ) : null}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "",
              right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek"
            }}
            buttonText={{
              day: "Day",
              today: "Today",
              month: "Month",
              week: "Week",
              list: "List"
            }}
            events={events}
            selectable
            selectMirror
            nowIndicator
            allDaySlot={false}
            height="auto"
            hiddenDays={[0, 6]}
            showNonCurrentDates={false}
            fixedWeekCount={false}
            slotMinTime="09:00:00"
            slotMaxTime="17:00:00"
            slotDuration="00:30:00"
            snapDuration="00:30:00"
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5],
              startTime: "09:00",
              endTime: "17:00"
            }}
            datesSet={(dateInfo) => setCalendarTitle(formatCalendarTitle(dateInfo))}
            dayCellContent={(arg) =>
              arg.view.type === "dayGridMonth"
                ? formatDisplayDate(arg.date)
                : arg.dayNumberText
            }
            dayHeaderContent={(arg) => {
              const weekday = new Intl.DateTimeFormat("en-GB", {
                weekday: "short"
              }).format(arg.date);

              return arg.view.type === "dayGridMonth"
                ? weekday
                : `${weekday} ${formatDisplayDate(arg.date)}`;
            }}
            selectAllow={(selection) =>
              canSelectWindow(selection.start, selection.end)
            }
            select={handleDateSelect}
            eventClick={handleEventClick}
          />
        </div>

        {canReview ? (
          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-black text-ink">
                <ClipboardList size={18} aria-hidden="true" />
                Pending requests
              </h2>
              <span className="rounded-md bg-brass/10 px-2.5 py-1 text-xs font-black uppercase text-brass">
                {pendingBookings.length}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {pendingBookings.map((booking) => (
                <div
                  className="rounded-md border border-line bg-white p-3"
                  key={booking.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">
                        {booking.student_name}
                      </p>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {booking.rooms?.name} • {formatTimeRange(booking.starts_at, booking.ends_at)}
                      </p>
                    </div>
                    <StatusPill status={booking.status} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                    {booking.description}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold text-blue">
                    {summarizeEquipment(booking)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      className="icon-button bg-fern text-white hover:bg-fern/90"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() => handleReview(booking.id, "approved")}
                    >
                      <Check size={16} aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      className="icon-button border-line bg-white text-coral hover:border-coral/40 hover:bg-coral/5"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() => handleReview(booking.id, "rejected")}
                    >
                      <X size={16} aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      className="icon-button border-line bg-white text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => setSelectedBookingId(booking.id)}
                    >
                      <FileText size={16} aria-hidden="true" />
                      Open
                    </button>
                  </div>
                </div>
              ))}

              {pendingBookings.length === 0 ? (
                <div className="rounded-md border border-dashed border-line bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  <CheckCircle2
                    className="mb-3 text-fern"
                    size={22}
                    aria-hidden="true"
                  />
                  No pending requests.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <AdminPanels
            equipmentCategories={equipmentCategories}
            equipmentItems={equipmentItems}
            handleAdminSubmit={handleAdminSubmit}
            inventoryCategoryFilter={inventoryCategoryFilter}
            isSubmitting={isSubmitting}
            setInventoryCategoryFilter={setInventoryCategoryFilter}
            profiles={profiles}
            rooms={rooms}
          />
        ) : null}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <form className="panel space-y-4 p-4" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-ink">
                {editingBookingId ? "Edit pending request" : "New booking request"}
              </h2>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Monday-Friday, 09:00-17:00
              </p>
            </div>
            <span className="rounded-md bg-fern/10 p-2 text-fern">
              <CalendarPlus size={19} aria-hidden="true" />
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block space-y-2">
              <span className="field-label">Student name</span>
              <input
                className="field-control"
                value={form.studentName}
                onChange={(event) => updateField("studentName", event.target.value)}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">Student email</span>
              <input
                className="field-control"
                type="email"
                value={form.studentEmail}
                onChange={(event) => updateField("studentEmail", event.target.value)}
                required
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="field-label">Course / class</span>
            <select
              className="field-control"
              value={form.courseClass}
              onChange={(event) => updateField("courseClass", event.target.value)}
              required
            >
              {COURSE_CLASS_OPTIONS.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="field-label">Room required</span>
            <select
              className="field-control"
              value={form.roomId}
              onChange={(event) => updateField("roomId", event.target.value)}
              required
            >
              <option value="" disabled>
                Select a room
              </option>
              {roomOptions.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <label className="block space-y-2">
              <span className="field-label">Date</span>
              <select
                className="field-control"
                value={form.bookingDate}
                onChange={(event) => updateField("bookingDate", event.target.value)}
                required
              >
                {dateOptions.map((date) => (
                  <option key={date} value={date}>
                    {formatDisplayDate(date)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="field-label">Start time</span>
              <select
                className="field-control"
                value={form.startTime}
                onChange={(event) => updateField("startTime", event.target.value)}
                required
              >
                {START_TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {formatTimeOption(time)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="field-label">End time</span>
              <select
                className="field-control"
                value={form.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
                required
              >
                {endTimeOptions.map((time) => (
                  <option key={time} value={time}>
                    {formatTimeOption(time)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="field-label">Description of planned tasks</span>
            <textarea
              className="field-control min-h-28 resize-y"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="field-label">Additional notes</span>
            <textarea
              className="field-control min-h-20 resize-y"
              value={form.additionalNotes}
              onChange={(event) => updateField("additionalNotes", event.target.value)}
            />
          </label>

          <section className="space-y-3 rounded-md border border-line bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black text-navy">
                  <Mic2 size={17} aria-hidden="true" />
                  Equipment Required
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Select microphones or DI boxes for this booking window.
                </p>
              </div>
              <span className="rounded-md bg-sky/10 p-2 text-sky">
                <PackageCheck size={18} aria-hidden="true" />
              </span>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-line bg-white p-3 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-teal"
                checked={noEquipmentRequired}
                type="checkbox"
                onChange={(event) => {
                  setNoEquipmentRequired(event.target.checked);

                  if (event.target.checked) {
                    setEquipmentQuantities({});
                  }
                }}
              />
              No equipment required
            </label>

            <label className="block space-y-2">
              <span className="field-label">Search equipment</span>
              <div className="relative">
                <Filter
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                  aria-hidden="true"
                />
                <input
                  className="field-control pl-10"
                  placeholder="Search by name, e.g. SM57"
                  type="search"
                  value={equipmentSearch}
                  onChange={(event) => {
                    setEquipmentSearch(event.target.value);

                    if (event.target.value.trim().length > 0) {
                      setNoEquipmentRequired(false);
                    }
                  }}
                />
              </div>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
              <span>
                Showing {visibleEquipmentItemCount} of {equipmentItemCount} equipment
                items
              </span>
              {equipmentSearch ? (
                <button
                  className="font-black uppercase text-teal hover:text-navy"
                  type="button"
                  onClick={() => setEquipmentSearch("")}
                >
                  Clear search
                </button>
              ) : null}
            </div>

            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {groupedEquipmentItems.map(({ category, items }) => (
                <div className="space-y-2" key={category.id}>
                  <h4 className="text-xs font-black uppercase text-blue">
                    {category.name}
                  </h4>
                  <div className="grid gap-2">
                    {items.map((item) => {
                      const requestedQuantity = equipmentQuantities[item.id] ?? 0;
                      const availableQuantity = getAvailableForItem(item);
                      const isUnavailable =
                        requestedQuantity > 0 && requestedQuantity > availableQuantity;

                      return (
                        <div
                          className={cn(
                            "rounded-md border bg-white p-3",
                            isUnavailable ? "border-red-200" : "border-line"
                          )}
                          key={item.id}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-ink">
                                {item.name}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Total {item.total_quantity} • Available now{" "}
                                {availableQuantity}
                              </p>
                              {item.notes ? (
                                <p className="mt-2 text-xs leading-5 text-slate-600">
                                  {item.notes}
                                </p>
                              ) : null}
                            </div>
                            <label className="grid w-full gap-1 sm:w-28">
                              <span className="field-label">Qty</span>
                              <input
                                className="field-control"
                                disabled={noEquipmentRequired}
                                max={item.total_quantity}
                                min={0}
                                type="number"
                                value={requestedQuantity}
                                onChange={(event) =>
                                  updateEquipmentQuantity(
                                    item.id,
                                    Number(event.target.value)
                                  )
                                }
                              />
                            </label>
                          </div>

                          {isUnavailable ? (
                            <p className="mt-2 flex items-center gap-1 text-xs font-bold text-red-700">
                              <AlertTriangle size={14} aria-hidden="true" />
                              Not enough available for this time.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {groupedEquipmentItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-line bg-white p-3 text-sm font-semibold text-slate-500">
                  {equipmentItemCount === 0
                    ? "No equipment inventory has loaded. Run the Stage 2 Supabase migration to seed the microphone and DI inventory."
                    : "No matching equipment."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-3">
            <h3 className="text-sm font-black text-navy">Booking summary</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Room:</span>{" "}
                {roomOptions.find((room) => room.id === form.roomId)?.name ??
                  "Select a room"}
              </p>
              <p>
                <span className="font-semibold">Time:</span>{" "}
                {formatDisplayDate(form.bookingDate)} {formatTimeOption(form.startTime)}
                -{formatTimeOption(form.endTime)}
              </p>
              <p>
                <span className="font-semibold">Tasks:</span>{" "}
                {form.description.trim() || "Description required"}
              </p>
              <p>
                <span className="font-semibold">Equipment:</span>{" "}
                {noEquipmentRequired || selectedEquipmentRequests.length === 0
                  ? "No equipment required"
                  : selectedEquipmentRequests
                      .map((request) => {
                        const item = equipmentItemLookup.get(request.equipmentItemId);

                        return `${request.quantity} x ${
                          item?.name ?? "Equipment"
                        }`;
                      })
                      .join(", ")}
              </p>
              <p>
                <span className="font-semibold">Status:</span> Pending Approval
              </p>
            </div>
          </section>

          {feedback ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-semibold",
                feedback.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {feedback.text}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <button
              className="icon-button w-full bg-fern text-white hover:bg-fern/90"
              disabled={isSubmitting || roomOptions.length === 0}
              type="submit"
            >
              {editingBookingId ? (
                <Save size={18} aria-hidden="true" />
              ) : (
                <Plus size={18} aria-hidden="true" />
              )}
              {isSubmitting
                ? "Saving"
                : editingBookingId
                  ? "Save request"
                  : "Submit request"}
            </button>

            {editingBookingId ? (
              <button
                className="icon-button w-full border-line bg-white text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={resetForm}
              >
                <X size={18} aria-hidden="true" />
                Stop editing
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-ink">Selected booking</h2>
            <span className="rounded-md bg-slate-100 p-2 text-slate-600">
              <Clock size={19} aria-hidden="true" />
            </span>
          </div>

          {selectedBooking ? (
            <div className="space-y-4">
              <div>
                <p className="font-black text-ink">{selectedBooking.student_name}</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-600">
                  <MapPin size={15} aria-hidden="true" />
                  {selectedBooking.rooms?.name ?? "Room"}
                </p>
              </div>

              <div className="space-y-1 text-sm text-slate-700">
                <p>{formatDateTime(selectedBooking.starts_at)}</p>
                <p>{formatDateTime(selectedBooking.ends_at)}</p>
                <p className="font-semibold">{selectedBooking.course_class}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={selectedBooking.status} />
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {selectedBooking.student_email}
                </span>
              </div>

              <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {selectedBooking.description}
              </p>

              {selectedBooking.additional_notes ? (
                <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  {selectedBooking.additional_notes}
                </p>
              ) : null}

              <section className="rounded-md border border-line bg-white p-3">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-navy">
                  <Mic2 size={16} aria-hidden="true" />
                  Requested equipment
                </h3>
                {getBookingEquipment(selectedBooking).length > 0 ? (
                  <div className="space-y-2">
                    {getBookingEquipment(selectedBooking).map((row) => {
                      const item =
                        equipmentItemLookup.get(row.equipment_item_id) ??
                        row.equipment_items;
                      const availableQuantity = getAvailableForBookingEquipment(
                        selectedBooking,
                        row
                      );
                      const effectiveQuantity = getEffectiveEquipmentQuantity(row);
                      const hasAvailabilityWarning =
                        ACTIVE_EQUIPMENT_STATUSES.includes(row.status) &&
                        effectiveQuantity > availableQuantity;

                      return (
                        <div
                          className={cn(
                            "rounded-md border p-3",
                            hasAvailabilityWarning
                              ? "border-red-200 bg-red-50"
                              : "border-line bg-slate-50"
                          )}
                          key={row.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-ink">
                                {effectiveQuantity} x{" "}
                                {item?.name ?? "Equipment"}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {row.equipment_items?.equipment_categories?.name ??
                                  "Inventory"}{" "}
                                •
                                Total {item?.total_quantity ?? 0} • Available{" "}
                                {availableQuantity}
                              </p>
                            </div>
                            {equipmentStatusPill(row.status)}
                          </div>
                          {item?.notes ? (
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              {item.notes}
                            </p>
                          ) : null}
                          {row.staff_notes ? (
                            <p className="mt-2 rounded-md bg-white p-2 text-xs leading-5 text-slate-600">
                              {row.staff_notes}
                            </p>
                          ) : null}
                          {hasAvailabilityWarning ? (
                            <p className="mt-2 flex items-center gap-1 text-xs font-bold text-red-700">
                              <AlertTriangle size={14} aria-hidden="true" />
                              Availability warning before approval.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-line bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                    No equipment required.
                  </p>
                )}
              </section>

              {canReview ? (
                <div className="space-y-3">
                  <form className="space-y-3" onSubmit={handleReviewSubmit}>
                    <input
                      name="booking_id"
                      type="hidden"
                      value={selectedBooking.id}
                    />

                    {getBookingEquipment(selectedBooking).length > 0 ? (
                      <div className="space-y-2">
                        <h3 className="text-sm font-black text-navy">
                          Equipment review
                        </h3>
                        {getBookingEquipment(selectedBooking).map((row) => {
                          const item =
                            equipmentItemLookup.get(row.equipment_item_id) ??
                            row.equipment_items;
                          const availableQuantity =
                            getAvailableForBookingEquipment(selectedBooking, row);
                          const defaultQuantity =
                            row.staff_adjusted_quantity ?? row.quantity;

                          return (
                            <div
                              className="grid gap-2 rounded-md border border-line bg-white p-3"
                              key={row.id}
                            >
                              <input
                                name="booking_equipment_id"
                                type="hidden"
                                value={row.id}
                              />
                              <p className="text-sm font-black text-ink">
                                {item?.name ?? "Equipment"}
                              </p>
                              <p className="text-xs font-semibold text-slate-500">
                                Requested {row.quantity} • Available{" "}
                                {availableQuantity}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="block space-y-2">
                                  <span className="field-label">Decision</span>
                                  <select
                                    className="field-control"
                                    defaultValue={
                                      row.status === "rejected"
                                        ? "rejected"
                                        : "approved"
                                    }
                                    name={`equipment_status_${row.id}`}
                                  >
                                    <option value="approved">Approve</option>
                                    <option value="rejected">Reject item</option>
                                  </select>
                                </label>
                                <label className="block space-y-2">
                                  <span className="field-label">Quantity</span>
                                  <input
                                    className="field-control"
                                    defaultValue={defaultQuantity}
                                    max={item?.total_quantity ?? row.quantity}
                                    min={0}
                                    name={`equipment_quantity_${row.id}`}
                                    type="number"
                                  />
                                </label>
                              </div>
                              <label className="block space-y-2">
                                <span className="field-label">Equipment notes</span>
                                <textarea
                                  className="field-control min-h-16 resize-y"
                                  defaultValue={row.staff_notes ?? ""}
                                  name={`equipment_staff_notes_${row.id}`}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <label className="block space-y-2">
                      <span className="field-label">Review note</span>
                      <textarea
                        className="field-control min-h-20 resize-y"
                        name="staff_note"
                        value={staffNote}
                        onChange={(event) => setStaffNote(event.target.value)}
                      />
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        className="icon-button bg-teal text-white hover:bg-teal/90"
                        disabled={isSubmitting}
                        name="status"
                        type="submit"
                        value="approved"
                      >
                        <Check size={16} aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        className="icon-button border-line bg-white text-coral hover:border-coral/40 hover:bg-coral/5"
                        disabled={isSubmitting}
                        name="status"
                        type="submit"
                        value="rejected"
                      >
                        <X size={16} aria-hidden="true" />
                        Reject
                      </button>
                      <button
                        className="icon-button border-line bg-white text-slate-700 hover:bg-slate-50"
                        disabled={isSubmitting}
                        name="status"
                        type="submit"
                        value="cancelled"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Cancel
                      </button>
                    </div>
                  </form>

                  <form className="space-y-2" onSubmit={handleAddStaffNote}>
                    <input
                      name="booking_id"
                      type="hidden"
                      value={selectedBooking.id}
                    />
                    <label className="block space-y-2">
                      <span className="field-label">Staff notes</span>
                      <textarea
                        className="field-control min-h-20 resize-y"
                        name="staff_note"
                        value={staffNote}
                        onChange={(event) => setStaffNote(event.target.value)}
                        required
                      />
                    </label>
                    <button
                      className="icon-button w-full border-line bg-white text-ink hover:bg-slate-50"
                      disabled={isSubmitting}
                      type="submit"
                    >
                      <MessageSquare size={17} aria-hidden="true" />
                      Add note
                    </button>
                  </form>

                  {selectedBooking.staff_notes?.length ? (
                    <div className="space-y-2">
                      {selectedBooking.staff_notes.map((note) => (
                        <div
                          className="rounded-md border border-line bg-white p-3"
                          key={note.id}
                        >
                          <p className="text-sm leading-6 text-slate-700">
                            {note.note}
                          </p>
                          <p className="mt-2 text-xs font-semibold uppercase text-slate-500">
                            {note.profiles?.full_name ?? "Staff"} •{" "}
                            {formatDateTime(note.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedIsOwnPending ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    className="icon-button w-full border-line bg-white text-ink hover:bg-slate-50"
                    type="button"
                    onClick={loadSelectedBookingForEdit}
                  >
                    <Edit3 size={17} aria-hidden="true" />
                    Edit request
                  </button>
                  <button
                    className="icon-button w-full border-line bg-white text-coral hover:border-coral/40 hover:bg-coral/5"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => handleCancelBooking(selectedBooking.id)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                    Cancel request
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line bg-slate-50 p-4 text-sm font-semibold text-slate-500">
              <CheckCircle2 className="mb-3 text-fern" size={22} aria-hidden="true" />
              No booking selected.
            </div>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-3 flex items-center gap-2 text-base font-black text-ink">
            <DoorOpen size={18} aria-hidden="true" />
            Rooms
          </h2>
          <div className="space-y-2">
            {roomOptions.map((room) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-white p-3"
                key={room.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{room.name}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">
                    {room.location}
                  </p>
                </div>
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: room.color }}
                />
              </div>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function AdminPanels({
  equipmentCategories,
  equipmentItems,
  handleAdminSubmit,
  inventoryCategoryFilter,
  isSubmitting,
  setInventoryCategoryFilter,
  profiles,
  rooms
}: {
  equipmentCategories: EquipmentCategory[];
  equipmentItems: EquipmentItem[];
  handleAdminSubmit: (
    event: FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<{
      ok: boolean;
      message?: string;
      error?: string;
    }>
  ) => Promise<void>;
  inventoryCategoryFilter: string;
  isSubmitting: boolean;
  setInventoryCategoryFilter: (value: string) => void;
  profiles: Profile[];
  rooms: Room[];
}) {
  const categoryNameById = new Map(
    equipmentCategories.map((category) => [category.id, category.name])
  );
  const filteredEquipmentItems =
    inventoryCategoryFilter === "all"
      ? equipmentItems
      : equipmentItems.filter(
          (item) => item.category_id === inventoryCategoryFilter
        );

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="panel p-4">
        <h2 className="mb-4 flex items-center gap-2 text-base font-black text-ink">
          <ShieldCheck size={18} aria-hidden="true" />
          Manage rooms
        </h2>

        <div className="space-y-3">
          {rooms.map((room) => (
            <form
              className="grid gap-3 rounded-md border border-line bg-white p-3"
              key={room.id}
              onSubmit={(event) => handleAdminSubmit(event, saveRoomAction)}
            >
              <input name="room_id" type="hidden" value={room.id} />
              <input
                className="field-control"
                defaultValue={room.name}
                name="name"
                required
              />
              <input
                className="field-control"
                defaultValue={room.location}
                name="location"
                required
              />
              <textarea
                className="field-control min-h-20 resize-y"
                defaultValue={room.description ?? ""}
                name="description"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className="field-control"
                  defaultValue={room.capacity}
                  min={1}
                  name="capacity"
                  type="number"
                />
                <input
                  className="field-control"
                  defaultValue={room.sort_order}
                  name="sort_order"
                  type="number"
                />
                <input
                  className="field-control h-11"
                  defaultValue={room.color}
                  name="color"
                  type="color"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  className="h-4 w-4 accent-fern"
                  defaultChecked={room.is_active}
                  name="is_active"
                  type="checkbox"
                />
                Active
              </label>
              <button
                className="icon-button bg-ink text-white hover:bg-ink/90"
                disabled={isSubmitting}
                type="submit"
              >
                <Save size={17} aria-hidden="true" />
                Save room
              </button>
            </form>
          ))}

          <form
            className="grid gap-3 rounded-md border border-dashed border-line bg-slate-50 p-3"
            onSubmit={(event) => handleAdminSubmit(event, saveRoomAction)}
          >
            <input className="field-control" name="name" placeholder="Room name" required />
            <input
              className="field-control"
              name="location"
              placeholder="Location"
              required
            />
            <textarea
              className="field-control min-h-20 resize-y"
              name="description"
              placeholder="Description"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="field-control"
                defaultValue={4}
                min={1}
                name="capacity"
                type="number"
              />
              <input
                className="field-control"
                defaultValue={rooms.length + 1}
                name="sort_order"
                type="number"
              />
              <input
                className="field-control h-11"
                defaultValue="#177a68"
                name="color"
                type="color"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-fern"
                defaultChecked
                name="is_active"
                type="checkbox"
              />
              Active
            </label>
            <button
              className="icon-button bg-fern text-white hover:bg-fern/90"
              disabled={isSubmitting}
              type="submit"
            >
              <Plus size={17} aria-hidden="true" />
              Add room
            </button>
          </form>
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="mb-4 flex items-center gap-2 text-base font-black text-ink">
          <UserCog size={18} aria-hidden="true" />
          Manage users
        </h2>

        <div className="space-y-3">
          {profiles.map((userProfile) => (
            <form
              className="grid gap-3 rounded-md border border-line bg-white p-3"
              key={userProfile.id}
              onSubmit={(event) => handleAdminSubmit(event, saveUserAction)}
            >
              <input name="user_id" type="hidden" value={userProfile.id} />
              <input
                className="field-control"
                defaultValue={userProfile.full_name}
                name="full_name"
                required
              />
              <p className="truncate text-xs font-semibold uppercase text-slate-500">
                {userProfile.email}
              </p>
              <select
                className="field-control"
                defaultValue={userProfile.role}
                name="role"
              >
                {(["student", "staff", "admin"] satisfies UserRole[]).map(
                  (role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  )
                )}
              </select>
              <select
                className="field-control"
                defaultValue={userProfile.course_class ?? DEFAULT_COURSE_CLASS}
                name="course_class"
              >
                {COURSE_CLASS_OPTIONS.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              <button
                className="icon-button bg-ink text-white hover:bg-ink/90"
                disabled={isSubmitting}
                type="submit"
              >
                <Save size={17} aria-hidden="true" />
                Save user
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="panel p-4 lg:col-span-2">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-ink">
              <Mic2 size={18} aria-hidden="true" />
              Manage equipment inventory
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Microphones and DI boxes seeded from data/FC Mic List.xlsx.
            </p>
          </div>
          <label className="block space-y-2 lg:w-72">
            <span className="field-label">Filter category</span>
            <select
              className="field-control"
              value={inventoryCategoryFilter}
              onChange={(event) => setInventoryCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {equipmentCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <form
            className="grid gap-3 rounded-md border border-dashed border-line bg-slate-50 p-3"
            onSubmit={(event) =>
              handleAdminSubmit(event, saveEquipmentCategoryAction)
            }
          >
            <h3 className="text-sm font-black text-navy">Add category</h3>
            <input
              className="field-control"
              name="name"
              placeholder="Category name"
              required
            />
            <input
              className="field-control"
              defaultValue={equipmentCategories.length + 1}
              name="display_order"
              type="number"
            />
            <button
              className="icon-button bg-teal text-white hover:bg-teal/90"
              disabled={isSubmitting}
              type="submit"
            >
              <Plus size={17} aria-hidden="true" />
              Add category
            </button>
          </form>

          <form
            className="grid gap-3 rounded-md border border-dashed border-line bg-slate-50 p-3"
            onSubmit={(event) => handleAdminSubmit(event, saveEquipmentItemAction)}
          >
            <h3 className="text-sm font-black text-navy">Add equipment item</h3>
            <select className="field-control" name="category_id" required>
              {equipmentCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              className="field-control"
              name="name"
              placeholder="Item name"
              required
            />
            <input
              className="field-control"
              min={0}
              name="total_quantity"
              placeholder="Total quantity"
              type="number"
              required
            />
            <textarea
              className="field-control min-h-20 resize-y"
              name="notes"
              placeholder="Notes"
            />
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-teal"
                defaultChecked
                name="is_active"
                type="checkbox"
              />
              Active
            </label>
            <button
              className="icon-button bg-teal text-white hover:bg-teal/90"
              disabled={isSubmitting || equipmentCategories.length === 0}
              type="submit"
            >
              <Plus size={17} aria-hidden="true" />
              Add item
            </button>
          </form>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredEquipmentItems.map((item) => (
            <form
              className="grid gap-3 rounded-md border border-line bg-white p-3"
              key={item.id}
              onSubmit={(event) => handleAdminSubmit(event, saveEquipmentItemAction)}
            >
              <input name="equipment_item_id" type="hidden" value={item.id} />
              <label className="block space-y-2">
                <span className="field-label">Category</span>
                <select
                  className="field-control"
                  defaultValue={item.category_id}
                  name="category_id"
                >
                  {equipmentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className="field-control"
                defaultValue={item.name}
                name="name"
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="field-label">Quantity</span>
                  <input
                    className="field-control"
                    defaultValue={item.total_quantity}
                    min={0}
                    name="total_quantity"
                    type="number"
                  />
                </label>
                <div className="rounded-md bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                  {categoryNameById.get(item.category_id) ?? "Category"}
                </div>
              </div>
              <textarea
                className="field-control min-h-20 resize-y"
                defaultValue={item.notes ?? ""}
                name="notes"
              />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  className="h-4 w-4 accent-teal"
                  defaultChecked={item.is_active}
                  name="is_active"
                  type="checkbox"
                />
                Active
              </label>
              <button
                className="icon-button bg-navy text-white hover:bg-blue"
                disabled={isSubmitting}
                type="submit"
              >
                <Save size={17} aria-hidden="true" />
                Save item
              </button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}
