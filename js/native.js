import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { dbRef, set, state } from "./data.js";

const DEVICE_ID_KEY = "TASWT_deviceId";
let listenersRegistered = false;

function getDeviceId() {
    let value = localStorage.getItem(DEVICE_ID_KEY);
    if (!value) {
        value = globalThis.crypto?.randomUUID?.() || `android-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(DEVICE_ID_KEY, value);
    }
    return value;
}

function showStatus(message, kind = "warning") {
    const banner = document.getElementById("notification-status");
    if (!banner) return;
    banner.textContent = message;
    banner.dataset.kind = kind;
    banner.classList.remove("hidden");
}

function showForegroundNotification(notification) {
    const container = document.getElementById("foreground-notification");
    if (!container) return;
    document.getElementById("foreground-notification-title").textContent = notification.title || "TAS WT 알림";
    document.getElementById("foreground-notification-body").textContent = notification.body || "";
    container.classList.remove("hidden");
    clearTimeout(showForegroundNotification.timer);
    showForegroundNotification.timer = setTimeout(() => container.classList.add("hidden"), 8000);
}

function rememberRoute(data = {}) {
    state.pendingNotificationRoute = data.route || (state.isAdmin ? "admin" : "main");
    if (state.currentUser) {
        window.dispatchEvent(new CustomEvent("taswt:notification-route", {
            detail: { route: state.pendingNotificationRoute }
        }));
    }
}

async function createChannels() {
    await PushNotifications.createChannel({
        id: "urgent_alerts",
        name: "긴급 알림",
        description: "즉시 확인이 필요한 지점 긴급 알림",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default",
        lights: true
    });
    await PushNotifications.createChannel({
        id: "branch_notices",
        name: "지점 알림",
        description: "현재 지점의 일반 공지",
        importance: 3,
        visibility: 1,
        vibration: true,
        sound: "default"
    });
}

async function saveToken(token) {
    if (!state.currentUser || state.isAdmin) return;
    await set(dbRef(`pushTokens/${state.currentUser}/${getDeviceId()}`), {
        token,
        platform: "android",
        updatedAt: Date.now(),
        lastLoginAt: Date.now(),
        active: true
    });
}

async function registerListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;

    await PushNotifications.addListener("registration", ({ value }) => {
        saveToken(value).catch((error) => console.error("FCM 토큰 저장 실패:", error));
    });
    await PushNotifications.addListener("registrationError", (error) => {
        console.error("푸시 등록 실패:", error);
        showStatus("알림 등록에 실패했습니다. 네트워크와 Firebase 설정을 확인해주세요.", "error");
    });
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        showForegroundNotification(notification);
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        rememberRoute(notification.data || {});
    });
    await App.addListener("appUrlOpen", ({ url }) => {
        if (url.includes("admin")) rememberRoute({ route: "admin" });
        if (url.includes("main")) rememberRoute({ route: "main" });
    });
}

export function isNativeAndroid() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

let appStateHandlers = null;
let appStateListenerRegistered = false;

// 앱이 백그라운드/종료 상태로 전환되면 RTDB 실시간 리스너를 모두 끊고,
// 알림은 FCM 네이티브 푸시로만 수신한다. 포그라운드 복귀 시에만 다시 구독한다.
export function registerAppStateListener(handlers) {
    appStateHandlers = handlers;
    if (!isNativeAndroid() || appStateListenerRegistered) return;
    appStateListenerRegistered = true;
    App.addListener("appStateChange", ({ isActive }) => {
        if (!appStateHandlers) return;
        if (isActive) {
            appStateHandlers.onForeground?.();
        } else {
            appStateHandlers.onBackground?.();
        }
    });
}

export async function initializePushForLogin() {
    if (!isNativeAndroid() || !state.currentUser || state.isAdmin) return;
    await registerListeners();
    await createChannels();

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") {
        permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") {
        showStatus("알림 권한이 꺼져 있습니다. Android 설정에서 TAS WT 알림을 허용해주세요.");
        return;
    }
    await PushNotifications.register();
}

export async function deactivateCurrentDeviceToken() {
    if (!isNativeAndroid() || !state.currentUser || state.isAdmin) return;
    await set(dbRef(`pushTokens/${state.currentUser}/${getDeviceId()}/active`), false).catch(() => {});
}
