import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();
const corsHandler = cors({ origin: true });

export const createChange = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { title, description, authorUid } = req.body || {};
    if (!authorUid || !title) return res.status(400).send("Missing fields");
    try {
      const doc = await db.collection("changes").add({
        title,
        description: description || "",
        authorUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "open"
      });
      res.status(201).send({ id: doc.id });
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });
});



