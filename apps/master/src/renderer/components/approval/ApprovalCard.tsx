import { Armchair, CheckCircle2, ReceiptText, User as UserIcon, XCircle } from 'lucide-react';
import type { Order } from '@/api/orders';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';

function locationLabel(order: Order): string {
  return (
    order.tableName ||
    (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')
  );
}

function linePreview(order: Order): { previewLines: string[]; remaining: number } {
  const lines = (order.lines ?? []).filter((line) => !line.isCanceled);
  const previewLines = lines.slice(0, 3).map((line) => `${line.quantity}× ${line.nameSnapshot}`);
  const remaining = Math.max(0, lines.length - previewLines.length);
  return { previewLines, remaining };
}

export function ApprovalCard({
  order,
  onConfirm,
  onWalkout,
}: {
  order: Order;
  onConfirm: () => void;
  onWalkout: () => void;
}) {
  const { previewLines, remaining } = linePreview(order);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm flex items-center gap-1.5 tabular-nums">
            <ReceiptText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            #{order.orderNumber}
          </CardTitle>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Armchair className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <span className="truncate font-medium">{locationLabel(order)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserIcon className="h-3 w-3" strokeWidth={1.75} />
            <span className="truncate">{order.waiter?.fullName ?? '—'}</span>
          </div>
        </div>
        <DateTimeCell value={order.createdAt} className="text-[11px] text-muted-foreground" />
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-4">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1">
          {previewLines.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Pozitsiyalar yo&apos;q</p>
          ) : (
            previewLines.map((line, idx) => (
              <p key={idx} className="text-xs text-foreground truncate">
                {line}
              </p>
            ))
          )}
          {remaining > 0 && (
            <p className="text-[11px] text-muted-foreground">
              +{remaining} ta yana
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between border-t border-border/40 pt-3">
          <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
            Summa
          </span>
          <span className="text-lg font-semibold">
            <MoneyCell value={order.totalSnapshot || order.totalAmount || 0} />
          </span>
        </div>
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          variant="outline"
          onClick={onWalkout}
          className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
        >
          <XCircle />
          To&apos;lamay ketdi
        </Button>
        <Button onClick={onConfirm} className="flex-[2]">
          <CheckCircle2 />
          Tasdiqlash
        </Button>
      </CardFooter>
    </Card>
  );
}
