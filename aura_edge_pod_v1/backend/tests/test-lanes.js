import test from 'node:test';
import assert from 'node:assert/strict';
import { GroundingPlane } from '../lib/lanes/grounding.js';
import { MediaLane } from '../lib/lanes/media.js';

test('Intelligence lanes', async (t) => {
  await t.test('Ephemeral grounding returns fast context', async () => {
    const plane = new GroundingPlane(null, null);
    const res = await plane.resolveEphemeral('test', 'r1', []);
    assert.equal(res.tier, 'EPHEMERAL');
  });

  await t.test('Media resolution reports not implemented', async () => {
    const media = new MediaLane(null, null);
    const res = await media.resolveMedia('some highlight', 'r1');
    assert.equal(res.error, 'NOT_IMPLEMENTED');
  });
});
