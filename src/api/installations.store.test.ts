import { type Store } from '@agentage/extension';
import { describe, expect, it } from 'vitest';
import { createInstallationsStore } from './installations.store.js';

const failing = (err: unknown) => ({ query: () => Promise.reject(err) }) as unknown as Store;
const doc = { target: 'm_1a2b3c4d', deployments: [], routes: {} };

describe('installations store put', () => {
  it('a forget racing the write (23503) writes nothing, any other error throws', async () => {
    const raced = createInstallationsStore(failing({ code: '23503' }));
    expect(await raced.put('usr_a', doc.target, doc, { kind: 'any' })).toBeNull();
    const broken = createInstallationsStore(failing(new Error('boom')));
    await expect(broken.put('usr_a', doc.target, doc, { kind: 'any' })).rejects.toThrow('boom');
  });
});
