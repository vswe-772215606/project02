import { getPrisma } from '../src/main/server/lib/prisma';
import { seedLikeProd } from './seed-like-prod';

seedLikeProd(getPrisma())
  .then(() => getPrisma().$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
