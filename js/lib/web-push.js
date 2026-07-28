export const WEB_PUSH_DEVICE_ID_KEY = "TASWT_webPushDeviceId";

export function isAppleMobilePlatform(navigatorLike = {}) {
    const platform = String(navigatorLike.platform || "");
    const userAgent = String(navigatorLike.userAgent || "");
    const touchPoints = Number(navigatorLike.maxTouchPoints || 0);
    return /iPhone|iPad|iPod/i.test(userAgent)
        || /iPhone|iPad|iPod/i.test(platform)
        || (platform === "MacIntel" && touchPoints > 1);
}

export function isStandaloneDisplay(windowLike = {}, navigatorLike = {}) {
    return navigatorLike.standalone === true
        || windowLike.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

export function supportsWebPush(windowLike = {}, navigatorLike = {}) {
    return "serviceWorker" in navigatorLike
        && "PushManager" in windowLike
        && "Notification" in windowLike;
}

export function getWebPushEnvironment({
    windowLike = globalThis.window || {},
    navigatorLike = globalThis.navigator || {},
    nativeAndroid = false
} = {}) {
    if (nativeAndroid) return { eligible: false, reason: "android-native" };
    if (!isAppleMobilePlatform(navigatorLike)) return { eligible: false, reason: "not-ios" };
    if (!supportsWebPush(windowLike, navigatorLike)) return { eligible: false, reason: "unsupported" };
    if (!isStandaloneDisplay(windowLike, navigatorLike)) return { eligible: false, reason: "not-standalone" };
    return { eligible: true, reason: "ready" };
}

export function urlBase64ToUint8Array(value) {
    const input = String(value || "").trim();
    if (!input || !/^[A-Za-z0-9_-]+={0,2}$/.test(input)) {
        throw new TypeError("Invalid VAPID public key.");
    }
    const padding = "=".repeat((4 - (input.length % 4)) % 4);
    const base64 = (input + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = globalThis.atob
        ? globalThis.atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function getOrCreateWebPushDeviceId(storage, cryptoLike = globalThis.crypto) {
    const existing = storage.getItem(WEB_PUSH_DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = cryptoLike?.randomUUID?.()
        || `web-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
    storage.setItem(WEB_PUSH_DEVICE_ID_KEY, generated);
    return generated;
}

export async function ensurePushSubscription(registration, publicKey) {
    const existing = await registration.pushManager.getSubscription();
    if (existing) return { subscription: existing, created: false };
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    return { subscription, created: true };
}

export function getPermissionUiState(permission, hasSubscription) {
    if (permission === "denied") return "denied";
    if (permission === "granted" && hasSubscription) return "subscribed";
    return "ready";
}

export function createRegistrationPayload(deviceId, subscription) {
    return {
        deviceId,
        subscription: subscription.toJSON()
    };
}

export async function unsubscribeExistingSubscription(subscription) {
    if (!subscription) return false;
    return subscription.unsubscribe();
}
