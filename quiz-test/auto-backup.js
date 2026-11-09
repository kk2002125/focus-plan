(function (root) {
  'use strict';

  const folderName = '电子技术自动备份';
  const prefix = '电子技术_自动备份_';
  const pattern = /^电子技术_自动备份_(\d{4,})_\d{4}-\d{2}-\d{2}\.json$/;
  const lockName = 'focus-plan-quiz-test-auto-backup';

  async function writeBackup(folder, payload, now = new Date()) {
    const previous = [];
    const occupied = new Set();
    for await (const [name, handle] of folder.entries()) {
      occupied.add(name);
      const match = name.match(pattern);
      if (handle.kind === 'file' && match && Number.isSafeInteger(Number(match[1]))) {
        previous.push({ name, sequence: Number(match[1]) });
      }
    }
    previous.sort((a, b) => b.sequence - a.sequence || b.name.localeCompare(a.name));
    const pad = value => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let sequence = previous[0]?.sequence ?? 0;
    let name;
    do {
      sequence++;
      if (!Number.isSafeInteger(sequence)) throw new Error('备份编号超出范围');
      name = `${prefix}${String(sequence).padStart(4, '0')}_${date}.json`;
    } while (occupied.has(name));

    const data = JSON.stringify(payload);
    const file = await folder.getFileHandle(name, { create: true });
    let writer;
    try {
      writer = await file.createWritable();
      await writer.write(data);
      await writer.close();
    } catch (error) {
      if (writer) await writer.abort().catch(() => {});
      await folder.removeEntry(name).catch(() => {});
      throw error;
    }

    let cleanupFailed = false;
    for (const entry of previous.slice(2)) {
      try {
        await folder.removeEntry(entry.name);
      } catch (error) {
        if (error.name !== 'NotFoundError') cleanupFailed = true;
      }
    }
    return { name, cleanupFailed };
  }

  function start(getBackup) {
    const supported = typeof root.showDirectoryPicker === 'function' && root.navigator.locks && root.indexedDB;
    const permission = { mode: 'readwrite' };
    let dbPromise, settings, status, timer, busy = false;

    function accessSettings(value) {
      dbPromise ??= new Promise((resolve, reject) => {
        const request = root.indexedDB.open(lockName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('settings');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const write = value !== undefined;
      return dbPromise.then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', write ? 'readwrite' : 'readonly');
        const store = transaction.objectStore('settings');
        const request = write ? store.put(value, 'backup') : store.get('backup');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
      }));
    }

    function render() {
      const note = document.getElementById('auto-backup-status');
      if (!note) return;
      const choose = document.getElementById('auto-backup-choose');
      const backup = document.getElementById('auto-backup-now');
      const stop = document.getElementById('auto-backup-stop');
      choose.hidden = !supported;
      choose.disabled = busy;
      choose.textContent = settings ? '更换保存目录' : '选择保存目录';
      backup.hidden = stop.hidden = !settings;
      backup.disabled = stop.disabled = busy;
      const last = settings?.lastBackupAt
        ? ` 上次成功备份 ${new Date(settings.lastBackupAt).toLocaleString('zh-CN')}。`
        : '';
      note.textContent = !supported ? '当前浏览器支持手动导出。请用电脑版 Chrome 或 Edge 设置目录自动备份。'
        : status || (settings ? `已启用，保存到「${settings.parentName} / ${folderName}」。${last}`
          : '尚未启用。选择目录后，有进度变化时自动保存。');
      if (status && settings) note.textContent += last;
    }

    async function save(force = false, directory) {
      await root.navigator.locks.request(lockName, async () => {
        settings = await accessSettings();
        if (!settings) {
          status = '';
          return;
        }
        if (directory && !(await settings.folder.isSameEntry(directory))) {
          status = '';
          return;
        }
        if (await settings.folder.queryPermission(permission) !== 'granted') {
          status = '需要重新授权。点击「立即备份」继续。';
          return;
        }
        const now = new Date();
        const payload = getBackup(now);
        if (!force && settings.lastBackupAt && settings.lastStateSavedAt === payload.state.lastSavedAt) return;
        const result = await writeBackup(settings.folder, payload, now);
        settings = { ...settings, lastBackupAt: now.getTime(), lastStateSavedAt: payload.state.lastSavedAt };
        await accessSettings(settings);
        status = result.cleanupFailed ? '新备份已保存，旧文件暂时无法清理，下次备份将重试。' : '';
      });
    }

    async function automatic() {
      clearTimeout(timer);
      timer = undefined;
      try {
        await save();
      } catch {
        status = '自动备份失败。请检查目录权限或可用空间后重试。';
      }
      render();
    }

    async function action(work) {
      busy = true;
      render();
      try {
        await work();
      } catch (error) {
        if (error.name !== 'AbortError') status = '备份操作失败。请检查目录权限或可用空间后重试。';
      } finally {
        busy = false;
        render();
      }
    }

    if (supported) {
      root.addEventListener('electronics-quiz-state-saved', () => {
        timer ??= setTimeout(automatic, 3000);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && timer !== undefined) void automatic();
      });
      root.addEventListener('focus', () => { void automatic(); });
      void automatic();
    }

    return {
      render,
      choose: () => action(async () => {
        const parent = await root.showDirectoryPicker({ ...permission, id: 'electronics-backup' });
        const folder = await parent.getDirectoryHandle(folderName, { create: true });
        await root.navigator.locks.request(lockName, async () => {
          const current = await accessSettings();
          settings = current && await current.folder.isSameEntry(folder)
            ? current : { folder, parentName: parent.name };
          await accessSettings(settings);
          status = '';
        });
        await save(true, folder);
      }),
      now: () => action(async () => {
        const folder = settings?.folder;
        if (!folder) return;
        if (await folder.requestPermission(permission) === 'granted') await save(true, folder);
        else status = '目录未授权。允许写入后即可继续备份。';
      }),
      stop: () => action(() => root.navigator.locks.request(lockName, async () => {
        await accessSettings(null);
        settings = null;
        status = '已关闭自动备份，已有文件已保留。';
      })),
    };
  }

  if (typeof module === 'object' && module.exports) module.exports = { writeBackup };
  else root.ElectronicsBackup = { start };
})(globalThis);
