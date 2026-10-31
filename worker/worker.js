// AgenDam · Famille connectée : boîte aux lettres chiffrée.
// Le serveur ne stocke que des données chiffrées sur les téléphones (AES-GCM) : il ne peut pas les lire.
// Espace = 32 caractères hexadécimaux dérivés de la clé familiale (la clé, elle, ne quitte jamais les téléphones).
// Stockage : base D1 (liaison « DB »), beaucoup plus généreuse en gratuit que KV. Les anciennes données KV (liaison « FAM »)
// sont recopiées une seule fois par espace dans D1. Sans liaison DB, le serveur continue en KV comme avant.
const ORIGINS = ['https://dam-cigogne.github.io', 'http://localhost:8765'];
const MAX = 400 * 1024;
const DAY = 864e5;
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (req, obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
let READY = null;
const MIGD = new Set();
function ready(env) {
  if (!READY) READY = env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (space TEXT NOT NULL, doc TEXT NOT NULL, at INTEGER NOT NULL, by TEXT, data TEXT NOT NULL, PRIMARY KEY (space, doc))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS docs_at ON docs (space, at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inv (id TEXT PRIMARY KEY, data TEXT NOT NULL, exp INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mig (space TEXT PRIMARY KEY)')
  ]).catch(e => { READY = null; throw e });
  return READY;
}
// recopie unique des anciennes données KV d'un espace vers D1 (les données plus récentes de D1 sont gardées)
async function migrate(env, space) {
  if (!env.FAM || MIGD.has(space)) return;
  const done = await env.DB.prepare('SELECT 1 AS x FROM mig WHERE space = ?').bind(space).first();
  if (done) { MIGD.add(space); return }
  const st = [];
  let cursor;
  do {
    const l = await env.FAM.list({ prefix: space + ':', cursor });
    for (const k of l.keys) {
      const v = await env.FAM.get(k.name);
      const md = k.metadata || {};
      if (v) st.push(env.DB.prepare('INSERT OR IGNORE INTO docs (space, doc, at, by, data) VALUES (?, ?, ?, ?, ?)').bind(space, k.name.slice(33), md.at || 0, md.by || '', v));
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  st.push(env.DB.prepare('INSERT OR IGNORE INTO mig (space) VALUES (?)').bind(space));
  await env.DB.batch(st);
  MIGD.add(space);
}
async function pull(env, space, since) {
  if (env.DB) {
    await migrate(env, space);
    const r = await env.DB.prepare('SELECT doc, at, by, data FROM docs WHERE space = ? AND at > ? ORDER BY at').bind(space, since).all();
    return (r.results || []).map(x => ({ doc: x.doc, at: x.at, by: x.by || '', data: x.data }));
  }
  const out = [];
  let cursor;
  do {
    const l = await env.FAM.list({ prefix: space + ':', cursor });
    for (const k of l.keys) {
      const md = k.metadata || {};
      if ((md.at || 0) > since) {
        const v = await env.FAM.get(k.name);
        if (v) out.push({ doc: k.name.slice(33), at: md.at || 0, by: md.by || '', data: v });
      }
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
}
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (env.DB) await ready(env);
    // Code d'invitation : la clé familiale chiffrée par le code, gardée 7 jours (le serveur ne voit jamais le code)
    const iv = url.pathname.match(/^\/i\/([0-9a-f]{32})$/);
    if (iv) {
      if (req.method === 'GET') {
        let v = null;
        if (env.DB) { const r = await env.DB.prepare('SELECT data FROM inv WHERE id = ? AND exp > ?').bind(iv[1], Date.now()).first(); v = r ? r.data : null }
        if (!v && env.FAM) v = await env.FAM.get('inv:' + iv[1]);
        return v ? new Response(v, { headers: { 'Content-Type': 'application/json', ...cors(req) } }) : json(req, { error: 'inconnu' }, 404);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > 4096) return json(req, { error: 'trop gros' }, 413);
        let o; try { o = JSON.parse(body) } catch (e) { return json(req, { error: 'illisible' }, 400) }
        if (!o || typeof o.c !== 'string' || typeof o.iv !== 'string') return json(req, { error: 'format' }, 400);
        const data = JSON.stringify({ c: o.c, iv: o.iv });
        if (env.DB) await env.DB.prepare('INSERT OR REPLACE INTO inv (id, data, exp) VALUES (?, ?, ?)').bind(iv[1], data, Date.now() + 7 * DAY).run();
        else await env.FAM.put('inv:' + iv[1], data, { expirationTtl: 60 * 60 * 24 * 7 });
        return json(req, { ok: true });
      }
      return json(req, { error: 'methode' }, 405);
    }
    // Relais d'image (photo d'une recette) : l'appli ne peut pas la télécharger directement à cause des règles des navigateurs
    if (url.pathname === '/img' && req.method === 'GET') {
      const u = url.searchParams.get('u') || '';
      if (!/^https:\/\/[^\s]{4,2000}$/.test(u)) return json(req, { error: 'lien' }, 400);
      let r;
      try { r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'image/*' }, redirect: 'follow' }) } catch (e) { return json(req, { error: 'injoignable' }, 502) }
      const ct = r.headers.get('Content-Type') || '';
      if (!r.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(ct)) return json(req, { error: 'pas une image' }, 415);
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 6 * 1024 * 1024) return json(req, { error: 'trop gros' }, 413);
      return new Response(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', ...cors(req) } });
    }
    // Lire une recette sur un site (Marmiton, 750g…) : on ne renvoie que la recette trouvée (données schema.org), jamais la page
    if (url.pathname === '/recette' && req.method === 'GET') {
      const u = url.searchParams.get('u') || '';
      if (!/^https?:\/\/[^\s]{4,2000}$/.test(u)) return json(req, { error: 'lien' }, 400);
      let r;
      try { r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' }, redirect: 'follow' }) } catch (e) { return json(req, { error: 'injoignable' }, 502) }
      if (!r.ok) return json(req, { error: 'page ' + r.status }, 502);
      const html = (await r.text()).slice(0, 3000000);
      const found = []; const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi; let mm;
      while ((mm = re.exec(html))) { try { found.push(JSON.parse(mm[1].trim())) } catch (e) { } }
      let rec = null;
      const f = x => { if (!x || rec) return; if (Array.isArray(x)) return x.forEach(f); if (x['@graph']) f(x['@graph']); const t = x['@type']; if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) rec = x };
      found.forEach(f);
      const title = ((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim().slice(0, 200);
      if (!rec) return json(req, { error: 'pas de recette', title }, 404);
      const k = ['name', 'recipeYield', 'totalTime', 'cookTime', 'prepTime', 'recipeIngredient', 'recipeInstructions', 'recipeCategory', 'image'];
      const out = {}; for (const x of k) if (rec[x] != null) out[x] = rec[x];
      return json(req, { recipe: out, url: r.url });
    }
    if (url.pathname === '/' || url.pathname === '/ping') return json(req, { ok: true, app: 'agendam-famille', db: env.DB ? 'd1' : 'kv' });
    // Plusieurs groupes en une seule demande : /m?q=espace1.depuis1,espace2.depuis2
    if (url.pathname === '/m' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').split(',').filter(Boolean).slice(0, 12);
      const r = {};
      for (const it of q) {
        const p = it.match(/^([0-9a-f]{32})\.(\d{1,15})$/);
        if (!p) return json(req, { error: 'format' }, 400);
        r[p[1]] = await pull(env, p[1], +p[2]);
      }
      return json(req, { now: Date.now(), r });
    }
    const m = url.pathname.match(/^\/s\/([0-9a-f]{32})(?:\/([a-z0-9-]{1,40}))?$/);
    if (!m) return json(req, { error: 'adresse inconnue' }, 404);
    const space = m[1], doc = m[2];
    if (req.method === 'GET' && !doc) {
      // liste des documents modifiés depuis « since » (horodatage en ms)
      const since = +url.searchParams.get('since') || 0;
      return json(req, { now: Date.now(), docs: await pull(env, space, since) });
    }
    if (req.method === 'PUT' && doc) {
      const body = await req.text();
      if (body.length > MAX) return json(req, { error: 'trop gros' }, 413);
      let o; try { o = JSON.parse(body) } catch (e) { return json(req, { error: 'illisible' }, 400) }
      if (!o || typeof o.c !== 'string' || typeof o.iv !== 'string') return json(req, { error: 'format' }, 400);
      const at = Date.now(), by = String(o.by || '').slice(0, 30), data = JSON.stringify({ c: o.c, iv: o.iv });
      if (env.DB) {
        await env.DB.prepare('INSERT INTO docs (space, doc, at, by, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (space, doc) DO UPDATE SET at = excluded.at, by = excluded.by, data = excluded.data').bind(space, doc, at, by, data).run();
        // ménage de temps en temps : documents non modifiés depuis 400 jours, invitations expirées
        if (Math.random() < 0.01) await env.DB.batch([env.DB.prepare('DELETE FROM docs WHERE at < ?').bind(at - 400 * DAY), env.DB.prepare('DELETE FROM inv WHERE exp < ?').bind(at)]);
      } else await env.FAM.put(space + ':' + doc, data, { metadata: { at, by }, expirationTtl: 60 * 60 * 24 * 400 });
      return json(req, { ok: true, at });
    }
    return json(req, { error: 'methode' }, 405);
  }
};
