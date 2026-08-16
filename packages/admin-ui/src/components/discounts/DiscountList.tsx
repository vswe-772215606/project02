import { Chip, Row, RowHeader, RowMoney, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Discount } from '@/api/discounts';

const COLUMNS = '1fr 150px 120px';

/**
 * The preset list. Selecting a row opens it in the editor panel — there is
 * no separate edit action to confuse with deactivate, which now lives only
 * in the panel's action bar.
 */
export function DiscountList({
  discounts,
  selectedId,
  onSelect,
}: {
  discounts: Discount[];
  selectedId: string | null;
  onSelect: (discount: Discount) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Nomi</span>
        <span className="text-right">Qiymati</span>
        <span>Holati</span>
      </RowHeader>

      {discounts.map((discount) => (
        <Row key={discount.id} columns={COLUMNS} selected={discount.id === selectedId} onClick={() => onSelect(discount)}>
          <span className="min-w-0 truncate">{discount.name}</span>
          <RowMoney>{discount.type === 'PERCENT' ? `${discount.value}%` : formatMoney(discount.value)}</RowMoney>
          <span>
            <Chip tone={discount.isActive ? 'settled' : 'inert'}>{discount.isActive ? 'Faol' : 'Nofaol'}</Chip>
          </span>
        </Row>
      ))}

      {discounts.length === 0 && (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">Chegirmalar yo'q</div>
      )}
    </Seam>
  );
}
