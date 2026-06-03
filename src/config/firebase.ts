// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBW_o6drShCv_E8H4RaP4qMcAuRdyjzMLg",
  authDomain: "recycle-waste-management-75e93.firebaseapp.com",
  projectId: "recycle-waste-management-75e93",
  storageBucket: "recycle-waste-management-75e93.firebasestorage.app",
  messagingSenderId: "181008493307",
  appId: "1:181008493307:web:dab0716f25829043b25e5e",
  measurementId: "G-XDSR9P7MTF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
