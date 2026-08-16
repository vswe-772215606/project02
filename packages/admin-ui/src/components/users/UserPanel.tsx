import { Panel } from '@/components/layout/Screen';
import { ActionBar, Chip, Row, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import type { User } from '@/api/auth';

const ROLE_LABEL: Record<User['role'], string> = {
  OWNER: 'Ega',
  ADMIN: 'Admin',
  WAITER: 'Ofitsiant',
};

/**
 * The person in hand.
 *
 * Read-only: this panel names who they are and what they can do next. The
 * only way to change their record is Tahrirlash, which opens the form —
 * keeping a fast, glanceable view separate from the slower editing task.
 */
export function UserPanel({
  user,
  canToggle,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  user: User;
  /** False for the signed-in user, and for an Owner record an Admin may not touch. */
  canToggle: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{user.fullName}</div>
          <div className="text-[13px] text-muted-foreground">
            {ROLE_LABEL[user.role]} · {user.isActive ? 'Faol' : "To'xtatilgan"}
          </div>
        </>
      }
      foot={
        <div className="bg-field p-pad">
          <ActionBar
            destructive={
              canToggle && user.isActive ? (
                <Button variant="destructive" onClick={onDeactivate}>
                  Faolsizlantirish
                </Button>
              ) : undefined
            }
          >
            {canToggle && !user.isActive ? <Button onClick={onReactivate}>Faollashtirish</Button> : null}
            <Button variant="secondary" onClick={onEdit}>
              Tahrirlash
            </Button>
          </ActionBar>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Row columns="1fr auto">
            <span>Login</span>
            <span className="text-right text-[14.5px]">{user.username ?? 'PIN orqali'}</span>
          </Row>
          <Row columns="1fr auto">
            <span>Rol</span>
            <span className="text-right text-[14.5px]">{ROLE_LABEL[user.role]}</span>
          </Row>
          <Row columns="1fr auto">
            <span>Holati</span>
            <span className="flex justify-end">
              <Chip tone={user.isActive ? 'settled' : 'owed'}>{user.isActive ? 'Faol' : "To'xtatilgan"}</Chip>
            </span>
          </Row>
        </Seam>
      </div>
    </Panel>
  );
}
