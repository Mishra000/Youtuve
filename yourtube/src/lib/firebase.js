import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration with environment variable support
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyAGrCfS4xNN4OLrBA13B0QhGsbAEbyoSgQ",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "yourtube-8e780.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "yourtube-8e780",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "yourtube-8e780.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "886224704945",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:886224704945:web:cffd43e4c53f962e955990",
};

// Initialize Firebase safely for Next.js SSR / HMR
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Always prompt account selection so users can switch accounts easily
provider.setCustomParameters({
  prompt: "select_account",
});

export { app, auth, provider };
