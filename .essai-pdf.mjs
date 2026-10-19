import 'dotenv/config';
import fs from 'fs';
const S = process.argv[2];
const { ouvrirBacASable } = await import('./server/testeur/bac-a-sable.js');
const { Records } = await import('./server/db.js');
const id = Records.list('PresentationBancaire')[0].id;
const bac = await ouvrirBacASable({ user: { email: 'jules.b@klocka.immo', role: 'admin' } });
try {
  const r = await fetch(bac.base + '/api/admin/presentations-bancaires/' + id + '/pdf', { method: 'POST', headers: { cookie: 'klocka_session=' + bac.jeton, 'content-type': 'application/json' }, body: '{"forcer":true}' });
  const j = await r.json(); console.log(r.status, j.pdf_url || j.error);
  const f = await fetch(bac.base + j.pdf_url, { headers: { cookie: 'klocka_session=' + bac.jeton } }); fs.writeFileSync(`${S}/libourne.pdf`, Buffer.from(await f.arrayBuffer()));
} finally { await bac.fermer(); }
