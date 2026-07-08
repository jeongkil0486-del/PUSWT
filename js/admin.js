import { db, ref, set, get, update, remove, onValue, push, state } from './data.js';
import { renderGrid } from './ui.js';

export function registerAdminGlobals() {
    window.dismissAlarm = dismissAlarm;
}

export function listenToAdminBoard() {
    const adminGrid = document.getElementById('admin-number-grid');
    onValue(ref(db, 'system'), (snapshot) => {
        if (!snapshot.exists()) {
            return;
        }

        const data = snapshot.val();
        const total = (data.config && data.config.totalNumbers) || 20;
        const disabled = (data.config && data.config.disabledNumbers) || {};
        const occupied = (data.boardState && data.boardState.numbers) || {};

        renderGrid(adminGrid, total, disabled, occupied, {
            isAdminView: true,
            onAdminClear: adminForceClear
        });

        if (state.currentAlarmSenders.size > 0) {
            applyAlarmBlinkToBoxes(state.currentAlarmSenders);
        }
    });
}

export function applyAlarmBlinkToBoxes(senders) {
    const adminGrid = document.getElementById('admin-number-grid');
    if (!adminGrid) {
        return;
    }

    Array.from(adminGrid.querySelectorAll('.number-box')).forEach((box) => {
        const nameTag = box.querySelector('.name-tag');
        const base = nameTag ? nameTag.innerText.split('(')[0] : '';
        if (senders.has(base)) {
            box.classList.add('alarm-blink');
        } else {
            box.classList.remove('alarm-blink');
        }
    });
}

export function clearAllAlarmBlink() {
    const adminGrid = document.getElementById('admin-number-grid');
    if (!adminGrid) {
        return;
    }

    adminGrid.querySelectorAll('.alarm-blink').forEach((box) => box.classList.remove('alarm-blink'));
    state.currentAlarmSenders = new Set();
}

export function listenToUserAlarms() {
    const fiveMin = 5 * 60 * 1000;
    onValue(ref(db, 'system/userAlarms'), (snap) => {
        const alarmBanner = document.getElementById('admin-incoming-alarm');
        const alarmList = document.getElementById('alarm-list');

        if (!snap.exists()) {
            alarmBanner.classList.add('hidden');
            clearAllAlarmBlink();
            return;
        }

        const allAlarms = snap.val();
        const now = Date.now();
        const active = Object.entries(allAlarms)
            .map(([key, value]) => ({ key, ...value }))
            .filter((alarm) => !alarm.dismissed && now - alarm.timestamp < fiveMin)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (active.length === 0) {
            alarmBanner.classList.add('hidden');
            clearAllAlarmBlink();
            return;
        }

        alarmList.innerHTML = active.map((alarm) => {
            const elapsed = now - alarm.timestamp;
            const mins = Math.floor(elapsed / 60000);
            const secs = Math.floor((elapsed % 60000) / 1000);
            const timeAgo = mins > 0 ? `${mins}분 ${secs}초 전` : `${secs}초 전`;
            return '<div style="padding:4px 0; border-bottom:1px solid #ffd0d0; display:flex; justify-content:space-between; align-items:center;">'
                + `<span>&#128276; <b>${alarm.sender}</b> (${timeAgo})</span>`
                + `<button onclick="dismissAlarm('${alarm.key}')" style="background:#8e8e93;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;">끄기</button>`
                + '</div>';
        }).join('');

        state.currentAlarmSenders = new Set(active.map((alarm) => alarm.sender));
        alarmBanner.classList.remove('hidden');
        applyAlarmBlinkToBoxes(state.currentAlarmSenders);
    });
}

export async function dismissAlarm(key) {
    try {
        await update(ref(db, `system/userAlarms/${key}`), { dismissed: true });
    } catch (error) {
        console.error('알림 끄기 실패:', error);
    }
}

export async function resetAllPasswords() {
    if (!confirm('모든 직원의 비밀번호를 초기화하시겠습니까?\n(각 직원이 다음 로그인 시 새 비밀번호를 설정하게 됩니다)')) {
        return;
    }

    try {
        const whitelistSnap = await get(ref(db, 'system/whitelist'));
        if (!whitelistSnap.exists()) {
            alert('등록된 직원 명단이 없습니다.');
            return;
        }

        const names = Object.keys(whitelistSnap.val());
        const tasks = names.map((name) => remove(ref(db, `users/${name}`)));
        await Promise.all(tasks);
        alert(`총 ${names.length}명의 비밀번호가 전체 초기화되었습니다.`);
    } catch (error) {
        console.error('전체 PW 초기화 오류:', error);
        alert('초기화 실패. 다시 시도해주세요.');
    }
}

export async function dismissAllAlarms() {
    try {
        const snap = await get(ref(db, 'system/userAlarms'));
        if (!snap.exists()) {
            return;
        }

        const tasks = Object.keys(snap.val()).map((key) => update(ref(db, `system/userAlarms/${key}`), { dismissed: true }));
        await Promise.all(tasks);
    } catch (error) {
        console.error('전체 알림 끄기 실패:', error);
    }
}

export async function adminForceClear(num, currentOccupant) {
    if (!confirm(`[${currentOccupant}] 님이 사용 중인 ${num}번을 강제로 반납(취소)하시겠습니까?`)) {
        return;
    }

    try {
        const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        await remove(ref(db, `system/boardState/numbers/${num}`));
        await push(ref(db, 'system/boardState/log'), {
            time: timeStr,
            num,
            action: '관리자강제취소',
            user: currentOccupant.split('(')[0]
        });
    } catch (error) {
        console.error('강제 취소 오류:', error);
        alert('처리 중 오류가 발생했습니다.');
    }
}

export async function adminResetAllNumbers() {
    if (!confirm('현재 선택된 모든 사람들의 번호를 강제로 초기화(전체 반납) 하시겠습니까?')) {
        return;
    }

    try {
        const snap = await get(ref(db, 'system/boardState/numbers'));
        if (!snap.exists() || !snap.val()) {
            alert('비울 번호가 없습니다.');
            return;
        }

        const numbers = snap.val();
        if (Object.keys(numbers).length === 0) {
            alert('비울 번호가 없습니다.');
            return;
        }

        const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const tasks = Object.entries(numbers).map(([num, name]) =>
            remove(ref(db, `system/boardState/numbers/${num}`)).then(() => push(ref(db, 'system/boardState/log'), {
                time: timeStr,
                num,
                action: '관리자전체강제취소',
                user: name.split('(')[0]
            }))
        );

        await Promise.all(tasks);
        alert('모든 번호판이 성공적으로 초기화되었습니다.');
    } catch (error) {
        console.error('전체 강제 초기화 오류:', error);
        alert('처리 중 오류가 발생했습니다.');
    }
}

export function toggleAdminBoard() {
    document.getElementById('admin-board-popup').classList.toggle('hidden');
}

export async function requestPasswordReset() {
    const id = document.getElementById('login-id').value.trim();
    if (!id) {
        alert('ID(이름) 칸에 본인 이름을 먼저 적고 [비밀번호 초기화 요청]을 눌러주세요.');
        return;
    }

    try {
        await set(ref(db, `system/resetRequests/${id}`), true);
        alert(`[${id}]님의 비밀번호 초기화를 관리자에게 요청했습니다.`);
    } catch (error) {
        alert('요청 전송 실패. 네트워크를 확인해주세요.');
    }
}

export function listenToResetRequests() {
    onValue(ref(db, 'system/resetRequests'), (snap) => {
        const badge = document.getElementById('reset-badge');
        if (snap.exists()) {
            state.pendingResets = Object.keys(snap.val());
            if (state.pendingResets.length > 0) {
                badge.innerText = state.pendingResets.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
            return;
        }

        state.pendingResets = [];
        badge.style.display = 'none';
    });
}

export function toggleWhitelistDropdown() {
    document.getElementById('whitelist-dropdown').classList.toggle('hidden');
    renderWhitelist();
}

export function handleWhitelistOutsideClick(event) {
    const title = document.getElementById('admin-whitelist-title');
    const dropdown = document.getElementById('whitelist-dropdown');
    if (!title.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.add('hidden');
    }
}

export async function renderWhitelist() {
    const content = document.getElementById('whitelist-content');
    content.innerHTML = '불러오는 중...';

    try {
        const snap = await get(ref(db, 'system/whitelist'));
        if (snap.exists()) {
            const names = Object.keys(snap.val());
            content.innerHTML = names.map((name) => `<div class="whitelist-item">- ${name}</div>`).join('');
        } else {
            content.innerHTML = '등록된 명단이 없습니다.';
        }
    } catch (error) {
        content.innerHTML = '명단 로딩 실패.';
    }
}

export async function addUser() {
    const id = document.getElementById('admin-target-user').value.trim();
    if (!id) {
        alert('직원 이름을 입력하세요.');
        return;
    }

    try {
        await set(ref(db, `system/whitelist/${id}`), true);
        alert(`[${id}]님이 명단에 등록되었습니다.`);
        document.getElementById('admin-target-user').value = '';
        renderWhitelist();
    } catch (error) {
        alert('명단 추가 실패.');
    }
}

export async function deleteUser() {
    const id = document.getElementById('admin-target-user').value.trim();
    if (!id) {
        alert('삭제할 직원 이름을 입력하세요.');
        return;
    }

    if (!confirm(`[${id}]님의 계정을 완전히 삭제하시겠습니까?`)) {
        return;
    }

    try {
        await remove(ref(db, `system/whitelist/${id}`));
        await remove(ref(db, `users/${id}`));
        alert(`[${id}] 계정이 삭제되었습니다.`);
        document.getElementById('admin-target-user').value = '';
        renderWhitelist();
    } catch (error) {
        alert('계정 삭제 실패.');
    }
}

export async function resetUserPassword() {
    const id = document.getElementById('admin-target-user').value.trim();
    if (!id) {
        if (state.pendingResets.length > 0) {
            alert(`[현재 초기화 요청 대기자]\n- ${state.pendingResets.join('\n- ')}\n\n입력창에 이름을 적고 버튼을 누르시면 초기화됩니다.`);
            return;
        }

        alert('초기화할 직원 이름을 입력하세요.');
        return;
    }

    try {
        const userSnap = await get(ref(db, `users/${id}`));
        const whitelistSnap = await get(ref(db, `system/whitelist/${id}`));
        if (userSnap.exists() || whitelistSnap.exists()) {
            await remove(ref(db, `users/${id}`));
            await set(ref(db, `system/whitelist/${id}`), true);
            await remove(ref(db, `system/resetRequests/${id}`));
            alert(`[${id}]님의 비밀번호가 초기화되었습니다.\n다시 로그인할 때 입력하는 새로운 비밀번호가 계정 비밀번호로 확정됩니다.`);
            document.getElementById('admin-target-user').value = '';
        } else {
            alert(`[${id}]님은 등록된 명단에 없습니다.`);
        }
    } catch (error) {
        alert('비밀번호 초기화 실패.');
    }
}

export async function updateTotalNumbers() {
    const total = parseInt(document.getElementById('admin-total-nums').value, 10);
    if (!total || total < 1) {
        alert('올바른 번호 개수를 입력하세요.');
        return;
    }

    try {
        await update(ref(db, 'system/config'), { totalNumbers: total });
        alert(`번호판이 ${total}개로 변경되었습니다.`);
    } catch (error) {
        alert('변경 실패.');
    }
}

export async function toggleDisableNumber() {
    const num = parseInt(document.getElementById('admin-disable-num').value, 10);
    if (!num) {
        alert('번호를 입력하세요.');
        return;
    }

    try {
        const configRef = ref(db, 'system/config');
        const snap = await get(configRef);
        const disables = snap.exists() ? snap.val().disabledNumbers || {} : {};
        if (disables[num]) {
            delete disables[num];
        } else {
            disables[num] = true;
        }
        await update(configRef, { disabledNumbers: disables });
        alert(`${num}번 상태가 변경되었습니다.`);
    } catch (error) {
        alert('상태 변경 실패.');
    }
}

export async function sendGlobalAlarm() {
    try {
        await set(ref(db, 'system/alarm'), { timestamp: Date.now() });
        alert('미반납자 전체에게 퇴근 경고 알람이 전송되었습니다.');
    } catch (error) {
        alert('알람 전송 실패.');
    }
}
