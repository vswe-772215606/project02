import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const settingRepo = {
  async findByKey(key: string, tx?: Tx) {
    return (tx ?? getPrisma()).setting.findUnique({ where: { key } });
  },

  async findAll(tx?: Tx) {
    return (tx ?? getPrisma()).setting.findMany({
      orderBy: { key: 'asc' },
    });
  },

  async upsert(key: string, value: string, tx?: Tx) {
    return (tx ?? getPrisma()).setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  },

  async upsertMany(entries: Array<{ key: string; value: string }>, tx?: Tx) {
    const client = tx ?? getPrisma();
    const results = [];

    for (const entry of entries) {
      results.push(await client.setting.upsert({
        where: { key: entry.key },
        create: entry,
        update: { value: entry.value },
      }));
    }

    return results;
  },
};
