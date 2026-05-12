require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;
const baseUrl = process.env.BINANCE_API_BASE_URL || 'https://api.binance.com';
const outputPath = path.join(__dirname, 'c2c-chat-events.jsonl');
const listenSeconds = Number(process.env.C2C_CHAT_LISTEN_SECONDS || 90);

if (!apiKey || !apiSecret) {
  console.error('Faltan BINANCE_API_KEY o BINANCE_API_SECRET en el entorno.');
  process.exit(1);
}

function sign(queryString) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

async function signedGet(pathname, params = {}, extraHeaders = {}) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: '60000',
    timestamp: String(timestamp),
  }).toString();

  const signature = sign(query);
  const url = `${baseUrl}${pathname}?${query}&signature=${signature}`;
  const response = await axios.get(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      clientType: 'web',
      ...extraHeaders,
    },
    timeout: 15000,
  });

  return response.data;
}

function appendEvent(kind, payload) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    kind,
    payload,
  });
  fs.appendFileSync(outputPath, `${line}\n`, 'utf8');
}

async function getChatCredential() {
  const result = await signedGet('/sapi/v1/c2c/chat/retrieveChatCredential');
  if (!result?.success || !result?.data?.chatWssUrl || !result?.data?.listenKey) {
    throw new Error(`Credenciales de chat invalidas: ${JSON.stringify(result)}`);
  }
  return result.data;
}

async function main() {
  console.log('Obteniendo credenciales de chat C2C...');
  const credential = await getChatCredential();

  console.log('Conectando WebSocket de chat Binance...');
  console.log(JSON.stringify({
    chatWssUrl: credential.chatWssUrl,
    hasListenKey: Boolean(credential.listenKey),
    hasListenToken: Boolean(credential.listenToken),
    outputPath,
    listenSeconds,
  }, null, 2));

  appendEvent('credential', {
    chatWssUrl: credential.chatWssUrl,
    hasListenKey: Boolean(credential.listenKey),
    hasListenToken: Boolean(credential.listenToken),
  });

  const socket = new WebSocket(credential.chatWssUrl, {
    headers: {
      'Origin': 'https://c2c.binance.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
    perMessageDeflate: false,
    handshakeTimeout: 15000,
  });

  let authSent = false;
  let messageCount = 0;
  let opened = false;

  const shutdown = (code = 0) => {
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {}
    process.exit(code);
  };

  const timer = setTimeout(() => {
    console.log(`Tiempo de escucha agotado (${listenSeconds}s). Cerrando listener.`);
    appendEvent('info', { message: 'listener_timeout_reached', listenSeconds, messageCount, opened });
    shutdown(0);
  }, listenSeconds * 1000);

  socket.on('open', () => {
    opened = true;
    console.log('WebSocket abierto. Enviando autenticacion inicial...');
    const authPayload = {
      listenKey: credential.listenKey,
      listenToken: credential.listenToken,
    };
    socket.send(JSON.stringify(authPayload));
    authSent = true;
    appendEvent('socket_open', { authPayloadKeys: Object.keys(authPayload) });
  });

  socket.on('message', (raw) => {
    messageCount += 1;
    const text = raw.toString();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    console.log(`Mensaje #${messageCount}:`);
    console.log(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
    appendEvent('message', parsed);
  });

  socket.on('unexpected-response', (_req, res) => {
    console.error('Handshake WS rechazado por el servidor.');
    console.error(`status=${res.statusCode}`);
    appendEvent('unexpected_response', {
      statusCode: res.statusCode,
      headers: res.headers,
    });
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    appendEvent('error', { message: error.message, opened, authSent });
  });

  socket.on('close', (code, reasonBuffer) => {
    clearTimeout(timer);
    const reason = reasonBuffer ? reasonBuffer.toString() : '';
    console.log(`WebSocket cerrado. code=${code} reason=${reason}`);
    appendEvent('socket_close', {
      code,
      reason,
      opened,
      authSent,
      messageCount,
    });
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Probe chat listener fallo:', error.response?.data || error.message);
  appendEvent('fatal', { message: error.response?.data || error.message });
  process.exit(1);
});
