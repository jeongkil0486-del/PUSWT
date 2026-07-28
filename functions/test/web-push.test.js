import test from "node:test";
import assert from "node:assert/strict";
import {
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
} from "../lib/web-push.js";

const validSubscription = {
    endpoint: "https://push.example.test/device/123",
    keys: { p256dh: "AQIDBA", auth: "BQYHCA" }
};

test("인증 없는 Web Push 등록을 거부한다", () => {
    assert.throws(() => resolveEmployeeIdentity(null), { code: "unauthenticated" });
});

test("관리자 계정의 직원용 Web Push 등록을 거부한다", () => {
    assert.throws(
        () => resolveEmployeeIdentity({ uid: "admin", token: { role: "admin", branch: "PUS", userId: "PUSWT" } }),
        { code: "permission-denied" }
    );
});

test("직원 식별자는 auth custom claims에서만 가져온다", () => {
    assert.deepEqual(
        resolveEmployeeIdentity({ uid: "u1", token: { role: "user", branch: "TAE", userId: "직원1" } }),
        { uid: "u1", branch: "TAE", userId: "직원1" }
    );
});

test("deviceId 형식과 길이를 제한한다", () => {
    assert.equal(validateDeviceId("device_1-abc"), "device_1-abc");
    assert.throws(() => validateDeviceId("../other-user"), { code: "invalid-argument" });
    assert.throws(() => validateDeviceId("a".repeat(129)), { code: "invalid-argument" });
});

test("HTTPS endpoint와 암호화 키만 저장하고 예상하지 못한 필드를 제거한다", () => {
    assert.deepEqual(
        sanitizeSubscription({ ...validSubscription, userId: "spoof", __proto__: { polluted: true } }),
        validSubscription
    );
    assert.equal({}.polluted, undefined);
});

test("구독 저장 레코드는 기존 createdAt을 보존하고 iOS PWA 필드만 생성한다", () => {
    assert.deepEqual(createSubscriptionRecord(validSubscription, { createdAt: 10 }, 20), {
        ...validSubscription,
        platform: "ios-pwa",
        active: true,
        createdAt: 10,
        updatedAt: 20,
        lastLoginAt: 20
    });
});

test("등록, 삭제, 본인 테스트는 claims의 userId 아래 동일 기기 경로를 사용한다", () => {
    const identity = resolveEmployeeIdentity({
        uid: "u1",
        token: { role: "user", branch: "CJU", userId: "직원1" }
    });
    assert.equal(
        webPushSubscriptionPath(identity.userId, "device-1"),
        "webPushSubscriptions/직원1/device-1"
    );
});

test("HTTP endpoint와 비정상 키를 거부한다", () => {
    assert.throws(
        () => sanitizeSubscription({ ...validSubscription, endpoint: "http://push.example.test/device" }),
        { code: "invalid-argument" }
    );
    assert.throws(
        () => sanitizeSubscription({ ...validSubscription, keys: { p256dh: "bad key!", auth: "BQYHCA" } }),
        { code: "invalid-argument" }
    );
});

test("지점별 트리에서 대상 직원 구독만 수집하고 중복 endpoint를 제거한다", () => {
    const result = collectWebPushDevices(["직원1"], {
        직원1: {
            phone: { ...validSubscription, platform: "ios-pwa", active: true },
            duplicate: { ...validSubscription, platform: "ios-pwa", active: true }
        },
        다른직원: {
            phone: {
                ...validSubscription,
                endpoint: "https://push.example.test/other",
                platform: "ios-pwa",
                active: true
            }
        }
    });
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].userId, "직원1");
});

test("404와 410만 만료 구독으로 정리한다", () => {
    assert.equal(shouldDeleteWebPushSubscription(404), true);
    assert.equal(shouldDeleteWebPushSubscription(410), true);
    assert.equal(shouldDeleteWebPushSubscription(429), false);
    assert.equal(shouldDeleteWebPushSubscription(500), false);
});

test("Android와 iPhone이 모두 없는 사용자만 미등록으로 집계한다", () => {
    assert.deepEqual(
        usersWithoutAnyPush(
            ["android", "iphone", "none"],
            [{ userId: "android" }],
            [{ userId: "iphone" }]
        ),
        ["none"]
    );
});

test("오류 요약에 endpoint나 암호화 키를 포함하지 않는다", () => {
    const error = {
        statusCode: 410,
        endpoint: validSubscription.endpoint,
        body: JSON.stringify(validSubscription)
    };
    const serialized = JSON.stringify(safeWebPushError(error));
    assert.equal(serialized.includes("push.example"), false);
    assert.equal(serialized.includes("AQIDBA"), false);
    assert.deepEqual(JSON.parse(serialized), { statusCode: 410, category: "expired" });
});

test("표시 가능한 알림 payload에 경로와 고유 tag를 포함한다", () => {
    const payload = JSON.parse(createWebPushPayload({
        title: "긴급 알림",
        body: "내용",
        type: "urgent",
        branchCode: "PUS",
        id: "abc",
        timestamp: 123
    }));
    assert.equal(payload.url, "/?notification=urgent");
    assert.equal(payload.tag, "taswt-urgent-abc");
    assert.equal(payload.timestamp, 123);
});
