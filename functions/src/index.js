"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChange = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const corsLib = __importStar(require("cors"));
admin.initializeApp();
const db = admin.firestore();
const cors = corsLib({ origin: true });
exports.createChange = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== "POST")
            return res.status(405).send("Method Not Allowed");
        const { title, description, authorUid } = req.body || {};
        if (!authorUid || !title)
            return res.status(400).send("Missing fields");
        try {
            const doc = await db.collection("changes").add({
                title,
                description: description || "",
                authorUid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                status: "open"
            });
            res.status(201).send({ id: doc.id });
        }
        catch (e) {
            res.status(500).send(e.message);
        }
    });
});
