// Verifica qué releases hay en cada track (solo lectura, no modifica nada).
// Uso: $env:GOOGLE_PLAY_KEY_FILE=".\play-key.json"; node check.mjs
import { google } from 'googleapis';

const packageName = 'com.cambiosmanzano.app';
const keyFile = process.env.GOOGLE_PLAY_KEY_FILE || './play-key.json';

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const play = google.androidpublisher({ version: 'v3', auth });

const { data: edit } = await play.edits.insert({ packageName, requestBody: {} });
try {
  const { data } = await play.edits.tracks.list({ packageName, editId: edit.id });
  for (const tr of data.tracks || []) {
    console.log(`TRACK: ${tr.track}`);
    for (const r of tr.releases || []) {
      console.log(`  status: ${r.status} | codes: ${(r.versionCodes || []).join(',')}`);
      for (const n of r.releaseNotes || []) console.log(`  notes [${n.language}]: ${n.text}`);
    }
  }
} finally {
  await play.edits.delete({ packageName, editId: edit.id }).catch(() => {});
  process.exit(0);
}
