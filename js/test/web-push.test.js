import test from "node:test";
import assert from "node:assert/strict";
import {
    createRegistrationPayload,
    ensurePushSubscription,
    getPermissionUiState,
    getOrCreateWebPushDeviceId,
    getWebPushEnvironment,
    isAppleMobilePlatform,
    isStandaloneDisplay,
    supportsWebPush,
    unsubscribeExistingSubscription,
    urlBase64ToUint8Array
} from "../lib/web-push.js";

const iosNavigator = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    platform: "iPhone",
    standalone: true,
    serviceWorker: {}
};
const iosWindow = {
    PushManager: class {},
    Notification: { permission: "default" },
    matchMedia: () => ({ matches: true })
};

test("iPhone과 터치 iPad를 Apple 모바일 환경으로 판정한다", () => {
    assert.equal(isAppleMobilePlatform(iosNavigator), true);
    assert.equal(isAppleMobilePlatform({ platform: "MacIntel", maxTouchPoints: 5 }), true);
    assert.equal(isAppleMobilePlatform({ platform: "Win32", userAgent: "Chrome" }), false);
});

test("navigator.standalone과 display-mode standalone을 모두 지원한다", () => {
    assert.equal(isStandaloneDisplay({}, { standalone: true }), true);
    assert.equal(isStandaloneDisplay({ matchMedia: () => ({ matches: true }) }, {}), true);
    assert.equal(isStandaloneDisplay({ matchMedia: () => ({ matches: false }) }, {}), false);
});

test("Push, Notification, Service Worker API를 feature detection 한다", () => {
    assert.equal(supportsWebPush(iosWindow, iosNavigator), true);
    assert.equal(supportsWebPush({}, iosNavigator), false);
});

test("Android 네이티브에서는 Web Push를 실행하지 않는다", () => {
    assert.deepEqual(
        getWebPushEnvironment({ windowLike: iosWindow, navigatorLike: iosNavigator, nativeAndroid: true }),
        { eligible: false, reason: "android-native" }
    );
});

test("일반 Safari 탭에서는 알림 요청 대상이 아니다", () => {
    const windowLike = { ...iosWindow, matchMedia: () => ({ matches: false }) };
    const navigatorLike = { ...iosNavigator, standalone: false };
    assert.deepEqual(
        getWebPushEnvironment({ windowLike, navigatorLike }),
        { eligible: false, reason: "not-standalone" }
    );
});

test("standalone iPhone PWA만 알림 활성화 대상이다", () => {
    assert.deepEqual(
        getWebPushEnvironment({ windowLike: iosWindow, navigatorLike: iosNavigator }),
        { eligible: true, reason: "ready" }
    );
});

test("알림 권한 default, granted, denied 상태를 구분한다", () => {
    assert.equal(getPermissionUiState("default", false), "ready");
    assert.equal(getPermissionUiState("granted", true), "subscribed");
    assert.equal(getPermissionUiState("granted", false), "ready");
    assert.equal(getPermissionUiState("denied", false), "denied");
});

test("VAPID 공개키를 Uint8Array로 변환한다", () => {
    assert.deepEqual([...urlBase64ToUint8Array("AQIDBA")], [1, 2, 3, 4]);
    assert.throws(() => urlBase64ToUint8Array("not valid!"), /Invalid VAPID/);
});

test("웹 Push 기기 ID를 한 번 생성한 뒤 재사용한다", () => {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    };
    const first = getOrCreateWebPushDeviceId(storage, { randomUUID: () => "device-1" });
    const second = getOrCreateWebPushDeviceId(storage, { randomUUID: () => "device-2" });
    assert.equal(first, "device-1");
    assert.equal(second, "device-1");
});

test("기존 PushSubscription은 중복 생성하지 않고 재사용한다", async () => {
    const existing = { endpoint: "https://push.example/existing" };
    let subscribed = false;
    const registration = {
        pushManager: {
            getSubscription: async () => existing,
            subscribe: async () => {
                subscribed = true;
            }
        }
    };
    const result = await ensurePushSubscription(registration, "AQIDBA");
    assert.equal(result.subscription, existing);
    assert.equal(result.created, false);
    assert.equal(subscribed, false);
});

test("구독이 없으면 userVisibleOnly와 VAPID 키로 생성한다", async () => {
    let options;
    const created = { endpoint: "https://push.example/new" };
    const registration = {
        pushManager: {
            getSubscription: async () => null,
            subscribe: async (value) => {
                options = value;
                return created;
            }
        }
    };
    const result = await ensurePushSubscription(registration, "AQIDBA");
    assert.equal(result.subscription, created);
    assert.equal(result.created, true);
    assert.equal(options.userVisibleOnly, true);
    assert.deepEqual([...options.applicationServerKey], [1, 2, 3, 4]);
});

test("Callable 등록 요청에는 기기 ID와 표준 구독 JSON만 담는다", () => {
    const subscription = { toJSON: () => ({ endpoint: "https://push.example/new", keys: { p256dh: "a", auth: "b" } }) };
    assert.deepEqual(createRegistrationPayload("device-1", subscription), {
        deviceId: "device-1",
        subscription: subscription.toJSON()
    });
});

test("구독 해제는 기존 구독에만 실행한다", async () => {
    let called = 0;
    assert.equal(await unsubscribeExistingSubscription(null), false);
    assert.equal(await unsubscribeExistingSubscription({ unsubscribe: async () => {
        called += 1;
        return true;
    } }), true);
    assert.equal(called, 1);
});
