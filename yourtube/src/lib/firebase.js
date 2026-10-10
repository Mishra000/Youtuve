// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGrCfS4xNN4OLrBA13B0QhGsbAEbyoSgQ",
  authDomain: "yourtube-8e780.firebaseapp.com",
  projectId: "yourtube-8e780",
  storageBucket: "yourtube-8e780.firebasestorage.app",
  messagingSenderId: "886224704945",
  appId: "1:886224704945:web:cffd43e4c53f962e955990",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
export { auth, provider };
