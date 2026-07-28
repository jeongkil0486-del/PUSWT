const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export class WebPushInputError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "WebPushInputError";
        this.code = code;
    }
}

export function resolveEmployeeIdentity(auth) {
    if (!auth?.uid) {
        throw new WebPushInputError("unauthenticated", "로그인이 필요합니다.");
    }
    if (auth.token?.role !== "user") {
        throw new WebPushInputError("permission-denied", "직원 계정만 아이폰 알림을 사용할 수 있습니다.");
    }
    const branch = String(auth.token?.branch || "").toUpperCase();
    const userId = typeof auth.token?.userId === "string" ? auth.token.userId.trim() : "";
    if (!branch || !userId || userId.length > 80) {
        throw new WebPushInputError("failed-precondition", "로그인 계정 정보가 올바르지 않습니다.");
    }
    return { uid: auth.uid, branch, userId };
}

export function validateDeviceId(value) {
    const deviceId = typeof value === "string" ? value.trim() : "";
    if (!DEVICE_ID_PATTERN.test(deviceId)) {
        throw new WebPushInputError("invalid-argument", "기기 ID가 올바르지 않습니다.");
    }
    return deviceId;
}

export function sanitizeSubscription(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new WebPushInputError("invalid-argument", "Web Push 구독 정보가 올바르지 않습니다.");
    }
    const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
    let endpointUrl;
    try {
        endpointUrl = new URL(endpoint);
    } catch {
        throw new WebPushInputError("invalid-argument", "Web Push endpoint가 올바르지 않습니다.");
    }
    if (endpointUrl.protocol !== "https:" || endpoint.length > 2048) {
        throw new WebPushInputError("invalid-argument", "Web Push endpoint가 올바르지 않습니다.");
    }

    const p256dh = typeof value.keys?.p256dh === "string" ? value.keys.p256dh.trim() : "";
    const auth = typeof value.keys?.auth === "string" ? value.keys.auth.trim() : "";
    if (!p256dh || p256dh.length > 256 || !KEY_PATTERN.test(p256dh)) {
        throw new WebPushInputError("invalid-argument", "Web Push p256dh 키가 올바르지 않습니다.");
    }
    if (!auth || auth.length > 128 || !KEY_PATTERN.test(auth)) {
        throw new WebPushInputError("invalid-argument", "Web Push auth 키가 올바르지 않습니다.");
    }

    return {
        endpoint: endpointUrl.href,
        keys: { p256dh, auth }
    };
}

export function webPushSubscriptionPath(userId, deviceId) {
    return `webPushSubscriptions/${userId}/${validateDeviceId(deviceId)}`;
}

export function createSubscriptionRecord(subscription, existing = {}, now = Date.now()) {
    return {
        ...sanitizeSubscription(subscription),
        platform: "ios-pwa",
        active: true,
        createdAt: Number(existing.createdAt) || now,
        updatedAt: now,
        lastLoginAt: now
    };
}

export function collectWebPushDevices(targetUsers, subscriptionTree) {
    const devices = [];
    const usersWithWebPush = new Set();
    const seenEndpoints = new Set();
    for (const userId of targetUsers) {
        for (const [deviceId, value] of Object.entries(subscriptionTree?.[userId] || {})) {
            if (value?.active === false || value?.platform !== "ios-pwa") continue;
            try {
                const subscription = sanitizeSubscription(value);
                if (seenEndpoints.has(subscription.endpoint)) continue;
                seenEndpoints.add(subscription.endpoint);
                usersWithWebPush.add(userId);
                devices.push({ userId, deviceId, subscription });
            } catch {
                // Invalid stored entries are ignored without logging endpoint/key material.
            }
        }
    }
    return { devices, usersWithWebPush };
}

export function shouldDeleteWebPushSubscription(statusCode) {
    return statusCode === 404 || statusCode === 410;
}

export function usersWithoutAnyPush(targetUsers, androidDevices, webPushDevices) {
    const registered = new Set([
        ...androidDevices.map((device) => device.userId),
        ...webPushDevices.map((device) => device.userId)
    ]);
    return targetUsers.filter((userId) => !registered.has(userId));
}

export function safeWebPushError(error) {
    const statusCode = Number(error?.statusCode || 0) || null;
    return {
        statusCode,
        category: shouldDeleteWebPushSubscription(statusCode)
            ? "expired"
            : statusCode === 429
                ? "rate-limited"
                : statusCode >= 500
                    ? "server"
                    : "delivery"
    };
}

export function createWebPushPayload({ title, body, type, branchCode, id, timestamp = Date.now() }) {
    return JSON.stringify({
        title,
        body,
        type,
        branchCode,
        route: "main",
        url: `/?notification=${encodeURIComponent(type)}`,
        tag: `taswt-${type}-${id}`,
        timestamp
    });
}
