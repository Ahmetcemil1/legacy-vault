import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC4okgfI7NVq_rwsFslXPQi-5hAHcC03uk",
  appId: "1:49441798160:web:3bfd762edfa78dd9a6f295",
  messagingSenderId: "49441798160",
  projectId: "legacy-vault-49a71",
  authDomain: "legacy-vault-49a71.firebaseapp.com",
  storageBucket: "legacy-vault-49a71.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
