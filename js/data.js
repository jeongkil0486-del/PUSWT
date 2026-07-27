import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { DEFAULT_BRANCH, BRANCH_OPTIONS, normalizeBranch } from "./lib/branches.js";

export { ref, set, get, update, remove, onValue, push, runTransaction };
export { DEFAULT_BRANCH, BRANCH_OPTIONS, normalizeBranch };

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

export const APP_DISPLAY_NAME = "TAS Walkie-Talkie";

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-northeast3");

export const state = {
    currentUser: null,
    isAdmin: false,
    currentMode: "본인",
    pendingResets: [],
    isProcessingClick: false,
    isEditMode: false,
    currentBoardNumbers: {},
    todayString: "",
    currentBranch: DEFAULT_BRANCH,
    authUser: null,
    pendingNotificationRoute: null,
    seatNames: {}   // { "1": "여객1", "2": "크루2", ... }
};

export const screens = {
    loading: document.getElementById("loading-screen"),
    login: document.getElementById("login-screen"),
    main: document.getElementById("main-screen"),
    admin: document.getElementById("admin-screen")
};

export function getBranchLabel(branchCode = state.currentBranch) {
    const normalized = normalizeBranch(branchCode);
    return BRANCH_OPTIONS.find((branch) => branch.code === normalized)?.label || normalized;
}

export function isDefaultBranch(branchCode = state.currentBranch) {
    return normalizeBranch(branchCode) === DEFAULT_BRANCH;
}

export function scopedPath(path, branchCode = state.currentBranch) {
    const normalized = normalizeBranch(branchCode);
    return isDefaultBranch(normalized) ? path : `branches/${normalized}/${path}`;
}

export function dbRef(path, branchCode = state.currentBranch) {
    return ref(db, scopedPath(path, branchCode));
}

// 사용 기록 전용 경로: usageLogs/{branchCode}/{yyyy-mm-dd}/{logId}
// 번호판 실시간 경로(system/boardState)와 완전히 분리해 다운로드 비용을 줄인다.
export function usageLogRef(date, branchCode = state.currentBranch) {
    const branch = normalizeBranch(branchCode);
    return ref(db, `usageLogs/${branch}/${date}`);
}

export function setCurrentBranch(branchCode) {
    state.currentBranch = normalizeBranch(branchCode);
    return state.currentBranch;
}
