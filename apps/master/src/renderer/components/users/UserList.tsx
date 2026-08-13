import { Chip, Row, RowHeader, RowSub, Seam } from '@/components/blocks';
import type { User } from '@/api/auth';

const COLUMNS = '1fr 130px 130px';

const ROLE_LABEL: Record<User['role'], string> = {
  OWNER: 'Ega',
  ADMIN: 'Admin',
  WAITER: 'Ofitsiant',
};

const ROLE_TONE: Record<User['role'], 'selected' | 'live' | 'inert'> = {
  OWNER: 'selected',
  ADMIN: 'live',
  WAITER: 'inert',
};

/**
 * The staff roster.
 *
 * Every row carries its role and its status as words, not icons, so the list
 * reads the same with or without the panel open. Actions live in the panel —
 * a row is a selection, never a menu of tiny per-row buttons.
 */
export function UserList({
  users,
  selectedId,
  onSelect,
}: {
  users: User[];
  selectedId: string | null;
  onSelect: (user: User) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Xodim</span>
        <span>Rol</span>
        <span>Holati</span>
      </RowHeader>

      {users.map((user) => (
        <Row key={user.id} columns={COLUMNS} selected={user.id === selectedId} onClick={() => onSelect(user)}>
          <span className="min-w-0 truncate">
            {user.fullName}
            <RowSub>{user.username ?? 'PIN orqali'}</RowSub>
          </span>
          <span>
            <Chip tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Chip>
          </span>
          <span>
            <Chip tone={user.isActive ? 'settled' : 'owed'}>{user.isActive ? 'Faol' : "To'xtatilgan"}</Chip>
          </span>
        </Row>
      ))}

      {users.length === 0 && (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">Foydalanuvchilar topilmadi</div>
      )}
    </Seam>
  );
}
