// Ingredient + Recipe + boshlang'ich Xarid seed.
// Yuqoridagi prisma/seed.ts dan keyin ishlatiladi (bu menyu va foydalanuvchilarni
// allaqachon yaratgan deb taxmin qiladi).
//
// Foydalanish:
//   pnpm --filter @chayxana/master exec tsx scripts/seed-ingredients-recipes.ts
//
// Idempotent: bir necha marta ishlatish xavfsiz. Mavjud ingredient va recipe
// upsert qilinadi. Boshlang'ich Xarid faqat shu ingredient uchun hech qachon
// xarid bo'lmagan bo'lsa qo'shiladi (aks holda stockni qayta yo'q qilamiz).

import { IngredientMovementType, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_ID = 'seed-owner';
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

// Menyu mahsulot ID'lari (prisma/seed.ts dan)
const M = {
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

type IngredientSpec = {
  // Stable ID: seed-ing-<dish>-<name>
  id: string;
  parentMenuItemId: string;
  name: string;
  buyUnit: string;            // bozordan olinadigan birlik
  recipeUnit: string;         // retseptda ishlatiladigan birlik
  conversionFactor: number;   // 1 buy = N recipe
  // Boshlang'ich xarid (bir marta yaratiladi)
  initialPurchase: {
    quantityBuyUnit: number;  // qancha buyUnit olindi
    totalCostUzs: number;     // umumiy narx so'mda
  };
};

type RecipeSpec = {
  menuItemId: string;
  ingredients: Array<{ ingredientId: string; quantity: number }>; // recipeUnit'da
};

// Har bir taom uchun: ingredientlar + retsept + boshlang'ich xarid.
// Narxlar va miqdorlar ko'rsatkichli — sinash uchun real ko'rinishda.
const SPECS: Array<{ ingredients: IngredientSpec[]; recipe: RecipeSpec }> = [
  // ─── Achichuk ───
  {
    ingredients: [
      { id: 'seed-ing-achichuk-pomidor', parentMenuItemId: M.achichuk, name: 'Pomidor', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 5, totalCostUzs: 60000 } },
      { id: 'seed-ing-achichuk-piyoz', parentMenuItemId: M.achichuk, name: 'Piyoz', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 3, totalCostUzs: 24000 } },
      { id: 'seed-ing-achichuk-kokat', parentMenuItemId: M.achichuk, name: "Ko'kat", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 1, totalCostUzs: 30000 } },
    ],
    recipe: {
      menuItemId: M.achichuk,
      ingredients: [
        { ingredientId: 'seed-ing-achichuk-pomidor', quantity: 100 },
        { ingredientId: 'seed-ing-achichuk-piyoz', quantity: 50 },
        { ingredientId: 'seed-ing-achichuk-kokat', quantity: 10 },
      ],
    },
  },

  // ─── Guruchli salat ───
  {
    ingredients: [
      { id: 'seed-ing-guruchsalat-guruch', parentMenuItemId: M.guruchSalat, name: 'Guruch', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 10, totalCostUzs: 150000 } },
      { id: 'seed-ing-guruchsalat-sabzi', parentMenuItemId: M.guruchSalat, name: 'Sabzi', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 3, totalCostUzs: 18000 } },
      { id: 'seed-ing-guruchsalat-makka', parentMenuItemId: M.guruchSalat, name: "Makkajo'xori", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 2, totalCostUzs: 30000 } },
    ],
    recipe: {
      menuItemId: M.guruchSalat,
      ingredients: [
        { ingredientId: 'seed-ing-guruchsalat-guruch', quantity: 100 },
        { ingredientId: 'seed-ing-guruchsalat-sabzi', quantity: 30 },
        { ingredientId: 'seed-ing-guruchsalat-makka', quantity: 20 },
      ],
    },
  },

  // ─── Qarsildoq salat ───
  {
    ingredients: [
      { id: 'seed-ing-qarsildoq-bodring', parentMenuItemId: M.qarsildoqSalat, name: 'Bodring', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 4, totalCostUzs: 32000 } },
      { id: 'seed-ing-qarsildoq-kokat', parentMenuItemId: M.qarsildoqSalat, name: "Ko'kat", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 1, totalCostUzs: 30000 } },
    ],
    recipe: {
      menuItemId: M.qarsildoqSalat,
      ingredients: [
        { ingredientId: 'seed-ing-qarsildoq-bodring', quantity: 100 },
        { ingredientId: 'seed-ing-qarsildoq-kokat', quantity: 20 },
      ],
    },
  },

  // ─── Mastava ───
  {
    ingredients: [
      { id: 'seed-ing-mastava-gosht', parentMenuItemId: M.mastava, name: "Mol go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 5, totalCostUzs: 400000 } },
      { id: 'seed-ing-mastava-guruch', parentMenuItemId: M.mastava, name: 'Guruch', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 5, totalCostUzs: 75000 } },
      { id: 'seed-ing-mastava-sabzi', parentMenuItemId: M.mastava, name: 'Sabzi', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 3, totalCostUzs: 18000 } },
      { id: 'seed-ing-mastava-pomidor', parentMenuItemId: M.mastava, name: 'Pomidor', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 3, totalCostUzs: 36000 } },
    ],
    recipe: {
      menuItemId: M.mastava,
      ingredients: [
        { ingredientId: 'seed-ing-mastava-gosht', quantity: 80 },
        { ingredientId: 'seed-ing-mastava-guruch', quantity: 50 },
        { ingredientId: 'seed-ing-mastava-sabzi', quantity: 30 },
        { ingredientId: 'seed-ing-mastava-pomidor', quantity: 50 },
      ],
    },
  },

  // ─── Lag'mon sho'rva ───
  {
    ingredients: [
      { id: 'seed-ing-lagmon-gosht', parentMenuItemId: M.lagmonSoup, name: "Mol go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 5, totalCostUzs: 400000 } },
      { id: 'seed-ing-lagmon-xamir', parentMenuItemId: M.lagmonSoup, name: 'Xamir', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 4, totalCostUzs: 60000 } },
      { id: 'seed-ing-lagmon-sabzi', parentMenuItemId: M.lagmonSoup, name: 'Sabzi', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 2, totalCostUzs: 12000 } },
    ],
    recipe: {
      menuItemId: M.lagmonSoup,
      ingredients: [
        { ingredientId: 'seed-ing-lagmon-gosht', quantity: 100 },
        { ingredientId: 'seed-ing-lagmon-xamir', quantity: 100 },
        { ingredientId: 'seed-ing-lagmon-sabzi', quantity: 30 },
      ],
    },
  },

  // ─── Osh ───
  {
    ingredients: [
      { id: 'seed-ing-osh-gosht', parentMenuItemId: M.osh, name: "Mol go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 10, totalCostUzs: 800000 } },
      { id: 'seed-ing-osh-guruch', parentMenuItemId: M.osh, name: 'Guruch (devzira)', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 15, totalCostUzs: 300000 } },
      { id: 'seed-ing-osh-sabzi', parentMenuItemId: M.osh, name: 'Sabzi', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 8, totalCostUzs: 48000 } },
      { id: 'seed-ing-osh-piyoz', parentMenuItemId: M.osh, name: 'Piyoz', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 4, totalCostUzs: 32000 } },
    ],
    recipe: {
      menuItemId: M.osh,
      ingredients: [
        { ingredientId: 'seed-ing-osh-gosht', quantity: 150 },
        { ingredientId: 'seed-ing-osh-guruch', quantity: 200 },
        { ingredientId: 'seed-ing-osh-sabzi', quantity: 100 },
        { ingredientId: 'seed-ing-osh-piyoz', quantity: 50 },
      ],
    },
  },

  // ─── Mol kabob ───
  {
    ingredients: [
      { id: 'seed-ing-molkabob-gosht', parentMenuItemId: M.molKabob, name: "Mol go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 8, totalCostUzs: 640000 } },
      { id: 'seed-ing-molkabob-piyoz', parentMenuItemId: M.molKabob, name: 'Piyoz', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 2, totalCostUzs: 16000 } },
    ],
    recipe: {
      menuItemId: M.molKabob,
      ingredients: [
        { ingredientId: 'seed-ing-molkabob-gosht', quantity: 200 },
        { ingredientId: 'seed-ing-molkabob-piyoz', quantity: 30 },
      ],
    },
  },

  // ─── Tovuq kabob ───
  {
    ingredients: [
      { id: 'seed-ing-tovuq-gosht', parentMenuItemId: M.tovuqKabob, name: "Tovuq go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 6, totalCostUzs: 240000 } },
      { id: 'seed-ing-tovuq-piyoz', parentMenuItemId: M.tovuqKabob, name: 'Piyoz', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 2, totalCostUzs: 16000 } },
    ],
    recipe: {
      menuItemId: M.tovuqKabob,
      ingredients: [
        { ingredientId: 'seed-ing-tovuq-gosht', quantity: 200 },
        { ingredientId: 'seed-ing-tovuq-piyoz', quantity: 30 },
      ],
    },
  },

  // ─── Somsa ───
  {
    ingredients: [
      { id: 'seed-ing-somsa-xamir', parentMenuItemId: M.somsa, name: 'Somsa xamiri', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 5, totalCostUzs: 75000 } },
      { id: 'seed-ing-somsa-gosht', parentMenuItemId: M.somsa, name: "Mol go'shti", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 3, totalCostUzs: 240000 } },
      { id: 'seed-ing-somsa-piyoz', parentMenuItemId: M.somsa, name: 'Piyoz', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 2, totalCostUzs: 16000 } },
    ],
    recipe: {
      menuItemId: M.somsa,
      ingredients: [
        { ingredientId: 'seed-ing-somsa-xamir', quantity: 80 },
        { ingredientId: 'seed-ing-somsa-gosht', quantity: 60 },
        { ingredientId: 'seed-ing-somsa-piyoz', quantity: 30 },
      ],
    },
  },

  // ─── Qora choy ───
  {
    ingredients: [
      { id: 'seed-ing-qoraChoy-bargi', parentMenuItemId: M.qoraChoy, name: 'Qora choy bargi', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 1, totalCostUzs: 80000 } },
    ],
    recipe: {
      menuItemId: M.qoraChoy,
      ingredients: [
        { ingredientId: 'seed-ing-qoraChoy-bargi', quantity: 5 },
      ],
    },
  },

  // ─── Ko'k choy ───
  {
    ingredients: [
      { id: 'seed-ing-kokChoy-bargi', parentMenuItemId: M.kokChoy, name: "Ko'k choy bargi", buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 1, totalCostUzs: 90000 } },
    ],
    recipe: {
      menuItemId: M.kokChoy,
      ingredients: [
        { ingredientId: 'seed-ing-kokChoy-bargi', quantity: 5 },
      ],
    },
  },

  // ─── Patir non ───
  {
    ingredients: [
      { id: 'seed-ing-patir-un', parentMenuItemId: M.patirNon, name: 'Un', buyUnit: 'kg', recipeUnit: 'gramm', conversionFactor: 1000, initialPurchase: { quantityBuyUnit: 20, totalCostUzs: 120000 } },
    ],
    recipe: {
      menuItemId: M.patirNon,
      ingredients: [
        { ingredientId: 'seed-ing-patir-un', quantity: 100 },
      ],
    },
  },
];

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (msg: string) => console.log(`\n${c(36, '──')} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const info = (m: string) => console.log(`  ${c(90, '·')} ${m}`);

async function ensureOwnerExists() {
  const owner = await prisma.user.findUnique({ where: { id: OWNER_ID } });
  if (!owner) {
    throw new Error(
      `Owner foydalanuvchi topilmadi (${OWNER_ID}). Avval "pnpm exec tsx prisma/seed.ts" ni ishga tushiring.`,
    );
  }
}

async function ensureIngredientCategoryExists() {
  const cat = await prisma.expenseCategory.findUnique({
    where: { id: INGREDIENT_EXPENSE_CATEGORY_ID },
  });
  if (!cat) {
    throw new Error(
      `Ingredient kategoriya topilmadi (${INGREDIENT_EXPENSE_CATEGORY_ID}). Avval prisma/seed.ts ni ishga tushiring.`,
    );
  }
}

async function ensureMenuItemsExist() {
  const ids = Object.values(M);
  const found = await prisma.menuItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundSet = new Set(found.map((m) => m.id));
  const missing = ids.filter((id) => !foundSet.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Menyu mahsulotlari topilmadi: ${missing.join(', ')}. Avval prisma/seed.ts ni ishga tushiring.`,
    );
  }
}

async function upsertIngredient(spec: IngredientSpec) {
  await prisma.ingredient.upsert({
    where: { id: spec.id },
    create: {
      id: spec.id,
      parentMenuItem: { connect: { id: spec.parentMenuItemId } },
      expenseCategory: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
      name: spec.name,
      buyUnit: spec.buyUnit,
      recipeUnit: spec.recipeUnit,
      conversionFactor: new Prisma.Decimal(spec.conversionFactor),
      currentStock: new Prisma.Decimal(0),
      weightedAvgCost: new Prisma.Decimal(0),
      varianceThreshold: new Prisma.Decimal(5),
      isActive: true,
    },
    update: {
      name: spec.name,
      buyUnit: spec.buyUnit,
      recipeUnit: spec.recipeUnit,
      conversionFactor: new Prisma.Decimal(spec.conversionFactor),
      isActive: true,
      expenseCategory: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
    },
  });
}

async function seedInitialPurchase(spec: IngredientSpec) {
  // Idempotency: skip if this ingredient already has any purchase.
  const existing = await prisma.purchase.count({
    where: { ingredientId: spec.id },
  });
  if (existing > 0) {
    info(`Xarid mavjud, o'tkazib yuborildi: ${spec.name}`);
    return;
  }

  const quantityBuyUnit = new Prisma.Decimal(spec.initialPurchase.quantityBuyUnit);
  const totalCostUzs = new Prisma.Decimal(spec.initialPurchase.totalCostUzs);
  const conversionFactor = new Prisma.Decimal(spec.conversionFactor);
  const quantityRecipeUnit = quantityBuyUnit.mul(conversionFactor);
  const unitCostPerRecipeUnit = totalCostUzs.div(quantityRecipeUnit);

  const ingredient = await prisma.ingredient.findUnique({ where: { id: spec.id } });
  if (!ingredient) return;

  const oldStock = ingredient.currentStock;
  const oldAvg = ingredient.weightedAvgCost;
  const newStock = oldStock.plus(quantityRecipeUnit);
  const newAvg = oldStock.lte(0)
    ? unitCostPerRecipeUnit
    : oldStock.mul(oldAvg).plus(quantityRecipeUnit.mul(unitCostPerRecipeUnit)).div(newStock);

  const occurredAt = new Date();

  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        category: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
        amount: totalCostUzs,
        reason: `Boshlang'ich xarid: ${spec.name}`,
        note: 'Seed orqali yaratilgan',
        occurredAt,
        createdBy: { connect: { id: OWNER_ID } },
      },
    });

    const purchase = await tx.purchase.create({
      data: {
        ingredient: { connect: { id: spec.id } },
        quantityBuyUnit,
        quantityRecipeUnit,
        totalCostUzs,
        unitCostPerRecipeUnit,
        supplierNote: 'Seed orqali yaratilgan',
        recordedBy: { connect: { id: OWNER_ID } },
        occurredAt,
        expense: { connect: { id: expense.id } },
      },
    });

    await tx.ingredient.update({
      where: { id: spec.id },
      data: {
        currentStock: newStock,
        weightedAvgCost: newAvg,
      },
    });

    await tx.ingredientMovement.create({
      data: {
        ingredient: { connect: { id: spec.id } },
        type: IngredientMovementType.PURCHASE,
        quantity: quantityRecipeUnit,
        unitCostSnapshot: unitCostPerRecipeUnit,
        resultingStock: newStock,
        resultingAvgCost: newAvg,
        purchase: { connect: { id: purchase.id } },
        actor: { connect: { id: OWNER_ID } },
        occurredAt,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: OWNER_ID,
        action: 'PURCHASE_RECORDED',
        entityType: 'Purchase',
        entityId: purchase.id,
        metadata: {
          source: 'seed-ingredients-recipes',
          ingredientId: spec.id,
          ingredientName: spec.name,
          quantityBuyUnit: quantityBuyUnit.toFixed(3),
          totalCostUzs: totalCostUzs.toFixed(0),
        },
      },
    });
  });

  ok(`${spec.name}: ${quantityBuyUnit.toFixed(0)} ${spec.buyUnit} (${totalCostUzs.toFixed(0)} so'm) → stock ${newStock.toFixed(0)} ${spec.recipeUnit}`);
}

async function upsertRecipe(spec: RecipeSpec) {
  // Recipe ID = menuItemId (1:1 via @unique menuItemId).
  const recipe = await prisma.recipe.upsert({
    where: { menuItemId: spec.menuItemId },
    create: {
      menuItem: { connect: { id: spec.menuItemId } },
      isComplete: true,
    },
    update: {
      isComplete: true,
    },
  });

  // Replace all ingredient links.
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipeIngredient.createMany({
    data: spec.ingredients.map((ri) => ({
      recipeId: recipe.id,
      ingredientId: ri.ingredientId,
      quantity: new Prisma.Decimal(ri.quantity),
    })),
  });
}

async function main() {
  step('Tekshiruvlar');
  await ensureOwnerExists();
  ok('Owner mavjud');
  await ensureIngredientCategoryExists();
  ok('Ingredient kategoriya mavjud');
  await ensureMenuItemsExist();
  ok('Menyu mahsulotlari mavjud');

  step('Ingredientlar (idempotent upsert)');
  for (const block of SPECS) {
    for (const ing of block.ingredients) {
      await upsertIngredient(ing);
    }
  }
  ok('Barcha ingredientlar tayyor');

  step("Boshlang'ich xaridlar (faqat bo'sh ingredientlarga)");
  for (const block of SPECS) {
    for (const ing of block.ingredients) {
      await seedInitialPurchase(ing);
    }
  }

  step('Retseptlar (qayta yoziladi)');
  for (const block of SPECS) {
    await upsertRecipe(block.recipe);
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: block.recipe.menuItemId },
      select: { name: true },
    });
    ok(`${menuItem?.name ?? block.recipe.menuItemId}: ${block.recipe.ingredients.length} ta ingredient`);
  }

  step('Yakuniy holat');
  const stats = await prisma.ingredient.aggregate({
    _count: { _all: true },
  });
  const recipesCount = await prisma.recipe.count();
  const purchasesCount = await prisma.purchase.count();
  console.log(`  Ingredientlar:  ${stats._count._all}`);
  console.log(`  Retseptlar:     ${recipesCount}`);
  console.log(`  Xaridlar:       ${purchasesCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\n✅ Tayyor');
  })
  .catch(async (error: unknown) => {
    console.error('\n❌ Xatolik:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
