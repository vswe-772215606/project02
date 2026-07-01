import bcrypt from 'bcryptjs';
import { PrismaClient, TableType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

const USER_IDS = {
  owner: 'seed-owner',
  admin: 'seed-admin',
  waiterBotir: 'seed-waiter-botir',
  waiterAziza: 'seed-waiter-aziza',
} as const;

const CATEGORY_IDS = {
  salads: 'seed-category-salads',
  soups: 'seed-category-soups',
  mains: 'seed-category-mains',
  tea: 'seed-category-tea',
  bread: 'seed-category-bread',
} as const;

const MENU_ITEM_IDS = {
  achichuk: 'seed-item-achichuk',
  guruchSalat: 'seed-item-guruch-salat',
  qarsildoqSalat: 'seed-item-qarsildoq-salat',
  mastava: 'seed-item-mastava',
  lagmonSoup: 'seed-item-lagmon-soup',
  osh: 'seed-item-osh',
  molKabob: 'seed-item-mol-kabob',
  tovuqKabob: 'seed-item-tovuq-kabob',
  somsa: 'seed-item-somsa',
  qoraChoy: 'seed-item-qora-choy',
  kokChoy: 'seed-item-kok-choy',
  patirNon: 'seed-item-patir-non',
} as const;

const TABLE_IDS = {
  xona1: 'seed-table-room-1',
  xona2: 'seed-table-room-2',
  xona3: 'seed-table-room-3',
  stol1: 'seed-table-table-1',
  stol2: 'seed-table-table-2',
  stol3: 'seed-table-table-3',
} as const;

const COMBO_ID = 'seed-combo-lunch-set';

async function upsertUser(input: {
  id: string;
  username?: string;
  password?: string;
  pin?: string;
  fullName: string;
  role: UserRole;
}) {
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    : null;
  const pinHash = input.pin ? await bcrypt.hash(input.pin, BCRYPT_ROUNDS) : null;

  return prisma.user.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      username: input.username ?? null,
      passwordHash,
      pinHash,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      failedLogins: 0,
      lockedUntil: null,
    },
    update: {
      username: input.username ?? null,
      passwordHash,
      pinHash,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      failedLogins: 0,
      lockedUntil: null,
    },
  });
}

async function main() {
  await upsertUser({
    id: USER_IDS.owner,
    username: 'owner',
    password: 'owner123',
    fullName: 'Owner',
    role: UserRole.OWNER,
  });

  await upsertUser({
    id: USER_IDS.admin,
    username: 'admin',
    password: 'admin123',
    fullName: 'Admin',
    role: UserRole.ADMIN,
  });

  await upsertUser({
    id: USER_IDS.waiterBotir,
    pin: '5678',
    fullName: 'Waiter Botir',
    role: UserRole.WAITER,
  });

  await upsertUser({
    id: USER_IDS.waiterAziza,
    pin: '2468',
    fullName: 'Waiter Aziza',
    role: UserRole.WAITER,
  });

  for (const setting of [
    { key: 'max_discount_percent', value: '15' },
    { key: 'max_discount_amount', value: '100000' },
    { key: 'daily_report_telegram_enabled', value: 'false' },
    { key: 'daily_report_telegram_time', value: '23:30' },
    { key: 'monthly_report_telegram_enabled', value: 'false' },
    { key: 'monthly_report_telegram_time', value: '09:00' },
    { key: 'telegram_bot_token', value: '' },
    { key: 'owner_telegram_chat_id', value: '' },
    { key: 'admin_printer_name', value: 'POS-80' },
    { key: 'store_heading', value: 'Chayxana' },
    { key: 'store_phone', value: '' },
    { key: 'store_address', value: '' },
    { key: 'variance_alert_threshold', value: '50000' },
    { key: 'monthly_kitchen_overhead_uzs', value: '0' },
    { key: 'system_costing_active_since', value: '' },
    { key: 'alerts_telegram_enabled', value: 'true' },
    { key: 'alert_discount_threshold', value: '50000' },
    { key: 'alert_expense_threshold', value: '500000' },
    { key: 'alert_low_stock_enabled', value: 'true' },
  ]) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { value: setting.value },
    });
  }

  // Minimal category set — admin no longer picks a category in the UI.
  // 'Mahsulot xaridi' is auto-attached by Purchase events; 'Operatsion' is the
  // default for everything else (salary, rent, utilities, etc.).
  // Older category names (Go'sht / Sabzavot / Ichimlik / Transport / Xo'jalik /
  // Ishchilar oyligi / Avans / Boshqa) may still exist in older dev DBs from
  // earlier seeds; they continue to work but new expenses default to Operatsion.
  const expenseCategories = [
    { id: 'seed-cat-ingredients', name: 'Mahsulot xaridi', displayOrder: 0 },
    { id: 'seed-cat-operational', name: 'Operatsion', displayOrder: 1 },
  ];

  for (const category of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: category.name },
      create: category,
      update: {
        displayOrder: category.displayOrder,
        isActive: true,
      },
    });
  }

  const categories = [
    { id: CATEGORY_IDS.salads, name: 'Salatlar', displayOrder: 0 },
    { id: CATEGORY_IDS.soups, name: "Sho'rvalar", displayOrder: 1 },
    { id: CATEGORY_IDS.mains, name: 'Osh va kabob', displayOrder: 2 },
    { id: CATEGORY_IDS.tea, name: 'Choy', displayOrder: 3 },
    { id: CATEGORY_IDS.bread, name: 'Non', displayOrder: 4 },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      create: category,
      update: {
        name: category.name,
        displayOrder: category.displayOrder,
        isActive: true,
      },
    });
  }

  const menuItems = [
    { id: MENU_ITEM_IDS.achichuk, categoryId: CATEGORY_IDS.salads, name: 'Achichuk', description: 'Pomidor va piyozli salat', price: '18000', displayOrder: 0 },
    { id: MENU_ITEM_IDS.guruchSalat, categoryId: CATEGORY_IDS.salads, name: 'Guruchli salat', description: 'Mayin guruch va sabzavotlar', price: '22000', displayOrder: 1 },
    { id: MENU_ITEM_IDS.qarsildoqSalat, categoryId: CATEGORY_IDS.salads, name: 'Qarsildoq salat', description: 'Bodring va ko\'katli salat', price: '20000', displayOrder: 2 },
    { id: MENU_ITEM_IDS.mastava, categoryId: CATEGORY_IDS.soups, name: 'Mastava', description: 'Mol go\'shtli issiq sho\'rva', price: '26000', displayOrder: 0 },
    { id: MENU_ITEM_IDS.lagmonSoup, categoryId: CATEGORY_IDS.soups, name: 'Lag\'mon sho\'rva', description: 'Uy lag\'monidan sho\'rva', price: '30000', displayOrder: 1 },
    { id: MENU_ITEM_IDS.osh, categoryId: CATEGORY_IDS.mains, name: 'Osh', description: 'An\'anaviy toshkent oshi', price: '35000', displayOrder: 0 },
    { id: MENU_ITEM_IDS.molKabob, categoryId: CATEGORY_IDS.mains, name: 'Mol kabob', description: 'Mol go\'shtidan kabob', price: '42000', displayOrder: 1 },
    { id: MENU_ITEM_IDS.tovuqKabob, categoryId: CATEGORY_IDS.mains, name: 'Tovuq kabob', description: 'Tovuq go\'shtidan kabob', price: '36000', displayOrder: 2 },
    { id: MENU_ITEM_IDS.somsa, categoryId: CATEGORY_IDS.mains, name: 'Somsa', description: 'Tandir somsasi', price: '12000', displayOrder: 3 },
    { id: MENU_ITEM_IDS.qoraChoy, categoryId: CATEGORY_IDS.tea, name: 'Qora choy', description: 'Bir choynak qora choy', price: '8000', displayOrder: 0 },
    { id: MENU_ITEM_IDS.kokChoy, categoryId: CATEGORY_IDS.tea, name: 'Ko\'k choy', description: 'Bir choynak ko\'k choy', price: '8000', displayOrder: 1 },
    { id: MENU_ITEM_IDS.patirNon, categoryId: CATEGORY_IDS.bread, name: 'Patir non', description: 'Yangi tandir non', price: '6000', displayOrder: 0 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        category: {
          connect: { id: item.categoryId },
        },
        name: item.name,
        description: item.description,
        price: item.price,
        displayOrder: item.displayOrder,
        isAvailable: true,
        isActive: true,
      },
      update: {
        category: {
          connect: { id: item.categoryId },
        },
        name: item.name,
        description: item.description,
        price: item.price,
        displayOrder: item.displayOrder,
        isAvailable: true,
        isActive: true,
      },
    });
  }

  const tables = [
    { id: TABLE_IDS.xona1, name: 'Xona 1', type: TableType.ROOM, displayOrder: 0 },
    { id: TABLE_IDS.xona2, name: 'Xona 2', type: TableType.ROOM, displayOrder: 1 },
    { id: TABLE_IDS.xona3, name: 'Xona 3', type: TableType.ROOM, displayOrder: 2 },
    { id: TABLE_IDS.stol1, name: 'Stol 1', type: TableType.TABLE, displayOrder: 3 },
    { id: TABLE_IDS.stol2, name: 'Stol 2', type: TableType.TABLE, displayOrder: 4 },
    { id: TABLE_IDS.stol3, name: 'Stol 3', type: TableType.TABLE, displayOrder: 5 },
  ];

  for (const table of tables) {
    await prisma.table.upsert({
      where: { id: table.id },
      create: table,
      update: {
        name: table.name,
        type: table.type,
        displayOrder: table.displayOrder,
        isActive: true,
      },
    });
  }

  await prisma.discount.upsert({
    where: { id: 'seed-discount-10pct' },
    create: {
      id: 'seed-discount-10pct',
      name: "10% chegirma",
      type: 'PERCENT',
      value: '10',
      isActive: true,
      createdById: USER_IDS.owner,
    },
    update: {
      name: "10% chegirma",
      type: 'PERCENT',
      value: '10',
      isActive: true,
    },
  });

  await prisma.discount.upsert({
    where: { id: 'seed-discount-fixed-5k' },
    create: {
      id: 'seed-discount-fixed-5k',
      name: "5 000 so'm chegirma",
      type: 'FIXED',
      value: '5000',
      isActive: true,
      createdById: USER_IDS.owner,
    },
    update: {
      name: "5 000 so'm chegirma",
      type: 'FIXED',
      value: '5000',
      isActive: true,
    },
  });

  await prisma.combo.upsert({
    where: { id: COMBO_ID },
    create: {
      id: COMBO_ID,
      name: 'Lunch Set',
      displayOrder: 0,
      isActive: true,
    },
    update: {
      name: 'Lunch Set',
      displayOrder: 0,
      isActive: true,
    },
  });

  await prisma.comboComponent.deleteMany({
    where: { comboId: COMBO_ID },
  });

  await prisma.comboComponent.createMany({
    data: [
      {
        comboId: COMBO_ID,
        menuItemId: MENU_ITEM_IDS.mastava,
        quantity: 1,
      },
      {
        comboId: COMBO_ID,
        menuItemId: MENU_ITEM_IDS.molKabob,
        quantity: 1,
      },
      {
        comboId: COMBO_ID,
        menuItemId: MENU_ITEM_IDS.qoraChoy,
        quantity: 1,
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
