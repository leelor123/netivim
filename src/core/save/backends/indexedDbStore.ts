import type { AsyncStore } from '../stores';

const DB_NAME = 'netivim';
const STORE = 'saves';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** IndexedDB mirror. Opens lazily; if IndexedDB is unavailable every call rejects (and is reported). */
export function indexedDbStore(factory: IDBFactory): AsyncStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('IndexedDB open failed'));
      };
    });
    return dbPromise;
  };
  const tx = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => (await open()).transaction(STORE, mode).objectStore(STORE);

  return {
    name: 'indexeddb',
    async get(key) {
      const v = await request((await tx('readonly')).get(key));
      return typeof v === 'string' ? v : null;
    },
    async set(key, value) {
      await request((await tx('readwrite')).put(value, key));
    },
    async remove(key) {
      await request((await tx('readwrite')).delete(key));
    },
  };
}
