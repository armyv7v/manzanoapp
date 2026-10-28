/**
 * agentApi.ts — API de agente para Cambios Manzano (v1)
 *
 * CONTRATO DE SEGURIDAD (leelo antes de tocar):
 *  - El agente (Hermes) se autentica con un API key de SOLO LECTURA (scope=read).
 *    Header: x-api-key: <AGENT_API_KEY secret>. Nunca puede escribir con eso.
 *  - Las ESCRITURAS son de DOS FASES y requieren aprobación HUMANA:
 *      1) POST /api/v1/intents              -> el agente crea la intención (status=pending). NO ejecuta.
 *      2) POST /api/v1/intents/{id}/approve -> SOLO un super-admin logueado la aprueba.
 *         Emite un approvalToken de un solo uso (no lo ve el agente; se guarda el hash).
 *      3) POST /api/v1/intents/{id}/execute -> el agente presenta el approvalToken + su api-key.
 *         Recién ahí se escribe en `orders`. Token inválido/expirado => 403.
 *  - El agente NO puede auto-aprobarse: /approve exige request.auth (sesión Google del admin),
 *    /execute exige el approvalToken que solo /approve generó.
 *
 * Reutiliza TUS convenciones: mismo gating de super-admin por email
 * (SUPER_ADMIN_EMAIL / USER_TAGS de index.ts), y escribe en la colección "orders"
 * exactamente como el flujo actual => notifyNewOrder (onDocumentCreated) sigue disparando
 * mails y notificaciones sin cambios.
 *
 * Autónomo: NO importa index.ts (evita re-ejecutar admin.initializeApp y re-registrar funciones).
 */

import { onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import * as crypto from "crypto";

const AGENT_API_KEY = defineSecret("AGENT_API_KEY");

const SUPER_ADMIN_EMAIL = "enderjpinar@gmail.com";
const INTENT_TTL_MS = 60 * 60 * 1000; // 60 min para aprobar (con notificacion push al super admin)

interface AgentIntent {
  id: string;
  kind: "create_order" | "adjust_balance";
  status: "pending" | "approved" | "executed" | "rejected" | "expired";
  createdByAgent: boolean;
  summary: Record<string, unknown>;
  orderPayload?: Record<string, unknown>;
  adjustmentPayload?: {
    accountId: string;
    amount: number;
    reason?: string;
    /** Tasa original de la transaccion que origina este abono (opcional). */
    purchaseRateVES?: number;
  };
  approvalTokenHash?: string;
  approvedBy?: string;
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  executedAt?: admin.firestore.Timestamp;
  executedOrderId?: string;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function error(res: any, code: number, message: string, extra?: Record<string, unknown>) {
  res.status(code).set(corsHeaders()).json({ error: message, ...(extra || {}) });
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function requireAgentApiKey(req: any, res: any): boolean {
  const key = req.headers["x-api-key"];
  const expected = process.env.AGENT_API_KEY || (AGENT_API_KEY.value?.() ?? "");
  if (!expected || key !== expected) {
    error(res, 401, "API key invalida");
    return false;
  }
  return true;
}

async function assertSuperAdmin(req: any): Promise<{ uid: string; email: string }> {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    throw new HttpsError("unauthenticated", "Debes enviar tu Firebase ID token en 'Authorization: Bearer <token>'");
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    throw new HttpsError("unauthenticated", "Token no proporcionado");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = (decodedToken.email || "").trim().toLowerCase();
    if (email !== SUPER_ADMIN_EMAIL) {
      throw new HttpsError("permission-denied", "Solo el super admin autorizado (enderjpinar@gmail.com) puede aprobar.");
    }
    return { uid: decodedToken.uid, email };
  } catch (err: any) {
    logger.error("Error verificando ID token en /approve", { error: err.message });
    throw new HttpsError("unauthenticated", `Firebase ID token invalido: ${err.message}`);
  }
}

export const agentApi = onRequest({ secrets: [AGENT_API_KEY], cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).set(corsHeaders()).send("");
    return;
  }

  const raw = (req.originalUrl || req.url || "").split("?")[0];
  const path = raw.replace(/^\/agentApi/, "").replace(/^\/api\/v1/, "").replace(/\/+$/, "");

  try {
    // ── LECTURA (api-key del agente) ──────────────────────────────────────
    if (req.method === "GET" && path === "/rates") {
      if (!requireAgentApiKey(req, res)) return;
      const snap = await admin.firestore().collection("config").doc("rate").get();
      const data = snap.exists ? snap.data() : {};
      res.status(200).set(corsHeaders()).json({ source: "config/rate", rate: data });
      return;
    }

    if (req.method === "GET" && path === "/wallet") {
      if (!requireAgentApiKey(req, res)) return;
      const accountsSnap = await admin.firestore().collection("accounts").get();
      const balances: Record<string, number> = {};
      accountsSnap.forEach((d) => {
        balances[d.id] = Number(d.data()?.balance || 0);
      });
      res.status(200).set(corsHeaders()).json({ balances });
      return;
    }

    if (req.method === "GET" && path === "/orders") {
      if (!requireAgentApiKey(req, res)) return;
      const ordersSnap = await admin.firestore()
        .collection("orders").orderBy("createdAt", "desc").limit(50).get();
      const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.status(200).set(corsHeaders()).json({ orders });
      return;
    }

    // ── FASE 1: crear intención (api-key del agente) ──────────────────────
    if (req.method === "POST" && path === "/intents") {
      if (!requireAgentApiKey(req, res)) return;
      const body = (req.body || {}) as Record<string, any>;
      if (body.kind !== "create_order" && body.kind !== "adjust_balance") {
        error(res, 400, "kind no soportado (debe ser create_order o adjust_balance)");
        return;
      }

      if (body.kind === "create_order") {
        const orderPayload = (body.orderPayload || {}) as Record<string, unknown>;
        if (!orderPayload || Object.keys(orderPayload).length === 0) {
          error(res, 400, "orderPayload es requerido para create_order");
          return;
        }
      } else if (body.kind === "adjust_balance") {
        const adj = body.adjustmentPayload as { accountId?: string; amount?: number } | undefined;
        if (!adj || !adj.accountId || typeof adj.amount !== "number") {
          error(res, 400, "adjustmentPayload (accountId y amount numerico) es requerido para adjust_balance");
          return;
        }
      }

      const now = admin.firestore.Timestamp.now();
      const expires = admin.firestore.Timestamp.fromMillis(Date.now() + INTENT_TTL_MS);
      const intentRef = admin.firestore().collection("agent_intents").doc();
      
      const intentDoc: Record<string, any> = {
        id: intentRef.id,
        kind: body.kind,
        status: "pending",
        createdByAgent: true,
        summary: (body.summary || {}) as Record<string, unknown>,
        createdAt: now,
        expiresAt: expires,
      };

      if (body.kind === "create_order") {
        intentDoc.orderPayload = body.orderPayload;
      } else if (body.kind === "adjust_balance") {
        intentDoc.adjustmentPayload = body.adjustmentPayload;
      }

      await intentRef.set(intentDoc);

      // ── Notificar al super admin (FCM push) para que apruebe a tiempo ──
      try {
        const adminUserSnap = await admin.firestore().collection("users")
          .where("email", "==", SUPER_ADMIN_EMAIL).limit(1).get();
        if (!adminUserSnap.empty) {
          const udata: any = adminUserSnap.docs[0].data() || {};
          // DEDUP: los mismos tokens viven en fcmDeviceTokens, fcmPlatformTokens,
          // fcmToken y fcmTokens. Sin dedupe el push llega varias veces al MISMO
          // dispositivo (sendEachForMulticast manda una por entrada).
          const tokenSet = new Set<string>();
          const addTok = (t: unknown) => {
            if (typeof t === "string" && t.trim()) tokenSet.add(t.trim());
          };
          if (udata?.fcmDeviceTokens && typeof udata.fcmDeviceTokens === "object") {
            Object.values(udata.fcmDeviceTokens).forEach((entry: any) => addTok(entry?.token));
          }
          addTok(udata?.fcmPlatformTokens?.web?.token);
          addTok(udata?.fcmPlatformTokens?.native?.token);
          addTok(udata?.fcmToken);
          if (Array.isArray(udata?.fcmTokens)) udata.fcmTokens.forEach(addTok);
          const tokens: string[] = [...tokenSet];

          const desc = String(intentDoc.summary?.description || "Solicitud del agente");
          const adjDesc = intentDoc.kind === "adjust_balance"
            ? `${intentDoc.adjustmentPayload?.amount >= 0 ? "+" : ""}${intentDoc.adjustmentPayload?.amount} VES -> ${intentDoc.adjustmentPayload?.accountId}`
            : desc;
          if (tokens.length > 0) {
            const notif = {
              notification: {
                title: "🤖 Aprobación de intención pendiente",
                body: `${adjDesc} (expira en 60 min)`,
              },
            };
            // Multicast a todos los dispositivos registrados del super admin
            const sendRes = await admin.messaging().sendEachForMulticast({
              tokens,
              ...notif,
              data: { type: "agent_intent", intentId: intentRef.id, kind: String(intentDoc.kind || "") },
              webpush: {
                notification: {
                  ...notif.notification,
                  icon: "/images/icon-192x192.png",
                  vibrate: [200, 100, 200, 100, 200],
                  requireInteraction: true,
                },
                fcmOptions: { link: `/?id=${intentRef.id}` },
              },
              android: {
                priority: "high",
                notification: {
                  channelId: "manzano_alerts_v1",
                  sound: "default",
                  icon: "ic_stat_notification",
                  color: "#8cb33e",
                },
              },
            } as any);

            // Auto-purga de tokens invalidos (dispositivos viejos/desinstalados)
            // para que no se acumulen y sigan recibiendo/envios fallidos.
            try {
              const invalid: string[] = [];
              sendRes.responses.forEach((resp, i) => {
                if (!resp.success) {
                  const code = (resp.error as any)?.code || "";
                  if (code === "messaging/registration-token-not-registered" ||
                      code === "messaging/invalid-argument" ||
                      code === "messaging/invalid-registration-token") {
                    invalid.push(tokens[i]);
                  }
                }
              });
              if (invalid.length > 0) {
                const userDoc = adminUserSnap.docs[0];
                const cur: any = userDoc.data() || {};
                const devMap: Record<string, any> = { ...(cur.fcmDeviceTokens || {}) };
                Object.keys(devMap).forEach((id) => {
                  if (invalid.includes(devMap[id]?.token)) delete devMap[id];
                });
                const remaining = Array.from(new Set(
                  Object.values(devMap).map((e: any) => e?.token).filter(Boolean)
                )) as string[];
                const webTok = cur.fcmPlatformTokens?.web?.token;
                const natTok = cur.fcmPlatformTokens?.native?.token;
                await userDoc.ref.set({
                  fcmDeviceTokens: devMap,
                  fcmTokens: remaining,
                  fcmToken: remaining[0] || null,
                  fcmPlatformTokens: {
                    web: webTok && !invalid.includes(webTok) ? { token: webTok } : null,
                    native: natTok && !invalid.includes(natTok) ? { token: natTok } : null,
                  },
                }, { merge: true });
                logger.info("Tokens FCM invalidos purgados", { intentId: intentRef.id, purged: invalid.length });
              }
            } catch (purgeErr: any) {
              logger.warn("No se pudieron purgar tokens FCM", { error: purgeErr?.message });
            }
          }
          logger.info("Notificacion FCM enviada al super admin", { intentId: intentRef.id, tokens: tokens.length });
        }
      } catch (notifErr: any) {
        logger.warn("No se pudo enviar la notificacion FCM", { error: notifErr?.message });
      }

      res.status(201).set(corsHeaders()).json({
        intentId: intentRef.id,
        kind: body.kind,
        status: "pending",
        expiresAt: expires.toMillis(),
        summary: intentDoc.summary,
        message: "Intencion creada. Requiere aprobacion humana via /intents/{id}/approve.",
      });
      return;
    }

    // ── FASE 2: APROBAR (solo super-admin logueado; emite approval token) ──
    const approveMatch = path.match(/^\/intents\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const { email } = await assertSuperAdmin(req); // verifica Firebase ID Token en Authorization: Bearer
      const intentId = approveMatch[1];
      const intentRef = admin.firestore().collection("agent_intents").doc(intentId);
      const snap = await intentRef.get();
      if (!snap.exists) { error(res, 404, "intent no encontrado"); return; }
      const intent = snap.data() as AgentIntent;
      if (intent.status !== "pending") { error(res, 409, `intent en estado ${intent.status}`); return; }
      if (intent.expiresAt.toMillis() < Date.now()) { error(res, 410, "intent expirado"); return; }

      const approvalToken = crypto.randomBytes(32).toString("hex");
      // La tasa original viaja en el intent; el super admin puede AJUSTARLA al aprobar
      // (body opcional { purchaseRateVES }). Queda fijada en el intent aprobado.
      const bodyRate = (req.body || {}).purchaseRateVES;
      const rateUpdate: Record<string, any> = {};
      if (bodyRate !== undefined && bodyRate !== null && bodyRate !== "") {
        const r = Number(bodyRate);
        if (!Number.isFinite(r) || r <= 0) {
          error(res, 400, "purchaseRateVES invalido (debe ser numero > 0)");
          return;
        }
        rateUpdate["adjustmentPayload.purchaseRateVES"] = r;
        rateUpdate.rateAdjustedByAdmin = true;
      }
      await intentRef.update({
        status: "approved",
        approvalTokenHash: sha256(approvalToken),
        approvedBy: email,
        approvedAt: admin.firestore.Timestamp.now(),
        ...rateUpdate,
      });

      logger.info("Intent aprobado por super-admin", { intentId, email });

      res.status(200).set(corsHeaders()).json({
        intentId,
        status: "approved",
        approvalToken,
        message: "Aprobado. Entrega este approvalToken al agente para ejecutar.",
      });
      return;
    }

    // ── FASE 3: EJECUTAR (agent key + approval token válido) ──────────────
    const executeMatch = path.match(/^\/intents\/([^/]+)\/execute$/);
    if (req.method === "POST" && executeMatch) {
      if (!requireAgentApiKey(req, res)) return;
      const intentId = executeMatch[1];
      const providedToken = (req.body || {}).approvalToken;
      if (!providedToken) { error(res, 401, "approvalToken requerido"); return; }
      const providedTokenHash = sha256(providedToken);

      const db = admin.firestore();
      const intentRef = db.collection("agent_intents").doc(intentId);

      // Ejecucion transaccional: la lectura del intent y todas las escrituras
      // (pedido/cuenta/ledger) conmutan juntas. Un execute concurrente con el
      // mismo token re-lee status "executed" y sale por 409 en vez de duplicar
      // el credito de saldo o el pedido.
      type ExecResult = { status: string; extra: Record<string, unknown> };
      try {
        const result = await db.runTransaction(async (tx): Promise<ExecResult> => {
          const snap = await tx.get(intentRef);
          if (!snap.exists) { const e: any = new Error("intent no encontrado"); e.statusCode = 404; throw e; }
          const intent = snap.data() as AgentIntent;
          if (intent.status !== "approved") { const e: any = new Error(`intent en estado ${intent.status}`); e.statusCode = 409; throw e; }
          if (!intent.expiresAt || intent.expiresAt.toMillis() < Date.now()) { const e: any = new Error("intent expirado"); e.statusCode = 410; throw e; }
          if (!intent.approvalTokenHash || providedTokenHash !== intent.approvalTokenHash) {
            const e: any = new Error("approvalToken invalido"); e.statusCode = 403; throw e;
          }

          if (intent.kind === "create_order") {
            const orderRef = db.collection("orders").doc();
            tx.set(orderRef, {
              ...intent.orderPayload,
              agentIntentId: intentId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            tx.update(intentRef, {
              status: "executed",
              executedAt: admin.firestore.FieldValue.serverTimestamp(),
              executedOrderId: orderRef.id,
            });

            logger.info("Intent create_order ejecutado por agente", { intentId, orderId: orderRef.id });
            return { status: "executed", extra: { orderId: orderRef.id } };
          }

          if (intent.kind === "adjust_balance") {
            if (!intent.adjustmentPayload) { const e: any = new Error("intent sin adjustmentPayload"); e.statusCode = 409; throw e; }
            const { accountId, amount, reason, purchaseRateVES } = intent.adjustmentPayload;
            const accountRef = db.collection("accounts").doc(accountId);
            const accountSnap = await tx.get(accountRef);
            if (!accountSnap.exists) { const e: any = new Error(`La cuenta ${accountId} no existe`); e.statusCode = 404; throw e; }
            const accData = accountSnap.data() || {};
            const holder = String(accData.holder || accountId.split("_")[0] || accountId);
            const bank = String(accData.bank || accountId.split("_").slice(1).join("_") || "");
            const type = amount >= 0 ? "add" : "subtract";
            const currentBalance = Number(accData.balance || 0);
            const balanceAfter = currentBalance + amount;

            // Tasa de esta operacion: la original (del intent, ajustable por el admin al aprobar).
            // NO se pisa config/rate.purchaseRateVES global: esa sigue siendo la ultima compra mayorista real.
            const rateUsed = Number(purchaseRateVES) > 0 ? Number(purchaseRateVES) : null;
            const clpAmount = rateUsed ? Math.ceil((Math.abs(amount) / rateUsed) * 100) / 100 : null;

            const ts = admin.firestore.FieldValue.serverTimestamp();
            tx.update(accountRef, {
              balance: admin.firestore.FieldValue.increment(amount),
              updatedAt: ts,
            });

            tx.set(db.collection("account_movements").doc(), {
              accountId,
              amount,
              reason: reason || "Ajuste de balance via agente",
              agentIntentId: intentId,
              createdAt: ts,
            });

            // Historial VES (mismo patron que useBalanceOperations de la app)
            tx.set(db.collection("balance_history").doc(), {
              amount: Math.abs(amount),
              type,
              holder,
              bank,
              note: reason || "Ajuste de balance via agente",
              timestamp: ts,
              balanceAfter,
              agentIntentId: intentId,
            });

            // Historial CLP equivalente (solo ingresos, con la tasa usada en ESTA operacion)
            if (type === "add" && clpAmount !== null) {
              tx.set(db.collection("clp_balance_history").doc(), {
                amount: clpAmount,
                type: "add",
                note: reason || "Carga de saldo via agente",
                description: reason || "Carga de saldo via agente",
                purchaseRateVESUsed: rateUsed,
                vesAmountAtCalc: Math.abs(amount),
                clpAmountComputed: clpAmount,
                timestamp: ts,
                createdAt: ts,
                adminTag: "AGENT",
                bank,
                agentIntentId: intentId,
              });
            }

            tx.update(intentRef, {
              status: "executed",
              executedAt: ts,
            });

            logger.info("Intent adjust_balance ejecutado por agente", { intentId, accountId, amount, rateUsed });
            return { status: "executed", extra: { accountId, amountAdjusted: amount, purchaseRateVESUsed: rateUsed } };
          }

          const e: any = new Error(`kind no soportado: ${intent.kind}`); e.statusCode = 409; throw e;
        });

        res.status(200).set(corsHeaders()).json({ status: result.status, ...result.extra });
        return;
      } catch (txErr: any) {
        if (txErr && txErr.statusCode) {
          error(res, txErr.statusCode, txErr.message);
          return;
        }
        throw txErr;
      }
    }

    error(res, 404, `ruta no encontrada: ${req.method} ${path}`);
  } catch (err: any) {
    if (err.httpErrorCode?.canonicalName) {
      // HttpsError de firebase-functions (assertSuperAdmin)
      error(res, 403, err.message);
      return;
    }
    logger.error("agentApi error", { err: err.message });
    error(res, 500, "error interno", { detail: err.message });
  }
});
