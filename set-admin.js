// Script to set admin custom claim for a user
// Run with: node set-admin.js YOUR_EMAIL@example.com

const https = require('https');

const email = process.argv[2];

if (!email) {
    console.error('❌ Error: Please provide an email address');
    console.log('Usage: node set-admin.js YOUR_EMAIL@example.com');
    process.exit(1);
}

// You need to get the Cloud Function URL from Firebase Console
// Go to: Firebase Console > Functions > makeAdmin > copy the URL
const FUNCTION_URL = 'YOUR_FUNCTION_URL_HERE';

const data = JSON.stringify({ email });

const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log(`🔄 Setting admin claim for: ${email}...`);

const req = https.request(FUNCTION_URL, options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ Success!', responseData);
            console.log('\n⚠️  IMPORTANT: The user needs to log out and log in again for the changes to take effect.');
        } else {
            console.error('❌ Error:', res.statusCode, responseData);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error);
});

req.write(data);
req.end();
