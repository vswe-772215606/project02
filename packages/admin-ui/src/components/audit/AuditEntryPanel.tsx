import { Panel } from '@/components/layout/Screen';
import { Chip, Row, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { AUDIT_LABELS, auditActionTone } from '@/lib/audit-labels';
import { formatDateTime } from '@/lib/format';
import type { AuditLogItem } from '@/api/audit';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Ega', ADMIN: 'Admin', WAITER: 'Ofitsiant' };

const TONE_MAP: Record<ReturnType<typeof auditActionTone>, ChipTone> = {
  success: 'settled',
  danger: 'owed',
  warning: 'live',
  info: 'selected',
  neutral: 'inert',
};

function metadataEntries(metadata: unknown): Array<[string, string]> {
  if (!metadata || typeof metadata !== 'object') return [];
  return Object.entries(metadata as Record<string, unknown>).map(([key, value]) => {
    if (value === null || value === undefined) return [key, '—'];
    if (typeof value === 'string') return [key, value];
    if (typeof value === 'number' || typeof value === 'boolean') return [key, String(value)];
    return [key, JSON.stringify(value)];
  });
}

/**
 * The full entry — everything the row can't show.
 *
 * Previously this information existed only as a native `title` tooltip,
 * unreadable on a touchscreen and, on this page whose entire job is reading
 * audit detail, the actual defect being fixed. Nothing here is truncated.
 */
export function AuditEntryPanel({ entry }: { entry: AuditLogItem }) {
  const tone = TONE_MAP[auditActionTone(entry.action)];
  const label = AUDIT_LABELS[entry.action] ?? entry.action;
  const fields = metadataEntries(entry.metadata);

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{label}</div>
          <div className="text-[13px] text-muted-foreground">
            {entry.user.fullName} · {formatDateTime(entry.createdAt)}
          </div>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Row columns="1fr auto">
            <span>Vaqti</span>
            <span className="text-right text-[14.5px] tabular-nums">{formatDateTime(entry.createdAt)}</span>
          </Row>
          <Row columns="1fr auto">
            <span>Amal</span>
            <span className="flex justify-end">
              <Chip tone={tone}>{label}</Chip>
            </span>
          </Row>
          <Row columns="1fr auto">
            <span>Foydalanuvchi</span>
            <span className="text-right text-[14.5px]">
              {entry.user.fullName}
              <RowSub>{ROLE_LABEL[entry.user.role] ?? entry.user.role}</RowSub>
            </span>
          </Row>
          <Row columns="1fr auto">
            <span>Obyekt</span>
            <span className="text-right text-[14.5px]">
              {entry.entityType}
              {entry.entityId ? <RowSub>{entry.entityId}</RowSub> : null}
            </span>
          </Row>

          <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Tafsilot
          </div>
          {fields.length === 0 ? (
            <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">Qo'shimcha ma'lumot yo'q</div>
          ) : (
            // A Field here, not a Row: metadata values (a written reason, a
            // stringified object) are unbounded, and Row's fixed 48px would
            // clip or overlap anything longer than one short line.
            fields.map(([key, value]) => (
              <div key={key} className="bg-field px-pad py-2">
                <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{key}</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px]">{value}</div>
              </div>
            ))
          )}
        </Seam>
      </div>
    </Panel>
  );
}
