require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const BINANCE_P2P_SEARCH_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const baseUrl = process.env.BINANCE_API_BASE_URL || 'https://api.binance.com';
const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('Faltan BINANCE_API_KEY o BINANCE_API_SECRET en el entorno.');
  process.exit(1);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sign(queryString) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

function canCoverTargetAmount(row, targetAmount) {
  const min = toNumber(row?.adv?.minSingleTransAmount);
  const max = toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount);
  if (targetAmount <= 0) return true;
  if (min > 0 && targetAmount < min) return false;
  if (max > 0 && targetAmount > max) return false;
  return true;
}

async function fetchOrderBook({ asset = 'USDT', fiat = 'VES', tradeType = 'SELL', payTypes = [], amount, rows = 20 }) {
  const payload = {
    proMerchantAds: false,
    page: 1,
    rows,
    payTypes,
    countries: [],
    publisherType: null,
    asset,
    fiat,
    tradeType,
  };

  if (amount > 0) payload.transAmount = String(amount);

  const response = await axios.post(BINANCE_P2P_SEARCH_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function signedPost(pathname, body = {}, params = {}) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: '60000',
    timestamp: String(timestamp),
  }).toString();
  const signature = sign(query);
  const url = `${baseUrl}${pathname}?${query}&signature=${signature}`;
  const response = await axios.post(url, body, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
      clientType: 'web',
    },
    timeout: 15000,
  });
  return response.data;
}

async function main() {
  const availableUsdt = toNumber(process.argv[2] || 153.95);
  const targetVes = toNumber(process.argv[3] || 100000);

  console.log(`Buscando mejor aviso SELL para validar colocacion: ${availableUsdt} USDT -> ${targetVes} VES`);

  const rows = await fetchOrderBook({
    asset: 'USDT',
    fiat: 'VES',
    tradeType: 'SELL',
    payTypes: ['BancoDeVenezuela'],
    amount: targetVes,
    rows: 20,
  });

  const filtered = rows
    .filter((row) => canCoverTargetAmount(row, targetVes))
    .map((row) => ({
      advNo: row?.adv?.advNo || row?.adv?.adNo || '',
      price: toNumber(row?.adv?.price),
      advertiser: row?.advertiser?.nickName || '',
      minSingleTransAmount: toNumber(row?.adv?.minSingleTransAmount),
      maxSingleTransAmount: toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount),
    }))
    .filter((row) => row.advNo && row.price > 0)
    .sort((a, b) => b.price - a.price);

  const best = filtered[0];
  if (!best) {
    throw new Error('No se encontro aviso BDV valido para ese monto.');
  }

  const requiredUsdt = targetVes / best.price;
  console.log(JSON.stringify({
    selectedAdv: best,
    requiredUsdt: Number(requiredUsdt.toFixed(6)),
    availableUsdt,
    canAfford: availableUsdt >= requiredUsdt,
  }, null, 2));

  const payloadVariants = [
    {
      name: 'variant_fiat_amount',
      body: {
        adsNo: best.advNo,
        fiat: 'VES',
        asset: 'USDT',
        tradeType: 'SELL',
        totalAmount: String(targetVes),
      },
    },
    {
      name: 'variant_crypto_amount',
      body: {
        adsNo: best.advNo,
        fiat: 'VES',
        asset: 'USDT',
        tradeType: 'SELL',
        amount: requiredUsdt.toFixed(6),
      },
    },
  ];

  for (const variant of payloadVariants) {
    try {
      const result = await signedPost('/sapi/v1/c2c/orderMatch/checkIfCanPlaceOrder', variant.body);
      console.log(`\n=== ${variant.name}: OK ===`);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.log(`\n=== ${variant.name}: ERROR ===`);
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
}

main().catch((error) => {
  console.error('Probe checkIfCanPlaceOrder fallo:', error.response?.data || error.message);
  process.exit(1);
});
