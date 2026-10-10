import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAMAuCH4_iQUz0fUo85_VBJKqOby1JquS4",
  authDomain: "personal-lib-41851.firebaseapp.com",
  projectId: "personal-lib-41851",
  storageBucket: "personal-lib-41851.firebasestorage.app",
  messagingSenderId: "492890595352",
  appId: "1:492890595352:web:ddfe785194ca74a28ee36d",
  measurementId: "G-3C1R1KXRXW",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();

// This gives you a reference to the parent frame, i.e. the offscreen document.
const PARENT_FRAME = document.location.ancestorOrigins[0];

const PROVIDER = new GoogleAuthProvider();

function sendResponse(result) {
  window.parent.postMessage(JSON.stringify(result), PARENT_FRAME);
}

window.addEventListener("message", function ({ data }) {
  if (data.initAuth) {
    signInWithPopup(auth, PROVIDER).then(sendResponse).catch(sendResponse);
  }
});
