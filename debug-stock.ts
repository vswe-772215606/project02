import { stockService } from './apps/master/src/main/server/services/stock.service';
import { getPrisma, disconnectPrisma } from './apps/master/src/main/server/lib/prisma';

async function test() {
  const prisma = getPrisma();
  const ownerId = 'seed-owner';
  const itemId = 'seed-item-mol-kabob';

  console.log('Testing Stock Service as OWNER...');

  try {
    // 1. Check list
    const items = await stockService.listToday();
    const kebab = items.find(i => i.menuItemId === itemId);
    console.log('Initial state:', kebab);

    // 2. Set initial (if missing or forced)
    console.log('Setting initial to 50...');
    await stockService.setInitialForToday([{ menuItemId: itemId, count: 50 }], ownerId, true);
    
    // 3. Add batch
    console.log('Adding batch +10...');
    await stockService.addBatch(itemId, 10, ownerId);
    
    const afterAdd = (await stockService.listToday()).find(i => i.menuItemId === itemId);
    console.log('After add +10:', afterAdd);
    
    if (afterAdd?.initialCount !== 60 || afterAdd?.currentCount !== 60) {
      throw new Error('Add batch math failed');
    }

    // 4. Remove batch
    console.log('Removing batch -5...');
    await stockService.removeBatch(itemId, 5, ownerId);
    
    const afterRemove = (await stockService.listToday()).find(i => i.menuItemId === itemId);
    console.log('After remove -5:', afterRemove);

    if (afterRemove?.initialCount !== 60 || afterRemove?.currentCount !== 55) {
      throw new Error('Remove batch math failed');
    }

    console.log('✅ ALL STOCK FUNCTIONS WORKING ON BACKEND');
  } catch (err) {
    console.error('❌ STOCK FUNCTION FAILED:', err);
  } finally {
    await disconnectPrisma();
  }
}

test();
