import { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  query, orderBy, getDocs
} from "firebase/firestore";

const col = collection(db, "changes");

export async function listChanges() {
  const q = query(col, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createChange(params: {
  title: string; description?: string; authorUid: string;
}) {
  const { title, description = "", authorUid } = params;
  return addDoc(col, {
    title, description, authorUid,
    createdAt: serverTimestamp(),
    status: "open"
  });
}
