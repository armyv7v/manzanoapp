require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const admin = require('firebase-admin');

const execFileAsync = promisify(execFile);

const POLL_MS = Number(process.env.BINANCE_P2P_WORKER_POLL_MS || 5000);
const ACTION_TIMEOUT_MS = Number(process.env.BINANCE_P2P_ACTION_TIMEOUT_MS || 180000);
const WORKER_HOST = process.env.BINANCE_P2P_WORKER_NAME || os.hostname();
const REPO_ROOT = process.env.BINANCE_P2P_REPO_ROOT || path.resolve(__dirname, '..');
const BOT_DIR = process.env.BINANCE_P2P_BOT_DIR || path.join(REPO_ROOT, 'binance-p2p-bot');
const ARTIFACTS_DIR = path.join(BOT_DIR, 'artifacts');

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

async function processNextAction(db, runtimeRef) {
  const snapshot = await db.collection('binance_p2p_actions')
    .where('status', '==', 'pending')
    .orderBy('requestedAt', 'asc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return false;
  }

  const actionDoc = snapshot.docs[0];
  const actionData = actionDoc.data() || {};
  const actionRef = actionDoc.ref;

  await markAction(actionRef, {
    status: 'running',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    processorHost: WORKER_HOST,
  });

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

  console.log(`[binance-p2p-worker] online on ${WORKER_HOST}`);

  while (true) {
    try {
      await updateRuntime(runtimeRef, {
        status: 'idle',
        sessionState: 'ready',
      });
      await processNextAction(db, runtimeRef);
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
