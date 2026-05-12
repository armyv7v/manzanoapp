require('dotenv').config();
const axios = require('axios');

const BINANCE_P2P_SEARCH_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canCoverTargetAmount(row, targetAmount) {
  const min = toNumber(row?.adv?.minSingleTransAmount);
  const max = toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount);
  if (targetAmount <= 0) return true;
  if (min > 0 && targetAmount < min) return false;
  if (max > 0 && targetAmount > max) return false;
  return true;
}

function extractMethods(row) {
  return Array.isArray(row?.adv?.tradeMethods)
    ? row.adv.tradeMethods.map((method) => ({
        name: method?.tradeMethodName || '',
        identifier: method?.identifier || '',
      }))
    : [];
}

async function fetchOrderBook({ asset = 'USDT', fiat = 'VES', tradeType = 'SELL', payTypes = [], amount, rows = 20, page = 1 }) {
  const payload = {
    proMerchantAds: false,
    page,
    rows,
    payTypes,
    countries: [],
    publisherType: null,
    asset,
    fiat,
    tradeType,
  };

  if (amount > 0) {
    payload.transAmount = String(amount);
  }

  const response = await axios.post(BINANCE_P2P_SEARCH_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

function buildCandidate(row, availableUsdt, targetVes) {
  const price = toNumber(row?.adv?.price);
  if (!(price > 0)) return null;

  const requiredUsdt = targetVes / price;
  const canAfford = availableUsdt >= requiredUsdt;
  const maxVesWithBalance = availableUsdt * price;

  return {
    advNo: row?.adv?.advNo || row?.adv?.adNo || '',
    advertiser: row?.advertiser?.nickName || '',
    price,
    requiredUsdt: Number(requiredUsdt.toFixed(6)),
    availableUsdt: Number(availableUsdt.toFixed(6)),
    targetVes,
    canAfford,
    maxVesWithBalance: Number(maxVesWithBalance.toFixed(2)),
    remainingUsdt: Number((availableUsdt - requiredUsdt).toFixed(6)),
    minSingleTransAmount: toNumber(row?.adv?.minSingleTransAmount),
    maxSingleTransAmount: toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount),
    methods: extractMethods(row),
  };
}

async function findBestMatch(payTypes, label, availableUsdt, targetVes) {
  const rows = await fetchOrderBook({
    asset: 'USDT',
    fiat: 'VES',
    tradeType: 'SELL',
    payTypes,
    amount: targetVes,
    rows: 20,
  });

  const filtered = rows.filter((row) => canCoverTargetAmount(row, targetVes));
  const candidates = filtered
    .map((row) => buildCandidate(row, availableUsdt, targetVes))
    .filter(Boolean)
    .sort((a, b) => b.price - a.price);

  return {
    label,
    requestedPayTypes: payTypes,
    rowsReturned: rows.length,
    rowsCoveringAmount: filtered.length,
    bestMatch: candidates[0] || null,
    top3: candidates.slice(0, 3),
  };
}

async function main() {
  const availableUsdt = toNumber(process.env.PROBE_AVAILABLE_USDT || process.argv[2] || 153.95);
  const targetVes = toNumber(process.env.PROBE_TARGET_VES || process.argv[3] || 100000);

  if (!(availableUsdt > 0) || !(targetVes > 0)) {
    throw new Error('Debes indicar availableUsdt y targetVes validos.');
  }

  console.log(`Buscando match SELL USDT/VES para ${availableUsdt} USDT -> ${targetVes} VES...`);

  const bdv = await findBestMatch(['BancoDeVenezuela'], 'Banco de Venezuela', availableUsdt, targetVes);
  const bankTransfer = await findBestMatch(['BANK'], 'Transferencia Bancaria', availableUsdt, targetVes);

  const thresholdRate = targetVes / availableUsdt;

  console.log(JSON.stringify({
    availableUsdt,
    targetVes,
    minimumRequiredRate: Number(thresholdRate.toFixed(6)),
    primary: bdv,
    fallback: bankTransfer,
  }, null, 2));
}

main().catch((error) => {
  console.error('Probe P2P SELL match fallo:', error.response?.data || error.message);
  process.exit(1);
});
