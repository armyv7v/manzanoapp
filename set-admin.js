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
const role = process.argv[3] || 'admin'; // 'admin' o 'seller'
const commission = parseFloat(process.argv[4]) || 0; // Porcentaje de comisión, ej: 2.5
const requiresProof = process.argv[5] === 'true'; // Nuevo: 'true' si el vendedor debe subir capture

if (!email) {
  console.error('❌ Error: Debes proporcionar un correo electrónico.');
  console.log('\nUso para Administrador:');
  console.log('  node set-admin.js correo@ejemplo.com admin');
  console.log('\nUso para Vendedor (sin carga de capture):');
  console.log('  node set-admin.js correo@ejemplo.com seller 2.5');
  console.log('\nUso para Vendedor (CON carga de capture):');
  console.log('  node set-admin.js correo@ejemplo.com seller 2.0 true');
  process.exit(1);
}

let claims = {};
if (role === 'admin') {
  claims = { admin: true };
} else if (role === 'seller') {
  if (commission <= 0 || commission >= 100) {
    console.error('❌ Error: La comisión para un vendedor debe ser un número entre 0 y 100.');
    process.exit(1);
  }
  claims = { seller: true, commissionRate: commission / 100 };
  if (requiresProof) {
    claims.requiresProof = true;
  }
} else {
  console.error(`❌ Error: Rol '${role}' no reconocido. Usa 'admin' o 'seller'.`);
  process.exit(1);
}

async function setAndVerifyAdminRole(email) {
  try {
    // 1. Buscar al usuario por su correo electrónico.
    console.log(`1. Buscando usuario: ${email}`);
    const user = await admin.auth().getUserByEmail(email);
    console.log(`   ✅ Usuario encontrado con UID: ${user.uid}`);

    // 2. Asignar los permisos personalizados (claims).
    console.log(`2. Asignando rol '${role}'...`);
    await admin.auth().setCustomUserClaims(user.uid, claims);
    console.log('   ✅ Permiso enviado a Firebase.');

    // 3. VERIFICAR: Leer el usuario de nuevo para comprobar el permiso.
    console.log('3. Verificando el permiso en el backend de Firebase...');
    const updatedUser = await admin.auth().getUser(user.uid);
    
    if (updatedUser.customClaims && JSON.stringify(updatedUser.customClaims) === JSON.stringify(claims)) {
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
