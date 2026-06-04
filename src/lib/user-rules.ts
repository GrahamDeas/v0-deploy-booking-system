import type { UserRole } from "@/types/app";

export const FIFE_EMAIL_DOMAIN = "@fife.ac.uk";

export const STAFF_EMAIL_ALLOWLIST = [
  "grahamdeas@fife.ac.uk",
  "neilbethune@fife.ac.uk",
  "traviswhalley@fife.ac.uk",
  "jamesbisset@fife.ac.uk",
  "billthaw@fife.ac.uk"
] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isFifeEmail(email: string) {
  return normalizeEmail(email).endsWith(FIFE_EMAIL_DOMAIN);
}

export function canUseStaffRole(email: string) {
  return STAFF_EMAIL_ALLOWLIST.includes(
    normalizeEmail(email) as (typeof STAFF_EMAIL_ALLOWLIST)[number]
  );
}

export function isStaffLevelRole(role: UserRole) {
  return role === "staff" || role === "admin";
}
