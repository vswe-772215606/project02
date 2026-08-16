import PQueue from 'p-queue';

const QueueCtor = (PQueue as unknown as { default?: typeof PQueue }).default ?? PQueue;

export const printQueue = new QueueCtor({ concurrency: 1 });
