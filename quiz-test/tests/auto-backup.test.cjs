const assert = require('node:assert/strict');
const { test } = require('node:test');
const { writeBackup } = require('../auto-backup.js');

const old = [1, 2, 3].map(n => `电子技术_自动备份_000${n}_2026-11-08.json`);
const other = "高数复习卡_自动备份_0999_2026-11-08.json";
const next = '电子技术_自动备份_0004_2026-11-09.json';
const payload = { state: { stats: { total: 5 } } };
const date = new Date(2026, 10, 9, 1);

function directory({ failWrite = false, failClean = false } = {}) {
  const entries = new Map([...old, other].map(name => [name, {kind:'file'}]));
  entries.set('电子技术_自动备份_0500_2026-11-09.json', {kind:'directory'});
  return {
    entries,
    async *entriesForTest() { yield* entries; },
    async getFileHandle(name) {
      entries.set(name, {kind:'file'});
      return { async createWritable() {
        let pending;
        return {
          async write(data) { pending = data; },
          async close() {
            if (failWrite) throw new Error('disk full');
            entries.set(name, {kind:'file', data:pending});
          },
          async abort() {},
        };
      }};
    },
    async removeEntry(name) {
      if (failClean && name === old[0]) throw new Error('permission');
      entries.delete(name);
    },
  };
}
function setup(options) {
  const dir = directory(options);
  return { dir, files: dir.entries, handle: {...dir, entries: dir.entriesForTest} };
}

test('writes a restorable snapshot and keeps only the newest three managed files', async () => {
  const { files, handle } = setup();
  assert.deepEqual(await writeBackup(handle, payload, date), { name: next, cleanupFailed: false });
  assert.deepEqual(JSON.parse(files.get(next).data), payload);
  assert.deepEqual([...files].filter(([, entry]) => entry.kind === 'file').map(([name]) => name).sort(),
    [...old.slice(1), next, other].sort());
});

test('preserves all existing files when the new write fails to commit', async () => {
  const { files, handle } = setup({failWrite:true});
  await assert.rejects(writeBackup(handle, payload, date), /disk full/);
  assert.deepEqual([...files].filter(([, entry]) => entry.kind === 'file').map(([name]) => name), [...old, other]);
});

test('reports cleanup failure separately from saving the new backup', async () => {
  const { files, handle } = setup({failClean:true});
  assert.deepEqual(await writeBackup(handle, payload, date), { name: next, cleanupFailed: true });
  assert.ok(files.has(next) && files.has(old[0]));
});

test('skips a conflicting directory name without removing that directory', async () => {
  const { files, handle } = setup();
  files.set(next, {kind:'directory'});
  const result = await writeBackup(handle, payload, date);
  assert.match(result.name, /_0005_/);
  assert.equal(files.get(next).kind, 'directory');
});

test('treats an already removed old file as successful cleanup', async () => {
  const { files, handle } = setup();
  handle.removeEntry = async name => {
    files.delete(name);
    throw new DOMException('Already removed', 'NotFoundError');
  };
  assert.deepEqual(await writeBackup(handle, payload, date), { name: next, cleanupFailed: false });
});
