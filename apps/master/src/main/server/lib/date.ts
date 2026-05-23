// Sanani mahalliy kun chegaralariga ajratuvchi yagona util.
//
// Server boot (src/main/index.ts) `process.env.TZ = 'Asia/Tashkent'` qiladi —
// shuning uchun Node `Date` ob'ektining "local time" qatlami O'zbekiston
// vaqti bo'yicha ishlaydi. Bu modul shu invariantga tayanadi.

// Production'da TZ index.ts'da o'rnatiladi. Bu fallback faqat alohida
// chaqirilgan testlar / skriptlar uchun: TZ tashqi muhitda berilmasa,
// kun chegaralari noaniq bo'lib qolmasligi uchun shu joyda zo'rlaymiz.
if (!process.env.TZ) {
  process.env.TZ = 'Asia/Tashkent';
}

export const APP_TZ = 'Asia/Tashkent';

export function dayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function dayEnd(date: Date): Date {
  // Yarim-ochiq chegara: keyingi kunning 00:00 dan oldin.
  const value = dayStart(date);
  value.setDate(value.getDate() + 1);
  return value;
}

// Inclusive-exclusive: [from, to). Reports / aggregates uchun.
export function dayRange(date: Date): { from: Date; to: Date } {
  return { from: dayStart(date), to: dayEnd(date) };
}

// YYYY-MM-DD kaliti mahalliy vaqt bo'yicha. DailyClose.date va URL paramlar uchun.
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 'YYYY-MM-DD' kalitidan mahalliy kunning 00:00 ini olish.
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((part) => Number(part));
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return dayStart(left).getTime() === dayStart(right).getTime();
}
