import { dbRef, set, get, update, remove, onValue, push, state } from "./data.js";
import { renderGrid } from "./ui.js";

function formatElapsedTime(elapsed) {
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    return mins > 0 ? `${mins}분 ${secs}초 전` : `${secs}초 전`;
}

export function registerAdminGlobals() {
    window.dismissAlarm = dismissAlarm;
    window.dismissAlarmBySender = dismissAlarmBySender;
}

export function listenToAdminBoard() {
    const adminGrid = document.getElementById("admin-number-grid");
    onValue(dbRef("system"), (snapshot) => {
        if (!snapshot.exists()) {
            return;
        }

        const data = snapshot.val();
        const total = data.config?.totalNumbers || 20;
        const disabled = data.config?.disabledNumbers || {};
        const occupied = data.boardState?.numbers || {};
        // seatNames, seatOrder 실시간 반영
        state.seatNames = data.config?.seatNames || {};
        state.seatOrder = data.config?.seatOrder || [];

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
    const adminGrid = document.getElementById("admin-number-grid");
    if (!adminGrid) {
        return;
    }

    Array.from(adminGrid.querySelectorAll(".number-box")).forEach((box) => {
        const nameTag = box.querySelector(".name-tag");
        const base = nameTag ? nameTag.innerText.split("(")[0] : "";
        if (senders.has(base)) {
            box.classList.add("alarm-blink");
        } else {
            box.classList.remove("alarm-blink");
        }
    });
}

export function clearAllAlarmBlink() {
    const adminGrid = document.getElementById("admin-number-grid");
    if (!adminGrid) {
        return;
    }

    adminGrid.querySelectorAll(".alarm-blink").forEach((box) => box.classList.remove("alarm-blink"));
    state.currentAlarmSenders = new Set();
}

export function listenToUserAlarms() {
    const fiveMin = 5 * 60 * 1000;
    onValue(dbRef("system/userAlarms"), (snap) => {
        const alarmBanner = document.getElementById("admin-incoming-alarm");
        const alarmList = document.getElementById("alarm-list");

        if (!snap.exists()) {
            alarmBanner.classList.add("hidden");
            clearAllAlarmBlink();
            return;
        }

        const allAlarms = snap.val();
        const now = Date.now();

        // 5분 이상 지난 항목은 Firebase에서 자동 dismissed 처리
        const expiredKeys = Object.entries(allAlarms)
            .filter(([, v]) => !v.dismissed && now - v.timestamp >= fiveMin)
            .map(([key]) => key);
        if (expiredKeys.length > 0) {
            expiredKeys.forEach((key) => update(dbRef(`system/userAlarms/${key}`), { dismissed: true }));
        }

        // dismissed 아니고 5분 미만인 항목만, sender별 가장 최신 1개만 표시
        const allActive = Object.entries(allAlarms)
            .map(([key, value]) => ({ key, ...value }))
            .filter((alarm) => !alarm.dismissed && now - alarm.timestamp < fiveMin)
            .sort((a, b) => b.timestamp - a.timestamp);

        // sender별 중복 제거 — 가장 최신 1건만 남김
        const seenSenders = new Set();
        const active = allActive.filter((alarm) => {
            if (seenSenders.has(alarm.sender)) return false;
            seenSenders.add(alarm.sender);
            return true;
        });

        if (active.length === 0) {
            alarmBanner.classList.add("hidden");
            clearAllAlarmBlink();
            return;
        }

        alarmList.innerHTML = active.map((alarm) => (
            `<div style="padding:4px 0; border-bottom:1px solid #ffd0d0; display:flex; justify-content:space-between; align-items:center;">
                <span>&#128276; <b>${alarm.sender}</b> (${formatElapsedTime(now - alarm.timestamp)})</span>
                <button onclick="dismissAlarmBySender('${alarm.sender}')" style="background:#8e8e93;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;">끄기</button>
            </div>`
        )).join("");

        state.currentAlarmSenders = new Set(active.map((alarm) => alarm.sender));
        alarmBanner.classList.remove("hidden");
        applyAlarmBlinkToBoxes(state.currentAlarmSenders);
    });
}

// sender 기준으로 해당 사람의 모든 알림을 dismissed 처리
export async function dismissAlarmBySender(sender) {
    try {
        const snap = await get(dbRef("system/userAlarms"));
        if (!snap.exists()) return;
        const all = snap.val();
        const tasks = Object.entries(all)
            .filter(([, v]) => v.sender === sender && !v.dismissed)
            .map(([key]) => update(dbRef(`system/userAlarms/${key}`), { dismissed: true }));
        await Promise.all(tasks);
    } catch (error) {
        console.error("알림 끄기 실패:", error);
    }
}

export async function dismissAlarm(key) {
    try {
        await update(dbRef(`system/userAlarms/${key}`), { dismissed: true });
    } catch (error) {
        console.error("알림 끄기 실패:", error);
    }
}

export async function resetAllPasswords() {
    if (!confirm("모든 직원의 비밀번호를 초기화하시겠습니까?\n(각 직원이 다음 로그인 시 새 비밀번호를 설정하게 됩니다)")) {
        return;
    }

    try {
        const whitelistSnap = await get(dbRef("system/whitelist"));
        if (!whitelistSnap.exists()) {
            alert("등록된 직원 명단이 없습니다.");
            return;
        }

        const names = Object.keys(whitelistSnap.val());
        const tasks = names.map((name) => remove(dbRef(`users/${name}`)));
        await Promise.all(tasks);
        alert(`총 ${names.length}명의 비밀번호가 전체 초기화되었습니다.`);
    } catch (error) {
        console.error("전체 PW 초기화 오류:", error);
        alert("초기화 실패. 다시 시도해주세요.");
    }
}

export async function dismissAllAlarms() {
    try {
        const snap = await get(dbRef("system/userAlarms"));
        if (!snap.exists()) {
            return;
        }

        const tasks = Object.keys(snap.val()).map((key) => update(dbRef(`system/userAlarms/${key}`), { dismissed: true }));
        await Promise.all(tasks);
    } catch (error) {
        console.error("전체 알림 끄기 실패:", error);
    }
}

export async function adminForceClear(num, currentOccupant) {
    if (!confirm(`[${currentOccupant}] 님이 사용 중인 ${num}번을 강제로 반납(취소)하시겠습니까?`)) {
        return;
    }

    try {
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
        await remove(dbRef(`system/boardState/numbers/${num}`));
        await push(dbRef("system/boardState/log"), {
            time: timeStr,
            num,
            action: "관리자강제취소",
            user: currentOccupant.split("(")[0]
        });
    } catch (error) {
        console.error("강제 취소 오류:", error);
        alert("처리 중 오류가 발생했습니다.");
    }
}

export async function adminResetAllNumbers() {
    if (!confirm("현재 선택된 모든 사람들의 번호를 강제로 초기화(전체 반납) 하시겠습니까?")) {
        return;
    }

    try {
        const snap = await get(dbRef("system/boardState/numbers"));
        if (!snap.exists() || !snap.val()) {
            alert("비울 번호가 없습니다.");
            return;
        }

        const numbers = snap.val();
        if (Object.keys(numbers).length === 0) {
            alert("비울 번호가 없습니다.");
            return;
        }

        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
        const tasks = Object.entries(numbers).map(([num, name]) =>
            remove(dbRef(`system/boardState/numbers/${num}`)).then(() => push(dbRef("system/boardState/log"), {
                time: timeStr,
                num,
                action: "관리자전체강제취소",
                user: name.split("(")[0]
            }))
        );

        await Promise.all(tasks);
        alert("모든 번호판이 성공적으로 초기화되었습니다.");
    } catch (error) {
        console.error("전체 강제 초기화 오류:", error);
        alert("처리 중 오류가 발생했습니다.");
    }
}

export function toggleAdminBoard() {
    document.getElementById("admin-board-popup").classList.toggle("hidden");
}

export async function requestPasswordReset() {
    const id = document.getElementById("login-id").value.trim();
    if (!id) {
        alert("ID(이름) 칸에 본인 이름을 먼저 적고 [비밀번호 초기화 요청]을 눌러주세요.");
        return;
    }

    try {
        await set(dbRef(`system/resetRequests/${id}`), true);
        alert(`[${id}]님의 비밀번호 초기화를 관리자에게 요청했습니다.`);
    } catch (error) {
        alert("요청 전송 실패. 네트워크를 확인해주세요.");
    }
}

export function listenToResetRequests() {
    onValue(dbRef("system/resetRequests"), (snap) => {
        const badge = document.getElementById("reset-badge");
        // 항상 Firebase 실시간 데이터만 기준으로 표시 — 로컬 캐시/이전 state 사용 안 함
        if (snap.exists()) {
            const data = snap.val();
            // true 값을 가진 항목만 유효한 요청으로 간주
            const pendingNames = Object.entries(data)
                .filter(([, v]) => v === true)
                .map(([name]) => name);
            state.pendingResets = pendingNames;
            if (pendingNames.length > 0) {
                badge.innerText = pendingNames.length;
                badge.style.display = "inline-block";
            } else {
                badge.style.display = "none";
            }
        } else {
            // 데이터 없으면 완전 초기화
            state.pendingResets = [];
            badge.style.display = "none";
        }
    });
}

export function toggleWhitelistDropdown() {
    document.getElementById("whitelist-dropdown").classList.toggle("hidden");
    renderWhitelist();
}

export function handleWhitelistOutsideClick(event) {
    const title = document.getElementById("admin-whitelist-title");
    const dropdown = document.getElementById("whitelist-dropdown");
    if (!title.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.add("hidden");
    }
}

export async function renderWhitelist() {
    const content = document.getElementById("whitelist-content");
    content.innerHTML = "불러오는 중...";

    try {
        const snap = await get(dbRef("system/whitelist"));
        if (snap.exists()) {
            const names = Object.keys(snap.val());
            content.innerHTML = names.map((name) => `<div class="whitelist-item">- ${name}</div>`).join("");
        } else {
            content.innerHTML = "등록된 명단이 없습니다.";
        }
    } catch (error) {
        content.innerHTML = "명단 로딩 실패.";
    }
}

export async function addUser() {
    const id = document.getElementById("admin-target-user").value.trim();
    if (!id) {
        alert("직원 이름을 입력하세요.");
        return;
    }

    try {
        await set(dbRef(`system/whitelist/${id}`), true);
        alert(`[${id}]님이 명단에 등록되었습니다.`);
        document.getElementById("admin-target-user").value = "";
        await renderWhitelist();
    } catch (error) {
        alert("명단 추가 실패.");
    }
}

export async function deleteUser() {
    const id = document.getElementById("admin-target-user").value.trim();
    if (!id) {
        alert("삭제할 직원 이름을 입력하세요.");
        return;
    }

    if (!confirm(`[${id}]님의 계정을 완전히 삭제하시겠습니까?`)) {
        return;
    }

    try {
        await remove(dbRef(`system/whitelist/${id}`));
        await remove(dbRef(`users/${id}`));
        alert(`[${id}] 계정이 삭제되었습니다.`);
        document.getElementById("admin-target-user").value = "";
        await renderWhitelist();
    } catch (error) {
        alert("계정 삭제 실패.");
    }
}

export async function resetUserPassword() {
    const id = document.getElementById("admin-target-user").value.trim();
    if (!id) {
        if (state.pendingResets.length > 0) {
            alert(`[현재 초기화 요청 대기자]\n- ${state.pendingResets.join("\n- ")}\n\n입력창에 이름을 적고 버튼을 누르시면 초기화됩니다.`);
            return;
        }

        alert("초기화할 직원 이름을 입력하세요.");
        return;
    }

    try {
        const userSnap = await get(dbRef(`users/${id}`));
        const whitelistSnap = await get(dbRef(`system/whitelist/${id}`));
        if (userSnap.exists() || whitelistSnap.exists()) {
            await remove(dbRef(`users/${id}`));
            await set(dbRef(`system/whitelist/${id}`), true);
            await remove(dbRef(`system/resetRequests/${id}`));
            alert(`[${id}]님의 비밀번호가 초기화되었습니다.\n다시 로그인할 때 입력하는 새로운 비밀번호가 계정 비밀번호로 확정됩니다.`);
            document.getElementById("admin-target-user").value = "";
        } else {
            alert(`[${id}]님은 등록된 명단에 없습니다.`);
        }
    } catch (error) {
        alert("비밀번호 초기화 실패.");
    }
}

export async function updateTotalNumbers() {
    const total = parseInt(document.getElementById("admin-total-nums").value, 10);
    if (!total || total < 1) {
        alert("올바른 번호 개수를 입력하세요.");
        return;
    }

    try {
        await update(dbRef("system/config"), { totalNumbers: total });
        alert(`번호판이 ${total}개로 변경되었습니다.`);
    } catch (error) {
        alert("변경 실패.");
    }
}

export async function toggleDisableNumber() {
    const num = parseInt(document.getElementById("admin-disable-num").value, 10);
    if (!num) {
        alert("번호를 입력하세요.");
        return;
    }

    try {
        const configRef = dbRef("system/config");
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
        alert("상태 변경 실패.");
    }
}

export async function sendGlobalAlarm() {
    try {
        await set(dbRef("system/alarm"), { timestamp: Date.now() });
        alert("미반납자 전체에게 퇴근 경고 알람이 전송되었습니다.");
    } catch (error) {
        alert("알람 전송 실패.");
    }
}

// ─────────────────────────────────────────────
// 번호명 설정 기능
// ─────────────────────────────────────────────

let seatNameDragSrc = null; // 드래그 소스 인덱스

export function openSeatNamesPanel() {
    const panel = document.getElementById("seat-names-panel");
    if (!panel) return;
    panel.classList.remove("hidden");
    renderSeatNamesEditor();
}

export function closeSeatNamesPanel() {
    const panel = document.getElementById("seat-names-panel");
    if (panel) panel.classList.add("hidden");
}

export async function renderSeatNamesEditor() {
    const container = document.getElementById("seat-names-editor");
    if (!container) return;

    // Firebase에서 최신 데이터 읽기
    let total = 20;
    let currentNames = {};
    let hiddenNums = {};
    let order = [];

    try {
        const snap = await get(dbRef("system/config"));
        if (snap.exists()) {
            const cfg = snap.val();
            total = cfg.totalNumbers || 20;
            currentNames = cfg.seatNames || {};
            hiddenNums = cfg.hiddenNumbers || {};
            order = cfg.seatOrder || [];
        }
    } catch (e) {
        console.error("번호명 로딩 실패:", e);
    }

    // order가 없으면 기본 순서 생성
    if (!order.length) {
        order = Array.from({ length: total }, (_, i) => i + 1);
    } else {
        // total 변경 시 새 번호 추가 / 초과 번호 제거
        for (let i = 1; i <= total; i++) {
            if (!order.includes(i)) order.push(i);
        }
        order = order.filter(n => n >= 1 && n <= total);
    }

    container.innerHTML = order.map((num, idx) => {
        const name = currentNames[String(num)] || "";
        const isHidden = !!hiddenNums[String(num)];
        return `
        <div class="sn-row ${isHidden ? "sn-hidden" : ""}" data-idx="${idx}" data-num="${num}"
             draggable="true"
             ondragstart="window._snDragStart(event, ${idx})"
             ondragover="window._snDragOver(event)"
             ondrop="window._snDrop(event, ${idx})">
            <span class="sn-handle" title="드래그로 순서변경">⠿</span>
            <span class="sn-num">${num}번</span>
            <input class="sn-input" type="text" value="${name}" placeholder="표시 이름 (비우면 숫자)" data-num="${num}" maxlength="10">
            <button class="sn-toggle-btn" onclick="window._snToggleHide(${num}, ${isHidden})" title="${isHidden ? "표시" : "숨김"}">
                ${isHidden ? "🙈 숨김" : "👁 표시"}
            </button>
        </div>`;
    }).join("");

    // 드래그 순서 변경
    window._snDragStart = (e, idx) => {
        seatNameDragSrc = idx;
        e.dataTransfer.effectAllowed = "move";
    };
    window._snDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };
    window._snDrop = (e, toIdx) => {
        e.preventDefault();
        if (seatNameDragSrc === null || seatNameDragSrc === toIdx) return;
        const rows = [...container.querySelectorAll(".sn-row")];
        const fromEl = rows[seatNameDragSrc];
        const toEl = rows[toIdx];
        if (seatNameDragSrc < toIdx) {
            container.insertBefore(fromEl, toEl.nextSibling);
        } else {
            container.insertBefore(fromEl, toEl);
        }
        seatNameDragSrc = null;
    };

    // 숨김 토글 (즉시 저장)
    window._snToggleHide = async (num, currentlyHidden) => {
        try {
            const snap = await get(dbRef("system/config"));
            const cfg = snap.exists() ? snap.val() : {};
            const hidden = cfg.hiddenNumbers || {};
            if (currentlyHidden) {
                delete hidden[String(num)];
            } else {
                hidden[String(num)] = true;
            }
            await update(dbRef("system/config"), { hiddenNumbers: hidden });
            await renderSeatNamesEditor();
        } catch (e) {
            alert("숨김 상태 변경 실패.");
        }
    };
}

export async function saveSeatNames() {
    const container = document.getElementById("seat-names-editor");
    if (!container) return;

    const rows = [...container.querySelectorAll(".sn-row")];
    const newNames = {};
    const newOrder = [];

    rows.forEach(row => {
        const num = parseInt(row.dataset.num, 10);
        const input = row.querySelector(".sn-input");
        const val = input ? input.value.trim() : "";
        newOrder.push(num);
        if (val) {
            newNames[String(num)] = val;
        }
    });

    try {
        await update(dbRef("system/config"), {
            seatNames: newNames,
            seatOrder: newOrder
        });
        alert("번호명이 저장되었습니다. 직원 화면에 즉시 반영됩니다.");
    } catch (e) {
        alert("저장 실패. 다시 시도해주세요.");
        console.error(e);
    }
}

export async function resetSeatNames() {
    if (!confirm("모든 번호명을 초기화(기본 숫자)하시겠습니까?")) return;
    try {
        await update(dbRef("system/config"), {
            seatNames: {},
            seatOrder: [],
            hiddenNumbers: {}
        });
        alert("번호명이 초기화되었습니다.");
        await renderSeatNamesEditor();
    } catch (e) {
        alert("초기화 실패.");
    }
}
