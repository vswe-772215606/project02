import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  width?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  emptyState?: ReactNode;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  className?: string;
};

function alignClass(align?: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

/**
 * Standard list table per UI_UX_RULES §8.2.
 *   - Sticky header
 *   - Right-align numeric columns via column.align='right'
 *   - Row click opens detail (no separate View button)
 *   - Skeleton rows during isLoading; emptyState renders when data is empty
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyState,
  rowKey,
  onRowClick,
  skeletonRows = 5,
  className,
}: DataTableProps<T>) {
  const isEmpty = !isLoading && (!data || data.length === 0);

  return (
    <div className={cn('rounded-md border bg-card overflow-hidden', className)}>
      <div className="overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'text-xs uppercase tracking-wider font-medium text-muted-foreground',
                    alignClass(col.align),
                    col.headerClassName,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: skeletonRows }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn(alignClass(col.align), col.className)}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isEmpty && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-12"
                >
                  {emptyState ?? <span className="text-sm">Ma'lumot yo'q</span>}
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              data?.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-muted/40')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(alignClass(col.align), col.className)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
