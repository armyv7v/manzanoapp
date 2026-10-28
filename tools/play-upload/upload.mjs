// Sube un AAB a Google Play con la Android Publisher API.
//
// Uso:
//   $env:GOOGLE_PLAY_KEY_FILE=".\play-key.json"
//   node upload.mjs --aab ..\android\app\build\outputs\bundle\release\app-release.aab [--track internal] [--draft] [--package com.cambiosmanzano.app]
//
// Por defecto sube al track `internal` con estado `completed` (solo testers
// internos, nunca toca producción por accidente). Con `--draft` queda en
// borrador para revisar y lanzar a mano desde Play Console.
//
// Requisitos previos (una sola vez, en navegador):
//   1. Cloud Console: habilitar "Google Play Android Developer API".
//   2. IAM: crear service account + clave JSON.
//   3. Play Console > Configuración > Usuarios y permisos: invitar el email
//      de la service account con permiso de Versiones.
//   4. Guardar el JSON como ./play-key.json (está en .gitignore, jamás al repo).
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const packageName = get('--package', 'com.cambiosmanzano.app');
const track = get('--track', 'internal');
const aabPath = path.resolve(get('--aab', '../../android/app/build/outputs/bundle/release/app-release.aab'));
const draft = args.includes('--draft');
const notes = get('--notes', '');
const notesLang = get('--notes-lang', 'es');
const keyFile = path.resolve(process.env.GOOGLE_PLAY_KEY_FILE || './play-key.json');

if (!fs.existsSync(aabPath)) throw new Error(`No existe el AAB: ${aabPath}`);
if (!fs.existsSync(keyFile)) throw new Error(`No existe la llave: ${keyFile}`);

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const play = google.androidpublisher({ version: 'v3', auth });

const { data: edit } = await play.edits.insert({ packageName, requestBody: {} });
const editId = edit.id;
console.log(`Edit abierto: ${editId}`);
try {
  const { data: bundle } = await play.edits.bundles.upload({
    packageName,
    editId,
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(aabPath) },
  });
  console.log(`AAB subido. versionCode: ${bundle.versionCode}`);

  const release = { versionCodes: [String(bundle.versionCode)], status: draft ? 'draft' : 'completed' };
  if (notes) release.releaseNotes = [{ language: notesLang, text: notes }];

  await play.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: { releases: [release] },
  });
  console.log(`Track '${track}' actualizado (${draft ? 'borrador' : 'completo'}).`);

  const { data: committed } = await play.edits.commit({ packageName, editId });
  console.log(`Commit OK. id: ${committed.id}`);
} catch (err) {
  await play.edits.delete({ packageName, editId }).catch(() => {});
  throw err;
}
