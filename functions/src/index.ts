import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();

const brevoApiKey = defineSecret("BREVO_API_KEY");
const SUPER_ADMIN_EMAIL = "enderjpinar@gmail.com";
const CLP_ADMIN_TAGS = new Set(["A1", "A2"]);
const VES_ADMIN_TAGS = new Set(["A3", "A4", "A5"]);
const USER_TAGS: Record<string, string> = {
  "enderjpinar@gmail.com": "A1",
  "namv2210@gmail.com": "A2",
  "emmaquintero511@gmail.com": "A3",
  "yvettepierina@gmail.com": "A4",
  "loistoda@gmail.com": "A5",
  "stalinread117@gmail.com": "V1",
  "beaguiar2405@gmail.com": "V2",
  "myanirethsg@gmail.com": "V3",
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUp2(value: number): number {
  return Math.ceil(value * 100) / 100;
}

function resolveUserTag(raw: string): string {
  const normalized = (raw || "").trim();
  if (!normalized) return "";

  const mapped = USER_TAGS[normalized.toLowerCase()];
  if (mapped) return mapped;

  const asTag = normalized.toUpperCase();
  return /^[AV]\d+$/.test(asTag) ? asTag : "";
}

function isSuperAdminEmail(raw: string | null | undefined): boolean {
  return (raw || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

const BINANCE_P2P_ALLOWED_ACTIONS = new Set([
  "prepare_sell",
  "heartbeat",
]);

type BinanceP2PActionPayload = {
  amount?: string;
  amountMode?: "fiat" | "asset";
  advertiser?: string;
  rowIndex?: number;
};

function assertSuperAdmin(request: Parameters<typeof onCall>[0] extends never ? never : any): { uid: string; email: string } {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesion para usar el panel Binance P2P.");
  }

  const email = typeof request.auth.token.email === "string" ? request.auth.token.email.trim().toLowerCase() : "";
  if (request.auth.token.admin !== true || !isSuperAdminEmail(email)) {
    throw new HttpsError("permission-denied", "Solo el super admin autorizado puede operar Binance P2P.");
  }

  return {
    uid: request.auth.uid,
    email,
  };
}

function sanitizeBinanceP2PActionPayload(actionType: string, raw: Record<string, unknown>): BinanceP2PActionPayload {
  if (actionType === "heartbeat") {
    return {};
  }

  const amount = typeof raw.amount === "string" ? raw.amount.trim() : "";
  if (!amount) {
    throw new HttpsError("invalid-argument", "Debes indicar un monto para preparar la venta.");
  }

  const amountMode = raw.amountMode === "asset" ? "asset" : "fiat";
  const advertiser = typeof raw.advertiser === "string" ? raw.advertiser.trim().slice(0, 120) : "";
  const rawRowIndex = typeof raw.rowIndex === "number" ? raw.rowIndex : Number(raw.rowIndex || 0);
  const rowIndex = Number.isFinite(rawRowIndex) && rawRowIndex >= 0 ? Math.floor(rawRowIndex) : 0;

  return {
    amount,
    amountMode,
    advertiser: advertiser || undefined,
    rowIndex,
  };
}

function buildPaidOrderFinancials(orderData: Record<string, any>) {
  const baseAmount = Number(orderData.destinationAmount || 0);
  const appliedFee = Number(orderData.bankFee || 0);
  const adminCommissionVes = Number(orderData.adminCommission || 0);
  const tilloCommissionVes = Number(orderData.tilloCommission || 0);
  const sellerCommissionAmountVES = Number(orderData.sellerCommissionAmountVES || 0);
  const orderCLPAmount = Number(orderData.clpAmount || 0);
  const sellerId = typeof orderData.sellerId === "string" ? orderData.sellerId.trim() : "";
  const sellerEmailFromOrder = typeof orderData.sellerEmail === "string" ? orderData.sellerEmail.trim() : "";
  const createdByTagEmail = typeof orderData.createdByTag === "string" ? orderData.createdByTag.trim() : "";
  const sellerEmail = sellerEmailFromOrder || createdByTagEmail;
  const sellerTag = resolveUserTag(sellerEmail || createdByTagEmail);
  const rawSellerRate = Number(orderData.sellerCommissionRate || orderData.commissionRate || 0);
  const sellerCommissionRate = Number.isFinite(rawSellerRate) ? rawSellerRate : 0;
  const useVesCommission = VES_ADMIN_TAGS.has(sellerTag);
  const useClpCommission = CLP_ADMIN_TAGS.has(sellerTag) || sellerTag.startsWith("V");
  const sellerCommissionAmountCLP = Number(orderData.sellerCommissionAmountCLP || (
    useClpCommission && sellerCommissionRate > 0 && orderCLPAmount > 0
      ? roundUp2(orderCLPAmount * sellerCommissionRate)
      : 0
  ));
  const computedSellerCommissionAmountVES = useVesCommission && sellerCommissionRate > 0 && baseAmount > 0
    ? roundUp2(baseAmount * sellerCommissionRate)
    : 0;
  const totalCommissionVes = adminCommissionVes + tilloCommissionVes;
  const totalDebitVes = baseAmount + appliedFee + totalCommissionVes;
  const totalDebitVesWithSellerCommission = totalDebitVes + (sellerCommissionAmountVES || computedSellerCommissionAmountVES);

  return {
    baseAmount,
    appliedFee,
    adminCommissionVes,
    tilloCommissionVes,
    sellerCommissionAmountVES: sellerCommissionAmountVES || computedSellerCommissionAmountVES,
    sellerCommissionAmountCLP,
    orderCLPAmount,
    sellerId,
    sellerEmail,
    sellerTag,
    sellerCommissionRate,
    totalDebitVes,
    totalDebitVesWithSellerCommission,
  };
}

type SyncUserProfileParams = {
  uid: string;
  email?: string | null;
  isAdmin?: boolean;
  isSeller?: boolean;
  platform?: string | null;
};

async function syncUserProfileDoc(params: SyncUserProfileParams): Promise<void> {
  const {
    uid,
    email,
    isAdmin = false,
    isSeller = false,
    platform,
  } = params;

  const payload: Record<string, unknown> = {
    email: email || "",
    isAdmin,
    isSeller,
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (platform) {
    payload.platform = platform;
  }

  await admin.firestore().collection("users").doc(uid).set(payload, { merge: true });
}

// ─── Email helpers ─────────────────────────────────────────────────────────────

function buildOrderConfirmationHtml(params: {
  clientName: string;
  vesAmount: string;
  clpAmount: string;
  bank: string;
  orderType: string;
  orderId: string;
  proofsHtml: string;
}): string {
  const { clientName, vesAmount, clpAmount, bank, orderType, orderId, proofsHtml } = params;
  const orderRef = orderId.slice(-6).toUpperCase();
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #8cb33e; padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .body { padding: 28px 32px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { font-weight: bold; color: #222; }
    .badge { display: inline-block; background: #e6f4d7; color: #4a7c15; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .proofs { margin-top: 24px; padding: 16px; background: #fdfdfd; border: 1px dashed #d9d9d9; border-radius: 8px; text-align: center; font-size: 14px; }
    .proof-btn { display: inline-block; margin: 6px; padding: 8px 16px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 6px; font-weight: bold; border: 1px solid #e0e0e0; }
    .proof-btn:hover { background: #e8e8e8; }
    .footer { background: #f9f9f9; padding: 16px 32px; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>✅ Pedido Procesado</h1></div>
    <div class="body">
      <p>Hola <strong>${clientName}</strong>,</p>
      <p>Tu pedido en <strong>Cambios Manzano</strong> ha sido procesado y pagado exitosamente.</p>
      <div class="row"><span class="label">Número de pedido</span><span class="value">#${orderRef}</span></div>
      <div class="row"><span class="label">Monto enviado</span><span class="value">${vesAmount} VES</span></div>
      <div class="row"><span class="label">Monto CLP</span><span class="value">${clpAmount} CLP</span></div>
      <div class="row"><span class="label">Banco / Servicio</span><span class="value">${bank || 'N/A'}</span></div>
      <div class="row"><span class="label">Tipo de operación</span><span class="value">${orderType}</span></div>
      <div class="row"><span class="label">Estado</span><span class="value"><span class="badge">Pagado</span></span></div>
      ${proofsHtml}
    </div>
    <div class="footer">Gracias por confiar en Cambios Manzano &bull; Este es un correo automático, por favor no respondas.</div>
  </div>
</body>
</html>`;
}

async function sendOrderConfirmation(apiKey: string, orderId: string, orderData: Record<string, any>): Promise<void> {
  const clientEmail = typeof orderData.email === "string" ? orderData.email.trim() : "";
  if (!clientEmail) {
    logger.info("No client email in order, skipping confirmation email", { orderId });
    return;
  }

  const clientName = orderData.clientName || orderData.name || "Cliente";
  const vesAmount = (orderData.destinationAmount || orderData.vesAmount || 0)
    .toLocaleString("es-VE", { minimumFractionDigits: 2 });
  const clpAmount = (orderData.clpAmount || 0)
    .toLocaleString("es-CL", { minimumFractionDigits: 0 });
  const bank = orderData.bank || "";
  const orderType = orderData.type || "transferencia";

  const proofUrls: string[] = Array.isArray(orderData.proofUrls) ? orderData.proofUrls : (orderData.proofUrl ? [orderData.proofUrl] : []);
  const attachments: { name: string, content: string }[] = [];

  if (proofUrls.length > 0) {
    for (let i = 0; i < proofUrls.length; i++) {
      try {
        const url = proofUrls[i];
        const res = await fetch(url);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const base64Content = Buffer.from(buffer).toString('base64');
          const ext = url.toLowerCase().includes('.png') ? 'png' : (url.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg');
          attachments.push({
            name: `comprobante_${i + 1}.${ext}`,
            content: base64Content
          });
        }
      } catch (err) {
        logger.error("Failed downloading proof attachment for email", { orderId, url: proofUrls[i], err });
      }
    }
  }

  const htmlContent = buildOrderConfirmationHtml({ clientName, vesAmount, clpAmount, bank, orderType, orderId, proofsHtml: '' });

  const payload: any = {
    sender: { name: "Cambios Manzano", email: "cmanzanospa@gmail.com" },
    to: [{ email: clientEmail, name: clientName }],
    subject: `✅ Tu pedido en Cambios Manzano ha sido procesado`,
    htmlContent,
  };

  if (attachments.length > 0) {
    payload.attachment = attachments;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const db = admin.firestore();
    const orderRef = db.collection('orders').doc(orderId);

    if (!res.ok) {
      const errText = await res.text();
      logger.error("Brevo email API error", { orderId, status: res.status, error: errText });
      await orderRef.update({
        emailSent: false,
        emailError: `API Status ${res.status}: ${errText.substring(0, 500)}`,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    await orderRef.update({
      emailSent: true,
      emailError: null,
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("Order confirmation email sent via Brevo with attachments", { orderId, email: clientEmail, attachments: attachments.length });
  } catch (err: any) {
    logger.error("Email processing failed", { orderId, err: err.message });
    const db = admin.firestore();
    await db.collection('orders').doc(orderId).update({
      emailSent: false,
      emailError: err.message || 'Unknown network error',
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(e => logger.error("Failed updating order with email error", { orderId, err: e.message }));
  }
}

async function syncDynamicClpBalance(reason: string): Promise<void> {
  const db = admin.firestore();
  const rateRef = db.collection("config").doc("rate");

  const [rateSnap, accountsSnap] = await Promise.all([
    rateRef.get(),
    db.collection("accounts").get(),
  ]);

  if (!rateSnap.exists) {
    logger.warn("config/rate does not exist, skipping CLP balance sync", { reason });
    return;
  }

  const rateData = rateSnap.data() || {};
  const purchaseRateVES = Number(rateData.purchaseRateVES || 0);
  const currentTotalClpBalance = Number(rateData.totalClpBalance || 0);

  let totalVesBalance = 0;
  accountsSnap.forEach((accountDoc) => {
    totalVesBalance += Number(accountDoc.data()?.balance || 0);
  });
  totalVesBalance = round2(totalVesBalance);

  const computedTotalClpBalance = purchaseRateVES > 0
    ? round2(totalVesBalance / purchaseRateVES)
    : 0;

  const shouldUpdate = Math.abs(currentTotalClpBalance - computedTotalClpBalance) > 0.005;
  if (!shouldUpdate) return;

  await rateRef.set({
    totalClpBalance: computedTotalClpBalance,
    totalVesBalance,
    clpBalanceMode: "dynamic_ves_div_purchaseRateVES",
    clpBalanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("CLP balance synchronized from VES balance", {
    reason,
    purchaseRateVES,
    totalVesBalance,
    currentTotalClpBalance,
    computedTotalClpBalance,
  });
}

/**
 * Keeps config/rate.totalClpBalance aligned with:
 * total VES in accounts / purchaseRateVES.
 */
export const syncClpBalanceFromAccounts = onDocumentWritten("accounts/{accountId}", async (event) => {
  await syncDynamicClpBalance(`accounts/${event.params.accountId}`);
  return null;
});

/**
 * Recompute CLP balance whenever purchaseRateVES changes.
 */
export const syncClpBalanceFromRate = onDocumentUpdated("config/rate", async (event) => {
  const beforeRate = Number(event.data?.before.data()?.purchaseRateVES || 0);
  const afterRate = Number(event.data?.after.data()?.purchaseRateVES || 0);
  if (beforeRate === afterRate) return null;

  await syncDynamicClpBalance("config/rate.purchaseRateVES");
  return null;
});

function collectTokensFromUser(data: any): string[] {
  const tokens = new Set<string>();

  // Preferred source: one token per registered device.
  if (data?.fcmDeviceTokens && typeof data.fcmDeviceTokens === "object") {
    Object.values(data.fcmDeviceTokens).forEach((entry: any) => {
      const token = entry?.token;
      if (typeof token === "string" && token.trim()) tokens.add(token);
    });
  }

  // If the new device map exists, trust it and ignore legacy fields.
  if (tokens.size > 0) {
    return Array.from(tokens);
  }

  // Backward compatibility: one token per platform.
  const webToken = data?.fcmPlatformTokens?.web?.token;
  const nativeToken = data?.fcmPlatformTokens?.native?.token;
  if (typeof webToken === "string" && webToken.trim()) tokens.add(webToken);
  if (typeof nativeToken === "string" && nativeToken.trim()) tokens.add(nativeToken);

  // Legacy fields.
  if (typeof data?.fcmToken === "string" && data.fcmToken.trim()) tokens.add(data.fcmToken);
  if (Array.isArray(data?.fcmTokens)) {
    data.fcmTokens.forEach((t: unknown) => {
      if (typeof t === "string" && t.trim()) tokens.add(t);
    });
  }

  return Array.from(tokens);
}

/**
 * A simple placeholder function to ensure deployment works.
 */
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase! Your functions are deploying correctly.");
});

/**
 * Ensures the authenticated user has a Firestore profile doc managed by backend.
 */
export const ensureUserProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesion para sincronizar tu perfil.");
  }

  const platform = typeof request.data?.platform === "string" ? request.data.platform : null;

  await syncUserProfileDoc({
    uid: request.auth.uid,
    email: request.auth.token.email,
    isAdmin: request.auth.token.admin === true,
    isSeller: request.auth.token.seller === true,
    platform,
  });

  logger.info("Ensured Firestore profile from callable", {
    uid: request.auth.uid,
    platform,
    isAdmin: request.auth.token.admin === true,
    isSeller: request.auth.token.seller === true,
  });

  return { success: true };
});

/**
 * Test function to verify a specific user's tokens
 */
export const testPushNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in to test push.");
  }

  const uid = request.auth.uid;
  logger.info(`Test push requested by ${uid}`);

  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (!userDoc.exists) return { success: false, message: 'User not found' };

    const tokens = collectTokensFromUser(userDoc.data());
    if (tokens.length === 0) return { success: false, message: 'No tokens found for user' };

    logger.info(`Found ${tokens.length} tokens for user ${uid}`, { tokens });

    const response = await sendMulticastWithCleanup({
      tokens,
      notification: {
        title: "Test de Notificación Manzano",
        body: `¡Si lees esto, las notificaciones PWA están funcionando! (Tokens probados: ${tokens.length})`,
      },
      data: { type: "test" },
      webpush: {
        notification: {
          title: "Test de Notificación Manzano",
          body: `¡Si lees esto, las notificaciones PWA están funcionando! (Tokens probados: ${tokens.length})`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    });

    return {
      success: true,
      tokensFound: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      details: response.responses.map((r, i) => ({
        token: tokens[i].substring(0, 15) + '...',
        success: r.success,
        error: r.error ? JSON.stringify(r.error) : null
      }))
    };
  } catch (error: any) {
    logger.error("Error in test push", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Creates a Binance P2P action request to be consumed by the VPS worker.
 */
export const requestBinanceP2PAction = onCall(async (request) => {
  const actor = assertSuperAdmin(request);
  const actionType = typeof request.data?.actionType === "string" ? request.data.actionType.trim() : "";

  if (!BINANCE_P2P_ALLOWED_ACTIONS.has(actionType)) {
    throw new HttpsError("invalid-argument", "Tipo de accion Binance P2P no soportado.");
  }

  const db = admin.firestore();
  const activeActionSnapshot = await db.collection("binance_p2p_actions")
    .where("status", "in", ["pending", "running"])
    .limit(1)
    .get();

  if (!activeActionSnapshot.empty) {
    const activeAction = activeActionSnapshot.docs[0];
    throw new HttpsError(
      "failed-precondition",
      `Ya existe una accion Binance P2P activa (${activeAction.id}). Espera a que termine antes de crear otra.`,
    );
  }

  const payload = sanitizeBinanceP2PActionPayload(actionType, request.data || {});
  const actionRef = await db.collection("binance_p2p_actions").add({
    actionType,
    status: "pending",
    requestedBy: actor.uid,
    requestedByEmail: actor.email,
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "manzano-admin-app",
    payload,
    runtimeHints: {
      requiresLocalPc: false,
      approvalChannel: "manzano-app",
      sessionHost: "vps",
    },
  });

  logger.info("Binance P2P action requested", {
    actionId: actionRef.id,
    actionType,
    requestedBy: actor.uid,
    requestedByEmail: actor.email,
    payload,
  });

  return {
    success: true,
    actionId: actionRef.id,
    status: "pending",
  };
});

/**
 * Cancels a pending Binance P2P action before the VPS worker starts it.
 */
export const cancelBinanceP2PAction = onCall(async (request) => {
  assertSuperAdmin(request);

  const actionId = typeof request.data?.actionId === "string" ? request.data.actionId.trim() : "";
  if (!actionId) {
    throw new HttpsError("invalid-argument", "Debes indicar el actionId a cancelar.");
  }

  const actionRef = admin.firestore().collection("binance_p2p_actions").doc(actionId);
  const actionSnap = await actionRef.get();
  if (!actionSnap.exists) {
    throw new HttpsError("not-found", "La accion Binance P2P indicada no existe.");
  }

  const actionData = actionSnap.data() || {};
  if (actionData.status !== "pending") {
    throw new HttpsError("failed-precondition", "Solo puedes cancelar acciones Binance P2P que aun esten pendientes.");
  }

  await actionRef.set({
    status: "cancelled",
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("Binance P2P action cancelled", { actionId });
  return { success: true, actionId, status: "cancelled" };
});

/**
 * Sets a custom claim for a user to make them an admin.
 */
export const setAdminClaim = onCall(async (request) => {
  if (request.auth?.token?.admin !== true) {
    logger.warn(`Non-admin user ${request.auth?.uid || "unauthenticated"} tried to set admin claim.`);
    throw new HttpsError("permission-denied", "Only admins can set other admins.");
  }

  const email = request.data.email;
  if (!email) {
    throw new HttpsError("invalid-argument", "The function must be called with an 'email' argument.");
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    logger.info(`Successfully made ${email} an admin.`);
    return { message: `Success! ${email} has been made an admin.` };
  } catch (error: any) {
    logger.error("Error setting custom claim:", { email, error: error.message });
    throw new HttpsError("internal", "An internal error occurred while setting the admin claim.");
  }
});

/**
 * Validates a native Firebase Auth token and returns a custom token for Web SDK.
 */
export const validateAndSignIn = onCall(async (request) => {
  const { nativeToken } = request.data;
  if (!nativeToken) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'nativeToken' argument.");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(nativeToken);
    logger.info(`Token validated for user: ${decodedToken.uid}`);

    const customClaims: any = {};
    if (decodedToken.admin) customClaims.admin = true;
    if (decodedToken.seller) customClaims.seller = true;
    if (decodedToken.requiresProof) customClaims.requiresProof = true;
    if (decodedToken.commissionRate) customClaims.commissionRate = decodedToken.commissionRate;

    const customToken = await admin.auth().createCustomToken(decodedToken.uid, customClaims);
    logger.info(`Custom token created for user: ${decodedToken.uid}`, { claims: customClaims });

    return {
      customToken,
      uid: decodedToken.uid,
      claims: customClaims
    };
  } catch (error: any) {
    logger.error("Error validating native token:", { error: error.message });
    throw new HttpsError("unauthenticated", "Invalid or expired token.");
  }
});

/**
 * Manually resend confirmation email for a paid order.
 */
export const resendOrderEmail = onCall({ secrets: [brevoApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  // Permiso: Admin o el vendedor del pedido? Por ahora simplificamos a Admin o Seller.
  // Pero lo mas seguro es admins solo para este debug.
  const isAdmin = request.auth.token.admin === true;
  const isSeller = request.auth.token.seller === true;
  if (!isAdmin && !isSeller) {
    throw new HttpsError("permission-denied", "No tienes permisos para esta acción.");
  }

  const { orderId } = request.data;
  if (!orderId) {
    throw new HttpsError("invalid-argument", "Falta ID del pedido.");
  }

  const orderDoc = await admin.firestore().collection("orders").doc(orderId).get();
  if (!orderDoc.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
  }

  const orderData = orderDoc.data()!;
  if (orderData.status !== "Pagado") {
    throw new HttpsError("failed-precondition", "Solo se envían correos para pedidos pagados.");
  }

  if (!orderData.email) {
    throw new HttpsError("failed-precondition", "El pedido no tiene un correo válido.");
  }

  const key = brevoApiKey.value();
  if (!key) {
    throw new HttpsError("failed-precondition", "BREVO_API_KEY no configurado.");
  }

  try {
    await sendOrderConfirmation(key, orderId, orderData);
    return { success: true, message: "Correo enviado exitosamente." };
  } catch (error: any) {
    throw new HttpsError("internal", error.message || "Error al enviar el correo.");
  }
});

/**
 * Void a paid order and reverse all accounting movements.
 */
export const voidPaidOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Solo los administradores pueden anular pedidos pagados.");
  }

  if (!isSuperAdminEmail(request.auth.token.email)) {
    throw new HttpsError("permission-denied", `Solo ${SUPER_ADMIN_EMAIL} puede anular pedidos pagados.`);
  }

  const orderId = typeof request.data?.orderId === "string" ? request.data.orderId.trim() : "";
  const overrideSourceAccountId = typeof request.data?.sourceAccountId === "string"
    ? request.data.sourceAccountId.trim()
    : "";
  if (!orderId) {
    throw new HttpsError("invalid-argument", "Falta ID del pedido.");
  }

  const db = admin.firestore();

  try {
    await db.runTransaction(async (transaction) => {
      const orderRef = db.collection("orders").doc(orderId);
      const rateRef = db.collection("config").doc("rate");

      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        throw new HttpsError("not-found", "El pedido no existe.");
      }

      const orderData = orderDoc.data() || {};
      if (orderData.status === "Cancelado") {
        throw new HttpsError("failed-precondition", "El pedido ya estaba cancelado.");
      }

      if (orderData.status !== "Pagado") {
        throw new HttpsError("failed-precondition", "Solo se pueden anular pedidos pagados desde esta operación segura.");
      }

      const storedSourceAccountId = typeof orderData.sourceAccountId === "string" ? orderData.sourceAccountId.trim() : "";
      const sourceAccountId = storedSourceAccountId || overrideSourceAccountId;
      const sourceAccountBank = typeof orderData.sourceAccountBank === "string" ? orderData.sourceAccountBank.trim() : "";
      const sourceAccountHolder = typeof orderData.sourceAccountHolder === "string" ? orderData.sourceAccountHolder.trim() : "";
      if (!sourceAccountId) {
        throw new HttpsError("failed-precondition", "Este pedido fue pagado sin registrar la cuenta origen. No se puede anular automaticamente.");
      }

      const accountRef = db.collection("accounts").doc(sourceAccountId);
      const rateDoc = await transaction.get(rateRef);
      const accountDoc = await transaction.get(accountRef);

      if (!accountDoc.exists) {
        throw new HttpsError("failed-precondition", "La cuenta origen registrada ya no existe.");
      }

      const financials = buildPaidOrderFinancials(orderData);
      const purchaseRateVESUsed = Number(rateDoc.data()?.purchaseRateVES || 0);
      const totalDebitClp = purchaseRateVESUsed > 0
        ? roundUp2(financials.totalDebitVes / purchaseRateVESUsed)
        : 0;
      const ts = admin.firestore.FieldValue.serverTimestamp();

      transaction.update(orderRef, {
        status: "Cancelado",
        cancelledAt: ts,
        cancelledBy: request.auth?.token?.email || "ADMIN",
        voidedAt: ts,
        voidedBy: request.auth?.token?.email || "ADMIN",
        sourceAccountId,
        sourceAccountBank: sourceAccountBank || accountDoc.data()?.bank || "",
        sourceAccountHolder: sourceAccountHolder || accountDoc.data()?.holder || "",
        reversalCompleted: true,
      });

      if (totalDebitClp > 0) {
        const clpHistoryRef = db.collection("clp_balance_history").doc();
        const note = `Reversion anulacion pedido ${orderId.slice(-5)} (Retorno de VES)`;
        transaction.set(clpHistoryRef, {
          amount: totalDebitClp,
          type: "add",
          note,
          description: note,
          purchaseRateVESUsed,
          vesAmountAtCalc: financials.totalDebitVes,
          clpAmountComputed: totalDebitClp,
          timestamp: ts,
          createdAt: ts,
          orderId,
          createdBy: request.auth?.token?.email || "ADMIN",
          adminTag: "ADMIN",
          bank: orderData.bank || "",
          isReversal: true,
        });
      }

      transaction.update(accountRef, {
        balance: admin.firestore.FieldValue.increment(financials.totalDebitVesWithSellerCommission),
      });

      let runningBalance = Number(accountDoc.data()?.balance || 0);
      const holder = sourceAccountHolder || accountDoc.data()?.holder || sourceAccountBank || "Sin titular";
      const bank = sourceAccountBank || accountDoc.data()?.bank || orderData.bank || "Sin banco";

      const pushBalanceHistory = (amount: number, type: string, note: string) => {
        runningBalance += amount;
        transaction.set(db.collection("balance_history").doc(), {
          amount,
          type,
          note,
          timestamp: ts,
          orderId,
          accountId: sourceAccountId,
          holder,
          bank,
          balanceAfter: runningBalance,
        });
      };

      pushBalanceHistory(financials.baseAmount, "reversal_add", `Anulacion pedido ${orderId.slice(-5)} (${orderData.destinationCurrency || "VES"})`);

      if (financials.appliedFee > 0) {
        pushBalanceHistory(financials.appliedFee, "reversal_fee", `Reversion comision pedido ${orderId.slice(-5)}`);
      }

      if (financials.adminCommissionVes > 0) {
        pushBalanceHistory(financials.adminCommissionVes, "reversal_admin_commission", `Reversion Comision Admin pedido ${orderId.slice(-5)}`);
      }

      if (financials.tilloCommissionVes > 0) {
        pushBalanceHistory(financials.tilloCommissionVes, "reversal_tillo_commission", `Reversion Mano Tillo pedido ${orderId.slice(-5)}`);
      }

      if (financials.sellerCommissionAmountVES > 0) {
        pushBalanceHistory(financials.sellerCommissionAmountVES, "reversal_seller_commission", `Reversion Comision Venta ${financials.sellerTag || "ADMIN"} pedido ${orderId.slice(-5)}`);
      }

      if (financials.sellerEmail && financials.sellerCommissionAmountCLP > 0) {
        transaction.set(db.collection("seller_commissions").doc(), {
          sellerId: financials.sellerId || orderData.userId || "",
          sellerEmail: financials.sellerEmail,
          orderId,
          orderCLPAmount: -financials.orderCLPAmount,
          commissionRate: financials.sellerCommissionRate,
          commissionAmountCLP: -financials.sellerCommissionAmountCLP,
          commissionCurrency: "CLP",
          sellerTag: financials.sellerTag,
          timestamp: ts,
          createdAt: ts,
          createdBy: request.auth?.token?.email || "ADMIN",
          isReversal: true,
          reversalOfOrderId: orderId,
        });
      }
    });

    return { success: true };
  } catch (error: any) {
    logger.error("Error voiding paid order", { orderId, error: error?.message || error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error?.message || "No se pudo anular el pedido pagado.");
  }
});

/**
 * Helper to get all admin FCM tokens
 */
async function getAdminTokens(): Promise<string[]> {
  const adminsSnapshot = await admin.firestore()
    .collection("users")
    .where("isAdmin", "==", true)
    .get();

  const tokens = new Set<string>();
  adminsSnapshot.forEach(doc => {
    const data = doc.data();
    collectTokensFromUser(data).forEach((t) => tokens.add(t));
  });
  return Array.from(tokens);
}

/**
 * Helper to get all FCM tokens for a specific user ID
 */
async function getUserTokens(userId: string): Promise<string[]> {
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists) return [];

  const data = userDoc.data();
  return collectTokensFromUser(data);
}

/**
 * Helper to get all FCM tokens for a specific user email.
 */
async function getUserTokensByEmail(email: string): Promise<string[]> {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return [];

  const usersSnapshot = await admin.firestore()
    .collection("users")
    .where("email", "==", normalized)
    .limit(1)
    .get();

  if (usersSnapshot.empty) return [];
  const data = usersSnapshot.docs[0].data();
  return collectTokensFromUser(data);
}

async function pruneInvalidToken(token: string): Promise<void> {
  const usersRef = admin.firestore().collection("users");
  const [directTokenDocs, arrayTokenDocs] = await Promise.all([
    usersRef.where("fcmToken", "==", token).get(),
    usersRef.where("fcmTokens", "array-contains", token).get(),
  ]);

  const writeOps: Array<Promise<FirebaseFirestore.WriteResult>> = [];

  directTokenDocs.forEach((userDoc) => {
    const data = userDoc.data() || {};
    const updateData: Record<string, unknown> = {
      fcmToken: admin.firestore.FieldValue.delete(),
    };
    const platformTokens = (data as any).fcmPlatformTokens;
    if (platformTokens?.web?.token === token) {
      updateData["fcmPlatformTokens.web"] = admin.firestore.FieldValue.delete();
    }
    if (platformTokens?.native?.token === token) {
      updateData["fcmPlatformTokens.native"] = admin.firestore.FieldValue.delete();
    }
    const deviceTokens = (data as any).fcmDeviceTokens || {};
    Object.entries(deviceTokens).forEach(([deviceId, entry]: [string, any]) => {
      if (entry?.token === token) {
        updateData[`fcmDeviceTokens.${deviceId}`] = admin.firestore.FieldValue.delete();
      }
    });
    writeOps.push(userDoc.ref.update(updateData));
  });

  arrayTokenDocs.forEach((userDoc) => {
    const data = userDoc.data() || {};
    const updateData: Record<string, unknown> = {
      fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
    };
    const platformTokens = (data as any).fcmPlatformTokens;
    if (platformTokens?.web?.token === token) {
      updateData["fcmPlatformTokens.web"] = admin.firestore.FieldValue.delete();
    }
    if (platformTokens?.native?.token === token) {
      updateData["fcmPlatformTokens.native"] = admin.firestore.FieldValue.delete();
    }
    const deviceTokens = (data as any).fcmDeviceTokens || {};
    Object.entries(deviceTokens).forEach(([deviceId, entry]: [string, any]) => {
      if (entry?.token === token) {
        updateData[`fcmDeviceTokens.${deviceId}`] = admin.firestore.FieldValue.delete();
      }
    });
    writeOps.push(userDoc.ref.update(updateData));
  });

  if (writeOps.length > 0) {
    await Promise.all(writeOps);
  }
}

async function cleanupInvalidTokens(
  tokens: string[],
  responses: admin.messaging.SendResponse[],
): Promise<void> {
  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  const invalidTokens = new Set<string>();
  responses.forEach((response, idx) => {
    if (response.success) return;
    const code = (response.error as any)?.code || (response.error as any)?.errorInfo?.code || "";
    if (invalidCodes.has(code) && tokens[idx]) {
      invalidTokens.add(tokens[idx]);
    }
  });

  if (invalidTokens.size === 0) return;

  await Promise.all(Array.from(invalidTokens).map((token) => pruneInvalidToken(token)));
  logger.info("Invalid FCM tokens pruned", { count: invalidTokens.size });
}

async function sendMulticastWithCleanup(
  message: admin.messaging.MulticastMessage,
): Promise<admin.messaging.BatchResponse> {
  const { tokens, ...restMessage } = message;
  if (!tokens || tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      responses: [],
    };
  }

  const responses = await Promise.all(tokens.map(async (token) => {
    try {
      const messageId = await admin.messaging().send({
        ...restMessage,
        token,
      });
      return {
        success: true,
        messageId,
      } as admin.messaging.SendResponse;
    } catch (error) {
      return {
        success: false,
        error: error as any,
      } as admin.messaging.SendResponse;
    }
  }));

  const successCount = responses.filter((r) => r.success).length;
  const failureCount = responses.length - successCount;
  await cleanupInvalidTokens(tokens, responses);

  return {
    responses,
    successCount,
    failureCount,
  };
}


/**
 * Send push notification when a new order is created
 * Notifies admin users about new orders
 * AND sends confirmation email to client
 */
export const notifyNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const orderData = event.data?.data();
  if (!orderData) return null;

  const orderId = event.params.orderId;
  logger.info("New order created", { orderId });

  // Email se envía al confirmar el pago (ver notifyOrderUpdate, status=Pagado)

  try {
    const tokenList = await getAdminTokens();
    if (tokenList.length === 0) {
      logger.info("No admin tokens found, skipping notification");
      return null;
    }
    // ... (rest of the existing function)


    const amount = orderData.destinationAmount || orderData.vesAmount || 0;
    const bank = orderData.bank || 'N/A';
    const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    const payload = {
      notification: {
        title: "Nuevo Pedido Recibido",
        body: `Pedido de ${orderData.clientName || orderData.name || "Cliente"}. Banco: ${bank}. Monto: ${formattedAmount} VES`,
      },
      data: {
        orderID: orderId,
        type: "new_order",
        status: orderData.status,
      },
      webpush: {
        notification: {
          title: "Nuevo Pedido Recibido",
          body: `Pedido de ${orderData.clientName || orderData.name || "Cliente"}. Banco: ${bank}. Monto: ${formattedAmount} VES`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending new order notification:", error);
    return null;
  }
});

/**
 * Send push notification when a new wholesale purchase is registered.
 * Notifies specifically A1 (enderjpinar@gmail.com) and A2 (namv2210@gmail.com).
 */
export const notifyNewWholesalePurchase = onDocumentCreated("wholesale_purchases/{purchaseId}", async (event) => {
  const data = event.data?.data();
  if (!data) return null;

  const purchaseId = event.params.purchaseId;
  logger.info("New wholesale purchase created", { purchaseId });

  try {
    const adminEmails = ["enderjpinar@gmail.com", "namv2210@gmail.com"];
    const tokens = new Set<string>();

    for (const email of adminEmails) {
      const userTokens = await getUserTokensByEmail(email);
      userTokens.forEach(t => tokens.add(t));
    }

    const tokenList = Array.from(tokens);
    if (tokenList.length === 0) {
      logger.info("No tokens found for A1/A2 admins, skipping wholesale notification");
      return null;
    }

    const usdtAmount = data.usdtNeeded || 0;
    const formattedAmount = usdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const vesAmount = data.vesAmountComputed || 0;
    const formattedVes = vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    // Explicit requested format: "Se ha registrado COMPRA de X CANTIDAD de USDT. Equivalente: Y VES"
    const notificationBody = `Se ha registrado Compra de 💲${formattedAmount} de USDT. Equivalente: ${formattedVes} VES`;

    const payload = {
      notification: {
        title: "Nueva Compra Mayorista",
        body: notificationBody,
      },
      data: {
        purchaseID: purchaseId,
        type: "wholesale_purchase",
      },
      webpush: {
        notification: {
          title: "Nueva Compra Mayorista",
          body: notificationBody,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} wholesale notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending wholesale notification:", error);
    return null;
  }
});

/**
 * Send push notification when an order status is updated
 */
export const notifyOrderUpdate = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [brevoApiKey] },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) return null;

    const orderId = event.params.orderId;
    if (beforeData.status === afterData.status) return null;

    try {
      const tokens = new Set<string>();
      const recipients: string[] = [];

      if (afterData.userId) {
        const userTokens = await getUserTokens(afterData.userId);
        userTokens.forEach(t => tokens.add(t));
        recipients.push(`userId:${afterData.userId}`);
      }

      if (afterData.sellerId && afterData.sellerId !== afterData.userId) {
        const sellerTokens = await getUserTokens(afterData.sellerId);
        sellerTokens.forEach(t => tokens.add(t));
        recipients.push(`sellerId:${afterData.sellerId}`);
      }

      // Fallback for legacy/admin-created orders that do not store userId/sellerId.
      if (tokens.size === 0 && typeof afterData.createdByTag === "string" && afterData.createdByTag.trim()) {
        const creatorTokens = await getUserTokensByEmail(afterData.createdByTag);
        creatorTokens.forEach(t => tokens.add(t));
        recipients.push(`createdByTag:${afterData.createdByTag.trim().toLowerCase()}`);
      }

      const tokenList = Array.from(tokens);
      if (tokenList.length === 0) {
        logger.info("No recipient tokens found for order update", {
          orderId,
          beforeStatus: beforeData.status,
          afterStatus: afterData.status,
          userId: afterData.userId || null,
          sellerId: afterData.sellerId || null,
          createdByTag: afterData.createdByTag || null,
        });
        return null;
      }

      let notificationBody = "";
      const clientName = afterData.clientName || afterData.name || "Cliente";

      if (afterData.status === "Pagado") {
        notificationBody = `El pedido de ${clientName} ha sido procesado y pagado. ${afterData.vesAmount || 0} VES`;

        // Enviar email de confirmación al cliente
        const key = brevoApiKey.value();
        if (key) {
          sendOrderConfirmation(key, orderId, afterData)
            .catch(err => logger.error("Email confirmation failed", { orderId, err: err.message }));
        } else {
          logger.warn("BREVO_API_KEY secret not available, skipping email", { orderId });
        }
      } else if (afterData.status === "Cancelado") {
        notificationBody = `El pedido de ${clientName} ha sido cancelado.`;
      } else if (afterData.status === "Pendiente de pago") {
        notificationBody = `El pedido de ${clientName} está pendiente de pago.`;
      }

      if (!notificationBody) return null;

      const response = await sendMulticastWithCleanup({
        tokens: tokenList,
        notification: {
          title: "Actualización de Pedido",
          body: notificationBody,
        },
        data: {
          orderID: orderId,
          type: "order_update",
          status: afterData.status,
        },
        webpush: {
          notification: {
            title: "Actualización de Pedido",
            body: notificationBody,
            icon: "/images/icon-192x192.png",
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            requireInteraction: true,
          },
          fcmOptions: {
            link: "/"
          }
        },
        apns: { payload: { aps: { sound: "default" } } },
        android: {
          priority: "high" as const,
          notification: {
            channelId: "manzano_alerts_v1",
            sound: "default",
            icon: "ic_stat_notification",
            color: "#8cb33e",
          },
        },
      });
      logger.info("Order update notifications sent", {
        orderId,
        status: afterData.status,
        recipients,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });
      return response;
    } catch (error) {
      logger.error("Error sending order update notification:", error);
      return null;
    }
  });

/**
 * Sends app push updates for Binance P2P admin actions processed by the VPS worker.
 */
export const notifyBinanceP2PActionUpdate = onDocumentUpdated("binance_p2p_actions/{actionId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  if (!beforeData || !afterData) return null;
  if (beforeData.status === afterData.status) return null;

  const interestingStates = new Set(["running", "succeeded", "failed", "cancelled"]);
  if (!interestingStates.has(afterData.status)) return null;

  try {
    const tokenList = await getUserTokensByEmail(SUPER_ADMIN_EMAIL);
    if (tokenList.length === 0) {
      logger.info("No super-admin tokens found for Binance P2P notification", { actionId: event.params.actionId });
      return null;
    }

    const actionType = String(afterData.actionType || "binance_p2p");
    const amount = String(afterData.payload?.amount || "");
    const processorHost = String(afterData.processorHost || "");
    const resultSummary = String(afterData.resultSummary || "");

    let body = "Actualizacion disponible.";
    if (afterData.status === "running") {
      body = `El VPS comenzo a procesar ${actionType}${processorHost ? ` en ${processorHost}` : ""}.`;
    } else if (afterData.status === "succeeded") {
      body = resultSummary || `Accion ${actionType} completada${amount ? ` para ${amount}` : ""}.`;
    } else if (afterData.status === "failed") {
      body = afterData.errorMessage || `La accion ${actionType} fallo en el VPS.`;
    } else if (afterData.status === "cancelled") {
      body = `La accion ${actionType} fue cancelada antes de ejecutarse.`;
    }

    const payload = {
      notification: {
        title: "Binance P2P Admin",
        body,
      },
      data: {
        type: "binance_p2p_action",
        actionId: event.params.actionId,
        actionType,
        status: String(afterData.status || ""),
      },
      webpush: {
        notification: {
          title: "Binance P2P Admin",
          body,
          icon: "/images/icon-192x192.png",
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/",
        },
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info("Binance P2P action notification sent", {
      actionId: event.params.actionId,
      actionType,
      status: afterData.status,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    return response;
  } catch (error) {
    logger.error("Error sending Binance P2P action notification:", error);
    return null;
  }
});

/**
 * Send push notification when exchange rate is updated
 */
export const notifyExchangeRateUpdate = onDocumentUpdated("config/exchangeRate", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  if (!beforeData || !afterData || beforeData.rate === afterData.rate) return null;

  try {
    const usersSnapshot = await admin.firestore()
      .collection("users")
      .where("fcmToken", "!=", null)
      .get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
    });

    if (tokens.length === 0) return null;

    const payload = {
      notification: {
        title: "Tasa de Cambio Actualizada",
        body: `Nueva tasa: 1 CLP = ${afterData.rate} VES`,
      },
      data: {
        type: "exchange_rate_update",
        newRate: afterData.rate.toString(),
      },
      webpush: {
        notification: {
          title: "Tasa de Cambio Actualizada",
          body: `Nueva tasa: 1 CLP = ${afterData.rate} VES`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: 'default',
          icon: 'ic_stat_notification',
          color: '#8cb33e'
        }
      }
    };

    const batchSize = 500;
    const promises = [];
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      promises.push(sendMulticastWithCleanup({ tokens: batch, ...payload }));
    }

    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    logger.error("Error sending exchange rate notification:", error);
    return null;
  }
});

/**
 * Send push notification when balance is loaded
 */
export const notifyBalanceLoad = onDocumentCreated("balance_history/{historyId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.type !== 'add') return null;

  const historyId = event.params.historyId;
  logger.info("Balance load detected", { historyId });

  try {
    // Auto-complete wholesale purchases with matching VES amount
    const amount = data.amount || 0;
    if (amount > 0) {
      const db = admin.firestore();
      const purchasesSnap = await db.collection("wholesale_purchases")
        .where("vesAmountComputed", "==", amount)
        .where("status", "in", ["Ingresada", "En proceso"])
        .get();

      if (!purchasesSnap.empty) {
        const batch = db.batch();
        purchasesSnap.docs.forEach((docSnap) => {
          batch.update(docSnap.ref, { status: "Completada" });
        });
        await batch.commit();
        logger.info(`Automatically completed ${purchasesSnap.size} wholesale purchases for amount ${amount}`, { historyId });
      }
    }

    const tokenList = await getAdminTokens();
    if (tokenList.length === 0) {
      logger.info("No admin tokens found, skipping balance notification");
      return null;
    }

    const holder = data.holder || 'N/A';
    const bank = data.bank || 'N/A';
    const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    const payload = {
      notification: {
        title: "Saldo Cargado ✅",
        body: `Monto: ${formattedAmount} VES. A la cuenta de: ${holder}, Banco: ${bank}`,
      },
      data: {
        historyID: historyId,
        type: "balance_load",
      },
      webpush: {
        notification: {
          title: "Saldo Cargado ✅",
          body: `Monto: ${formattedAmount} VES. A la cuenta de: ${holder}, Banco: ${bank}`,
          icon: "/images/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200, 100, 200],
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/"
        }
      },
      apns: { payload: { aps: { sound: "default" } } },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "manzano_alerts_v1",
          sound: "default",
          icon: "ic_stat_notification",
          color: "#8cb33e",
        },
      },
    };

    const response = await sendMulticastWithCleanup({
      tokens: tokenList,
      ...payload,
    });

    logger.info(`Sent ${response.successCount} balance notifications, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    logger.error("Error sending balance load notification:", error);
    return null;
  }
});

/**
 * =========================================================
 * PROXY PARA BINANCE VPS (Bypass HTTPS Mixed Content)
 * Redirige llamadas de React (HTTPS) al HTTP del VPS
 * =========================================================
 */
export const binanceVpsProxy = onRequest(
    { cors: false },
    async (req, res) => {
        // Configuracion explicita de CORS para permitir headers personalizados como x-vps-token
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vps-token');
        
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        try {
            const axios = require('axios');
            const vpsIp = "http://165.227.158.59:3005";
            
            // Reparacion de path: Firebase a veces deja el nombre de la funcion en req.url
            let cleanPath = req.url.split('?')[0].replace('/binanceVpsProxy', '');
            
            // Si el front manda /balance, mapeamos a /api/balance para el VPS
            if (cleanPath === '/balance') cleanPath = '/api/balance';
            if (cleanPath === '/p2p-rate') cleanPath = '/api/p2p-rate';

            // Reconstruir query string si existe
            const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
            const targetUrl = `${vpsIp}${cleanPath}${queryString}`;
            
            logger.info(`Proxying ${req.method} to: ${targetUrl}`);

            const proxyResponse = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    'x-vps-token': req.header('x-vps-token') || 'un_token_largo_y_secreto_para_manzano'
                },
                validateStatus: () => true // Permitir 401, 404, etc. para que el front los maneje
            });

            res.status(proxyResponse.status).send(proxyResponse.data);
        } catch (error) {
            logger.error("Error critico en Proxy VPS:", error);
            res.status(500).json({ error: "Fallo comunicacion con el VPS de Binance.", details: String(error) });
        }
    }
);

/**
 * Reassign an order to a different seller
 */
export const reassignOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado.");
  }

  const email = request.auth.token.email;
  const userTag = resolveUserTag(email || "");
  
  // Only admins can reassign, specifically A1 or A2 as requested, but we can allow all admins or just A1/A2.
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Solo los administradores pueden reasignar pedidos.");
  }

  // Enforce A1/A2 or SuperAdmin
  if (!CLP_ADMIN_TAGS.has(userTag) && !isSuperAdminEmail(email)) {
    throw new HttpsError("permission-denied", "Solo los administradores principales pueden reasignar pedidos.");
  }

  const orderId = typeof request.data?.orderId === "string" ? request.data.orderId.trim() : "";
  const targetEmail = typeof request.data?.targetEmail === "string" ? request.data.targetEmail.trim() : "";

  if (!orderId || !targetEmail) {
    throw new HttpsError("invalid-argument", "Falta ID del pedido o email destino.");
  }

  try {
    const targetUserRecord = await admin.auth().getUserByEmail(targetEmail);
    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(orderId);

    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      throw new HttpsError("not-found", "El pedido no existe.");
    }

    const updateData: any = {
      createdByTag: targetEmail,
      sellerEmail: targetEmail,
      sellerId: targetUserRecord.uid
    };

    if (targetUserRecord.customClaims && typeof targetUserRecord.customClaims.commissionRate === 'number') {
      updateData.sellerCommissionRate = targetUserRecord.customClaims.commissionRate;
    } else {
      updateData.sellerCommissionRate = 0;
    }

    await orderRef.update(updateData);
    logger.info(`Order ${orderId} reassigned to ${targetEmail} by ${email}`);

    return { success: true };
  } catch (error: any) {
    logger.error("Error reassigning order:", error);
    throw new HttpsError("internal", "Error al reasignar el pedido. Puede que el usuario no exista.");
  }
});
