import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import webpush from "web-push";
import { collectDevices, selectTargetUsers } from "./lib/audience.js";
import { branchPath } from "./lib/database-path.js";
import { updateMigratedUser } from "./lib/user-migration.js";
import {
    WebPushInputError,
    collectWebPushDevices,
    createSubscriptionRecord,
    createWebPushPayload,
    resolveEmployeeIdentity,
    safeWebPushError,
    sanitizeSubscription,
    shouldDeleteWebPushSubscription,
    usersWithoutAnyPush,
    validateDeviceId,
    webPushSubscriptionPath
} from "./lib/web-push.js";

initializeApp();

const legacyAdminCredentials = defineSecret("LEGACY_ADMIN_CREDENTIALS_JSON");
const webPushVapidPublicKey = defineSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
const webPushVapidPrivateKey = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const REGION = "asia-northeast3";
const WEB_PUSH_SUBJECT = "https://tas-wt.vercel.app/";
const WEB_PUSH_TTL = Object.freeze({ urgent: 300, general: 3600, test: 60 });
const BRANCHES = new Set(["PUS", "TAE", "CJJ", "GMP", "CJU", "KWJ", "ICN"]);
const ADMIN_IDS = new Set(["PUSWT", "TAEWT", "CJJWT", "GMPWT", "CJUWT", "KWJWT", "ICNWT"]);
const INVALID_TOKEN_CODES = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered"
]);

function cleanString(value, field, maxLength) {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result) throw new HttpsError("invalid-argument", `${field} 항목은 비워둘 수 없습니다.`);
    if (result.length > maxLength) throw new HttpsError("invalid-argument", `${field} 항목이 너무 깁니다.`);
    return result;
}

function normalizeBranch(value) {
    const branch = String(value || "").toUpperCase();
    if (!BRANCHES.has(branch)) throw new HttpsError("invalid-argument", "지원하지 않는 지점입니다.");
    return branch;
}

function loginEmail(branch, userId) {
    return `${Buffer.from(userId, "utf8").toString("base64url")}.${branch.toLowerCase()}@taswt.invalid`;
}

function requireAdmin(request) {
    if (!request.auth || request.auth.token.role !== "admin") {
        throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    return normalizeBranch(request.auth.token.branch);
}

function requireEmployee(request) {
    try {
        const identity = resolveEmployeeIdentity(request.auth);
        return { ...identity, branch: normalizeBranch(identity.branch) };
    } catch (error) {
        if (error instanceof WebPushInputError) {
            throw new HttpsError(error.code, error.message);
        }
        throw error;
    }
}

function requireWebPushInput(getValue) {
    try {
        return getValue();
    } catch (error) {
        if (error instanceof WebPushInputError) {
            throw new HttpsError(error.code, error.message);
        }
        throw error;
    }
}

function configureWebPush() {
    const publicKey = webPushVapidPublicKey.value();
    const privateKey = webPushVapidPrivateKey.value();
    if (!publicKey || !privateKey) {
        throw new HttpsError("failed-precondition", "Web Push VAPID 설정이 완료되지 않았습니다.");
    }
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, publicKey, privateKey);
}

async function enforceRateLimit(uid) {
    const ref = getDatabase().ref(`_internal/notificationRateLimits/${uid}`);
    const now = Date.now();
    const result = await ref.transaction((previous) => {
        if (previous && now - previous < 10000) return;
        return now;
    });
    if (!result.committed) {
        throw new HttpsError("resource-exhausted", "알림은 10초 간격으로 전송할 수 있습니다.");
    }
}

async function enforceWebPushTestRateLimit(uid, deviceId) {
    const ref = getDatabase().ref(`_internal/webPushTestRateLimits/${uid}/${deviceId}`);
    const now = Date.now();
    const result = await ref.transaction((previous) => {
        if (previous && now - previous < 30000) return;
        return now;
    });
    if (!result.committed) {
        throw new HttpsError("resource-exhausted", "테스트 알림은 30초 간격으로 전송할 수 있습니다.");
    }
}

function parseLegacyAdmins() {
    try {
        const parsed = JSON.parse(legacyAdminCredentials.value());
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        throw new HttpsError("failed-precondition", "관리자 이전용 Firebase Secret이 올바르지 않습니다.");
    }
}

export const migrateLegacyLogin = onCall({
    region: REGION,
    secrets: [legacyAdminCredentials],
    enforceAppCheck: false
}, async (request) => {
    const branch = normalizeBranch(request.data?.branchCode);
    const userId = cleanString(request.data?.userId, "사용자 ID", 80);
    const password = cleanString(request.data?.password, "비밀번호", 128);
    const root = getDatabase().ref(branchPath(branch));
    const isAdminId = ADMIN_IDS.has(userId);
    let role = "user";

    if (isAdminId) {
        const credentials = parseLegacyAdmins();
        const expected = credentials[branch]?.[userId] ?? credentials[userId];
        if (!expected || expected !== password) {
            throw new HttpsError("unauthenticated", "계정 정보가 올바르지 않습니다.");
        }
        role = "admin";
    } else {
        const [whitelistSnapshot, userSnapshot, migrationSnapshot] = await Promise.all([
            root.child(`system/whitelist/${userId}`).get(),
            root.child(`users/${userId}`).get(),
            root.child(`authMigrations/${userId}`).get()
        ]);
        if (!whitelistSnapshot.exists()) {
            throw new HttpsError("permission-denied", "등록된 직원 명단에 없습니다.");
        }
        if (migrationSnapshot.exists()) {
            throw new HttpsError("unauthenticated", "비밀번호가 올바르지 않습니다. 관리자에게 초기화를 요청하세요.");
        }
        const legacy = userSnapshot.val() || {};
        if (legacy.pw && legacy.pw !== password) {
            throw new HttpsError("unauthenticated", "계정 정보가 올바르지 않습니다.");
        }
    }

    const uid = `${branch}:${Buffer.from(userId, "utf8").toString("base64url")}`;
    const email = loginEmail(branch, userId);
    const auth = getAuth();
    try {
        await auth.getUser(uid);
        await auth.updateUser(uid, { email, password: `taswt:${password}`, disabled: false });
    } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        await auth.createUser({ uid, email, password: `taswt:${password}`, displayName: userId });
    }
    await auth.setCustomUserClaims(uid, { role, branch, userId });
    const migratedAt = Date.now();
    await root.child(`authMigrations/${userId}`).update({ uid, role, migratedAt });
    if (role === "user") {
        await updateMigratedUser(root.child(`users/${userId}`), { uid, migratedAt });
    }
    return { customToken: await auth.createCustomToken(uid), role, branch };
});

export const requestLegacyPasswordReset = onCall({ region: REGION }, async (request) => {
    const branch = normalizeBranch(request.data?.branchCode);
    const userId = cleanString(request.data?.userId, "사용자 ID", 80);
    const root = getDatabase().ref(branchPath(branch));
    if (!(await root.child(`system/whitelist/${userId}`).get()).exists()) {
        throw new HttpsError("not-found", "등록된 직원 명단에 없습니다.");
    }
    await root.child(`system/resetRequests/${userId}`).set(true);
    return { accepted: true };
});

async function deleteAuthUser(branch, userId) {
    const uid = `${branch}:${Buffer.from(userId, "utf8").toString("base64url")}`;
    await getAuth().deleteUser(uid).catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
    });
}

export const resetEmployeePassword = onCall({ region: REGION }, async (request) => {
    const branch = requireAdmin(request);
    const userId = cleanString(request.data?.userId, "사용자 ID", 80);
    const root = getDatabase().ref(branchPath(branch));
    if (!(await root.child(`system/whitelist/${userId}`).get()).exists()) {
        throw new HttpsError("not-found", "등록된 직원 명단에 없습니다.");
    }
    await Promise.all([
        deleteAuthUser(branch, userId),
        root.child(`users/${userId}`).remove(),
        root.child(`system/resetRequests/${userId}`).remove(),
        root.child(`pushTokens/${userId}`).remove(),
        root.child(`authMigrations/${userId}`).remove()
    ]);
    return { reset: true };
});

export const resetAllEmployeePasswords = onCall({ region: REGION }, async (request) => {
    const branch = requireAdmin(request);
    const root = getDatabase().ref(branchPath(branch));
    const whitelist = (await root.child("system/whitelist").get()).val() || {};
    const users = Object.keys(whitelist).filter((userId) => !ADMIN_IDS.has(userId));
    await Promise.all(users.map((userId) => deleteAuthUser(branch, userId)));
    await Promise.all([
        root.child("users").remove(),
        root.child("system/resetRequests").remove(),
        root.child("pushTokens").remove(),
        root.child("authMigrations").remove()
    ]);
    return { resetUsers: users.length };
});

export const deleteEmployeeAccount = onCall({ region: REGION }, async (request) => {
    const branch = requireAdmin(request);
    const userId = cleanString(request.data?.userId, "사용자 ID", 80);
    const root = getDatabase().ref(branchPath(branch));
    await Promise.all([
        deleteAuthUser(branch, userId),
        root.child(`system/whitelist/${userId}`).remove(),
        root.child(`users/${userId}`).remove(),
        root.child(`system/resetRequests/${userId}`).remove(),
        root.child(`pushTokens/${userId}`).remove(),
        root.child(`authMigrations/${userId}`).remove()
    ]);
    return { deleted: true };
});

export const getWebPushPublicKey = onCall({
    region: REGION,
    secrets: [webPushVapidPublicKey]
}, async (request) => {
    requireEmployee(request);
    const publicKey = webPushVapidPublicKey.value();
    if (!publicKey) {
        throw new HttpsError("failed-precondition", "Web Push VAPID 설정이 완료되지 않았습니다.");
    }
    return { publicKey };
});

export const registerWebPushSubscription = onCall({ region: REGION }, async (request) => {
    const { branch, userId } = requireEmployee(request);
    const deviceId = requireWebPushInput(() => validateDeviceId(request.data?.deviceId));
    const subscription = requireWebPushInput(() => sanitizeSubscription(request.data?.subscription));
    const root = getDatabase().ref(branchPath(branch));
    const subscriptionRef = root.child(webPushSubscriptionPath(userId, deviceId));
    const existing = (await subscriptionRef.get()).val() || {};
    const now = Date.now();
    await subscriptionRef.set(createSubscriptionRecord(subscription, existing, now));
    return { registered: true };
});

export const unregisterWebPushSubscription = onCall({ region: REGION }, async (request) => {
    const { branch, userId } = requireEmployee(request);
    const deviceId = requireWebPushInput(() => validateDeviceId(request.data?.deviceId));
    const root = getDatabase().ref(branchPath(branch));
    await root.child(webPushSubscriptionPath(userId, deviceId)).remove();
    return { unregistered: true };
});

export const sendWebPushTestToSelf = onCall({
    region: REGION,
    secrets: [webPushVapidPublicKey, webPushVapidPrivateKey]
}, async (request) => {
    const { uid, branch, userId } = requireEmployee(request);
    const deviceId = requireWebPushInput(() => validateDeviceId(request.data?.deviceId));
    await enforceWebPushTestRateLimit(uid, deviceId);
    const root = getDatabase().ref(branchPath(branch));
    const ref = root.child(webPushSubscriptionPath(userId, deviceId));
    const stored = (await ref.get()).val();
    if (!stored || stored.active === false || stored.platform !== "ios-pwa") {
        throw new HttpsError("not-found", "아이폰 알림을 먼저 활성화해주세요.");
    }
    const subscription = requireWebPushInput(() => sanitizeSubscription(stored));
    configureWebPush();
    try {
        await webpush.sendNotification(
            subscription,
            createWebPushPayload({
                title: "TAS WT 알림 테스트",
                body: "아이폰 알림이 정상적으로 연결되었습니다.",
                type: "test",
                branchCode: branch,
                id: `${Date.now()}-${deviceId}`
            }),
            { TTL: WEB_PUSH_TTL.test, urgency: "normal" }
        );
        return { sent: true };
    } catch (error) {
        const summary = safeWebPushError(error);
        if (shouldDeleteWebPushSubscription(summary.statusCode)) {
            await ref.remove();
            throw new HttpsError("not-found", "아이폰 알림을 다시 활성화해주세요.");
        }
        console.error("Web Push test delivery failed", summary);
        throw new HttpsError("unavailable", "테스트 알림 전송에 실패했습니다.");
    }
});

async function loadAudience(branch, targetType) {
    const root = getDatabase().ref(branchPath(branch));
    const [whitelistSnapshot, numbersSnapshot, tokensSnapshot, webPushSnapshot] = await Promise.all([
        root.child("system/whitelist").get(),
        root.child("system/boardState/numbers").get(),
        root.child("pushTokens").get(),
        root.child("webPushSubscriptions").get()
    ]);
    const targetUsers = selectTargetUsers({
        whitelist: whitelistSnapshot.val() || {},
        numbers: numbersSnapshot.val() || {},
        targetType,
        adminIds: [...ADMIN_IDS]
    });
    const tokenTree = tokensSnapshot.val() || {};
    const { devices, usersWithoutTokens } = collectDevices(targetUsers, tokenTree);
    const { devices: webPushDevices } = collectWebPushDevices(
        targetUsers,
        webPushSnapshot.val() || {}
    );
    return {
        root,
        targetUsers,
        devices,
        webPushDevices,
        usersWithoutTokens,
        usersWithoutAnyPush: usersWithoutAnyPush(targetUsers, devices, webPushDevices)
    };
}

async function sendNotification({ request, type, targetType, title, message, channelId }) {
    const branch = requireAdmin(request);
    await enforceRateLimit(request.auth.uid);
    const audience = await loadAudience(branch, targetType);
    let androidSuccessDevices = 0;
    let androidFailedDevices = 0;
    let webPushSuccessDevices = 0;
    let webPushFailedDevices = 0;
    const androidCleanup = [];
    const webPushCleanup = [];
    const notificationRef = audience.root.child("notificationLogs").push();
    const notificationId = notificationRef.key || `${Date.now()}`;

    for (let offset = 0; offset < audience.devices.length; offset += 500) {
        const chunk = audience.devices.slice(offset, offset + 500);
        const response = await getMessaging().sendEachForMulticast({
            tokens: chunk.map((device) => device.token),
            notification: { title, body: message },
            data: { type, branchCode: branch, route: "main" },
            android: {
                priority: type === "urgent" ? "high" : "normal",
                notification: {
                    channelId,
                    sound: "default",
                    visibility: "public",
                    defaultVibrateTimings: type !== "urgent",
                    vibrateTimingsMillis: type === "urgent" ? [0, 500, 200, 500, 200, 800] : undefined
                }
            }
        });
        androidSuccessDevices += response.successCount;
        androidFailedDevices += response.failureCount;
        response.responses.forEach((item, index) => {
            const code = item.error?.code;
            if (code && INVALID_TOKEN_CODES.has(code)) {
                const device = chunk[index];
                androidCleanup.push(audience.root.child(`pushTokens/${device.userId}/${device.deviceId}`).remove());
            }
        });
    }
    await Promise.all(androidCleanup);

    configureWebPush();
    const payload = createWebPushPayload({
        title,
        body: message,
        type,
        branchCode: branch,
        id: notificationId
    });
    for (const device of audience.webPushDevices) {
        try {
            await webpush.sendNotification(device.subscription, payload, {
                TTL: WEB_PUSH_TTL[type],
                urgency: type === "urgent" ? "high" : "normal"
            });
            webPushSuccessDevices += 1;
        } catch (error) {
            webPushFailedDevices += 1;
            const summary = safeWebPushError(error);
            if (shouldDeleteWebPushSubscription(summary.statusCode)) {
                webPushCleanup.push(
                    audience.root.child(`webPushSubscriptions/${device.userId}/${device.deviceId}`).remove()
                );
            } else {
                console.error("Web Push delivery failed", summary);
            }
        }
    }
    await Promise.all(webPushCleanup);

    const successDevices = androidSuccessDevices + webPushSuccessDevices;
    const failedDevices = androidFailedDevices + webPushFailedDevices;

    const log = {
        branchCode: branch,
        sentByUid: request.auth.uid,
        sentBy: request.auth.token.userId || request.auth.uid,
        type,
        targetType,
        title,
        message,
        targetUsers: audience.targetUsers.length,
        successDevices,
        failedDevices,
        androidSuccessDevices,
        androidFailedDevices,
        webPushSuccessDevices,
        webPushFailedDevices,
        usersWithoutTokens: audience.usersWithoutTokens.length,
        usersWithoutAnyPush: audience.usersWithoutAnyPush.length,
        sentAt: Date.now()
    };
    await notificationRef.set(log);
    return {
        ...log,
        usersWithoutTokensList: audience.usersWithoutTokens,
        usersWithoutAnyPushList: audience.usersWithoutAnyPush
    };
}

export const sendUrgentBranchNotification = onCall({
    region: REGION,
    secrets: [webPushVapidPublicKey, webPushVapidPrivateKey]
}, async (request) => {
    const targetType = String(request.data?.targetType || "");
    if (!["occupied", "unoccupied", "all"].includes(targetType)) {
        throw new HttpsError("invalid-argument", "알림 대상 유형이 올바르지 않습니다.");
    }
    const message = cleanString(request.data?.message, "알림 내용", 500);
    return sendNotification({
        request,
        type: "urgent",
        targetType,
        title: "🚨 긴급 알림",
        message,
        channelId: "urgent_alerts"
    });
});

export const sendGeneralBranchNotification = onCall({
    region: REGION,
    secrets: [webPushVapidPublicKey, webPushVapidPrivateKey]
}, async (request) => {
    const title = cleanString(request.data?.title, "알림 제목", 80);
    const message = cleanString(request.data?.message, "알림 내용", 500);
    return sendNotification({
        request,
        type: "general",
        targetType: "all",
        title,
        message,
        channelId: "branch_notices"
    });
});

const USAGE_LOG_RETENTION_DAYS = 90;

// usageLogs/{branch}/{yyyy-mm-dd}는 지점·날짜별로 계속 쌓이는 구조이므로
// 보관 기간이 지난 날짜는 매일 새벽에 정리해 RTDB 저장/다운로드 비용이
// 무한정 늘어나지 않게 한다.
export const pruneOldUsageLogs = onSchedule({
    region: REGION,
    schedule: "0 4 * * *",
    timeZone: "Asia/Seoul"
}, async () => {
    const cutoff = Date.now() - USAGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const db = getDatabase();

    for (const branch of BRANCHES) {
        const branchRef = db.ref(`usageLogs/${branch}`);
        const snapshot = await branchRef.get();
        if (!snapshot.exists()) continue;

        const dateKeys = Object.keys(snapshot.val());
        const staleDates = dateKeys.filter((dateKey) => {
            const parsed = new Date(`${dateKey}T00:00:00+09:00`);
            return !Number.isNaN(parsed.getTime()) && parsed.getTime() < cutoff;
        });

        await Promise.all(staleDates.map((dateKey) => branchRef.child(dateKey).remove()));
    }
});
