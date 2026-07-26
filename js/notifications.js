import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { dbRef, functions, onValue, state } from "./data.js";

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

// 알림 이력은 번호판 실시간 구독과 완전히 분리된 별도 경로(notificationLogs)만 구독한다.
export function listenToNotificationHistory() {
    stopListeningToNotificationHistory();
    const container = document.getElementById("notification-history");
    unsubscribeNotificationHistory = onValue(dbRef("notificationLogs"), (snapshot) => {
        if (!snapshot.exists()) {
            container.textContent = "발송 이력이 없습니다.";
            return;
        }
        const entries = Object.entries(snapshot.val())
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => b.sentAt - a.sentAt)
            .slice(0, 20);
        container.innerHTML = entries.map((item) => `
            <article class="notification-log-item">
                <strong>${item.title || (item.type === "urgent" ? "긴급 알림" : "지점 알림")}</strong>
                <span>${new Date(item.sentAt).toLocaleString("ko-KR")}</span>
                <p>${item.message}</p>
                <small>대상 ${item.targetUsers || 0}명 · 성공 ${item.successDevices || 0}대 · 실패 ${item.failedDevices || 0}대</small>
            </article>
        `).join("");
    }, (error) => {
        console.error(error);
        container.textContent = "알림 이력을 불러오지 못했습니다.";
    });
}

export function stopListeningToNotificationHistory() {
    unsubscribeNotificationHistory?.();
    unsubscribeNotificationHistory = null;
}
