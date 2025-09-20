const admin = require('firebase-admin');

// --- IMPORTANTE ---
// Asegúrate de que tu archivo 'serviceAccountKey.json' esté en esta misma carpeta.
const serviceAccount = require('./serviceAccountKey.json');

// --- INICIALIZACIÓN ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// --- LÓGICA PRINCIPAL ---
const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Debes proporcionar un correo electrónico.');
  console.log('Uso: node set-admin.js correo@ejemplo.com');
  process.exit(1);
}

async function setAndVerifyAdminRole(email) {
  try {
    // 1. Buscar al usuario por su correo electrónico.
    console.log(`1. Buscando usuario: ${email}`);
    const user = await admin.auth().getUserByEmail(email);
    console.log(`   ✅ Usuario encontrado con UID: ${user.uid}`);

    // 2. Asignar el permiso de administrador.
    console.log('2. Asignando permiso de administrador...');
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log('   ✅ Permiso enviado a Firebase.');

    // 3. VERIFICAR: Leer el usuario de nuevo para comprobar el permiso.
    console.log('3. Verificando el permiso en el backend de Firebase...');
    const updatedUser = await admin.auth().getUser(user.uid);
    
    if (updatedUser.customClaims && updatedUser.customClaims.admin === true) {
      console.log('\n   ✅ ¡VERIFICADO! El permiso de administrador se guardó correctamente.');
      console.log('----------------------------------------------------------------');
      console.log(`🚀 ¡Éxito! El usuario ${email} ahora es un administrador.`);
      console.log('Pídele que CIERRE SESIÓN y VUELVA A INICIAR SESIÓN para que los cambios se apliquen.');
    } else {
      console.error('\n   ❌ ¡FALLO EN LA VERIFICACIÓN! El permiso no se guardó en Firebase.');
      console.error('   👉 Claims actuales:', updatedUser.customClaims || '{}');
      console.error('   👉 Causa probable: El archivo serviceAccountKey.json es incorrecto o no tiene permisos suficientes.');
    }

  } catch (error) {
    console.error(`\n❌ Ocurrió un error al procesar a ${email}:`, error.message);
    if (error.code === 'auth/user-not-found') {
        console.error('   👉 Asegúrate de que el correo electrónico esté escrito correctamente y el usuario exista.');
    }
  }
}

setAndVerifyAdminRole(email);
