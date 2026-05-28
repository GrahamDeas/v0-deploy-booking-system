export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type DbRecord<T extends object> = T & Record<string, unknown>;
type DbRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type DbTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: DbRelationship[];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: DbRecord<{
          id: string;
          full_name: string;
          email: string;
          role: Database["public"]["Enums"]["user_role"];
          course_class: string | null;
          lecturer: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id: string;
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"];
          course_class?: string | null;
          lecturer?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          full_name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"];
          course_class?: string | null;
          lecturer?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [];
      };
      rooms: {
        Row: DbRecord<{
          id: string;
          name: string;
          location: string;
          description: string | null;
          capacity: number;
          color: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          name: string;
          location: string;
          description?: string | null;
          capacity?: number;
          color?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          name?: string;
          location?: string;
          description?: string | null;
          capacity?: number;
          color?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [];
      };
      bookings: {
        Row: DbRecord<{
          id: string;
          user_id: string;
          room_id: string;
          student_name: string;
          student_email: string;
          course_class: string;
          lecturer: string;
          starts_at: string;
          ends_at: string;
          description: string;
          additional_notes: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          user_id: string;
          room_id: string;
          student_name: string;
          student_email: string;
          course_class: string;
          lecturer: string;
          starts_at: string;
          ends_at: string;
          description: string;
          additional_notes?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          user_id?: string;
          room_id?: string;
          student_name?: string;
          student_email?: string;
          course_class?: string;
          lecturer?: string;
          starts_at?: string;
          ends_at?: string;
          description?: string;
          additional_notes?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey";
            columns: ["room_id"];
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      approval_history: {
        Row: DbRecord<{
          id: string;
          booking_id: string;
          actor_id: string | null;
          from_status: Database["public"]["Enums"]["booking_status"] | null;
          to_status: Database["public"]["Enums"]["booking_status"];
          note: string | null;
          created_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          booking_id: string;
          actor_id?: string | null;
          from_status?: Database["public"]["Enums"]["booking_status"] | null;
          to_status: Database["public"]["Enums"]["booking_status"];
          note?: string | null;
          created_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          booking_id?: string;
          actor_id?: string | null;
          from_status?: Database["public"]["Enums"]["booking_status"] | null;
          to_status?: Database["public"]["Enums"]["booking_status"];
          note?: string | null;
          created_at?: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "approval_history_booking_id_fkey";
            columns: ["booking_id"];
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          }
        ];
      };
      staff_notes: {
        Row: DbRecord<{
          id: string;
          booking_id: string;
          staff_id: string;
          note: string;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          booking_id: string;
          staff_id: string;
          note: string;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          booking_id?: string;
          staff_id?: string;
          note?: string;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "staff_notes_booking_id_fkey";
            columns: ["booking_id"];
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_notes_staff_id_fkey";
            columns: ["staff_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      equipment_categories: {
        Row: DbRecord<{
          id: string;
          name: string;
          display_order: number;
          created_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          name: string;
          display_order: number;
          created_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          name?: string;
          display_order?: number;
          created_at?: string;
        }>;
        Relationships: [];
      };
      equipment_items: {
        Row: DbRecord<{
          id: string;
          category_id: string;
          name: string;
          total_quantity: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          category_id: string;
          name: string;
          total_quantity: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          category_id?: string;
          name?: string;
          total_quantity?: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "equipment_items_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "equipment_categories";
            referencedColumns: ["id"];
          }
        ];
      };
      booking_equipment: {
        Row: DbRecord<{
          id: string;
          booking_id: string;
          equipment_item_id: string;
          quantity: number;
          status: Database["public"]["Enums"]["booking_equipment_status"];
          staff_adjusted_quantity: number | null;
          staff_notes: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: DbRecord<{
          id?: string;
          booking_id: string;
          equipment_item_id: string;
          quantity: number;
          status?: Database["public"]["Enums"]["booking_equipment_status"];
          staff_adjusted_quantity?: number | null;
          staff_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Update: DbRecord<{
          id?: string;
          booking_id?: string;
          equipment_item_id?: string;
          quantity?: number;
          status?: Database["public"]["Enums"]["booking_equipment_status"];
          staff_adjusted_quantity?: number | null;
          staff_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "booking_equipment_booking_id_fkey";
            columns: ["booking_id"];
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_equipment_equipment_item_id_fkey";
            columns: ["equipment_item_id"];
            referencedRelation: "equipment_items";
            referencedColumns: ["id"];
          }
        ];
      };
    } & Record<string, DbTable>;
    Views: Record<string, never>;
    Functions: {
      get_equipment_reserved_quantity: {
        Args: {
          p_equipment_item_id: string;
          p_starts_at: string;
          p_ends_at: string;
          p_exclude_booking_id?: string | null;
        };
        Returns: number;
      };
    } & Record<string, never>;
    Enums: {
      booking_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "cancelled";
      booking_equipment_status:
        | "requested"
        | "approved"
        | "amended"
        | "rejected"
        | "cancelled";
      user_role: "student" | "staff" | "admin";
    };
    CompositeTypes: Record<string, never>;
  };
};
