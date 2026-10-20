/*
 * claude-shim.js — pengganti lokal untuk runtime artifact Claude.
 *
 * Di claude.ai, halaman ini memakai `window.claude.use('db' | 'user' | 'downloads')`
 * yang disediakan Claude. File ini meniru API yang sama supaya app.js bisa jalan
 * di laptop / hosting biasa tanpa perubahan:
 *
 *   - db      → data disimpan di localStorage browser, diisi awal dari seed.json
 *   - user    → satu pengguna lokal dengan akses tulis
 *   - downloads → unduhan file biasa lewat browser
 *
 * INI BUKAN DATABASE PRODUKSI. Data hanya ada di satu browser. Untuk dipakai tim,
 * ganti implementasi `db` di bawah dengan panggilan ke API/backend sungguhan
 * (lihat CLAUDE.md, bagian "Mengganti shim dengan backend").
 *
 * Kalau halaman dibuka di dalam Claude (window.claude sudah ada), shim tidak aktif.
 *
 * Tambahkan ?reset=1 di URL untuk membuang data lokal dan memuat ulang seed.json.
 */
(function () {
  if (window.claude && window.claude.use) return;

  const KEY = 'yantos-local-db-v1';
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const err = (code, message) => Object.assign(new Error(message), { code });

  // Merge seperti `update` di runtime Claude: objek digabung rekursif,
  // array dan nilai lain ditimpa, {__delete__: true} menghapus field.
  function merge(target, patch) {
    const out = isObj(target) ? { ...target } : {};
    for (const [k, v] of Object.entries(patch)) {
      if (isObj(v) && v.__delete__ === true) delete out[k];
      else if (isObj(v)) out[k] = merge(out[k], v);
      else out[k] = clone(v);
    }
    return out;
  }

  let store = null;            // { collection: { docId: data } }
  const listeners = new Set(); // { kind: 'coll'|'doc', coll, id, cb }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage penuh / diblokir: tetap jalan di memori */ }
  }

  async function load() {
    if (store) return store;
    const reset = new URLSearchParams(location.search).has('reset');
    if (!reset) {
      try { const raw = localStorage.getItem(KEY); if (raw) { store = JSON.parse(raw); return store; } } catch (e) {}
    }
    try {
      const res = await fetch('seed.json', { cache: 'no-store' });
      store = res.ok ? await res.json() : {};
    } catch (e) {
      console.warn('[claude-shim] seed.json tidak bisa dimuat. Buka lewat server lokal (lihat README), bukan file://.', e);
      store = {};
    }
    persist();
    if (reset) history.replaceState(null, '', location.pathname);
    return store;
  }

  const split = path => {
    const parts = String(path).split('/');
    if (parts.length !== 2) throw err('invalid_argument', 'Path dokumen harus "koleksi/id": ' + path);
    return parts;
  };
  const docSnap = (coll, id) => {
    const d = store[coll] && store[coll][id];
    return { id, exists: d !== undefined, data: () => clone(d) };
  };
  const collSnap = coll => {
    const c = store[coll] || {};
    return { docs: Object.keys(c).sort().map(id => ({ id, exists: true, data: () => clone(c[id]) })) };
  };

  function notify(coll, id) {
    for (const l of listeners) {
      if (l.coll !== coll) continue;
      if (l.kind === 'coll') l.cb(collSnap(coll));
      else if (l.id === id) l.cb(docSnap(coll, id));
    }
  }

  function write(coll, id, fn) {
    store[coll] = store[coll] || {};
    const next = fn(store[coll][id]);
    if (next === undefined) delete store[coll][id];
    else store[coll][id] = next;
    persist();
    setTimeout(() => notify(coll, id), 0);
  }

  const db = {
    collection(coll) {
      return {
        onSnapshot(cb, onError) {
          const l = { kind: 'coll', coll, cb };
          listeners.add(l);
          load().then(() => cb(collSnap(coll))).catch(e => onError && onError(e));
          return () => listeners.delete(l);
        },
        async get() { await load(); return collSnap(coll); },
      };
    },
    doc(path) {
      const [coll, id] = split(path);
      return {
        id,
        onSnapshot(cb, onError) {
          const l = { kind: 'doc', coll, id, cb };
          listeners.add(l);
          load().then(() => cb(docSnap(coll, id))).catch(e => onError && onError(e));
          return () => listeners.delete(l);
        },
        async get() { await load(); return docSnap(coll, id); },
        async set(data) { await load(); write(coll, id, () => clone(data)); },
        async update(patch) {
          await load();
          if (!(store[coll] && store[coll][id] !== undefined)) throw err('not_found', 'Dokumen belum ada: ' + path);
          write(coll, id, cur => merge(cur, patch));
        },
        async delete() { await load(); write(coll, id, () => undefined); },
        async acquire() { return { acquired: true }; }, // satu pengguna lokal: kunci selalu didapat
      };
    },
  };

  const LOCAL_ID = 'local-user';
  const user = {
    async id() { return LOCAL_ID; },
    async can() { return true; },
    async profiles(ids) {
      const out = {};
      for (const id of ids || []) if (id === LOCAL_ID) out[id] = { name: 'Lokal' };
      return out;
    },
  };

  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  const services = { db, user, downloads };
  window.claude = {
    __localShim: true,
    async use(name) {
      if (!services[name]) throw err('unavailable', 'Layanan tidak tersedia di mode lokal: ' + name);
      if (name === 'db') await load();
      return services[name];
    },
  };
})();
