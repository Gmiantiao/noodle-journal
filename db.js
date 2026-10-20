// Minimal IndexedDB wrapper — one store, no dependencies.
const DB_NAME = 'noodle-journal';
const DB_VERSION = 1;
const STORE = 'records';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function allRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function saveRecord(record) {
  return tx('readwrite', store => store.put(record));
}

export function deleteRecord(id) {
  return tx('readwrite', store => store.delete(id));
}

export function clearRecords() {
  return tx('readwrite', store => store.clear());
}

export async function importRecords(records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    let added = 0;
    records.forEach(r => {
      const getReq = store.get(r.id);
      getReq.onsuccess = () => {
        if (!getReq.result) { store.put(r); added++; }
      };
    });
    t.oncomplete = () => resolve(added);
    t.onerror = () => reject(t.error);
  });
}
