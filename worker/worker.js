// AgenDam · Famille connectée : boîte aux lettres chiffrée.
// Le serveur ne stocke que des données chiffrées sur les téléphones (AES-GCM) : il ne peut pas les lire.
// Espace = 32 caractères hexadécimaux dérivés de la clé familiale (la clé, elle, ne quitte jamais les téléphones).
const ORIGINS = ['https://dam-cigogne.github.io', 'http://localhost:8765'];
const MAX = 400 * 1024;
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
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    // Code d'invitation : la clé familiale chiffrée par le code, gardée 7 jours (le serveur ne voit jamais le code)
    const iv = url.pathname.match(/^\/i\/([0-9a-f]{32})$/);
    if (iv) {
      const key = 'inv:' + iv[1];
      if (req.method === 'GET') {
        const v = await env.FAM.get(key);
        return v ? new Response(v, { headers: { 'Content-Type': 'application/json', ...cors(req) } }) : json(req, { error: 'inconnu' }, 404);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > 4096) return json(req, { error: 'trop gros' }, 413);
        let o; try { o = JSON.parse(body) } catch (e) { return json(req, { error: 'illisible' }, 400) }
        if (!o || typeof o.c !== 'string' || typeof o.iv !== 'string') return json(req, { error: 'format' }, 400);
        await env.FAM.put(key, JSON.stringify({ c: o.c, iv: o.iv }), { expirationTtl: 60 * 60 * 24 * 7 });
        return json(req, { ok: true });
      }
      return json(req, { error: 'méthode' }, 405);
    }
    const m = url.pathname.match(/^\/s\/([0-9a-f]{32})(?:\/([a-z0-9-]{1,40}))?$/);
    if (url.pathname === '/' || url.pathname === '/ping') return json(req, { ok: true, app: 'agendam-famille' });
    if (!m) return json(req, { error: 'adresse inconnue' }, 404);
    const space = m[1], doc = m[2];
    if (req.method === 'GET' && !doc) {
      // liste des documents modifiés depuis « since » (horodatage en ms)
      const since = +url.searchParams.get('since') || 0;
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
      return json(req, { now: Date.now(), docs: out });
    }
    if (req.method === 'PUT' && doc) {
      const body = await req.text();
      if (body.length > MAX) return json(req, { error: 'trop gros' }, 413);
      let o; try { o = JSON.parse(body) } catch (e) { return json(req, { error: 'illisible' }, 400) }
      if (!o || typeof o.c !== 'string' || typeof o.iv !== 'string') return json(req, { error: 'format' }, 400);
      const at = Date.now(), by = String(o.by || '').slice(0, 30);
      await env.FAM.put(space + ':' + doc, JSON.stringify({ c: o.c, iv: o.iv }), { metadata: { at, by }, expirationTtl: 60 * 60 * 24 * 400 });
      return json(req, { ok: true, at });
    }
    return json(req, { error: 'méthode' }, 405);
  }
};
