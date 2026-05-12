// Script to set admin custom claim using Firebase Admin SDK
// Run with: node make-admin.js YOUR_EMAIL@example.com

const admin = require('firebase-admin');

// Get email from command line
const email = process.argv[2];

if (!email) {
    console.error('❌ Error: Please provide an email address');
    console.log('Usage: node make-admin.js YOUR_EMAIL@example.com');
    process.exit(1);
}

// Initialize Firebase Admin with service account
// Make sure you have the service account key file
try {
    const serviceAccount = require('./serviceAccountKey.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log(`🔄 Setting admin claim for: ${email}...`);

    admin.auth().getUserByEmail(email)
        .then((user) => {
            return admin.auth().setCustomUserClaims(user.uid, { admin: true });
        })
        .then(() => {
            console.log(`✅ Success! ${email} is now an admin.`);
            console.log('\n⚠️  IMPORTANT: The user must sign out and sign in again for changes to take effect.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error:', error.message);
            process.exit(1);
        });

} catch (error) {
    console.error('❌ Error: Could not find serviceAccountKey.json');
    console.log('\n📝 To fix this:');
    console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
    console.log('2. Click "Generate new private key"');
    console.log('3. Save the file as "serviceAccountKey.json" in this directory');
    process.exit(1);
}
