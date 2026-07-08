import { db, ref, set, get, state } from './data.js';
import { restoreSession, saveSession, clearSession, checkDailyReset } from './storage.js';
import {
    switchScreen,
    updateUserHeader,
    setMode,
    toggleEditMode,
    sendUserAlarm,
    logoutAction,
    listenToUserAlarmsForUser,
    listenToBoard,
    returnAllNumbers,
    listenToAlarms
} from './ui.js';
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
} from './admin.js';
import { exportExcel } from './excel.js';

function processLoginAction(id, adminFlag) {
    state.currentUser = id;
    state.isAdmin = adminFlag;
    saveSession(id, adminFlag);

    if (state.isAdmin) {
        switchScreen('admin');
        listenToAdminBoard();
        listenToResetRequests();
        listenToUserAlarms();
        return;
    }

    updateUserHeader();
    switchScreen('main');
    listenToBoard();
    listenToAlarms();
    listenToUserAlarmsForUser();
}

async function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value.trim();
    if (!id || !pw) {
        alert('ID(이름)와 비밀번호를 모두 입력해주세요.');
        return;
    }

    if (id === 'PUSWT' && pw === 'PUSWT') {
        try {
            await checkDailyReset(true);
            processLoginAction(id, true);
        } catch (error) {
            alert('서버 연결 실패.');
        }
        return;
    }

    try {
        await checkDailyReset(false);
        const [userSnap, whitelistSnap] = await Promise.all([
            get(ref(db, `users/${id}`)),
            get(ref(db, `system/whitelist/${id}`))
        ]);

        const isWhitelisted = whitelistSnap.exists();
        const existingPw = userSnap.exists() ? userSnap.val().pw : null;

        if (!isWhitelisted && !existingPw) {
            alert('사전 등록된 명단에 없습니다. 관리자에게 문의하세요.');
            return;
        }

        if (!existingPw) {
            await set(ref(db, `users/${id}`), { pw, role: 'user' });
            alert('환영합니다! 지금 입력하신 비밀번호로 계정이 확정되었습니다.');
            processLoginAction(id, false);
        } else if (existingPw === pw) {
            processLoginAction(id, false);
        } else {
            alert('비밀번호가 올바르지 않습니다.');
        }
    } catch (error) {
        console.error(error);
        alert('서버 연결 실패.');
    }
}

function bindEvents() {
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-mode-self').addEventListener('click', () => setMode('본인'));
    document.getElementById('btn-mode-crew').addEventListener('click', () => setMode('크루'));
    document.getElementById('btn-mode-charge').addEventListener('click', () => setMode('충전중'));
    document.getElementById('btn-edit-mode').addEventListener('click', (event) => toggleEditMode(event.currentTarget));
    document.getElementById('btn-user-alarm').addEventListener('click', sendUserAlarm);
    document.getElementById('btn-logout').addEventListener('click', logoutAction);
    document.getElementById('btn-admin-logout').addEventListener('click', logoutAction);
    document.getElementById('btn-return-all').addEventListener('click', returnAllNumbers);
    document.getElementById('btn-reset-all-pw').addEventListener('click', resetAllPasswords);
    document.getElementById('btn-dismiss-alarm').addEventListener('click', dismissAllAlarms);
    document.getElementById('btn-admin-reset-all').addEventListener('click', adminResetAllNumbers);
    document.getElementById('btn-toggle-admin-board').addEventListener('click', toggleAdminBoard);
    document.getElementById('btn-user-reset-req').addEventListener('click', requestPasswordReset);
    document.getElementById('admin-whitelist-title').addEventListener('click', toggleWhitelistDropdown);
    document.addEventListener('click', handleWhitelistOutsideClick);
    document.getElementById('btn-add-user').addEventListener('click', addUser);
    document.getElementById('btn-delete-user').addEventListener('click', deleteUser);
    document.getElementById('btn-reset-pw').addEventListener('click', resetUserPassword);
    document.getElementById('btn-update-nums').addEventListener('click', updateTotalNumbers);
    document.getElementById('btn-toggle-disable').addEventListener('click', toggleDisableNumber);
    document.getElementById('btn-send-alarm').addEventListener('click', sendGlobalAlarm);
    document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
}

async function restoreAutoLogin() {
    const savedSession = restoreSession();
    if (!savedSession) {
        return;
    }

    try {
        await checkDailyReset(savedSession.isAdmin);
        processLoginAction(savedSession.user, savedSession.isAdmin);
    } catch (error) {
        console.error('자동 로그인 실패:', error);
        clearSession();
    }
}

async function init() {
    registerAdminGlobals();
    bindEvents();
    state.todayString = '';
    await restoreAutoLogin();
}

window.addEventListener('load', init);
