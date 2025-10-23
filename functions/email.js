const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Define la región para tus funciones
setGlobalOptions({ region: "us-central1" });

// 1. Configuración del cliente de Brevo
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_KEY; // Accede al secreto

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// 2. Constantes de la aplicación
const APP_NAME = "Cambios Manzano";
// IMPORTANTE: Usa un email que hayas verificado como remitente en tu cuenta de Brevo.
const SENDER_EMAIL = "cmanzanospa@gmail.com";
const SENDER_NAME = APP_NAME;

/**
 * Se activa cuando un pedido es actualizado.
 * Si el estado cambia a 'Pagado', envía un correo de confirmación al cliente vía Brevo.
 * Escrito en la sintaxis de Firebase Functions v2.
 */
exports.sendPaymentConfirmationEmail = onDocumentUpdated(
    {
        document: "orders/{orderId}",
        secrets: ["BREVO_KEY"], // Especifica que esta función necesita el secreto
    },
    async (event) => {
        // En v2, los datos están dentro de event.data
        if (!event.data) {
            console.log("No data associated with the event, exiting.");
            return;
        }
        const change = event.data;
        const newValue = change.after.data();
        const previousValue = change.before.data();
        const orderId = event.params.orderId;

        // Condición: Solo actuar si el estado cambia a 'Pagado'
        if (newValue.status !== "Pagado" || previousValue.status === "Pagado") {
            console.log(`[${orderId}] El estado no cambió a 'Pagado'. No se envía correo.`);
            return;
        }

        // Obtener el email del cliente desde la colección 'clients'
        const clientRef = admin.firestore().collection("clients").doc(newValue.clientId);
        const clientSnap = await clientRef.get();

        if (!clientSnap.exists) {
            console.error(`[${orderId}] No se encontró el cliente con ID: ${newValue.clientId}`);
            return;
        }

        const clientData = clientSnap.data();
        const recipientEmail = clientData.email;

        if (!recipientEmail) {
            console.log(`[${orderId}] El cliente ${clientData.clientName} no tiene un email registrado. No se envía correo.`);
            return;
        }

        const proofUrl = newValue.proofUrl;
        if (!proofUrl) {
            console.error(`[${orderId}] El pedido está 'Pagado' pero no tiene 'proofUrl'. No se puede adjuntar comprobante.`);
            return;
        }

        // 3. Preparar el correo transaccional para Brevo
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.sender = { email: SENDER_EMAIL, name: SENDER_NAME };
        sendSmtpEmail.to = [{ email: recipientEmail, name: newValue.clientName }];
        sendSmtpEmail.subject = `✅ Tu pedido en ${APP_NAME} ha sido pagado!`;
        sendSmtpEmail.attachment = [{
            url: proofUrl,
            name: `Comprobante-${APP_NAME}-${orderId.slice(-5)}.jpg`
        }];

        sendSmtpEmail.htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
                .header { background-color: #4A90E2; color: white; padding: 10px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { padding: 20px; }
                .footer { font-size: 0.8em; text-align: center; color: #777; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>¡Pedido Pagado!</h1>
                </div>
                <div class="content">
                    <p>Hola <strong>${newValue.clientName}</strong>,</p>
                    <p>Te confirmamos que tu pedido por <strong>${newValue.destinationAmount.toLocaleString("es-VE", { style: "currency", currency: "VES" })}</strong> ha sido procesado y pagado con éxito.</p>
                    <p>Adjunto encontrarás el comprobante de la operación.</p>
                    <p>Gracias por confiar en ${APP_NAME}.</p>
                </div>
                <div class="footer">
                    <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
                </div>
            </div>
        </body>
        </html>
      `;

        // 4. Enviar el correo
        try {
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            console.log(`[${orderId}] Correo de confirmación enviado a ${recipientEmail} a través de Brevo.`);
        } catch (error) {
            console.error(`[${orderId}] Hubo un error al enviar el correo con Brevo:`, error.response ? error.response.body : error.message);
        }
    }
);