// PM2 may start this script from another working directory. Resolve .env next
// to the worker so the Firebase service-account path is always loaded.
require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const admin = require('firebase-admin');

const execFileAsync = promisify(execFile);

const POLL_MS = Number(process.env.BINANCE_P2P_WORKER_POLL_MS || 5000);
const ACTION_TIMEOUT_MS = Number(process.env.BINANCE_P2P_ACTION_TIMEOUT_MS || 180000);
const WORKER_HOST = process.env.BINANCE_P2P_WORKER_NAME || os.hostname();
const REPO_ROOT = process.env.BINANCE_P2P_REPO_ROOT || path.resolve(__dirname, '..');
const BOT_DIR = process.env.BINANCE_P2P_BOT_DIR || path.join(REPO_ROOT, 'binance-p2p-bot');
const ARTIFACTS_DIR = path.join(BOT_DIR, 'artifacts');
const WHOLESALE_SCAN_MS = Number(process.env.WHOLESALE_PURCHASE_SCAN_MS || 30000);
const BINANCE_API_BASE_URL = process.env.BINANCE_API_BASE_URL || 'https://api.binance.com';
const WHOLESALE_CHECK_MINUTES = [5, 10, 15];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const credentials = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
  }

  return admin.initializeApp();
}

async function findLatestPrepareArtifact() {
  const files = await fs.readdir(ARTIFACTS_DIR);
  const candidates = files
    .filter((fileName) => /^binance-p2p-prepare-order-cdp\.json$/i.test(fileName))
    .map((fileName) => path.join(ARTIFACTS_DIR, fileName));

  if (candidates.length === 0) {
    throw new Error('No se encontró el artifact binance-p2p-prepare-order-cdp.json.');
  }

  const stats = await Promise.all(candidates.map(async (fullPath) => ({
    fullPath,
    stat: await fs.stat(fullPath),
  })));

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0].fullPath;
}

function buildPrepareSummary(result) {
  const selectedAd = result?.selectedAd || {};
  const amount = result?.requestedInput?.amount || '';
  const mode = result?.requestedInput?.amountMode === 'asset' ? 'USDT' : 'VES';
  const advertiser = selectedAd.advertiser || 'sin anunciante';
  const statusBits = [];

  if (result?.apis?.checkMakeOrder?.matched) statusBits.push('checkMakeOrder ok');
  if (result?.apis?.prePlaceOrderPageInfo?.matched) statusBits.push('prePlaceOrder ok');

  return `Pre-order abierto para ${amount || 'sin monto'} ${mode} con ${advertiser}${statusBits.length ? ` · ${statusBits.join(' / ')}` : ''}`;
}

async function updateRuntime(runtimeRef, payload) {
  await runtimeRef.set({
    host: WORKER_HOST,
    transport: 'chrome-cdp',
    mode: 'vps',
    controlledFrom: 'manzano-app',
    requiresPhoneApproval: true,
    capabilities: {
      prepare_sell: true,
      heartbeat: true,
      localPcRequired: false,
    },
    ...payload,
    lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function markAction(actionRef, payload) {
  await actionRef.set(payload, { merge: true });
}

function getBinanceCredentials() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('Claves de Binance no configuradas en el worker VPS.');
  return { apiKey, apiSecret };
}

async function signedBinanceRequest(method, endpoint, params) {
  const { apiKey, apiSecret } = getBinanceCredentials();
  const search = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    recvWindow: '5000',
    timestamp: String(Date.now()),
  });
  const signature = crypto.createHmac('sha256', apiSecret).update(search.toString()).digest('hex');
  search.set('signature', signature);

  const response = await fetch(`${BINANCE_API_BASE_URL}${endpoint}?${search.toString()}`, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Binance ${endpoint}: ${body?.msg || response.statusText}`);
  return body;
}

async function getSpotUsdtAvailable() {
  const account = await signedBinanceRequest('GET', '/api/v3/account', {});
  const usdt = Array.isArray(account?.balances) ? account.balances.find((balance) => balance.asset === 'USDT') : null;
  return Number(usdt?.free || 0);
}

async function transferSpotToFunding(purchaseId, amount) {
  const clientTranId = `wholesale-${purchaseId}`.slice(0, 32);
  return signedBinanceRequest('POST', '/sapi/v1/asset/transfer', {
    type: 'MAIN_FUNDING',
    asset: 'USDT',
    amount: Number(amount).toFixed(8),
    clientTranId,
  });
}

function plannedWholesaleAttempt(createdAt, now) {
  const elapsedMs = now.getTime() - createdAt.getTime();
  if (elapsedMs >= WHOLESALE_CHECK_MINUTES[2] * 60 * 1000) return 3;
  if (elapsedMs >= WHOLESALE_CHECK_MINUTES[1] * 60 * 1000) return 2;
  if (elapsedMs >= WHOLESALE_CHECK_MINUTES[0] * 60 * 1000) return 1;
  return 0;
}

async function ensureOfflineAdActionForPurchase(db, purchaseRef, purchase) {
  const requestedUsdt = Number(purchase.usdtNeeded || purchase.transferredUsdt || 0);
  if (!(requestedUsdt > 0)) return false;

  // An id derived from the purchase makes this operation idempotent: worker
  // restarts and repeated polls cannot publish the same wholesale purchase twice.
  const actionRef = db.collection('binance_p2p_actions').doc(`publish-offline-${purchaseRef.id}`);
  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(actionRef);
    if (existing.exists) return false;
    transaction.set(actionRef, {
      actionType: 'publish_offline_ad',
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      requestedBy: 'binance-p2p-worker',
      payload: {
        wholesalePurchaseId: purchaseRef.id,
        amountUsdt: Number(requestedUsdt.toFixed(8)),
      },
      source: 'wholesale_purchase_transfer',
    });
    transaction.set(purchaseRef, {
      offlineAdActionId: actionRef.id,
      offlineAdStatus: 'pending',
      offlineAdQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return created;
}

async function processLatestWholesalePurchase(db) {
  const snapshot = await db.collection('wholesale_purchases').orderBy('createdAt', 'desc').limit(1).get();
  if (snapshot.empty) return false;

  const purchaseRef = snapshot.docs[0].ref;
  const purchase = snapshot.docs[0].data() || {};
  const createdAt = purchase.createdAt?.toDate?.();
  const requestedUsdt = Number(purchase.usdtNeeded || 0);
  const currentState = purchase.automationStatus || 'pending_spot';
  // Existing historical purchases are never candidates for automatic transfers.
  if (purchase.automationEnabled !== true || !createdAt || requestedUsdt <= 0) return false;
  if (currentState === 'transferred') return ensureOfflineAdActionForPurchase(db, purchaseRef, purchase);
  if (['expired', 'transferring', 'transfer_failed'].includes(currentState)) return false;

  const now = new Date();
  const plannedAttempt = plannedWholesaleAttempt(createdAt, now);
  const attempts = Number(purchase.spotCheckAttempts || 0);
  if (plannedAttempt === 0 || attempts >= plannedAttempt) return false;

  const spotUsdt = await getSpotUsdtAvailable();
  const common = {
    spotCheckAttempts: plannedAttempt,
    lastSpotCheckAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSpotUsdtAvailable: spotUsdt,
  };

  if (spotUsdt < requestedUsdt) {
    if (plannedAttempt >= 3) {
      await purchaseRef.set({
        ...common,
        automationStatus: 'expired',
        status: 'Expirada',
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        automationAlertA2At: purchase.automationAlertA2At || admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      await purchaseRef.set({
        ...common,
        automationStatus: 'pending_spot',
        status: 'En proceso',
        ...(plannedAttempt === 2 && !purchase.automationAlertA2At
          ? { automationAlertA2At: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
      }, { merge: true });
    }
    return true;
  }

  await purchaseRef.set({
    ...common,
    automationStatus: 'transferring',
    status: 'En proceso',
    transferStartedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  try {
    const transfer = await transferSpotToFunding(purchaseRef.id, requestedUsdt);
    await purchaseRef.set({
      automationStatus: 'transferred',
      status: 'Completada',
      transferredUsdt: requestedUsdt,
      transferTransactionId: transfer?.tranId || '',
      transferredAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await ensureOfflineAdActionForPurchase(db, purchaseRef, {
      ...purchase,
      transferredUsdt: requestedUsdt,
    });
  } catch (error) {
    await purchaseRef.set({
      automationStatus: 'transfer_failed',
      transferError: String(error?.message || error).slice(0, 1000),
      transferFailedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
  return true;
}

const C2C_BDV_PAY_ID = Number(process.env.BINANCE_C2C_BDV_PAY_ID || 77334701);
const C2C_P2P_SEARCH_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const P2P_AD_TERMS = `☢️☢️ LEER POR FAVOR ☢️☢️

🚨 NO ACEPTO PAGO DE TERCEROS. SERÁ REPORTADO EL USUARIO SI RECIBO PAGO DE TERCEROS. 🚨

☢️☢️ Buen día si el anuncio está en línea. Estamos activos para liberar una vez confirmado el pago y recibo del capture 👀👀

👉Por favor no pregunte si estamos en línea.

Comerciante verificado con mas de 4 años operando en Binance, 100% calificaciones positivas ✅ y más de 9000 operaciones exitosas. 🔝

☢️☢️ LEER POR FAVOR ☢️☢️

Contamos con 15 minutos para liberar, estamos procesando varias ordenes a la vez. Tiempo promedio de liberación 4-6 min. Por favor no se desespere que si el pago se confirma será liberado a la brevedad.
☢️☢️`;

async function signedBinanceJsonRequest(method, endpoint, body) {
  const { apiKey, apiSecret } = getBinanceCredentials();
  const search = new URLSearchParams({ recvWindow: '5000', timestamp: String(Date.now()) });
  search.set('signature', crypto.createHmac('sha256', apiSecret).update(search.toString()).digest('hex'));
  const response = await fetch(`${BINANCE_API_BASE_URL}${endpoint}?${search}`, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey, clientType: 'web', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.code && result.code !== '000000') throw new Error(`Binance ${endpoint}: ${result?.msg || response.statusText}`);
  return result;
}

async function getFundingUsdtAvailable() {
  const result = await signedBinanceRequest('POST', '/sapi/v1/asset/get-funding-asset', { asset: 'USDT' });
  const row = Array.isArray(result) ? result.find((item) => item.asset === 'USDT') : null;
  return Number(row?.free || 0);
}

async function findExistingBdvSellAd() {
  const response = await signedBinanceJsonRequest('POST', '/sapi/v1/c2c/ads/listWithPagination', {
    asset: 'USDT', fiatUnit: 'VES', tradeType: 'SELL', page: 1, rows: 20,
  });
  const rows = Array.isArray(response?.data) ? response.data : (Array.isArray(response?.data?.data) ? response.data.data : []);
  return rows.find((row) => {
    const methods = row?.adv?.tradeMethods || row?.tradeMethods || [];
    return methods.some((method) => method?.payId === C2C_BDV_PAY_ID || method?.identifier === 'BancoDeVenezuela' || method?.payType === 'BancoDeVenezuela');
  }) || null;
}

async function getOwnAdReferencePrice(index) {
  const response = await fetch(C2C_P2P_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({ proMerchantAds: false, page: 1, rows: 20, payTypes: ['BancoDeVenezuela'], countries: [], publisherType: null, asset: 'USDT', fiat: 'VES', tradeType: 'BUY', transAmount: '50000' }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const matching = rows.filter((row) => Number(row?.adv?.price || 0) > 0 && Number(row?.adv?.minSingleTransAmount || 0) <= 50000 && Number(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount || 0) >= 50000);
  const selected = matching[Math.max(0, Math.min(matching.length - 1, index - 1))];
  const price = Number(selected?.adv?.price || 0);
  if (!(price > 0)) throw new Error('No se encontró una referencia BUY Banco de Venezuela válida para el anuncio.');
  return price;
}

async function runPublishOfflineAd(db, actionRef, runtimeRef, actionData = {}) {
  await updateRuntime(runtimeRef, { status: 'running', sessionState: 'publishing_offline_ad', currentActionId: actionRef.id, lastError: '' });
  try {
    const rateConfig = (await db.collection('config').doc('rate').get()).data() || {};
    const index = Number(rateConfig.binanceAdReferenceIndex || 5);
    const availableFundingUsdt = await getFundingUsdtAvailable();
    const requestedUsdt = Number(actionData?.payload?.amountUsdt || 0);
    const existingAd = await findExistingBdvSellAd();
    const existingReservedUsdt = Number(existingAd?.adv?.surplusAmount || existingAd?.surplusAmount || 0);
    const fundingUsdt = requestedUsdt > 0
      ? existingReservedUsdt + requestedUsdt
      : existingReservedUsdt + availableFundingUsdt;
    if (!(fundingUsdt > 0)) throw new Error('No hay USDT disponible en Fondos para publicar el anuncio.');
    if (requestedUsdt > 0 && availableFundingUsdt + 0.00000001 < requestedUsdt) {
      throw new Error(`Fondos insuficientes para el anuncio: disponibles ${availableFundingUsdt} USDT, requeridos ${requestedUsdt} USDT.`);
    }
    const price = await getOwnAdReferencePrice(index);
    const maxVes = Math.min(200000, Math.floor(fundingUsdt * price));
    if (maxVes < 25000) throw new Error('El saldo en Fondos no cubre el mínimo de 25.000 VES para este anuncio.');
    const payload = { asset: 'USDT', classify: 'mass', tradeType: 'SELL', fiatUnit: 'VES', priceType: 1, price, initAmount: Number(fundingUsdt.toFixed(8)), minSingleTransAmount: 25000, maxSingleTransAmount: maxVes, payTimeLimit: 15, buyerKycLimit: 1, buyerRegDaysLimit: 60, remarks: P2P_AD_TERMS, autoReplyMsg: P2P_AD_TERMS, tradeMethods: [{ payId: C2C_BDV_PAY_ID, payType: 'BancoDeVenezuela', identifier: 'BancoDeVenezuela' }], onlineNow: false, onlineDelayTime: 0, saveAsTemplate: 0 };
    let advNo = '';
    let response;
    if (existingAd) {
      advNo = String(existingAd.advNo || existingAd.adv?.advNo || '');
      if (!advNo) throw new Error('Binance devolvió un anuncio existente sin advNo.');
      await signedBinanceJsonRequest('POST', '/sapi/v1/c2c/ads/updateStatus', { advNos: [advNo], advStatus: 3 });
      response = await signedBinanceJsonRequest('POST', '/sapi/v1/c2c/ads/update', { ...payload, advNo, advStatus: 3 });
    } else {
      response = await signedBinanceJsonRequest('POST', '/sapi/v1/c2c/ads/post', payload);
      advNo = typeof response?.data === 'string' ? response.data : response?.data?.advNo || '';
    }
    const result = { advNo, price, fundingUsdt: payload.initAmount, maxVes, referenceIndex: index, status: 'offline', mode: existingAd ? 'updated' : 'created' };
    await markAction(actionRef, { status: 'succeeded', completedAt: admin.firestore.FieldValue.serverTimestamp(), processorHost: WORKER_HOST, result, resultSummary: `Anuncio USDT/VES ${existingAd ? 'actualizado' : 'creado'} offline (${advNo || 'sin advNo'}).` });
    const wholesalePurchaseId = String(actionData?.payload?.wholesalePurchaseId || '');
    if (wholesalePurchaseId) {
      await db.collection('wholesale_purchases').doc(wholesalePurchaseId).set({
        offlineAdStatus: 'published_offline',
        offlineAdNumber: advNo,
        offlineAdPublishedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await updateRuntime(runtimeRef, { status: 'idle', sessionState: 'offline_ad_created', currentActionId: '', lastError: '', lastActionId: actionRef.id, lastActionStatus: 'succeeded', lastActionSummary: `Anuncio offline ${advNo || 'creado'}.` });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 4000);
    await markAction(actionRef, { status: 'failed', completedAt: admin.firestore.FieldValue.serverTimestamp(), processorHost: WORKER_HOST, errorMessage: message });
    const wholesalePurchaseId = String(actionData?.payload?.wholesalePurchaseId || '');
    if (wholesalePurchaseId) {
      await db.collection('wholesale_purchases').doc(wholesalePurchaseId).set({
        offlineAdStatus: 'failed',
        offlineAdError: message,
        offlineAdFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await updateRuntime(runtimeRef, { status: 'idle', sessionState: 'error', currentActionId: '', lastError: message, lastActionId: actionRef.id, lastActionStatus: 'failed' });
  }
}

async function runPrepareSell(actionRef, actionData, runtimeRef) {
  const payload = actionData.payload || {};
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['tsx', 'src/index.ts', 'prepare-order-cdp'];
  const env = {
    ...process.env,
    BINANCE_P2P_PREPARE_AMOUNT: String(payload.amount || ''),
    BINANCE_P2P_PREPARE_AMOUNT_MODE: payload.amountMode === 'asset' ? 'asset' : 'fiat',
    BINANCE_P2P_PREPARE_ADVERTISER: String(payload.advertiser || ''),
    BINANCE_P2P_PREPARE_ROW_INDEX: String(payload.rowIndex || 0),
  };

  await updateRuntime(runtimeRef, {
    status: 'running',
    sessionState: 'preparing_order',
    currentActionId: actionRef.id,
    lastError: '',
  });

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: BOT_DIR,
      env,
      timeout: ACTION_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });

    const artifactPath = await findLatestPrepareArtifact();
    const result = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    const resultSummary = buildPrepareSummary(result);

    await markAction(actionRef, {
      status: 'succeeded',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: WORKER_HOST,
      resultSummary,
      result,
      stdout: stdout.slice(-4000),
      stderr: stderr.slice(-4000),
    });

    await updateRuntime(runtimeRef, {
      status: 'idle',
      sessionState: 'preorder_ready',
      currentActionId: '',
      lastPreparedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: '',
      lastActionId: actionRef.id,
      lastActionStatus: 'succeeded',
      lastActionSummary: resultSummary,
    });
  } catch (error) {
    const message = error?.stderr || error?.stdout || error?.message || 'Fallo desconocido ejecutando prepare-order-cdp.';
    await markAction(actionRef, {
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: WORKER_HOST,
      errorMessage: String(message).slice(0, 4000),
    });

    await updateRuntime(runtimeRef, {
      status: 'idle',
      sessionState: 'error',
      currentActionId: '',
      lastError: String(message).slice(0, 4000),
      lastActionId: actionRef.id,
      lastActionStatus: 'failed',
    });
  }
}

// Acciones atascadas en 'running' (worker muerto a mitad de ejecucion) bloquean
// la cola para siempre porque el callable rechaza crear nuevas mientras exista
// una running: reclamarlas como failed permite continuar.
async function gcStaleRunningActions(db) {
  const staleCutoffMs = Math.max(ACTION_TIMEOUT_MS * 1.5, 5 * 60 * 1000);
  const snapshot = await db.collection('binance_p2p_actions')
    .where('status', '==', 'running')
    .limit(10)
    .get();
  const stale = snapshot.docs.filter((docSnap) => {
    const d = docSnap.data() || {};
    const startedMs = d.startedAt?.toMillis?.() || d.createdAt?.toMillis?.() || 0;
    return startedMs > 0 && Date.now() - startedMs > staleCutoffMs;
  });
  for (const docSnap of stale) {
    console.warn(`[binance-p2p-worker] accion ${docSnap.id} stale en running: marcando failed`);
    await markAction(docSnap.ref, {
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: WORKER_HOST,
      errorMessage: `Accion marcada stale tras ${Math.round(staleCutoffMs / 1000)}s sin cierre (probable reinicio del worker a mitad de ejecucion).`,
    });
  }
  return stale.length;
}

async function processNextAction(db, runtimeRef) {
  const snapshot = await db.collection('binance_p2p_actions')
    .where('status', '==', 'pending')
    .limit(10)
    .get();

  if (snapshot.empty) {
    return false;
  }

  // Sorting locally avoids a composite Firestore index (status + requestedAt)
  // and keeps the oldest pending request first.
  const actionDoc = [...snapshot.docs].sort((a, b) => {
    const aMs = a.data()?.requestedAt?.toMillis?.() || 0;
    const bMs = b.data()?.requestedAt?.toMillis?.() || 0;
    return aMs - bMs;
  })[0];
  const actionData = actionDoc.data() || {};
  const actionRef = actionDoc.ref;

  // Reclamo transaccional: si otra instancia del worker tomo la accion, la
  // re-lectura dentro de la transaccion ve status != 'pending' y la salta.
  const claimed = await admin.firestore().runTransaction(async (tx) => {
    const fresh = await tx.get(actionRef);
    if (!fresh.exists || fresh.data()?.status !== 'pending') return false;
    tx.set(actionRef, {
      status: 'running',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: WORKER_HOST,
    }, { merge: true });
    return true;
  });
  if (!claimed) return false;

  if (actionData.actionType === 'heartbeat') {
    await updateRuntime(runtimeRef, {
      status: 'idle',
      sessionState: 'ready',
      currentActionId: '',
      lastError: '',
      lastActionId: actionDoc.id,
      lastActionStatus: 'succeeded',
      lastActionSummary: 'Heartbeat manual ejecutado desde la app admin.',
    });

    await markAction(actionRef, {
      status: 'succeeded',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processorHost: WORKER_HOST,
      resultSummary: 'Heartbeat del VPS actualizado correctamente.',
    });

    return true;
  }

  if (actionData.actionType === 'prepare_sell') {
    await runPrepareSell(actionRef, actionData, runtimeRef);
    return true;
  }

  if (actionData.actionType === 'publish_offline_ad' || actionData.actionType === 'retry_publish_offline_ad') {
    await runPublishOfflineAd(db, actionRef, runtimeRef, actionData);
    return true;
  }

  await markAction(actionRef, {
    status: 'failed',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    processorHost: WORKER_HOST,
    errorMessage: `Acción no soportada por el worker: ${actionData.actionType || 'desconocida'}`,
  });

  await updateRuntime(runtimeRef, {
    status: 'idle',
    sessionState: 'error',
    currentActionId: '',
    lastError: `Acción no soportada por el worker: ${actionData.actionType || 'desconocida'}`,
  });

  return true;
}

async function main() {
  initFirebaseAdmin();
  const db = admin.firestore();
  const runtimeRef = db.collection('binance_p2p_runtime').doc('session');
  let lastWholesaleScanAt = 0;

  // Heartbeat cada ~30s en vez de cada ciclo de poll (5s): escribir el runtime
  // en cada iteracion generaba ~17.000 writes/dia. El poll de acciones sigue
  // cada ciclo; solo el write de heartbeat se espacia.
  const HEARTBEAT_MS = Number(process.env.BINANCE_P2P_WORKER_HEARTBEAT_MS || 30000);
  let lastHeartbeatAt = 0;

  console.log(`[binance-p2p-worker] online on ${WORKER_HOST}`);

  while (true) {
    try {
      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
        lastHeartbeatAt = Date.now();
        await updateRuntime(runtimeRef, {
          status: 'idle',
          sessionState: 'ready',
          lastError: '',
        });
      }
      await gcStaleRunningActions(db);
      await processNextAction(db, runtimeRef);
      if (Date.now() - lastWholesaleScanAt >= WHOLESALE_SCAN_MS) {
        lastWholesaleScanAt = Date.now();
        await processLatestWholesalePurchase(db);
      }
    } catch (error) {
      const message = error?.message || String(error);
      console.error('[binance-p2p-worker] loop error:', message);
      await updateRuntime(runtimeRef, {
        status: 'idle',
        sessionState: 'error',
        lastError: String(message).slice(0, 4000),
      }).catch(() => undefined);
    }

    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error('[binance-p2p-worker] fatal error:', error?.message || error);
  process.exit(1);
});
