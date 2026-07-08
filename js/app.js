import {
    APP_DISPLAY_NAME,
    BRANCH_OPTIONS,
    DEFAULT_BRANCH_WHITELISTS,
    dbRef,
    get,
    getAdminAccount,
    set,
    state,
    update,
    setCurrentBranch
} from "./data.js";
import {
    restoreSession,
    saveSession,
    clearSession,
    checkDailyReset,
    restoreSelectedBranch,
    saveSelectedBranch
} from "./storage.js";
import {
    switchScreen,
    updateUserHeader,
    updateBranchBadges,
    setMode,
    toggleEditMode,
    sendUserAlarm,
    logoutAction,
    listenToUserAlarmsForUser,
    listenToBoard,
    returnAllNumbers,
    listenToAlarms
} from "./ui.js";
import {
    registerAdminGlobals,
    listenToAdminBoard,
    listenToUserAlarms,
    resetAllPasswords,
    dismissAllAlarms,
    adminResetAllNumbers,
    toggleAdminBoard,
    requestPasswordReset,
    listenToResetRequests,
    toggleWhitelistDropdown,
    handleWhitelistOutsideClick,
    addUser,
    deleteUser,
    resetUserPassword,
    updateTotalNumbers,
    toggleDisableNumber,
    sendGlobalAlarm
} from "./admin.js";
import { exportExcel } from "./excel.js";

function renderBranchOptions() {
    const select = document.getElementById("branch-select");
    select.innerHTML = BRANCH_OPTIONS.map((branch) => (
        `<option value="${branch.code}">${branch.label}</option>`
    )).join("");
    updateBranchSelectionDisplay(select.value);
}

function updateBranchSelectionDisplay(branchCode) {
    const select = document.getElementById("branch-select");
    const display = document.getElementById("branch-select-display");
    const selectedOption = [...select.options].find((option) => option.value === branchCode) || select.selectedOptions[0];
    display.textContent = selectedOption ? selectedOption.textContent : "";
}

function syncBranchSelection(branchCode) {
    const normalized = setCurrentBranch(branchCode);
    const select = document.getElementById("branch-select");
    select.value = normalized;
    updateBranchSelectionDisplay(normalized);
    saveSelectedBranch(normalized);
    updateBranchBadges();
}

async function ensureBranchWhitelistSeed(branchCode) {
    const names = DEFAULT_BRANCH_WHITELISTS[branchCode];
    if (!Array.isArray(names) || names.length === 0) {
        return;
    }

    const whitelistRef = dbRef("system/whitelist", branchCode);

    try {
        const whitelistSnap = await get(whitelistRef);
        const existing = whitelistSnap.exists() ? whitelistSnap.val() || {} : {};
        const missingNames = names.filter((name) => !existing[name]);
        if (missingNames.length === 0) {
            return;
        }

        const seedData = missingNames.reduce((accumulator, name) => {
            accumulator[name] = true;
            return accumulator;
        }, {});

        await update(whitelistRef, seedData);
    } catch (error) {
        console.error(`${branchCode} whitelist seed failed:`, error);
    }
}

function processLoginAction(id, adminFlag) {
    state.currentUser = id;
    state.isAdmin = adminFlag;
    saveSession(id, adminFlag, state.currentBranch);

    if (state.isAdmin) {
        switchScreen("admin");
        updateBranchBadges();
        listenToAdminBoard();
        listenToResetRequests();
        listenToUserAlarms();
        return;
    }

    updateUserHeader();
    switchScreen("main");
    listenToBoard();
    listenToAlarms();
    listenToUserAlarmsForUser();
}

async function handleLogin() {
    const id = document.getElementById("login-id").value.trim();
    const pw = document.getElementById("login-pw").value.trim();
    if (!id || !pw) {
        alert("ID(이름)와 비밀번호를 모두 입력해주세요.");
        return;
    }

    const adminAccount = getAdminAccount();
    if (id === adminAccount.id && pw === adminAccount.password) {
        try {
            await checkDailyReset(true);
            processLoginAction(id, true);
        } catch (error) {
            alert("서버 연결 실패.");
        }
        return;
    }

    try {
        await checkDailyReset(false);
        const [userSnap, whitelistSnap] = await Promise.all([
            get(dbRef(`users/${id}`)),
            get(dbRef(`system/whitelist/${id}`))
        ]);

        const isWhitelisted = whitelistSnap.exists();
        const existingPw = userSnap.exists() ? userSnap.val().pw : null;

        if (!isWhitelisted && !existingPw) {
            alert("사전 등록된 명단에 없습니다. 관리자에게 문의하세요.");
            return;
        }

        if (!existingPw) {
            await set(dbRef(`users/${id}`), { pw, role: "user" });
            alert("환영합니다! 지금 입력하신 비밀번호로 계정이 확정되었습니다.");
            processLoginAction(id, false);
        } else if (existingPw === pw) {
            processLoginAction(id, false);
        } else {
            alert("비밀번호가 올바르지 않습니다.");
        }
    } catch (error) {
        console.error(error);
        alert("서버 연결 실패.");
    }
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById("login-pw");
    const toggleButton = document.getElementById("btn-toggle-password");
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    toggleButton.classList.toggle("active", isPassword);
}

function bindFocusableControlRows() {
    document.querySelectorAll(".control-row-focusable").forEach((row) => {
        row.addEventListener("click", (event) => {
            if (event.target.closest("button")) {
                return;
            }

            const targetId = row.dataset.focusTarget;
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) {
                return;
            }

            input.focus();
            if (typeof input.setSelectionRange === "function") {
                const valueLength = input.value.length;
                input.setSelectionRange(valueLength, valueLength);
            }
        });
    });
}

function bindEvents() {
    document.getElementById("branch-select").addEventListener("change", (event) => {
        syncBranchSelection(event.target.value);
    });
    bindFocusableControlRows();
    document.getElementById("btn-login").addEventListener("click", handleLogin);
    document.getElementById("btn-toggle-password").addEventListener("click", togglePasswordVisibility);
    document.getElementById("btn-mode-self").addEventListener("click", () => setMode("본인"));
    document.getElementById("btn-mode-crew").addEventListener("click", () => setMode("크루"));
    document.getElementById("btn-mode-charge").addEventListener("click", () => setMode("충전중"));
    document.getElementById("btn-edit-mode").addEventListener("click", (event) => toggleEditMode(event.currentTarget));
    document.getElementById("btn-user-alarm").addEventListener("click", sendUserAlarm);
    document.getElementById("btn-logout").addEventListener("click", logoutAction);
    document.getElementById("btn-admin-logout").addEventListener("click", logoutAction);
    document.getElementById("btn-return-all").addEventListener("click", returnAllNumbers);
    document.getElementById("btn-reset-all-pw").addEventListener("click", resetAllPasswords);
    document.getElementById("btn-dismiss-alarm").addEventListener("click", dismissAllAlarms);
    document.getElementById("btn-admin-reset-all").addEventListener("click", adminResetAllNumbers);
    document.getElementById("btn-toggle-admin-board").addEventListener("click", toggleAdminBoard);
    document.getElementById("btn-user-reset-req").addEventListener("click", requestPasswordReset);
    document.getElementById("admin-whitelist-title").addEventListener("click", toggleWhitelistDropdown);
    document.addEventListener("click", handleWhitelistOutsideClick);
    document.getElementById("btn-add-user").addEventListener("click", addUser);
    document.getElementById("btn-delete-user").addEventListener("click", deleteUser);
    document.getElementById("btn-reset-pw").addEventListener("click", resetUserPassword);
    document.getElementById("btn-update-nums").addEventListener("click", updateTotalNumbers);
    document.getElementById("btn-toggle-disable").addEventListener("click", toggleDisableNumber);
    document.getElementById("btn-send-alarm").addEventListener("click", sendGlobalAlarm);
    document.getElementById("btn-export-excel").addEventListener("click", exportExcel);
}

async function restoreAutoLogin() {
    const savedSession = restoreSession();
    if (!savedSession) {
        return;
    }

    try {
        syncBranchSelection(savedSession.branch);
        await checkDailyReset(savedSession.isAdmin);
        processLoginAction(savedSession.user, savedSession.isAdmin);
    } catch (error) {
        console.error("자동 로그인 실패:", error);
        clearSession();
    }
}

async function init() {
    document.title = APP_DISPLAY_NAME;
    registerAdminGlobals();
    switchScreen("login");
    renderBranchOptions();
    syncBranchSelection(restoreSelectedBranch());
    await ensureBranchWhitelistSeed("TAE");
    bindEvents();
    state.todayString = "";
    await restoreAutoLogin();
}

window.addEventListener("load", init);
