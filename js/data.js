import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

export { ref, set, get, update, remove, onValue, push, runTransaction };

export const firebaseConfig = {
    apiKey: "AIzaSyDlcAR1IJ-GM_13wH8XTd2BhVcvs9fZGd8",
    authDomain: "fltinfo.firebaseapp.com",
    databaseURL: "https://fltinfo-default-rtdb.firebaseio.com",
    projectId: "fltinfo",
    storageBucket: "fltinfo.firebasestorage.app",
    messagingSenderId: "77715217220",
    appId: "1:77715217220:web:8f940ae71f01e068ef9511",
    measurementId: "G-NTHVH61ZLS"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

export const state = {
    currentUser: null,
    isAdmin: false,
    currentMode: "본인",
    pendingResets: [],
    isProcessingClick: false,
    isEditMode: false,
    currentBoardNumbers: {},
    currentUserAlarmSenders: new Set(),
    currentAlarmSenders: new Set(),
    todayString: ""
};

export const screens = {
    login: document.getElementById('login-screen'),
    main: document.getElementById('main-screen'),
    admin: document.getElementById('admin-screen')
};
