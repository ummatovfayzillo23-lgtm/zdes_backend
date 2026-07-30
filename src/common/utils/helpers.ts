export function trimToNull(value?: string | null): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

export function isDateExpired(value: Date): boolean {
  return value.getTime() <= Date.now();
}

export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(instant: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Returns the UTC instant that corresponds to Y-M-D h:m:s wall-clock time in `timeZone`. */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const zonedParts = getZonedParts(new Date(naiveUtcMs), timeZone);
  const zonedAsUtcMs = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second,
  );
  const offsetMs = zonedAsUtcMs - naiveUtcMs;

  return new Date(naiveUtcMs - offsetMs);
}

/** Returns a date-only value (midnight UTC) keyed by the calendar day `value` falls on in `timeZone`. */
export function toZonedDateOnly(
  value: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const { year, month, day } = getZonedParts(value, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

export function calculateMinutesDifference(
  start: Date | null,
  end: Date | null,
): number {
  if (!start || !end) {
    return 0;
  }

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

export function getMonthKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

/** Interprets `time` ("HH:mm") as wall-clock time on `baseDate`'s calendar day in `timeZone`. */
export function parseTimeToZonedDate(
  baseDate: Date,
  time: string,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const [hours, minutes] = time.split(':').map(Number);

  return zonedWallTimeToUtc(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth() + 1,
    baseDate.getUTCDate(),
    hours,
    minutes,
    timeZone,
  );
}

export function getWorkDayNumber(value: Date): number {
  const day = value.getUTCDay();

  return day === 0 ? 7 : day;
}

export function decodeBase64Image(value: string): {
  buffer: Buffer;
  contentType: string | null;
} {
  const trimmedValue = value.trim();
  const dataUriMatch = /^data:(.+);base64,(.+)$/.exec(trimmedValue);

  if (dataUriMatch) {
    return {
      contentType: dataUriMatch[1] ?? null,
      buffer: Buffer.from(dataUriMatch[2] ?? '', 'base64'),
    };
  }

  return {
    contentType: null,
    buffer: Buffer.from(trimmedValue, 'base64'),
  };
}
