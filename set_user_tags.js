// One-off: siembra el campo `tag` en los docs de users para los usuarios del
// mapa legacy USER_TAGS. Idempotente (merge). Uso: node set_user_tags.js
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
});

const db = admin.firestore();

// Espejo de USER_TAGS en src-react/src/lib/constants.ts
const USER_TAGS = {
  'enderjpinar@gmail.com': 'A1',
  'namv2210@gmail.com': 'A2',
  'emmaquintero511@gmail.com': 'A3',
  'yvettepierina@gmail.com': 'A4',
  'loistoda@gmail.com': 'A5',
  'stalinread117@gmail.com': 'V1',
  'beaguiar2405@gmail.com': 'V2',
  'myanirethsg@gmail.com': 'V3',
};

(async () => {
  const users = await db.collection('users').get();
  let set = 0, missing = [];
  for (const docSnap of users.docs) {
    const email = docSnap.data().email;
    const tag = USER_TAGS[String(email || '').toLowerCase()];
    if (!tag) continue;
    if (docSnap.data().tag === tag) { console.log(`ya tenia tag ${email} = ${tag}`); continue; }
    await docSnap.ref.set({ tag }, { merge: true });
    set++;
    console.log(`tag ${tag} -> ${email} (${docSnap.id})`);
  }
  // Verificar que todos los emails del mapa existan en users
  const known = new Set(users.docs.map(d => String(d.data().email || '').toLowerCase()));
  for (const email of Object.keys(USER_TAGS)) {
    if (!known.has(email)) missing.push(email);
  }
  console.log(`\nSeteados: ${set}. Faltantes en users: ${missing.length ? missing.join(', ') : 'ninguno'}`);
  await admin.app().delete();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
