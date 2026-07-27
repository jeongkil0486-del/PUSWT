import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { dbRef, functions, onValue, state, getBranchLabel } from "./data.js";
import { setBackButtonInterceptor } from "./native.js";

function confirmSend(message) {
    return window.confirm(message);
}

function setSending(button, sending) {
    button.disabled = sending;
    button.dataset.originalText ||= button.textContent;
    button.textContent = sending ? "전송 중..." : button.dataset.originalText;
}

function formatResult(result) {
    return [
        `대상 직원 ${result.targetUsers}명`,
        `성공 기기 ${result.successDevices}대`,
        `실패 기기 ${result.failedDevices}대`,
        `FCM 토큰이 없는 직원 ${result.usersWithoutTokens}명`
    ].join("\n");
}

export async function sendUrgentNotification() {
    const button = document.getElementById("btn-send-urgent");
    const targetType = document.querySelector('input[name="urgent-target"]:checked')?.value;
    const message = document.getElementById("urgent-message").value.trim();
    const branchLabel = document.getElementById("admin-branch-badge").textContent;
    const empty = document.getElementById("urgent-empty");
    empty.classList.add("hidden");

    if (!message) {
        alert("알림 내용을 입력해주세요.");
        return;
    }
    if (!confirmSend(`${branchLabel} 지점의 선택 대상에게 긴급 알림을 전송하시겠습니까?`)) return;

    setSending(button, true);
    try {
        const callable = httpsCallable(functions, "sendUrgentBranchNotification");
        const { data } = await callable({ targetType, message });
        if (data.targetUsers === 0) {
            empty.textContent = targetType === "occupied"
                ? "현재 번호를 보유 중인 직원이 없습니다."
                : "현재 선택 조건에 해당하는 직원이 없습니다.";
            empty.classList.remove("hidden");
        }
        alert(formatResult(data));
    } catch (error) {
        console.error(error);
        alert(error.message || "긴급 알림 전송에 실패했습니다.");
    } finally {
        setSending(button, false);
    }
}

export async function sendGeneralNotification() {
    const button = document.getElementById("btn-send-general");
    const title = document.getElementById("general-title").value.trim();
    const message = document.getElementById("general-message").value.trim();
    const branchLabel = document.getElementById("admin-branch-badge").textContent;
    if (!title || !message) {
        alert("알림 제목과 내용을 모두 입력해주세요.");
        return;
    }
    if (!confirmSend(`${branchLabel} 지점 직원 전체에게 알림을 전송하시겠습니까?`)) return;

    setSending(button, true);
    try {
        const callable = httpsCallable(functions, "sendGeneralBranchNotification");
        const { data } = await callable({ title, message });
        alert(formatResult(data));
    } catch (error) {
        console.error(error);
        alert(error.message || "지점 알림 전송에 실패했습니다.");
    } finally {
        setSending(button, false);
    }
}

let unsubscribeNotificationHistory = null;
let notificationHistoryPanelOpen = false;
let savedScrollY = 0;

function renderHistoryEntry(item) {
    const typeLabel = item.type === "urgent" ? "긴급 알림" : "지점 전체 알림";

    const article = document.createElement("article");
    article.className = "notification-log-item";

    // title/message는 관리자가 입력한 문자열이므로 innerHTML이 아닌
    // textContent로만 삽입해 마크업/스크립트로 해석되지 않게 한다.
    const strong = document.createElement("strong");
    strong.textContent = `[${typeLabel}] ${item.title || typeLabel}`;

    const time = document.createElement("span");
    time.textContent = item.sentAt ? new Date(item.sentAt).toLocaleString("ko-KR") : "";

    const message = document.createElement("p");
    message.textContent = item.message || "";

    const statsParts = [
        `대상 ${item.targetUsers || 0}명`,
        `성공 ${item.successDevices || 0}대`,
        `실패 ${item.failedDevices || 0}대`
    ];
    if (typeof item.usersWithoutTokens === "number") {
        statsParts.push(`토큰없음 ${item.usersWithoutTokens}명`);
    }
    const stats = document.createElement("small");
    stats.textContent = statsParts.join(" · ");

    article.append(strong, time, message, stats);
    return article;
}

function renderHistoryState(container, text) {
    container.replaceChildren();
    container.textContent = text;
}

// 알림 이력은 번호판 실시간 구독과 완전히 분리된 별도 경로(notificationLogs)만 구독하며,
// 관리자가 팝업을 열어 실제로 보고 있을 때만 구독한다.
export function listenToNotificationHistory() {
    stopListeningToNotificationHistory();
    const container = document.getElementById("notification-history");
    if (!container) return;
    renderHistoryState(container, "불러오는 중...");

    unsubscribeNotificationHistory = onValue(dbRef("notificationLogs"), (snapshot) => {
        if (!snapshot.exists()) {
            renderHistoryState(container, "발송 이력이 없습니다.");
            return;
        }
        const entries = Object.entries(snapshot.val())
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => b.sentAt - a.sentAt)
            .slice(0, 20);
        container.replaceChildren();
        entries.forEach((item) => container.appendChild(renderHistoryEntry(item)));
    }, (error) => {
        console.error(error);
        renderHistoryState(container, "알림 이력을 불러오지 못했습니다.");
    });
}

export function stopListeningToNotificationHistory() {
    unsubscribeNotificationHistory?.();
    unsubscribeNotificationHistory = null;
}

// 백그라운드 전환 때문에 리스너가 끊겼다가 포그라운드로 돌아왔을 때,
// 팝업이 실제로 열려 있는 경우에만 다시 구독한다.
export function reattachNotificationHistoryListenerIfOpen() {
    if (notificationHistoryPanelOpen) {
        listenToNotificationHistory();
    }
}

function handleNotificationHistoryKeydown(event) {
    if (event.key === "Escape") {
        closeNotificationHistoryPanel();
    }
}

export function openNotificationHistoryPanel() {
    const panel = document.getElementById("notification-history-panel");
    if (!panel || notificationHistoryPanelOpen) return;

    notificationHistoryPanelOpen = true;
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    const branchBadge = document.getElementById("notif-history-branch-badge");
    if (branchBadge) branchBadge.textContent = getBranchLabel();

    panel.classList.remove("hidden");
    document.body.classList.add("notif-history-open");
    document.addEventListener("keydown", handleNotificationHistoryKeydown);

    listenToNotificationHistory();
}

export function closeNotificationHistoryPanel() {
    const panel = document.getElementById("notification-history-panel");
    if (!notificationHistoryPanelOpen) return;

    notificationHistoryPanelOpen = false;
    panel?.classList.add("hidden");
    document.body.classList.remove("notif-history-open");
    document.removeEventListener("keydown", handleNotificationHistoryKeydown);

    stopListeningToNotificationHistory();
    window.scrollTo(0, savedScrollY);
}

export function handleNotificationHistoryBackdropClick(event) {
    if (event.target === event.currentTarget) {
        closeNotificationHistoryPanel();
    }
}

// Android 뒤로가기: 팝업이 열려 있을 때만 가로채서 닫고,
// 그 외에는 기존 기본 동작(웹뷰 히스토리 back / 앱 종료)을 그대로 둔다.
setBackButtonInterceptor(() => {
    if (notificationHistoryPanelOpen) {
        closeNotificationHistoryPanel();
        return true;
    }
    return false;
});
