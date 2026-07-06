export const TOKYO_TZ = 'Asia/Tokyo';

// Japan does not observe DST, so Asia/Tokyo is a fixed UTC+9 offset.
const TOKYO_OFFSET_HOURS = 9;

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TOKYO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function tokyoDateInfoForMock(date: Date): { year: number; month: number; day: number } {
  return tokyoDateParts(date);
}

function tokyoDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = dateFmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Formats a Date as YYYY-MM-DD in Asia/Tokyo. */
export function formatTokyoDate(date: Date): string {
  return dateFmt.format(date);
}

/** Returns YYYY-MM for the given date in Asia/Tokyo (defaults to now). */
export function tokyoYearMonth(date: Date = new Date()): string {
  const { year, month } = tokyoDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** UTC instant corresponding to today 00:00 in Asia/Tokyo. */
export function tokyoTodayStart(now: Date = new Date()): Date {
  const { year, month, day } = tokyoDateParts(now);
  return new Date(Date.UTC(year, month - 1, day, -TOKYO_OFFSET_HOURS, 0, 0, 0));
}

/** UTC instant corresponding to the 1st of this month 00:00 in Asia/Tokyo. */
export function tokyoMonthStart(now: Date = new Date()): Date {
  const { year, month } = tokyoDateParts(now);
  return new Date(Date.UTC(year, month - 1, 1, -TOKYO_OFFSET_HOURS, 0, 0, 0));
}

/** UTC instant corresponding to the 1st of next month 00:00 in Asia/Tokyo (exclusive end bound). */
export function tokyoNextMonthStart(now: Date = new Date()): Date {
  const { year, month } = tokyoDateParts(now);
  return new Date(Date.UTC(year, month, 1, -TOKYO_OFFSET_HOURS, 0, 0, 0));
}

/** Tomorrow 00:00 in Asia/Tokyo (exclusive end bound for "today"). */
export function tokyoTomorrowStart(now: Date = new Date()): Date {
  const { year, month, day } = tokyoDateParts(now);
  return new Date(Date.UTC(year, month - 1, day + 1, -TOKYO_OFFSET_HOURS, 0, 0, 0));
}
