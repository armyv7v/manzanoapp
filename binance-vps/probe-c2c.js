require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;
const baseUrl = process.env.BINANCE_API_BASE_URL || 'https://api.binance.com';

if (!apiKey || !apiSecret) {
  console.error('Faltan BINANCE_API_KEY o BINANCE_API_SECRET en el entorno.');
  process.exit(1);
}

function sign(queryString) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

async function signedGet(path, params = {}, extraHeaders = {}) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: '60000',
    timestamp: String(timestamp),
  }).toString();

  const signature = sign(query);
  const url = `${baseUrl}${path}?${query}&signature=${signature}`;
  const response = await axios.get(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      ...extraHeaders,
    },
    timeout: 15000,
  });
  return response.data;
}

async function signedPost(path, body = {}, params = {}, extraHeaders = {}) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: '60000',
    timestamp: String(timestamp),
  }).toString();

  const signature = sign(query);
  const url = `${baseUrl}${path}?${query}&signature=${signature}`;
  const response = await axios.post(url, body, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      clientType: 'web',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    timeout: 15000,
  });
  return response.data;
}

async function runProbe(name, fn) {
  try {
    const result = await fn();
    console.log(`\n=== ${name}: OK ===`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(`\n=== ${name}: ERROR ===`);
    if (error.response) {
      console.log(JSON.stringify({
        status: error.response.status,
        data: error.response.data,
      }, null, 2));
    } else {
      console.log(JSON.stringify({ message: error.message }, null, 2));
    }
  }
}

async function main() {
  console.log('Iniciando probe seguro de Binance C2C (solo lectura)...');

  await runProbe('Official C2C history', async () => {
    return signedGet('/sapi/v1/c2c/orderMatch/listUserOrderHistory', {
      rows: 5,
      page: 1,
    });
  });

  await runProbe('Undocumented listOrders', async () => {
    return signedPost('/sapi/v1/c2c/orderMatch/listOrders', {
      page: 1,
      rows: 10,
    });
  });

  await runProbe('Undocumented chat credential', async () => {
    return signedGet('/sapi/v1/c2c/chat/retrieveChatCredential', {}, {
      clientType: 'web',
    });
  });
}

main().catch((error) => {
  console.error('Probe C2C fallo:', error.message);
  process.exit(1);
});
