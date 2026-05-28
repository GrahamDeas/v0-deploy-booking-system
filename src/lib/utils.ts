export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getOrdinalSuffix(day: number) {
  if (day > 3 && day < 21) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatDisplayDate(value: string | Date) {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  const day = date.getDate();
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long"
  }).format(date);

  return `${day}${getOrdinalSuffix(day)} ${month}`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "short"
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);

  return `${weekday} ${formatDisplayDate(date)}, ${time}`;
}
