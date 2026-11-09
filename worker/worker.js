// AgenDam · Famille connectée : boîte aux lettres chiffrée.
// Le serveur ne stocke que des données chiffrées sur les téléphones (AES-GCM) : il ne peut pas les lire.
// Espace = 32 caractères hexadécimaux dérivés de la clé familiale (la clé, elle, ne quitte jamais les téléphones).
// Stockage : base D1 (liaison « DB »), beaucoup plus généreuse en gratuit que KV. Les anciennes données KV (liaison « FAM »)
// sont recopiées une seule fois par espace dans D1. Sans liaison DB, le serveur continue en KV comme avant.
// --- Notifications (Web Push, sans contenu : le serveur ne lit rien). Secrets : VAPID_PRIVATE (JWK), VAPID_PUBLIC. ---
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const enc=s=>new TextEncoder().encode(s);
async function vapidAuth(env,endpoint){
  const aud=new URL(endpoint).origin;
  const h=b64u(enc(JSON.stringify({typ:'JWT',alg:'ES256'}))),p=b64u(enc(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+43200,sub:'mailto:dam-cigogne@hotmail.fr'})));
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.VAPID_PRIVATE),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc(h+'.'+p));
  return 'vapid t='+h+'.'+p+'.'+b64u(sig)+', k='+env.VAPID_PUBLIC;
}
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function hkdf(salt,ikm,info,len){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,len*8))}
// Chiffrement du message pour le téléphone (RFC 8291, aes128gcm)
async function encPayload(p256dh,auth,text){
  const ua=unb64(p256dh),au=unb64(auth),salt=crypto.getRandomValues(new Uint8Array(16));
  const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey));
  const uaKey=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},kp.privateKey,256));
  const cat=(...a)=>{const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let i=0;for(const x of a){o.set(x,i);i+=x.length}return o};
  const prk=await hkdf(au,secret,cat(enc('WebPush: info\0'),ua,asPub),32);
  const cek=await hkdf(salt,prk,enc('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(salt,prk,enc('Content-Encoding: nonce\0'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,cat(enc(text),new Uint8Array([2]))));
  return cat(salt,new Uint8Array([0,0,16,0,65]),asPub,ct);
}
async function sendOne(env,x,msg){
  try{
    const body=await encPayload(x.p,x.a,JSON.stringify(msg));
    const res=await fetch(x.endpoint,{method:'POST',headers:{Authorization:await vapidAuth(env,x.endpoint),TTL:'86400',Urgency:'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream'},body});
    if(res.status===404||res.status===410){await env.DB.prepare('DELETE FROM push3 WHERE endpoint = ?').bind(x.endpoint).run();return 'gone'}
    return res.ok?'ok':String(res.status);
  }catch(e){return String(e).slice(0,80)}
}
// Test : envoyé à tous les téléphones du groupe, sans règle
async function pushTest(env,space){
  const r=await env.DB.prepare('SELECT endpoint, p, a FROM push3 WHERE space = ?').bind(space).all();let ok=0;const err=[];
  for(const x of (r.results||[])){const s=await sendOne(env,x,{t:'✅ Test réussi',b:'Les notifications fonctionnent sur ce téléphone 🎉',g:'agd-test'});if(s==='ok')ok++;else err.push(s)}
  return {ok,err};
}
// Vraie notification : jamais pour ses propres appareils, seulement pour le destinataire, une pour chaque modification
async function notify(env,space,o){
  const r=await env.DB.prepare('SELECT endpoint, me, pf, p, a, last, n FROM push3 WHERE space = ?').bind(space).all();const now=Date.now();const jobs=[];
  for(const x of (r.results||[])){
    if(x.endpoint===o.selfEp||o.skip.includes(x.me))continue;
    if(o.to&&x.me!==o.to)continue;
    if(x.pf){const pq=x.pf.split('!');if(!pq[0].includes(o.kind))continue;if(o.kind==='i'&&o.hint&&pq[1]&&pq[1].split(',').includes(o.hint))continue}
    if(o.kind==='i'&&!o.hint)continue;
    if(o.kind==='i'){jobs.push((async()=>{
      if(!PEND_OK){await env.DB.prepare('CREATE TABLE IF NOT EXISTS pend (endpoint TEXT, space TEXT, by TEXT, h TEXT, d TEXT)').run();PEND_OK=1}
      await env.DB.prepare('INSERT INTO pend (endpoint, space, by, h, d) VALUES (?, ?, ?, ?, ?)').bind(x.endpoint,space,o.by,o.hint,o.det||'').run();
      await new Promise(rs=>setTimeout(rs,6000));
      const c=await env.DB.prepare('DELETE FROM pend WHERE endpoint = ? AND space = ? RETURNING by, h, d').bind(x.endpoint,space).all();
      const rows=c.results||[];if(!rows.length)return;
      await env.DB.prepare('UPDATE push3 SET last = ? WHERE endpoint = ? AND space = ?').bind(Date.now(),x.endpoint,space).run();
      const m=amMsg(rows);await sendOne(env,x,{t:m.t,b:m.b,g:'agd-i'});
    })());continue}
    if(now-x.last<0){await env.DB.prepare('UPDATE push3 SET n = n + 1 WHERE endpoint = ? AND space = ?').bind(x.endpoint,space).run();continue}
    const tot=x.n+1;
    await env.DB.prepare('UPDATE push3 SET last = ?, n = 0 WHERE endpoint = ? AND space = ?').bind(now,x.endpoint,space).run();
    const H=tot===1&&o.hint&&HINT[o.hint];await sendOne(env,x,{t:H?H[0]:(LBT[o.kind]||'🔔 Du nouveau'),b:H?(o.by+' '+((o.hint==='co'&&o.det)?('a modifié la liste « '+o.det+' »'):(/^fe[amd]$/.test(o.hint)&&o.det)?evTxt(o.hint,o.det):(/^f[tc][amd]$/.test(o.hint)&&o.det)?itTxt(o.hint,o.det):H[1])):tot>10?(o.by+' a fait plusieurs modifications'):tot>1?(o.by+' : '+tot+' modifications'):(o.by+' a modifié '+LBL[o.kind]),g:'agd-'+o.kind});
  }
  if(jobs.length)await Promise.all(jobs);
}
let PEND_OK=0;
const AMV={co:{a:['a ajouté','aux courses'],d:['a retiré','des courses'],x:['a coché','dans les courses'],u:['a décoché','dans les courses'],m:['a modifié','dans les courses'],N:'article'},
 tk:{a:['a ajouté','aux tâches'],d:['a supprimé','des tâches'],x:['a terminé','parmi les tâches'],u:['a rouvert','parmi les tâches'],m:['a modifié','dans les tâches'],N:'tâche'},
 ev:{a:['a ajouté','à l’agenda'],d:['a supprimé','de l’agenda'],x:['a modifié','dans l’agenda'],u:['a modifié','dans l’agenda'],m:['a modifié','dans l’agenda'],N:'rendez-vous'},
 ee:{a:['a ajouté','aux événements'],d:['a supprimé','des événements'],x:['a modifié','dans les événements'],u:['a modifié','dans les événements'],m:['a modifié','dans les événements'],N:'événement'},
 nt:{a:['a ajouté','aux notes'],d:['a supprimé','des notes'],x:['a modifié','dans les notes'],u:['a modifié','dans les notes'],m:['a modifié','dans les notes'],N:'note'}};
function amMsg(rows){
  const by=[...new Set(rows.map(r=>r.by))],hs=[...new Set(rows.map(r=>r.h))];
  const t=hs.length===1&&HINT[hs[0]]?HINT[hs[0]][0]:LBT.i,who=by.length===1?by[0]:'Plusieurs membres';
  const G={};rows.forEach(r=>{const p=(r.d||'').split('|'),ac=p[0]&&p[0].length===1?p[0]:'m',tx=p.length>1?p[1]:'',k=r.h+'|'+ac;(G[k]=G[k]||{h:r.h,ac,n:[]}).n.push(tx)});
  const ph=Object.values(G).map(g=>{const V=AMV[g.h];if(!V)return null;const [vb,suf]=V[g.ac]||V.m,nm=g.n.filter(Boolean);
    const what=(nm.length===g.n.length&&nm.length<=3)?nm.map(x=>'« '+x+' »').join(', '):g.n.length+' '+V.N+(g.n.length>1?'s':'');
    return vb+' '+what+' '+suf});
  let b=ph.every(Boolean)?(who+' '+ph.join(', ')):(who+' : '+rows.length+' modification'+(rows.length>1?'s':''));
  if(b.length>150)b=who+' : '+rows.length+' modifications';
  return {t,b};
}
const evTxt=(h,d)=>{const p=d.split('|');return (h==='fea'?'a ajouté':h==='fed'?'a supprimé':'a modifié')+' l’événement « '+p[0]+' »'+(p[1]?' ('+p[1]+')':'')};
const itTxt=(h,d)=>{const co=h[1]==='c',v=h[2]==='a'?'a ajouté':h[2]==='d'?(co?'a retiré':'a supprimé'):'a modifié';if(d[0]==='#'){const p=d.slice(1).split('|'),c=+p[0]||0,nm=p.slice(1).filter(Boolean),suf=co?(h[2]==='a'?' aux courses':h[2]==='d'?' des courses':' dans les courses'):'';if(nm.length)return v+' '+nm.map(x=>'« '+x+' »').join(', ')+(c>nm.length?' et '+(c-nm.length)+' autre'+(c-nm.length>1?'s':''):'')+(co?suf:' (tâches)');return v+' '+c+(co?' articles':' tâches')+suf}return v+(co?' « '+d+' »'+(h[2]==='a'?' aux courses':h[2]==='d'?' des courses':''):(h[2]==='a'?' la tâche « ':h[2]==='d'?' la tâche « ':' la tâche « ')+d+' »')};
const HINT = { fca:['🏠 Famille · Courses','a ajouté un article aux courses'], fcm:['🏠 Famille · Courses','a modifié la liste de courses'], fcd:['🏠 Famille · Courses','a retiré un article des courses'], fea:['🏠 Famille · Agenda','a ajouté un événement'], fem:['🏠 Famille · Agenda','a modifié un événement'], fed:['🏠 Famille · Agenda','a supprimé un événement'], fta:['🏠 Famille · Listes','a ajouté une tâche ou un article'], ftm:['🏠 Famille · Listes','a modifié une tâche ou une liste'], ftd:['🏠 Famille · Listes','a supprimé une tâche ou un article'], fba:['🏠 Famille · Anniversaires','a ajouté un anniversaire'], fbm:['🏠 Famille · Anniversaires','a modifié un anniversaire'], fbd:['🏠 Famille · Anniversaires','a supprimé un anniversaire'], fva:['🏠 Famille · Voyages','a ajouté un voyage'], fvm:['🏠 Famille · Voyages','a modifié un voyage'], fvd:['🏠 Famille · Voyages','a supprimé un voyage'], fmu:['🏠 Famille · Du nouveau','a fait plusieurs modifications'], fra:['🏠 Famille · Recettes','a ajouté une recette'], frm:['🏠 Famille · Recettes','a modifié une recette'], frd:['🏠 Famille · Recettes','a supprimé une recette'], tk:['☑ Amicale · Tâches','a modifié une tâche'], co:['🛒 Amicale · Courses','a modifié la liste de courses'], ev:['📅 Amicale · Agenda','a modifié l’agenda'], ee:['🎉 Amicale · Événement','a ajouté ou modifié un événement'], nt:['📝 Amicale · Notes','a modifié une note'], am:['🎖 Amicale · Membres','a modifié la liste des amicalistes'], ad:['📁 Amicale · Administratif','a ajouté ou modifié un document'], cd:['🎁 Amicale · Cadeaux','a modifié un cadeau'], ag:['📝 Amicale · Compte rendu AG','a modifié un compte rendu'], bs:['📰 Amicale · Bulletin','a modifié un bulletin'], bm:['📰 Amicale · Bulletin','a modifié un modèle de bulletin'], po:['🖼 Amicale · Affiches','a modifié une affiche'] };
const LBT = { a: '🏠 Famille · Agenda', c: '🏠 Famille · Listes', i: '🏛️ Amicale · Du nouveau' };
const LBL = { a: 'l’agenda partagé', c: 'les listes partagées', i: 'un élément du groupe Amicale' };
const ORIGINS = ['https://dam-cigogne.github.io', 'http://localhost:8765'];
const MAX = 400 * 1024;
const DAY = 864e5;
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Push-Self, X-Push-Skip, X-Push-Quiet, X-Push-Hint',
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
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mig (space TEXT PRIMARY KEY)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push (endpoint TEXT PRIMARY KEY, space TEXT NOT NULL, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push3 (endpoint TEXT NOT NULL, space TEXT NOT NULL, me TEXT NOT NULL DEFAULT \'\', pf TEXT NOT NULL DEFAULT \'\', at INTEGER NOT NULL, p TEXT NOT NULL, a TEXT NOT NULL, last INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (endpoint, space))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS push3_sp ON push3 (space)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS remind (endpoint TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, c TEXT NOT NULL, PRIMARY KEY (endpoint, id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS remind_at ON remind (at)')
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
  async fetch(req, env, ctx) {
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
    // Rappels à l'heure : l'appli envoie l'heure et un message CHIFFRÉ (le serveur ne lit que l'heure)
    if (url.pathname === '/remind' && req.method === 'PUT' && env.DB && env.VAPID_PRIVATE) {
      let o; try { o = JSON.parse(await req.text()) } catch (e) { return json(req, { error: 'illisible' }, 400) }
      if (!o || !/^https:\/\/[^\s]{10,600}$/.test(o.endpoint || '') || !Array.isArray(o.list)) return json(req, { error: 'format' }, 400);
      const known = await env.DB.prepare('SELECT 1 AS x FROM push3 WHERE endpoint = ? LIMIT 1').bind(o.endpoint).first();
      if (!known) return json(req, { error: 'inconnu' }, 404);
      const st = [env.DB.prepare('DELETE FROM remind WHERE endpoint = ?').bind(o.endpoint)];
      for (const r of o.list.slice(0, 150)) {
        if (!r || typeof r.id !== 'string' || typeof r.c !== 'string' || !(r.at > 0) || r.id.length > 120 || r.c.length > 2000) continue;
        st.push(env.DB.prepare('INSERT OR REPLACE INTO remind (endpoint, id, at, c) VALUES (?, ?, ?, ?)').bind(o.endpoint, r.id, Math.floor(r.at), r.c));
      }
      await env.DB.batch(st);
      return json(req, { ok: true, n: st.length - 1 });
    }
    // Notifications : abonnement d'un téléphone à un groupe, test, et envoi
    const pm = url.pathname.match(/^\/push\/([0-9a-f]{32})(\/test)?$/);
    if (pm && env.DB && env.VAPID_PRIVATE) {
      if (req.method === 'PUT') {
        let o; try { o = JSON.parse(await req.text()) } catch (e) { return json(req, { error: 'illisible' }, 400) }
        if (!o || !/^https:\/\/[^\s]{10,600}$/.test(o.endpoint || '')) return json(req, { error: 'format' }, 400);
        if (!o.keys || typeof o.keys.p256dh !== 'string' || typeof o.keys.auth !== 'string') return json(req, { error: 'clés' }, 400);
        await env.DB.prepare('INSERT OR REPLACE INTO push3 (endpoint, space, me, pf, at, p, a) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(o.endpoint, pm[1], String(o.me || '').slice(0, 20), String(o.pf || '').slice(0, 60), Date.now(), o.keys.p256dh, o.keys.auth).run();
        return json(req, { ok: true });
      }
      if (req.method === 'POST' && pm[2]) return json(req, await pushTest(env, pm[1]));
      return json(req, { error: 'methode' }, 405);
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
      if (env.DB && env.VAPID_PRIVATE) {
        const mm = doc.match(/^([ac])-([a-z0-9]+)-([a-z0-9]+)$/), skip = (req.headers.get('X-Push-Skip') || '').split(',').filter(Boolean);
        const kind = mm ? mm[1] : (/^i-/.test(doc) ? 'i' : null);
        if (kind && !req.headers.get('X-Push-Quiet')) ctx.waitUntil(notify(env, space, { kind, to: mm ? mm[3] : null, by: by || 'Quelqu’un', hint: (req.headers.get('X-Push-Hint') || '').slice(0, 3), det: (() => { try { return decodeURIComponent(url.searchParams.get('d') || '').replace(/[\r\n]+/g, ' ').slice(0, 80) } catch (e) { return '' } })(), skip, selfEp: req.headers.get('X-Push-Self') || null }));
      }
      return json(req, { ok: true, at });
    }
    return json(req, { error: 'methode' }, 405);
  },
  // Déclencheur « toutes les minutes » : envoie les rappels arrivés à l'heure
  async scheduled(ev, env, ctx) {
    if (!env.DB || !env.VAPID_PRIVATE) { console.log('cron: pas de base ou de clé'); return; }
    try {
      await ready(env);
      const now = Date.now();
      const r = await env.DB.prepare('SELECT endpoint, id, c FROM remind WHERE at <= ? AND at > ? ORDER BY at LIMIT 80').bind(now, now - 6 * 3600000).all();
      const rows = r.results || [];
      const tot = await env.DB.prepare('SELECT COUNT(*) AS n, MIN(at) AS a FROM remind').first();
      console.log('cron: ' + rows.length + ' rappel(s) à envoyer ; ' + (tot ? tot.n : '?') + ' en attente ; prochain=' + (tot && tot.a ? new Date(tot.a).toISOString() : '-'));
      for (const x of rows) {
        const s = await env.DB.prepare('SELECT endpoint, p, a FROM push3 WHERE endpoint = ? LIMIT 1').bind(x.endpoint).first();
        const res = s ? await sendOne(env, s, { e: x.c }) : 'abonnement introuvable';
        console.log('cron: envoi ' + x.id.slice(0, 20) + ' => ' + res);
        await env.DB.prepare('DELETE FROM remind WHERE endpoint = ? AND id = ?').bind(x.endpoint, x.id).run();
      }
      await env.DB.prepare('DELETE FROM remind WHERE at < ?').bind(now - 6 * 3600000).run();
    } catch (e) { console.log('cron: erreur ' + String(e).slice(0, 200)); }
  }
};
