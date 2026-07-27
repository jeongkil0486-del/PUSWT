import {
    signInWithCustomToken,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { auth, functions, state } from "./data.js";

function toBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function getLoginEmail(branchCode, userId) {
    return `${toBase64Url(userId)}.${branchCode.toLowerCase()}@taswt.invalid`;
}

export function getAuthPassword(password) {
    return `taswt:${password}`;
}

export async function authenticateUser(branchCode, userId, password) {
    const email = getLoginEmail(branchCode, userId);
    try {
        const credential = await signInWithEmailAndPassword(auth, email, getAuthPassword(password));
        state.authUser = credential.user;
        const token = await credential.user.getIdTokenResult(true);
        return { isAdmin: token.claims.role === "admin", migrated: false };
    } catch {
        const migrator = httpsCallable(functions, "migrateLegacyLogin");
        const result = await migrator({ branchCode, userId, password });
        const credential = await signInWithCustomToken(auth, result.data.customToken);
        state.authUser = credential.user;
        return { isAdmin: result.data.role === "admin", migrated: true };
    }
}

export async function logoutFirebase() {
    state.authUser = null;
    await signOut(auth).catch(() => {});
}
