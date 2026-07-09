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

export const APP_DISPLAY_NAME = "TAS Walkie-Talkie";
export const DEFAULT_BRANCH = "PUS";
export const ADMIN_ACCOUNTS = {
    PUS: { id: "PUSWT", password: "PUSWT" },
    TAE: { id: "TAEWT", password: "TAEWT" },
    CJJ: { id: "CJJWT", password: "CJJWT" },
    GMP: { id: "GMPWT", password: "GMPWT" }
};

export const BRANCH_OPTIONS = [
    { code: "PUS", label: "부산" },
    { code: "TAE", label: "대구" },
    { code: "CJJ", label: "청주" },
    { code: "GMP", label: "김포" }
];

export const DEFAULT_BRANCH_WHITELISTS = {
    TAE: [
        "김인숙",
        "신은지",
        "이가림",
        "김아란",
        "손주희",
        "서한별",
        "서희정",
        "이지현1",
        "서세영",
        "정재연",
        "서은영",
        "이도희",
        "이지현2",
        "박가현",
        "배효진",
        "전보현",
        "김수형",
        "김광수",
        "김규리2",
        "조연아",
        "조윤성",
        "김예진",
        "김혁진",
        "손정선",
        "김유진",
        "박시연",
        "이은지",
        "박민영",
        "곽예린",
        "김세은",
        "서승희",
        "이윤재",
        "김단영",
        "김련희",
        "김영훈",
        "이민아",
        "정소영",
        "김경종",
        "이향기",
        "김진관",
        "이균동",
        "황지원",
        "김민정",
        "정현정",
        "배정은",
        "이예지",
        "손상희",
        "노수지",
        "이예슬",
        "채원숙",
        "임효영",
        "차현서"
    ]
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
    todayString: "",
    currentBranch: DEFAULT_BRANCH,
    seatNames: {}   // { "1": "여객1", "2": "크루2", ... }
};

export const screens = {
    login: document.getElementById("login-screen"),
    main: document.getElementById("main-screen"),
    admin: document.getElementById("admin-screen")
};

export function normalizeBranch(branchCode) {
    const normalized = String(branchCode || DEFAULT_BRANCH).toUpperCase();
    return BRANCH_OPTIONS.some((branch) => branch.code === normalized) ? normalized : DEFAULT_BRANCH;
}

export function getBranchLabel(branchCode = state.currentBranch) {
    const normalized = normalizeBranch(branchCode);
    return BRANCH_OPTIONS.find((branch) => branch.code === normalized)?.label || normalized;
}

export function getAdminAccount(branchCode = state.currentBranch) {
    const normalized = normalizeBranch(branchCode);
    return ADMIN_ACCOUNTS[normalized] || ADMIN_ACCOUNTS[DEFAULT_BRANCH];
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

export function setCurrentBranch(branchCode) {
    state.currentBranch = normalizeBranch(branchCode);
    return state.currentBranch;
}
