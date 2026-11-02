// Encryption and syncing for Little One.
//
// Privacy model
// - Every phone derives a 256-bit key from the family passphrase (PBKDF2-SHA-256, 600,000 rounds,
//   random salt stored in meta.json). The passphrase itself is never stored or sent anywhere.
// - Everything that leaves the phone is encrypted with AES-GCM first. GitHub only ever receives
//   ciphertext plus the salt needed to derive the key.
// - Each phone writes only its own file (devices/<deviceId>.json): a full encrypted copy of the log.
//   Phones read each other's files and merge entry by entry; the most recently changed version wins.
// - The only network destination is https://api.github.com, using a key limited to the private
//   storage repository chosen during setup.

const te = new TextEncoder();
const td = new TextDecoder();
export const KDF_ITERATIONS = 600000;
const API = 'https://api.github.com';

// ---------- encoding ----------
export function toB64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(String(str).replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function b64url(str) { return toB64(te.encode(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return td.decode(fromB64(s));
}

// ---------- crypto ----------
export async function deriveKeyBytes(passphrase, saltBytes, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', te.encode(String(passphrase).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, base, 256);
  return new Uint8Array(bits);
}
export function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function gzip(bytes, compress) {
  const stream = new Blob([bytes]).stream().pipeThrough(compress ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function encryptJSON(key, obj) {
  let data = te.encode(JSON.stringify(obj));
  let z = 0;
  if (typeof CompressionStream === 'function') { data = await gzip(data, true); z = 1; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { v: 1, z, iv: toB64(iv), ct: toB64(ct) };
}
export async function decryptJSON(key, box) {
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct)));
  if (box.z && typeof DecompressionStream !== 'function') throw new SyncError('old', 'This phone needs a newer version of iOS or its browser to read the synced data.');
  const data = box.z ? await gzip(pt, false) : pt;
  return JSON.parse(td.decode(data));
}
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomId(bytes = 9) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- errors ----------
export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- GitHub storage ----------
export function normaliseRepo(input) {
  let s = String(input || '').trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = s.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export class GitHubStore {
  constructor(repo, token) { this.repo = repo; this.token = String(token || '').trim(); }

  async req(method, path, body) {
    const url = `${API}/repos/${this.repo}${path ? '/' + path : ''}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new SyncError('offline', "Can't reach GitHub right now. Changes are saved on this phone and will sync when you're back online.");
    }
    if (res.status === 404) return null;
    if (res.ok) return res.status === 204 ? {} : res.json();
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
    if (res.status === 401) throw new SyncError('auth', 'GitHub refused the key. It may be incomplete, expired or deleted. Paste it again, or make a new one.');
    if (res.status === 403 && /rate limit/i.test(msg)) throw new SyncError('rate', 'GitHub asked the app to slow down. It will try again in a few minutes.');
    if (res.status === 403) throw new SyncError('perm', 'The GitHub key can read the storage but can\'t save to it. Give the key "Contents: Read and write" permission.');
    if (res.status === 409 || res.status === 422) throw new SyncError('conflict', msg || 'Out of date');
    throw new SyncError('http', `GitHub returned an error (${res.status}${msg ? ': ' + msg : ''}). The app will try again.`);
  }

  repoInfo() { return this.req('GET', ''); }

  async listDir(dir) {
    const out = await this.req('GET', `contents/${dir}`);
    return Array.isArray(out) ? out.filter((f) => f.type === 'file') : [];
  }

  async getFileMeta(path) {
    const out = await this.req('GET', `contents/${path}`);
    return out && !Array.isArray(out) ? out : null;
  }

  async getBlobText(sha) {
    const out = await this.req('GET', `git/blobs/${sha}`);
    if (!out) throw new SyncError('http', 'A synced file went missing while reading it. The app will try again.');
    return td.decode(fromB64(out.content || ''));
  }

  async readJSON(path) {
    const meta = await this.getFileMeta(path);
    if (!meta) return null;
    const text = meta.content && meta.encoding === 'base64' ? td.decode(fromB64(meta.content)) : await this.getBlobText(meta.sha);
    return { sha: meta.sha, json: JSON.parse(text) };
  }

  async writeJSON(path, obj, sha, message) {
    const body = { message: message || 'Update', content: toB64(te.encode(JSON.stringify(obj))) };
    if (sha) body.sha = sha;
    const out = await this.req('PUT', `contents/${path}`, body);
    return out && out.content ? out.content.sha : null;
  }
}

// ---------- family setup ----------
async function checkRepo(gh) {
  const info = await gh.repoInfo();
  if (!info) throw new SyncError('notfound', `Can't find "${gh.repo}" with this key. Check the name, and that the key was given access to that repository.`);
  if (info.private === false) throw new SyncError('public', `"${gh.repo}" is public. Make it private on GitHub (Settings → General → Danger Zone → Change visibility), then try again.`);
  return info;
}

export async function createFamily(repo, token, passphrase) {
  const gh = new GitHubStore(repo, token);
  await checkRepo(gh);
  const existing = await gh.readJSON('meta.json');
  if (existing) throw new SyncError('exists', 'This storage already holds a Little One log. Choose "Join my partner\'s log" instead, using the same family passphrase.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const raw = await deriveKeyBytes(passphrase, salt);
  const key = await importAesKey(raw);
  const check = await encryptJSON(key, { app: 'littleone', ok: true });
  await gh.writeJSON('meta.json', { app: 'littleone', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toB64(salt) }, check }, null, 'Set up Little One storage');
  return raw;
}

export async function joinFamily(repo, token, passphrase) {
  const gh = new GitHubStore(repo, token);
  await checkRepo(gh);
  const meta = await gh.readJSON('meta.json');
  if (!meta || !meta.json || meta.json.app !== 'littleone') throw new SyncError('nometa', 'No Little One log was found in this storage yet. Start the log on the first phone, then join from this one.');
  const { salt, iterations } = meta.json.kdf;
  const raw = await deriveKeyBytes(passphrase, fromB64(salt), iterations);
  const key = await importAesKey(raw);
  try {
    const ok = await decryptJSON(key, meta.json.check);
    if (!ok || ok.app !== 'littleone') throw new Error('bad');
  } catch (e) {
    throw new SyncError('badpass', "That passphrase doesn't match the one used to set up this log. Check it with your partner and try again.");
  }
  return raw;
}

// ---------- invite codes ----------
export function makeInvite(repo, token) {
  return 'LO1-' + b64url(JSON.stringify({ r: repo, t: token }));
}
export function readInvite(code) {
  const s = String(code || '').replace(/\s+/g, '').replace(/^LO1-/, '');
  try {
    const o = JSON.parse(unb64url(s));
    const repo = normaliseRepo(o.r);
    if (repo && o.t) return { repo, token: o.t };
  } catch (e) { /* fall through */ }
  return null;
}

// ---------- sync engine ----------
// hooks:
//   getState() / setState(state): persisted sync bookkeeping { shas, mySha, lastHash, lastSyncAt }
//   merge(payloads): apply remote payloads locally, returns number of changes
//   snapshot(): { profile, entries, name } for this phone
export async function syncOnce(cfg, hooks) {
  const gh = new GitHubStore(cfg.repo, cfg.token);
  const key = await importAesKey(cfg.keyRaw);
  const state = Object.assign({ shas: {}, mySha: null, lastHash: '' }, (await hooks.getState()) || {});
  const myFile = `${cfg.deviceId}.json`;

  // 1. Pull partner files that changed since last time.
  const files = await gh.listDir('devices');
  const newShas = {};
  const payloads = [];
  let mySha = null;
  for (const f of files) {
    if (!/^[a-f0-9]+\.json$/.test(f.name)) continue;
    if (f.name === myFile) { mySha = f.sha; continue; }
    newShas[f.name] = f.sha;
    if (state.shas[f.name] === f.sha) continue;
    const box = JSON.parse(await gh.getBlobText(f.sha));
    let data;
    try { data = await decryptJSON(key, box); } catch (e) {
      if (e instanceof SyncError) throw e;
      throw new SyncError('badkey', "Another phone's data couldn't be unlocked with this phone's passphrase. Turn sync off and join again with the right passphrase.");
    }
    payloads.push(data);
  }
  const pulled = payloads.length ? await hooks.merge(payloads) : 0;

  // 2. Push this phone's full copy if it changed (or if the remote copy is missing).
  const snap = await hooks.snapshot();
  const entries = snap.entries.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const hash = await sha256Hex(JSON.stringify({ n: snap.name, p: snap.profile, e: entries }));
  let pushed = false;
  if (hash !== state.lastHash || !mySha) {
    const payload = { app: 'littleone', v: 1, dev: cfg.deviceId, name: snap.name, at: Date.now(), profile: snap.profile, entries };
    const box = await encryptJSON(key, payload);
    try {
      mySha = await gh.writeJSON(`devices/${myFile}`, box, mySha, 'Sync');
    } catch (e) {
      if (e.code !== 'conflict') throw e;
      const fresh = await gh.getFileMeta(`devices/${myFile}`);
      mySha = await gh.writeJSON(`devices/${myFile}`, box, fresh ? fresh.sha : null, 'Sync');
    }
    pushed = true;
  }

  await hooks.setState({ shas: newShas, mySha, lastHash: hash, lastSyncAt: Date.now() });
  return { pulled, pushed, devices: files.length };
}

// ---------- family helpers ----------
// Grandparents and other family can add entries without seeing the parents' log.
// - Their entries go to a separate private repository (the "family storage"), reached with a key that the
//   parents create for that repository only. That key never reaches the parents' main storage.
// - Each helper has their own random 256-bit key, made on a parent's phone and carried in their invite
//   code. Their phone locks its entries with it and writes members/<helperId>/<deviceId>.json.
// - Parents' phones keep every helper's key inside the parents' locked log, read the helpers' files, and
//   copy the entries into the main log. Nothing from the main log is ever written to the family storage,
//   so a helper can only ever read back what they logged themselves.

export function newHelperKey() { return toB64(crypto.getRandomValues(new Uint8Array(32))); }

export function makeHelperInvite(o) {
  return 'LOF1-' + b64url(JSON.stringify({ r: o.repo, t: o.token, m: o.id, k: o.key, n: o.name, c: o.child || '', a: o.age || '' }));
}
export function readHelperInvite(code) {
  const raw = String(code || '').replace(/\s+/g, '');
  if (!/^LOF1-/.test(raw)) return null;
  try {
    const o = JSON.parse(unb64url(raw.slice(5)));
    const repo = normaliseRepo(o.r); const key = fromB64(o.k || '');
    if (repo && o.t && /^[a-f0-9]{8,40}$/.test(o.m || '') && key.length === 32) {
      return { repo, token: o.t, id: o.m, keyRaw: key, name: String(o.n || '').slice(0, 40), child: String(o.c || '').slice(0, 40), age: String(o.a || '') };
    }
  } catch (e) { /* fall through */ }
  return null;
}
export function inviteKind(code) {
  const s = String(code || '').replace(/\s+/g, '');
  if (/^LOF1-/.test(s)) return readHelperInvite(s) ? 'helper' : null;
  return readInvite(s) ? 'partner' : null;
}

const FAMILY_MARK = 'about.json';
// Parents: check the family storage is private and separate from the main storage, and that its key can't
// reach the main storage. Then mark it as Little One's.
export async function setupFamilyStorage(repo, token, mainRepo) {
  if (mainRepo && repo.toLowerCase() === String(mainRepo).toLowerCase()) throw new SyncError('same', 'Use a different repository from your main storage, so family members can never reach your log.');
  const gh = new GitHubStore(repo, token);
  await checkRepo(gh);
  if (mainRepo) {
    const reach = await new GitHubStore(mainRepo, token).repoInfo();
    if (reach) throw new SyncError('wide', `This key can also reach your main storage (${mainRepo}). Make a new key that can only reach ${repo}, so family members can't reach your log.`);
  }
  const mark = await gh.readJSON(FAMILY_MARK);
  if (!mark) await gh.writeJSON(FAMILY_MARK, { app: 'littleone-family', v: 1, note: 'Locked entries from family helpers. Each helper can only unlock their own.' }, null, 'Set up family storage');
  else if (!mark.json || mark.json.app !== 'littleone-family') throw new SyncError('notfamily', `${repo} already holds other files. Use a new, empty private repository for family helpers.`);
  return true;
}
// Helpers: check the code still works before joining.
export async function checkFamilyStorage(repo, token) {
  const gh = new GitHubStore(repo, token);
  const info = await gh.repoInfo();
  if (!info) throw new SyncError('notfound', "This code can't reach the family storage any more. Ask for a new code.");
  const mark = await gh.readJSON(FAMILY_MARK);
  if (!mark || !mark.json || mark.json.app !== 'littleone-family') throw new SyncError('notfamily', "This code doesn't lead to a Little One family storage. Ask for a new code.");
  return true;
}

// Helper phones: sync this helper's own entries between their devices, and publish them for the parents.
export async function syncHelper(cfg, hooks) {
  const gh = new GitHubStore(cfg.repo, cfg.token);
  const key = await importAesKey(cfg.keyRaw);
  const state = Object.assign({ shas: {}, mySha: null, lastHash: '' }, (await hooks.getState()) || {});
  const dir = `members/${cfg.helperId}`; const myFile = `${cfg.deviceId}.json`;
  const files = await gh.listDir(dir);
  const newShas = {}; const payloads = []; let mySha = null;
  for (const f of files) {
    if (!/^[a-f0-9]+\.json$/.test(f.name)) continue;
    if (f.name === myFile) { mySha = f.sha; continue; }
    newShas[f.name] = f.sha;
    if (state.shas[f.name] === f.sha) continue;
    try {
      const data = await decryptJSON(key, JSON.parse(await gh.getBlobText(f.sha)));
      if (data && data.app === 'littleone-helper' && data.member === cfg.helperId) payloads.push(data);
    } catch (e) { if (e instanceof SyncError) throw e; /* a file this helper's key can't unlock: skip it */ }
  }
  const pulled = payloads.length ? await hooks.merge(payloads) : 0;
  const snap = await hooks.snapshot();
  const entries = snap.entries.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const hash = await sha256Hex(JSON.stringify({ n: snap.name, e: entries }));
  let pushed = false;
  if (hash !== state.lastHash || !mySha) {
    const box = await encryptJSON(key, { app: 'littleone-helper', v: 1, member: cfg.helperId, dev: cfg.deviceId, name: snap.name, at: Date.now(), entries });
    try { mySha = await gh.writeJSON(`${dir}/${myFile}`, box, mySha, 'Sync'); } catch (e) {
      if (e.code !== 'conflict') throw e;
      const fresh = await gh.getFileMeta(`${dir}/${myFile}`);
      mySha = await gh.writeJSON(`${dir}/${myFile}`, box, fresh ? fresh.sha : null, 'Sync');
    }
    pushed = true;
  }
  await hooks.setState({ shas: newShas, mySha, lastHash: hash, lastSyncAt: Date.now() });
  return { pulled, pushed };
}

// Parent phones: read every current helper's files and hand their entries to hooks.merge(helperId, payload).
// A file that can't be unlocked with that helper's key is skipped and reported, never trusted.
export async function pullHelpers(cfg, hooks) {
  const gh = new GitHubStore(cfg.repo, cfg.token);
  const state = Object.assign({ shas: {}, bad: {} }, (await hooks.getState()) || {});
  const newShas = {}; const bad = {}; const problems = []; let pulled = 0;
  for (const h of cfg.helpers) {
    let key;
    try { key = await importAesKey(fromB64(h.key)); } catch (e) { problems.push(h.id); continue; }
    const files = await gh.listDir(`members/${h.id}`);
    for (const f of files) {
      if (!/^[a-f0-9]+\.json$/.test(f.name)) continue;
      const p = `${h.id}/${f.name}`; newShas[p] = f.sha;
      if (state.bad[p] === f.sha) { bad[p] = f.sha; problems.push(h.id); continue; }
      if (state.shas[p] === f.sha) continue;
      let data = null;
      try { data = await decryptJSON(key, JSON.parse(await gh.getBlobText(f.sha))); } catch (e) {
        if (e instanceof SyncError) throw e; // network trouble: try again later
      }
      if (!data || data.app !== 'littleone-helper' || data.member !== h.id) { bad[p] = f.sha; problems.push(h.id); continue; }
      pulled += await hooks.merge(h.id, data);
    }
  }
  await hooks.setState({ shas: newShas, bad, lastSyncAt: Date.now() });
  return { pulled, problems: Array.from(new Set(problems)) };
}

// ---------- backup files ----------
export async function makeBackup(password, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await importAesKey(await deriveKeyBytes(password, salt));
  const box = await encryptJSON(key, data);
  return { app: 'littleone-backup', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toB64(salt) }, box };
}
export async function openBackup(password, file) {
  if (!file || file.app !== 'littleone-backup') throw new SyncError('notbackup', "This file isn't a Little One backup.");
  const key = await importAesKey(await deriveKeyBytes(password, fromB64(file.kdf.salt), file.kdf.iterations));
  try { return await decryptJSON(key, file.box); } catch (e) {
    throw new SyncError('badpass', "That password doesn't open this backup.");
  }
}
