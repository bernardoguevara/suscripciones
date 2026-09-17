// Revisa los cobros proximos y manda las notificaciones.
// Corre en GitHub Actions una vez al dia. No se ejecuta en el navegador.

import admin from 'firebase-admin';

const MODO = process.argv[2] || 'real';
const TZ_OFFSET_H = -6;               // Monterrey, todo el ano
const MON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();
const fcm = admin.messaging();

// --- fechas, en hora local de Monterrey ---
function hoy() {
  const n = new Date(Date.now() + TZ_OFFSET_H * 3600 * 1000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function parse(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function paso(d, ciclo) {
  const x = new Date(d);
  if (ciclo === 'mensual') x.setUTCMonth(x.getUTCMonth() + 1);
  else if (ciclo === 'anual') x.setUTCFullYear(x.getUTCFullYear() + 1);
  else if (ciclo === 'trimestral') x.setUTCMonth(x.getUTCMonth() + 3);
  else x.setUTCDate(x.getUTCDate() + 7);
  return x;
}
function proximoCobro(sub, desde) {
  let d = parse(sub.date), g = 0;
  while (d < desde && g++ < 800) d = paso(d, sub.cycle);
  return d;
}
function dinero(n, cur) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: cur || 'MXN', maximumFractionDigits: 0
  }).format(n);
}

async function enviar(tokens, titulo, cuerpo) {
  if (!tokens.length) return { ok: 0, fallidos: [] };
  const res = await fcm.sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    data: { title: titulo, body: cuerpo, tag: 'cobro-' + Date.now(), url: '/suscripciones/' },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } }
  });
  const fallidos = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument') fallidos.push(tokens[i].id);
    }
  });
  return { ok: res.successCount, fallidos };
}

async function main() {
  const hogares = await db.collection('homes').listDocuments();
  console.log(`Hogares encontrados: ${hogares.length} · modo: ${MODO}`);

  for (const hogar of hogares) {
    const [tokSnap, subSnap, metaSnap] = await Promise.all([
      hogar.collection('tokens').get(),
      hogar.collection('subs').get(),
      hogar.collection('meta').doc('settings').get()
    ]);

    const tokens = tokSnap.docs.map(d => ({ id: d.id, token: d.data().token })).filter(t => t.token);
    if (!tokens.length) { console.log(`  ${hogar.id}: sin dispositivos registrados`); continue; }

    const dias = (metaSnap.exists && metaSnap.data().days) || 3;

    if (MODO === 'prueba') {
      const r = await enviar(tokens, 'Prueba de avisos',
        `Funciona. Te avisaré ${dias} día${dias === 1 ? '' : 's'} antes de cada cobro.`);
      console.log(`  ${hogar.id}: prueba enviada a ${r.ok}/${tokens.length}`);
      await limpiar(hogar, r.fallidos);
      continue;
    }

    const h = hoy();
    const objetivo = new Date(h); objetivo.setUTCDate(objetivo.getUTCDate() + dias);

    const tocan = [];
    subSnap.forEach(doc => {
      const s = doc.data();
      if (s.kind === 'prueba') return;
      const p = proximoCobro(s, h);
      if (p.getTime() === objetivo.getTime()) tocan.push(s);
    });

    if (!tocan.length) { console.log(`  ${hogar.id}: nada que avisar hoy`); continue; }

    const cuando = dias === 1 ? 'mañana'
      : `el ${objetivo.getUTCDate()} de ${MON[objetivo.getUTCMonth()]}`;
    let titulo, cuerpo;
    if (tocan.length === 1) {
      const s = tocan[0];
      titulo = `${s.name} se cobra ${cuando}`;
      cuerpo = `${dinero(s.amount, s.currency)}${s.pay && s.pay !== '—' ? ' · ' + s.pay : ''}`;
    } else {
      const total = tocan.reduce((a, s) => a + s.amount * (s.currency === 'USD' ? 18.6 : 1), 0);
      titulo = `${tocan.length} cobros ${cuando}`;
      cuerpo = tocan.map(s => s.name).join(', ') + ` · ${dinero(total, 'MXN')}`;
    }

    const r = await enviar(tokens, titulo, cuerpo);
    console.log(`  ${hogar.id}: "${titulo}" → ${r.ok}/${tokens.length}`);
    await limpiar(hogar, r.fallidos);
  }
  console.log('Terminado.');
}

async function limpiar(hogar, ids) {
  for (const id of ids) {
    await hogar.collection('tokens').doc(id).delete();
    console.log(`    dispositivo caducado eliminado: ${id.slice(0, 18)}…`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
