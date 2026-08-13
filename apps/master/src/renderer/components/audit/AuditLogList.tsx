import { Chip, Row, RowHeader, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { AUDIT_LABELS, auditActionTone } from '@/lib/audit-labels';
import { formatDateTime } from '@/lib/format';
import type { AuditLogItem } from '@/api/audit';

const COLUMNS = '150px 1fr 210px 150px';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Ega', ADMIN: 'Admin', WAITER: 'Ofitsiant' };

const TONE_MAP: Record<ReturnType<typeof auditActionTone>, ChipTone> = {
  success: 'settled',
  danger: 'owed',
  warning: 'live',
  info: 'selected',
  neutral: 'inert',
};

/**
 * The ledger. Every row names its time, its actor, its action and its
 * object — the metadata that used to be summarised (or hidden) here now
 * lives entirely in the panel, in full, once a row is selected.
 */
export function AuditLogList({
  items,
  selectedId,
  onSelect,
}: {
  items: AuditLogItem[];
  selectedId: string | null;
  onSelect: (item: AuditLogItem) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Vaqti</span>
        <span>Foydalanuvchi</span>
        <span>Amal</span>
        <span>Obyekt</span>
      </RowHeader>

      {items.map((item) => (
        <Row key={item.id} columns={COLUMNS} selected={item.id === selectedId} onClick={() => onSelect(item)}>
          <span className="text-[13px] tabular-nums text-muted-foreground">{formatDateTime(item.createdAt)}</span>
          <span className="min-w-0 truncate">
            {item.user.fullName}
            <RowSub>{ROLE_LABEL[item.user.role] ?? item.user.role}</RowSub>
          </span>
          <span>
            <Chip tone={TONE_MAP[auditActionTone(item.action)]}>{AUDIT_LABELS[item.action] ?? item.action}</Chip>
          </span>
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">
            {item.entityType}
            {item.entityId ? ` #${item.entityId.slice(-6)}` : ''}
          </span>
        </Row>
      ))}

      {items.length === 0 && (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">Yozuvlar topilmadi</div>
      )}
    </Seam>
  );
}
