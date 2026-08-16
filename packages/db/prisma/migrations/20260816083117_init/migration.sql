-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'WAITER');

-- CreateEnum
CREATE TYPE "TableType" AS ENUM ('ROOM', 'TABLE');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'DEBT');

-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('BILL', 'BILL_REPRINT');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'REVERSED', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ExpenseRepayStatus" AS ENUM ('PENDING', 'PARTIAL', 'RETURNED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "MenuItemKind" AS ENUM ('FOOD', 'SERVICE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_CREATED', 'USER_DEACTIVATED', 'DISCOUNT_CREATED', 'DISCOUNT_EDITED', 'DISCOUNT_DELETED', 'DISCOUNT_APPLIED', 'ORDER_CONFIRMED', 'ORDER_CANCELED', 'WALKOUT_MARKED', 'TABLE_TRANSFERRED', 'RECEIPT_REPRINTED', 'SETTINGS_CHANGED', 'SERVICE_CHARGE_WAIVED', 'EXPENSE_CREATED', 'EXPENSE_REVERSED', 'EXPENSE_RETURN_RECEIVED', 'EXPENSE_WRITTEN_OFF', 'DEBT_CREATED', 'DEBT_PAYMENT_RECORDED', 'DEBT_CLOSED', 'DEBT_WRITTEN_OFF', 'REPORT_SENT', 'REPORT_SEND_FAILED', 'INGREDIENT_CREATED', 'INGREDIENT_UPDATED', 'INGREDIENT_ACTIVATED', 'INGREDIENT_DEACTIVATED', 'INGREDIENT_DELETED', 'INGREDIENT_COST_ADJUSTED', 'PURCHASE_RECORDED', 'PURCHASE_UPDATED', 'PURCHASE_REVERSED', 'PURCHASE_DELETED', 'RECIPE_CREATED', 'RECIPE_UPDATED', 'RECIPE_ACTIVATED', 'RECIPE_DEACTIVATED', 'RECIPE_DELETED', 'STOCKTAKE_OPENED', 'STOCKTAKE_COMPLETED', 'STOCKTAKE_VARIANCE_CATEGORIZED', 'WASTE_RECORDED', 'STOCK_RESTOCKED', 'STOCK_COUNT_SET', 'ITEM_COST_CHANGED');

-- CreateEnum
CREATE TYPE "IngredientMovementType" AS ENUM ('PURCHASE', 'CONSUME', 'RESTORE', 'STOCKTAKE', 'ADJUST', 'WASTE', 'COST_ADJUST');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('OPEN', 'AWAITING_REASONS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'REVERSED', 'DELETED');

-- CreateEnum
CREATE TYPE "StockEntryKind" AS ENUM ('RESTOCK', 'COUNT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "kind" "MenuItemKind" NOT NULL DEFAULT 'FOOD',
    "unitCostSnapshot" DECIMAL(14,2),
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "stockCount" INTEGER,
    "costPrice" DECIMAL(14,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboComponent" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TableType" NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "tableId" TEXT,
    "waiterId" TEXT NOT NULL,
    "subtotalSnapshot" DECIMAL(14,2),
    "discountAmountSnapshot" DECIMAL(14,2),
    "serviceChargeSnapshot" DECIMAL(14,2),
    "serviceChargeWaived" BOOLEAN NOT NULL DEFAULT false,
    "totalSnapshot" DECIMAL(14,2),
    "appliedDiscountId" TEXT,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "comboGroupId" TEXT,
    "comboNameSnapshot" TEXT,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "cogsSnapshot" DECIMAL(14,2),
    "consumptionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversedExpenseId" TEXT,
    "purchaseId" TEXT,
    "repayable" BOOLEAN NOT NULL DEFAULT false,
    "writtenOffAt" TIMESTAMP(3),
    "writtenOffReason" TEXT,
    "writtenOffById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReturn" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "debtorName" TEXT NOT NULL,
    "debtorPhone" TEXT,
    "note" TEXT,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "remainingAmount" DECIMAL(14,2) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "writtenOffAt" TIMESTAMP(3),
    "writtenOffById" TEXT,
    "writtenOffReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtRepayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "parentMenuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buyUnit" TEXT NOT NULL,
    "recipeUnit" TEXT NOT NULL,
    "conversionFactor" DECIMAL(65,30) NOT NULL,
    "currentStock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "weightedAvgCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceThreshold" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSelfMenuItem" BOOLEAN NOT NULL DEFAULT false,
    "selfMenuItemId" TEXT,
    "expenseCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "notes" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeEdit" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "beforeJson" JSONB NOT NULL,
    "afterJson" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityBuyUnit" DECIMAL(65,30) NOT NULL,
    "quantityRecipeUnit" DECIMAL(65,30) NOT NULL,
    "remainingQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCostUzs" DECIMAL(65,30) NOT NULL,
    "unitCostPerRecipeUnit" DECIMAL(65,30) NOT NULL,
    "supplierNote" TEXT,
    "recordedById" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalNote" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionNote" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineBatchConsumption" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLineBatchConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteEvent" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WasteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeEntry" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DECIMAL(65,30) NOT NULL,
    "countedQty" DECIMAL(65,30) NOT NULL,
    "variance" DECIMAL(65,30) NOT NULL,
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "valuedAtCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StocktakeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientMovement" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "IngredientMovementType" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCostSnapshot" DECIMAL(65,30),
    "resultingStock" DECIMAL(65,30) NOT NULL,
    "resultingAvgCost" DECIMAL(65,30) NOT NULL,
    "purchaseId" TEXT,
    "orderLineId" TEXT,
    "stocktakeEntryId" TEXT,
    "wasteEventId" TEXT,
    "reasonCode" TEXT,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "type" "PrintJobType" NOT NULL,
    "printerName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "orderId" TEXT,
    "triggeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "kind" "StockEntryKind" NOT NULL,
    "qty" INTEGER NOT NULL,
    "countBefore" INTEGER,
    "countAfter" INTEGER NOT NULL,
    "paidUzs" DECIMAL(14,2),
    "unitCost" DECIMAL(14,2),
    "expenseId" TEXT,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");

-- CreateIndex
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");

-- CreateIndex
CREATE INDEX "MenuItem_isActive_idx" ON "MenuItem"("isActive");

-- CreateIndex
CREATE INDEX "MenuItem_kind_idx" ON "MenuItem"("kind");

-- CreateIndex
CREATE INDEX "Combo_isActive_idx" ON "Combo"("isActive");

-- CreateIndex
CREATE INDEX "ComboComponent_comboId_idx" ON "ComboComponent"("comboId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboComponent_comboId_menuItemId_key" ON "ComboComponent"("comboId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_name_key" ON "Table"("name");

-- CreateIndex
CREATE INDEX "Table_type_idx" ON "Table"("type");

-- CreateIndex
CREATE INDEX "Table_isActive_idx" ON "Table"("isActive");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");

-- CreateIndex
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_closedAt_idx" ON "Order"("closedAt");

-- CreateIndex
CREATE INDEX "Order_sentAt_idx" ON "Order"("sentAt");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_comboGroupId_idx" ON "OrderLine"("comboGroupId");

-- CreateIndex
CREATE INDEX "Discount_isActive_idx" ON "Discount"("isActive");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");

-- CreateIndex
CREATE INDEX "ExpenseCategory_displayOrder_idx" ON "ExpenseCategory"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_purchaseId_key" ON "Expense"("purchaseId");

-- CreateIndex
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- CreateIndex
CREATE INDEX "Expense_repayable_idx" ON "Expense"("repayable");

-- CreateIndex
CREATE INDEX "Expense_writtenOffAt_idx" ON "Expense"("writtenOffAt");

-- CreateIndex
CREATE INDEX "ExpenseReturn_expenseId_idx" ON "ExpenseReturn"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseReturn_receivedAt_idx" ON "ExpenseReturn"("receivedAt");

-- CreateIndex
CREATE INDEX "ExpenseReturn_receivedById_idx" ON "ExpenseReturn"("receivedById");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_orderId_key" ON "Debt"("orderId");

-- CreateIndex
CREATE INDEX "Debt_status_idx" ON "Debt"("status");

-- CreateIndex
CREATE INDEX "Debt_openedAt_idx" ON "Debt"("openedAt");

-- CreateIndex
CREATE INDEX "Debt_createdById_idx" ON "Debt"("createdById");

-- CreateIndex
CREATE INDEX "Debt_debtorName_idx" ON "Debt"("debtorName");

-- CreateIndex
CREATE INDEX "DebtRepayment_debtId_idx" ON "DebtRepayment"("debtId");

-- CreateIndex
CREATE INDEX "DebtRepayment_paidAt_idx" ON "DebtRepayment"("paidAt");

-- CreateIndex
CREATE INDEX "DebtRepayment_receivedById_idx" ON "DebtRepayment"("receivedById");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_selfMenuItemId_key" ON "Ingredient"("selfMenuItemId");

-- CreateIndex
CREATE INDEX "Ingredient_isActive_idx" ON "Ingredient"("isActive");

-- CreateIndex
CREATE INDEX "Ingredient_isSelfMenuItem_idx" ON "Ingredient"("isSelfMenuItem");

-- CreateIndex
CREATE INDEX "Ingredient_parentMenuItemId_idx" ON "Ingredient"("parentMenuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_parentMenuItemId_name_key" ON "Ingredient"("parentMenuItemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_menuItemId_key" ON "Recipe"("menuItemId");

-- CreateIndex
CREATE INDEX "Recipe_isComplete_idx" ON "Recipe"("isComplete");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "RecipeEdit_recipeId_occurredAt_idx" ON "RecipeEdit"("recipeId", "occurredAt");

-- CreateIndex
CREATE INDEX "RecipeEdit_editedById_idx" ON "RecipeEdit"("editedById");

-- CreateIndex
CREATE INDEX "Purchase_ingredientId_occurredAt_idx" ON "Purchase"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Purchase_occurredAt_idx" ON "Purchase"("occurredAt");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_ingredientId_status_occurredAt_idx" ON "Purchase"("ingredientId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "OrderLineBatchConsumption_orderLineId_idx" ON "OrderLineBatchConsumption"("orderLineId");

-- CreateIndex
CREATE INDEX "OrderLineBatchConsumption_purchaseId_idx" ON "OrderLineBatchConsumption"("purchaseId");

-- CreateIndex
CREATE INDEX "WasteEvent_ingredientId_occurredAt_idx" ON "WasteEvent"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "WasteEvent_occurredAt_idx" ON "WasteEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_date_key" ON "Stocktake"("date");

-- CreateIndex
CREATE INDEX "Stocktake_status_idx" ON "Stocktake"("status");

-- CreateIndex
CREATE INDEX "Stocktake_performedById_idx" ON "Stocktake"("performedById");

-- CreateIndex
CREATE INDEX "StocktakeEntry_ingredientId_idx" ON "StocktakeEntry"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeEntry_stocktakeId_ingredientId_key" ON "StocktakeEntry"("stocktakeId", "ingredientId");

-- CreateIndex
CREATE INDEX "IngredientMovement_ingredientId_occurredAt_idx" ON "IngredientMovement"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "IngredientMovement_type_idx" ON "IngredientMovement"("type");

-- CreateIndex
CREATE INDEX "IngredientMovement_occurredAt_idx" ON "IngredientMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "IngredientMovement_orderLineId_idx" ON "IngredientMovement"("orderLineId");

-- CreateIndex
CREATE INDEX "IngredientMovement_purchaseId_idx" ON "IngredientMovement"("purchaseId");

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

-- CreateIndex
CREATE INDEX "PrintJob_orderId_idx" ON "PrintJob"("orderId");

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_expenseId_key" ON "StockEntry"("expenseId");

-- CreateIndex
CREATE INDEX "StockEntry_menuItemId_occurredAt_idx" ON "StockEntry"("menuItemId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockEntry_occurredAt_idx" ON "StockEntry"("occurredAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_appliedDiscountId_fkey" FOREIGN KEY ("appliedDiscountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversedExpenseId_fkey" FOREIGN KEY ("reversedExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReturn" ADD CONSTRAINT "ExpenseReturn_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReturn" ADD CONSTRAINT "ExpenseReturn_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtRepayment" ADD CONSTRAINT "DebtRepayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtRepayment" ADD CONSTRAINT "DebtRepayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_parentMenuItemId_fkey" FOREIGN KEY ("parentMenuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_selfMenuItemId_fkey" FOREIGN KEY ("selfMenuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeEdit" ADD CONSTRAINT "RecipeEdit_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeEdit" ADD CONSTRAINT "RecipeEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineBatchConsumption" ADD CONSTRAINT "OrderLineBatchConsumption_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineBatchConsumption" ADD CONSTRAINT "OrderLineBatchConsumption_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEvent" ADD CONSTRAINT "WasteEvent_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEvent" ADD CONSTRAINT "WasteEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEntry" ADD CONSTRAINT "StocktakeEntry_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEntry" ADD CONSTRAINT "StocktakeEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_stocktakeEntryId_fkey" FOREIGN KEY ("stocktakeEntryId") REFERENCES "StocktakeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientMovement" ADD CONSTRAINT "IngredientMovement_wasteEventId_fkey" FOREIGN KEY ("wasteEventId") REFERENCES "WasteEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
