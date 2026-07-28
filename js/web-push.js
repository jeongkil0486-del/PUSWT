import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { functions, state } from "./data.js";
import { isNativeAndroid } from "./native.js";
import {
    createRegistrationPayload,
    ensurePushSubscription,
    getOrCreateWebPushDeviceId,
    getWebPushEnvironment,
    getPermissionUiState,
    isAppleMobilePlatform,
    unsubscribeExistingSubscription
} from "./lib/web-push.js";

const SERVICE_WORKER_URL = "/sw.js";
let currentRegistration = null;
let actionInProgress = false;

function elements() {
    return {
        section: document.getElementById("ios-web-push"),
        status: document.getElementById("ios-web-push-status"),
        detail: document.getElementById("ios-web-push-detail"),
        enable: document.getElementById("btn-ios-web-push-enable"),
        test: document.getElementById("btn-ios-web-push-test"),
        disable: document.getElementById("btn-ios-web-push-disable"),
        installGuide: document.getElementById("ios-web-push-install-guide")
    };
}

function setHidden(element, hidden) {
    element?.classList.toggle("hidden", hidden);
}

function setStatus(message, kind = "info") {
    const { status } = elements();
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
}

function setBusy(busy) {
    actionInProgress = busy;
    const { enable, test, disable } = elements();
    [enable, test, disable].forEach((button) => {
        if (button) button.disabled = busy;
    });
}

function showInstallGuide() {
    const { section, enable, test, disable, installGuide, detail } = elements();
    setHidden(section, false);
    setHidden(enable, true);
    setHidden(test, true);
    setHidden(disable, true);
    setHidden(installGuide, false);
    setHidden(detail, true);
    setStatus("아이폰 알림을 사용하려면 홈 화면에 추가해주세요.");
}

function showUnsupported() {
    const { section, enable, test, disable, installGuide, detail } = elements();
    setHidden(section, false);
    setHidden(enable, true);
    setHidden(test, true);
    setHidden(disable, true);
    setHidden(installGuide, true);
    setHidden(detail, true);
    setStatus("이 기기 또는 브라우저에서는 아이폰 웹 알림을 지원하지 않습니다.");
}

function showDenied() {
    const { section, enable, test, disable, installGuide, detail } = elements();
    setHidden(section, false);
    setHidden(enable, true);
    setHidden(test, true);
    setHidden(disable, true);
    setHidden(installGuide, true);
    setHidden(detail, false);
    setStatus("아이폰 알림이 차단되어 있습니다.", "warning");
    detail.textContent = "iPhone 설정에서 TAS WT 알림을 허용한 뒤 다시 실행해주세요.";
}

function showReady() {
    const { section, enable, test, disable, installGuide, detail } = elements();
    setHidden(section, false);
    setHidden(enable, false);
    setHidden(test, true);
    setHidden(disable, true);
    setHidden(installGuide, true);
    setHidden(detail, false);
    setStatus("아이폰 알림을 아직 사용하지 않고 있습니다.");
    detail.textContent = "TAS WT가 종료되어 있거나 화면이 잠긴 상태에서도 업무 알림을 받을 수 있습니다.";
}

function showSubscribed() {
    const { section, enable, test, disable, installGuide, detail } = elements();
    setHidden(section, false);
    setHidden(enable, true);
    setHidden(test, false);
    setHidden(disable, false);
    setHidden(installGuide, true);
    setHidden(detail, false);
    setStatus("아이폰 알림 사용 중", "success");
    detail.textContent = "TAS WT가 종료되어 있거나 화면이 잠긴 상태에서도 업무 알림을 받을 수 있습니다.";
}

async function getRegistration() {
    currentRegistration ||= await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    return currentRegistration;
}

function deviceId() {
    return getOrCreateWebPushDeviceId(localStorage);
}

async function existingSubscription() {
    const registration = await getRegistration();
    return registration.pushManager.getSubscription();
}

async function enableWebPush() {
    if (actionInProgress || !state.currentUser || state.isAdmin) return;
    setBusy(true);
    try {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
            showDenied();
            return;
        }
        if (permission !== "granted") {
            showReady();
            return;
        }

        const getPublicKey = httpsCallable(functions, "getWebPushPublicKey");
        const { data } = await getPublicKey();
        const registration = await getRegistration();
        const { subscription } = await ensurePushSubscription(registration, data.publicKey);
        const registerSubscription = httpsCallable(functions, "registerWebPushSubscription");
        await registerSubscription(createRegistrationPayload(deviceId(), subscription));
        showSubscribed();
    } catch (error) {
        console.error("iPhone Web Push 등록 실패:", error?.code || error?.message || "unknown");
        setStatus("아이폰 알림 연결에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
        setBusy(false);
    }
}

async function sendTestNotification() {
    if (actionInProgress) return;
    setBusy(true);
    try {
        const callable = httpsCallable(functions, "sendWebPushTestToSelf");
        await callable({ deviceId: deviceId() });
        setStatus("테스트 알림을 전송했습니다.", "success");
    } catch (error) {
        const missing = String(error?.code || "").includes("not-found");
        setStatus(
            missing
                ? "아이폰 알림을 먼저 활성화해주세요."
                : "알림 전송에 실패했습니다. 잠시 후 다시 시도해주세요.",
            "error"
        );
    } finally {
        setBusy(false);
    }
}

async function unsubscribeWebPush({ forLogout = false } = {}) {
    const subscription = await existingSubscription();
    if (!subscription) {
        showReady();
        return;
    }
    const callable = httpsCallable(functions, "unregisterWebPushSubscription");
    await callable({ deviceId: deviceId() });
    await unsubscribeExistingSubscription(subscription);
    if (!forLogout) showReady();
}

async function disableWebPush() {
    if (actionInProgress) return;
    setBusy(true);
    try {
        await unsubscribeWebPush();
    } catch (error) {
        console.error("iPhone Web Push 해제 실패:", error?.code || error?.message || "unknown");
        setStatus("알림 해제에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.", "error");
    } finally {
        setBusy(false);
    }
}

export function bindWebPushEvents() {
    elements().enable?.addEventListener("click", enableWebPush);
    elements().test?.addEventListener("click", sendTestNotification);
    elements().disable?.addEventListener("click", disableWebPush);
}

export function registerWebPushNavigationHandler() {
    const remember = (route = "main") => {
        state.pendingNotificationRoute = route;
        sessionStorage.setItem("TASWT_pendingNotificationRoute", route);
        if (state.currentUser) {
            window.dispatchEvent(new CustomEvent("taswt:notification-route", { detail: { route } }));
        }
    };
    const notificationType = new URL(window.location.href).searchParams.get("notification");
    if (notificationType) remember("main");
    navigator.serviceWorker?.addEventListener("message", (event) => {
        if (event.data?.type === "TASWT_NOTIFICATION_CLICK") {
            remember(event.data.route || "main");
        }
    });
}

export async function initializeWebPushForLogin() {
    const { section } = elements();
    if (!section || state.isAdmin || !state.currentUser || isNativeAndroid()) {
        setHidden(section, true);
        return;
    }

    const environment = getWebPushEnvironment({
        windowLike: window,
        navigatorLike: navigator,
        nativeAndroid: false
    });
    if (environment.reason === "not-ios") {
        setHidden(section, true);
        return;
    }
    if (environment.reason === "not-standalone") {
        showInstallGuide();
        return;
    }
    if (environment.reason === "unsupported") {
        showUnsupported();
        return;
    }
    try {
        const subscription = await existingSubscription();
        const permissionState = getPermissionUiState(Notification.permission, Boolean(subscription));
        if (permissionState === "denied") {
            showDenied();
        } else if (permissionState === "subscribed") {
            showSubscribed();
        } else {
            showReady();
        }
    } catch (error) {
        console.error("iPhone Web Push 상태 확인 실패:", error?.message || "unknown");
        showUnsupported();
    }
}

export async function deactivateWebPushForLogout() {
    if (isNativeAndroid() || !state.currentUser || state.isAdmin || !isAppleMobilePlatform(navigator)) return;
    const environment = getWebPushEnvironment({ windowLike: window, navigatorLike: navigator });
    if (!environment.eligible) return;
    try {
        await unsubscribeWebPush({ forLogout: true });
    } catch (error) {
        setStatus("알림 해제에 실패했습니다. 네트워크를 확인하고 다시 시도해주세요.", "error");
        throw error;
    }
}
