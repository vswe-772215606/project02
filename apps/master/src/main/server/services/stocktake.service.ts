/**
 * Phase 0 stub. Real implementation lands in Phase 3 of the inventory refactor
 * (REFACTOR_PLAN.md §6). The stocktake service composes:
 *   - opening a Stocktake row for the local-date (via lib/time.localToday)
 *   - capturing per-ingredient expectedQty (current stock) vs countedQty
 *   - categorising variance with reason codes (waste|theft|recipe-error|...)
 *   - on complete: writing IngredientMovement(STOCKTAKE) + ADJUST rows, then
 *     snapping ingredient.currentStock to the counted reality
 *
 * Phase 0 leaves the surface so callers can import; bodies throw until Phase 3.
 */
export const stocktakeService = {
  async openForToday(_input: { actorUserId: string }): Promise<never> {
    throw new Error('stocktakeService.openForToday: implemented in Phase 3');
  },

  async recordCount(_input: {
    stocktakeId: string;
    ingredientId: string;
    countedQty: string | number;
    actorUserId: string;
  }): Promise<never> {
    throw new Error('stocktakeService.recordCount: implemented in Phase 3');
  },

  async categoriseVariance(_input: {
    entryId: string;
    reasonCode: string;
    reasonNote?: string;
    actorUserId: string;
  }): Promise<never> {
    throw new Error('stocktakeService.categoriseVariance: implemented in Phase 3');
  },

  async complete(_input: { stocktakeId: string; actorUserId: string }): Promise<never> {
    throw new Error('stocktakeService.complete: implemented in Phase 3');
  },
};
