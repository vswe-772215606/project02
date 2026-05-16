/**
 * Phase 0 stub. Real implementation lands in Phase 4 of the inventory refactor
 * (REFACTOR_PLAN.md §6). A waste event:
 *   - Records a WasteEvent with reason code + note
 *   - Writes IngredientMovement(WASTE) with negative quantity
 *   - Atomically decrements ingredient.currentStock
 *   - Surfaces in daily P&L as a "Yo'qotish" (waste) line, valued at
 *     weightedAvgCost × quantity
 */
export const wasteService = {
  async record(_input: {
    ingredientId: string;
    quantity: string | number;
    reasonCode: string;
    note?: string;
    occurredAt?: Date;
    actorUserId: string;
  }): Promise<never> {
    throw new Error('wasteService.record: implemented in Phase 4');
  },

  async list(_filters: { from?: Date; to?: Date; ingredientId?: string } = {}): Promise<never> {
    throw new Error('wasteService.list: implemented in Phase 4');
  },
};
