import { json, splitPath, type RouteHandler } from './util';

export let settings: Record<string, string> = {
  max_discount_percent: '15',
  max_discount_amount: '100000',
  daily_report_telegram_enabled: 'true',
  daily_report_telegram_time: '23:30',
  monthly_report_telegram_enabled: 'true',
  monthly_report_telegram_time: '09:00',
  // Synthetic — never a real credential, just long enough to stress the field.
  telegram_bot_token: '7821049563:AAHqZ9xKp3mLnQvT8dYsRfG2wEbXcZ4jKpM',
  owner_telegram_chat_id: '548213907',
  // Deliberately doesn't match the printers list below — shows the
  // "printer topilmadi" warning state.
  admin_printer_name: 'POS-80 (USB)',
  store_heading: 'Chayxana "Guliston"',
  store_phone: '+998 71 200 45 67',
  store_address: "Toshkent sh., Chilonzor tumani, Bunyodkor ko'chasi 12-uy",
  variance_alert_threshold: '50000',
  monthly_kitchen_overhead_uzs: '3500000',
  system_costing_active_since: '2026-01-01',
  alerts_telegram_enabled: 'true',
  alert_discount_threshold: '50000',
  alert_expense_threshold: '500000',
  alert_low_stock_enabled: 'true',
};

const PRINTERS = ['EPSON TM-T20III', 'XP-58IIH'];

export const settingsRoutes: RouteHandler = (path, method, body) => {
  const { base } = splitPath(path);

  if (method === 'GET' && base === '/api/settings') {
    return json(settings);
  }

  if (method === 'PATCH' && base === '/api/settings') {
    const key = String(body.key ?? '');
    const value = String(body.value ?? '');
    if (!key) return json({ error: { code: 'VALIDATION', message: "Kalit ko'rsatilmagan" } }, 400);
    settings = { ...settings, [key]: value };
    return json({ key, value });
  }

  if (method === 'GET' && base === '/api/printers') {
    return json({ printers: PRINTERS });
  }

  return null;
};
