// Local storage for Little One: IndexedDB on this device only.
// Stores: "entries" (one record per log entry, keyed by id) and "kv" (settings and sync state).
// Schema changes must be additive: never delete stores or clear data.

const DB_NAME = 'littleone';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('The app is open in another window. Close it and try again.'));
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Save was cancelled'));
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllEntries() {
  const db = await openDb();
  return result(db.transaction('entries').objectStore('entries').getAll());
}

export async function putEntries(list) {
  if (!list.length) return;
  const db = await openDb();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  for (const e of list) store.put(e);
  return done(tx);
}

export async function kvGet(key) {
  const db = await openDb();
  return result(db.transaction('kv').objectStore('kv').get(key));
}

export async function kvSet(key, value) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  return done(tx);
}

export async function kvDel(key) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').delete(key);
  return done(tx);
}
