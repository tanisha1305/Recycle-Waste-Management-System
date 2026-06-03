// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCUpvbVNuu60Rj5LOHtCD8LE4l7vT1r3iw",
  authDomain: "recycle-manager-2ab1b.firebaseapp.com",
  projectId: "recycle-manager-2ab1b",
  storageBucket: "recycle-manager-2ab1b.firebasestorage.app",
  messagingSenderId: "862420994335",
  appId: "1:862420994335:web:f9da1a32f6c5827cbf882a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
