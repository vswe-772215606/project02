import { useState } from 'react';
import { Package, Coins, ClipboardCheck } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import {
  ActionBar,
  Chip,
  Field,
  FieldLabel,
  Key,
  Keypad,
  MoneyField,
  NavItem,
  Row,
  RowHeader,
  RowMoney,
  RowSub,
  Seam,
  Tile,
  type KeypadKey,
} from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Blocks C1 gallery — every primitive in every state, on one screen.
 *
 * A developer surface, not a product page: it is deliberately absent from the
 * sidebar and reachable only at `#/components`. Delete the route and this
 * file to remove it.
 */

const ROW_COLUMNS = '1fr 128px 100px';

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Seam>
      <Field tone="raised" className="py-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.1em]">{title}</div>
        {note ? <div className="mt-0.5 text-[13px] text-muted-foreground">{note}</div> : null}
      </Field>
      <Field>{children}</Field>
    </Seam>
  );
}

export function ComponentsPage() {
  usePageTitle('Blocks C1');
  const [amount, setAmount] = useState('486000');
  const [selectedRow, setSelectedRow] = useState('a');
  const [selectedTile, setSelectedTile] = useState('stol5');

  const onKey = (key: KeypadKey) => {
    setAmount((current) => {
      if (key === 'backspace') return current.slice(0, -1);
      if (key === 'decimal') return current.includes(',') ? current : `${current},`;
      return `${current}${key}`;
    });
  };

  return (
    <div className="min-h-full bg-seam p-pad">
      <Seam className="mx-auto max-w-[1000px]">
        <Field>
          <div className="text-[24px] font-semibold tracking-[-0.015em]">Blocks C1</div>
          <p className="mt-1 max-w-[60ch] text-[14px] text-muted-foreground">
            Every primitive in every state. No borders, no radius, no shadows, no hover — separation
            is a 2px seam and state is the fill. Press anything to see the response.
          </p>
        </Field>

        <Section title="Money field" note="Headline figures — 31px, tabular, never below 17px anywhere else.">
          <Seam direction="row" className="w-max">
            <MoneyField label="Bugungi savdo" value="12 450 000" unit="so'm" note="kecha 11 505 000 · +8.2%" />
            <MoneyField label="Sof foyda" value="3 180 000" unit="so'm" note="COGS 6 920 000" />
            <MoneyField label="Kassa qoldig'i" value="0" unit="so'm" note="sanoq kiritilmagan" tone="raised" />
          </Seam>
        </Section>

        <Section title="Field tones" note="The same surface in each state fill. Every tone pairs with a word — the fill never carries the meaning alone.">
          <Seam direction="row" wrap className="w-max">
            <Field className="w-[150px]"><FieldLabel>Default</FieldLabel><div className="mt-1">Bo'sh</div></Field>
            <Field tone="raised" className="w-[150px]"><FieldLabel>Raised</FieldLabel><div className="mt-1">Sarlavha</div></Field>
            <Field tone="live" className="w-[150px]"><FieldLabel>Live</FieldLabel><div className="mt-1">Band</div></Field>
            <Field tone="settled" className="w-[150px]"><FieldLabel>Settled</FieldLabel><div className="mt-1">Yopilgan</div></Field>
            <Field tone="owed" className="w-[150px]"><FieldLabel>Owed</FieldLabel><div className="mt-1">Nasiya</div></Field>
            <Field tone="selected" className="w-[150px]"><FieldLabel>Selected</FieldLabel><div className="mt-1">Tanlandi</div></Field>
          </Seam>
        </Section>

        <Section title="Chips" note="Solid fill, no outline, no dot. The word is always there, so colour never carries the meaning alone.">
          <div className="flex flex-wrap gap-seam">
            <Chip tone="live">Kutilmoqda</Chip>
            <Chip tone="settled">Yopilgan</Chip>
            <Chip tone="owed">Nasiya</Chip>
            <Chip tone="inert">Bekor</Chip>
            <Chip tone="selected">Tanlandi</Chip>
          </div>
        </Section>

        <Section title="Rows" note="48px. A row with an action is a real button — keyboard reachable, and it inverts when selected.">
          <Seam>
            <RowHeader columns={ROW_COLUMNS}>
              <span>Stol / ofitsiant</span>
              <span>Holat</span>
              <span className="text-right">Jami</span>
            </RowHeader>
            <Row columns={ROW_COLUMNS} selected={selectedRow === 'a'} onClick={() => setSelectedRow('a')}>
              <span>
                Xona 3
                <RowSub>Botir · 14:22</RowSub>
              </span>
              <span><Chip tone="live">Kutilmoqda</Chip></span>
              <RowMoney>486 000</RowMoney>
            </Row>
            <Row columns={ROW_COLUMNS} selected={selectedRow === 'b'} onClick={() => setSelectedRow('b')}>
              <span>
                Stol 5
                <RowSub>Aziza · 14:05</RowSub>
              </span>
              <span><Chip tone="settled">Yopilgan</Chip></span>
              <RowMoney>212 000</RowMoney>
            </Row>
            <Row columns={ROW_COLUMNS} selected={selectedRow === 'c'} onClick={() => setSelectedRow('c')}>
              <span>
                Xona 1
                <RowSub>Botir · 13:41</RowSub>
              </span>
              <span><Chip tone="owed">Nasiya</Chip></span>
              <RowMoney>1 340 000</RowMoney>
            </Row>
            <Row columns={ROW_COLUMNS} inert>
              <span>
                Stol 2
                <RowSub>Aziza · 13:02</RowSub>
              </span>
              <span><Chip tone="inert">Bekor</Chip></span>
              <RowMoney>—</RowMoney>
            </Row>
          </Seam>
        </Section>

        <Section title="Buttons and the action bar" note="48px standard, 56px for the action a screen exists for. Destructive keeps a 16px moat — ActionBar guarantees it.">
          <div className="flex flex-col gap-pad">
            <div className="flex flex-wrap items-center gap-seam">
              <Button size="action">Tasdiqlash</Button>
              <Button variant="outline" size="action">Bekor qilish</Button>
              <Button variant="secondary" size="action">Chop etish</Button>
              <Button size="action" disabled>Yopilgan</Button>
            </div>
            <div className="flex flex-wrap items-center gap-seam">
              <Button>Saqlash</Button>
              <Button variant="outline">Yopish</Button>
              <Button variant="ghost">Tozalash</Button>
              <Button variant="link">Batafsil</Button>
              <Button size="sm">Qo'shish</Button>
              <Button size="lg" variant="outline">Kattaroq</Button>
              <Button size="icon" aria-label="Qo'shish"><Package /></Button>
            </div>
            <ActionBar destructive={<Button variant="destructive">O'chirish</Button>}>
              <Button variant="outline">Bekor qilish</Button>
              <Button>Tasdiqlash</Button>
            </ActionBar>
            <ActionBar align="start" destructive={<Button variant="destructive" size="sm">Yo'qotish</Button>}>
              <Button variant="outline" size="sm">Chapdan</Button>
            </ActionBar>
          </div>
        </Section>

        <Section title="Inputs" note="Borderless at rest; focus is a 2px inset ring. Numeric inputs are right-aligned and tabular.">
          <div className="flex flex-wrap gap-pad">
            <div className="grid w-[200px] gap-1">
              <FieldLabel>Naqd</FieldLabel>
              <Input numeric value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="grid w-[200px] gap-1">
              <FieldLabel>Qarzdor ismi</FieldLabel>
              <Input placeholder="Ism familiya" />
            </div>
            <div className="grid w-[200px] gap-1">
              <FieldLabel>Karta</FieldLabel>
              <Input numeric value="0" disabled readOnly />
            </div>
          </div>
        </Section>

        <Section title="Tiles" note="The whole tile is the target and the fill is the signal. 2px seams between them.">
          <Seam direction="row" className="w-max">
            <Tile label="Stol 1" state="Bo'sh" tone={selectedTile === 'stol1' ? 'selected' : 'default'} onClick={() => setSelectedTile('stol1')} />
            <Tile label="Xona 3" state="Band" tone={selectedTile === 'xona3' ? 'selected' : 'live'} onClick={() => setSelectedTile('xona3')} />
            <Tile label="Stol 5" state={selectedTile === 'stol5' ? 'Tanlandi' : "Bo'sh"} tone={selectedTile === 'stol5' ? 'selected' : 'default'} onClick={() => setSelectedTile('stol5')} />
            <Tile label="Xona 2" state="Nasiya" tone="owed" onClick={() => setSelectedTile('xona2')} />
            <Tile label="Stol 7" state="Yopilgan" tone="settled" onClick={() => setSelectedTile('stol7')} />
            <Tile label="Stol 8" state="Yopiq" tone="inert" disabled />
          </Seam>
        </Section>

        <Section title="Keypad" note="Fixed three columns of 66px keys. Tender and quantity only — never navigation.">
          <div className="flex flex-wrap items-start gap-pad">
            <Keypad onKey={onKey} />
            <Keypad onKey={onKey} showDecimal />
            <div className="grid gap-seam">
              <FieldLabel>Tez summa</FieldLabel>
              <Seam direction="row" className="w-max">
                <Key className="w-[92px] text-[17px]" onClick={() => setAmount('500000')}>500 000</Key>
                <Key className="w-[92px] text-[17px]" onClick={() => setAmount('1000000')}>1 000 000</Key>
              </Seam>
            </div>
          </div>
        </Section>

        <Section title="Nav items" note="The active item inverts. No bar, no tint, no coloured edge.">
          <Seam className="w-[220px]">
            <NavItem label="Tasdiqlash" icon={<ClipboardCheck size={18} />} active />
            <NavItem label="Ombor" icon={<Package size={18} />} />
            <NavItem label="Kunlik moliya" icon={<Coins size={18} />} />
          </Seam>
        </Section>
      </Seam>
    </div>
  );
}
