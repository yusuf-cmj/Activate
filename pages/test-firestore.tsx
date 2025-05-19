import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useEffect } from "react";

export default function TestFirestore() {
  useEffect(() => {
    const test = async () => {
      // Veri yaz
      await addDoc(collection(db, "test"), { hello: "world", created: new Date() });
      // Veri oku
      const snapshot = await getDocs(collection(db, "test"));
      snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
      });
    };
    test();
  }, []);

  return <div>Firestore test edildi, konsolu kontrol et!</div>;
} 