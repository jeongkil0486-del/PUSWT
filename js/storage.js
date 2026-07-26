import { dbRef, set, get, update, state, DEFAULT_BRANCH, normalizeBranch } from "./data.js";

const SESSION_USER_KEY = "PUS_currentUser";
const SESSION_ADMIN_KEY = "PUS_isAdmin";
const SESSION_BRANCH_KEY = "PUS_currentBranch";

export function getTodayString() {
    const offset = new Date().getTimezoneOffset() * 60000;
    const dateOffset = new Date(Date.now() - offset);
    return dateOffset.toISOString().split("T")[0];
}

export function restoreSession() {
    const savedUser = localStorage.getItem(SESSION_USER_KEY);
    if (!savedUser) {
        return null;
    }

    return {
        user: savedUser,
        isAdmin: localStorage.getItem(SESSION_ADMIN_KEY) === "true",
        branch: restoreSelectedBranch()
    };
}

export function saveSession(user, isAdmin, branch) {
    localStorage.setItem(SESSION_USER_KEY, user);
    localStorage.setItem(SESSION_ADMIN_KEY, String(isAdmin));
    saveSelectedBranch(branch);
}

export function clearSession() {
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_ADMIN_KEY);
}

export function saveSelectedBranch(branch) {
    localStorage.setItem(SESSION_BRANCH_KEY, normalizeBranch(branch));
}

export function restoreSelectedBranch() {
    return normalizeBranch(localStorage.getItem(SESSION_BRANCH_KEY) || DEFAULT_BRANCH);
}

// 사용 기록은 usageLogs/{branch}/{yyyy-mm-dd}에 이미 날짜별로 분리 저장되므로
// 일자 롤오버 시 boardState에서 history로 로그를 복사할 필요가 없다.
// boardState는 오직 "오늘의 점유 상태(numbers)"만 담당한다.
export async function checkDailyReset(adminFlag = false) {
    state.todayString = getTodayString();
    const boardStateRef = dbRef("system/boardState");
    const snap = await get(boardStateRef);

    if (snap.exists()) {
        const data = snap.val();
        if (data.date && data.date !== state.todayString) {
            await update(boardStateRef, { date: state.todayString, numbers: {} });
        }
    } else {
        await set(boardStateRef, { date: state.todayString, numbers: {} });
        await set(dbRef("system/config"), { totalNumbers: 20, disabledNumbers: {} });
    }

    if (adminFlag) {
        const exportDateEl = document.getElementById("export-date");
        if (exportDateEl) {
            exportDateEl.value = state.todayString;
        }
    }
}
