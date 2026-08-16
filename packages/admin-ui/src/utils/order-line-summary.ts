import { OrderLine } from '../api/orders';

export function summarizeOrderLines(lines?: OrderLine[], maxChars = 80) {
  const activeLines = lines?.filter((line) => !line.isCanceled) ?? [];
  if (activeLines.length === 0) {
    return '';
  }

  const grouped = new Map<string, number>();
  for (const line of activeLines) {
    const name = line.nameSnapshot || line.name || line.comboNameSnapshot || 'Noma\'lum';
    grouped.set(name, (grouped.get(name) ?? 0) + line.quantity);
  }

  const summary = Array.from(grouped.entries())
    .map(([name, quantity]) => `${quantity}x ${name}`)
    .join(', ');

  if (summary.length <= maxChars) {
    return summary;
  }

  return `${summary.slice(0, maxChars - 1).trimEnd()}…`;
}
