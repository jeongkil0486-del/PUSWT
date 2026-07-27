import test from "node:test";
import assert from "node:assert/strict";
import { collectDevices, selectTargetUsers } from "../lib/audience.js";

const whitelist = { 김철수: true, 이영희: true, 박민수: true, PUSWT: true };
const numbers = {
    1: "김철수",
    2: "김철수(크루)",
    3: "박민수(충전중)"
};

test("번호 보유 직원은 모드를 제거하고 직원 단위로 중복 제거한다", () => {
    assert.deepEqual(
        selectTargetUsers({ whitelist, numbers, targetType: "occupied", adminIds: ["PUSWT"] }),
        ["김철수", "박민수"]
    );
});

test("미점유 직원과 전체 직원에서 관리자 계정을 제외한다", () => {
    assert.deepEqual(
        selectTargetUsers({ whitelist, numbers, targetType: "unoccupied", adminIds: ["PUSWT"] }),
        ["이영희"]
    );
    assert.deepEqual(
        selectTargetUsers({ whitelist, numbers, targetType: "all", adminIds: ["PUSWT"] }),
        ["김철수", "이영희", "박민수"]
    );
});

test("신규 지점 관리자 계정(CJUWT/KWJWT/ICNWT)도 알림 대상에서 제외된다", () => {
    const newBranchWhitelist = { 전정길: true, 김민재: true, CJUWT: true, KWJWT: true, ICNWT: true };
    const newBranchAdminIds = ["PUSWT", "TAEWT", "CJJWT", "GMPWT", "CJUWT", "KWJWT", "ICNWT"];

    assert.deepEqual(
        selectTargetUsers({ whitelist: newBranchWhitelist, numbers: {}, targetType: "all", adminIds: newBranchAdminIds }),
        ["전정길", "김민재"]
    );
});

test("여러 기기를 유지하고 중복/비활성 토큰 및 토큰 없는 직원을 분류한다", () => {
    const result = collectDevices(["김철수", "이영희", "박민수"], {
        김철수: {
            phone: { token: "a", platform: "android", active: true },
            tablet: { token: "b", platform: "android", active: true }
        },
        이영희: {
            old: { token: "c", platform: "android", active: false }
        },
        박민수: {
            duplicate: { token: "a", platform: "android", active: true }
        }
    });
    assert.deepEqual(result.devices.map(({ token }) => token), ["a", "b"]);
    assert.deepEqual(result.usersWithoutTokens, ["이영희", "박민수"]);
});
