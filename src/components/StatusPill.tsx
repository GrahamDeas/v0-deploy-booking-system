import type { BookingStatus } from "@/types/app";

const statusStyles: Record<BookingStatus, string> = {
  pending_approval: "border-lime/70 bg-lime/20 text-navy",
  approved: "border-teal/30 bg-teal/10 text-teal",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

const statusLabels: Record<BookingStatus, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled"
};

type StatusPillProps = {
  status: BookingStatus;
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`rounded-md border px-2.5 py-1 text-xs font-black uppercase ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
