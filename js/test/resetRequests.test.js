import test from "node:test";
import assert from "node:assert/strict";
import { selectPendingResetUsers } from "../lib/resetRequests.js";

const whitelist = { 전정길: true, 김민재: true };
const resetRequests = {
    전정길: true,
    T239182: true,
    배정: true,
    김민재: false,
    PUSWT: true
};

test("whitelist에 없는 과거 잔여 요청과 관리자 계정을 제외한다", () => {
    assert.deepEqual(selectPendingResetUsers({ resetRequests, whitelist }), ["전정길"]);
});

test("value가 true가 아닌 항목은 제외한다", () => {
    assert.deepEqual(
        selectPendingResetUsers({ resetRequests: { 김민재: false }, whitelist }),
        []
    );
});

test("resetRequests가 없으면 빈 목록을 반환한다", () => {
    assert.deepEqual(selectPendingResetUsers({ resetRequests: {}, whitelist }), []);
    assert.deepEqual(selectPendingResetUsers({ resetRequests: null, whitelist }), []);
});

test("whitelist가 없으면 빈 목록을 반환한다", () => {
    assert.deepEqual(selectPendingResetUsers({ resetRequests, whitelist: {} }), []);
    assert.deepEqual(selectPendingResetUsers({ resetRequests, whitelist: null }), []);
});

test("whitelist에서 직원이 빠지면 더 이상 목록에 나타나지 않는다", () => {
    const narrowedWhitelist = { 김민재: true };
    assert.deepEqual(
        selectPendingResetUsers({ resetRequests: { 전정길: true, 김민재: true }, whitelist: narrowedWhitelist }),
        ["김민재"]
    );
});

test("한글 로케일 기준으로 안정적으로 정렬한다", () => {
    const result = selectPendingResetUsers({
        resetRequests: { 황보림: true, 김민재: true, 배수아: true },
        whitelist: { 황보림: true, 김민재: true, 배수아: true }
    });
    assert.deepEqual(result, [...result].sort((a, b) => a.localeCompare(b, "ko-KR")));
    assert.deepEqual(result.length, 3);
});
