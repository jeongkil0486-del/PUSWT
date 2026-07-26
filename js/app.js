import {
    APP_DISPLAY_NAME,
    BRANCH_OPTIONS,
    auth,
    state,
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
    logoutAction,
    listenToBoard,
    stopListeningToBoard,
    returnAllNumbers
} from "./ui.js";
import {
    listenToAdminBoard,
    stopListeningToAdminBoard,
    resetAllPasswords,
    adminResetAllNumbers,
    toggleAdminBoard,
    requestPasswordReset,
    listenToResetRequests,
    stopListeningToResetRequests,
    toggleWhitelistDropdown,
    handleWhitelistOutsideClick,
    addUser,
    deleteUser,
    resetUserPassword,
    updateTotalNumbers,
    toggleDisableNumber,
    openSeatNamesPanel,
    closeSeatNamesPanel,
    saveSeatNames,
    resetSeatNames
} from "./admin.js";
import { exportExcel } from "./excel.js";
import { authenticateUser, logoutFirebase } from "./auth.js";
import { deactivateCurrentDeviceToken, initializePushForLogin, registerAppStateListener } from "./native.js";
import {
    listenToNotificationHistory,
    stopListeningToNotificationHistory,
    sendGeneralNotification,
    sendUrgentNotification
} from "./notifications.js";

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

// 앱이 백그라운드/종료 상태가 되면 RTDB 리스너를 모두 끊고,
// 포그라운드로 돌아왔을 때만 현재 화면(admin/main)에 맞는 리스너를 다시 건다.
// 알림 수신은 이 리스너들과 무관하게 FCM 네이티브 푸시가 전담한다.
function stopAllBoardListeners() {
    stopListeningToBoard();
    stopListeningToAdminBoard();
    stopListeningToResetRequests();
    stopListeningToNotificationHistory();
}

function processLoginAction(id, adminFlag) {
    state.currentUser = id;
    state.isAdmin = adminFlag;
    saveSession(id, adminFlag, state.currentBranch);

    registerAppStateListener({
        onBackground: stopAllBoardListeners,
        onForeground: () => {
            if (!state.currentUser) return;
            if (state.isAdmin) {
                listenToAdminBoard();
                listenToResetRequests();
                listenToNotificationHistory();
            } else {
                listenToBoard();
            }
        }
    });

    if (state.isAdmin) {
        switchScreen("admin");
        updateBranchBadges();
        listenToAdminBoard();
        listenToResetRequests();
        listenToNotificationHistory();
        return;
    }

    updateUserHeader();
    switchScreen("main");
    listenToBoard();
    initializePushForLogin().catch((error) => console.error("푸시 초기화 실패:", error));
}

async function handleLogin() {
    const id = document.getElementById("login-id").value.trim();
    const pw = document.getElementById("login-pw").value.trim();
    if (!id || !pw) {
        alert("ID(이름)와 비밀번호를 모두 입력해주세요.");
        return;
    }

    try {
        const login = await authenticateUser(state.currentBranch, id, pw);
        await checkDailyReset(login.isAdmin);
        processLoginAction(id, login.isAdmin);
    } catch (error) {
        console.error(error);
        alert("로그인에 실패했습니다. 계정 정보 또는 Firebase Functions 배포 상태를 확인해주세요.");
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
    const handleLogout = async () => {
        await deactivateCurrentDeviceToken();
        await logoutFirebase();
        logoutAction();
    };
    document.getElementById("btn-logout").addEventListener("click", handleLogout);
    document.getElementById("btn-admin-logout").addEventListener("click", handleLogout);
    document.getElementById("btn-return-all").addEventListener("click", returnAllNumbers);
    document.getElementById("btn-reset-all-pw").addEventListener("click", resetAllPasswords);
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
    document.getElementById("btn-send-urgent").addEventListener("click", sendUrgentNotification);
    document.getElementById("btn-send-general").addEventListener("click", sendGeneralNotification);
    document.getElementById("btn-export-excel").addEventListener("click", exportExcel);
    document.getElementById("btn-seat-names").addEventListener("click", openSeatNamesPanel);
    document.getElementById("btn-seat-names-close").addEventListener("click", closeSeatNamesPanel);
    document.getElementById("btn-seat-names-save").addEventListener("click", saveSeatNames);
    document.getElementById("btn-seat-names-reset").addEventListener("click", resetSeatNames);
}

async function restoreAutoLogin() {
    const savedSession = restoreSession();
    if (!savedSession) {
        return;
    }

    try {
        await auth.authStateReady();
        if (!auth.currentUser) {
            clearSession();
            return;
        }
        const claims = (await auth.currentUser.getIdTokenResult()).claims;
        if (claims.branch !== savedSession.branch || claims.userId !== savedSession.user) {
            await logoutFirebase();
            clearSession();
            return;
        }
        syncBranchSelection(savedSession.branch);
        const isAdmin = claims.role === "admin";
        await checkDailyReset(isAdmin);
        processLoginAction(savedSession.user, isAdmin);
    } catch (error) {
        console.error("자동 로그인 실패:", error);
        clearSession();
    }
}

async function init() {
    document.title = APP_DISPLAY_NAME;
    switchScreen("login");
    renderBranchOptions();
    syncBranchSelection(restoreSelectedBranch());
    bindEvents();
    state.todayString = "";
    await restoreAutoLogin();
}

window.addEventListener("load", init);
