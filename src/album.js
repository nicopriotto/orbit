// The visitor's own pile of instant photos. They stay in this browser only (IndexedDB), never on a server, and the
// oldest falls off once there are more than KEEP.
const KEEP = 12;
const STORE = 'prints';

let opening;
function open() {
  opening ??= new Promise((done, fail) => {
    const request = indexedDB.open('orbit-album', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => done(request.result);
    request.onerror = () => fail(request.error);
  });
  return opening;
}

async function run(mode, work) {
  const db = await open();
  return new Promise((done, fail) => {
    const transaction = db.transaction(STORE, mode);
    const result = work(transaction.objectStore(STORE));
    transaction.oncomplete = () => done(result?.result);
    transaction.onerror = () => fail(transaction.error);
  });
}

/** Newest first. A browser that refuses storage (private windows, some in-app browsers) just starts with no photos. */
export async function loadPrints() {
  try {
    const all = await run('readonly', (store) => store.getAll());
    return all.sort((a, b) => b.at - a.at).slice(0, KEEP);
  } catch {
    return [];
  }
}

/** Saves or replaces one print, then trims the pile. Returns the ids that fell off. */
export async function keepPrint(print, all) {
  const gone = all.slice(KEEP).map((entry) => entry.id);
  try {
    await run('readwrite', (store) => {
      store.put(print);
      gone.forEach((id) => store.delete(id));
    });
  } catch {
    // Without storage the pile still works for this visit.
  }
  return gone;
}

export async function dropPrint(id) {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // Nothing was stored to begin with.
  }
}

export { KEEP };
