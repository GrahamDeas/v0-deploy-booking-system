import type { Database } from "@/types/database";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type BookingEquipmentStatus =
  Database["public"]["Enums"]["booking_equipment_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];
export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type StaffNote = Database["public"]["Tables"]["staff_notes"]["Row"];
export type EquipmentCategory =
  Database["public"]["Tables"]["equipment_categories"]["Row"];
export type EquipmentItem =
  Database["public"]["Tables"]["equipment_items"]["Row"];
export type BookingEquipment =
  Database["public"]["Tables"]["booking_equipment"]["Row"];

export type DashboardStaffNote = StaffNote & {
  profiles?: Pick<Profile, "full_name"> | null;
};

export type DashboardEquipmentItem = EquipmentItem & {
  equipment_categories?: Pick<EquipmentCategory, "name" | "display_order"> | null;
};

export type DashboardBookingEquipment = BookingEquipment & {
  equipment_items?: DashboardEquipmentItem | null;
};

export type DashboardBooking = Booking & {
  rooms: Pick<Room, "name" | "color"> | null;
  booking_equipment?: DashboardBookingEquipment[];
  staff_notes?: DashboardStaffNote[];
};
