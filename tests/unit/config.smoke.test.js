const test = require('node:test');
const assert = require('node:assert/strict');

const { appConfig } = require('../../src/config/app');
const { createRoomStore } = require('../../src/room/repository/roomStore');

test('appConfig exposes expected baseline fields', () => {
  assert.ok(appConfig);
  assert.equal(typeof appConfig.port, 'number');
  assert.equal(typeof appConfig.host, 'string');
  assert.equal(typeof appConfig.startMode, 'string');
});

test('roomStore default room creation is idempotent', () => {
  const store = createRoomStore();
  const first = store.getOrCreateDefaultRoom(() => ({ id: 'ABCD', players: new Map() }));
  const second = store.getOrCreateDefaultRoom(() => ({ id: 'EFGH', players: new Map() }));

  assert.equal(first.room.id, 'ABCD');
  assert.equal(first.created, true);
  assert.equal(second.room.id, 'ABCD');
  assert.equal(second.created, false);
  assert.equal(store.getDefaultRoomId(), 'ABCD');
});
