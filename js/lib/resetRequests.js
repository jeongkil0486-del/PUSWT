export const RESET_REQUEST_ADMIN_IDS = new Set(["PUSWT", "TAEWT", "CJJWT", "GMPWT", "CJUWT", "KWJWT", "ICNWT"]);

// 초기화 요청 대기자로 표시할 사용자를 계산한다. 다음을 모두 만족해야 한다.
// 1) resetRequests[userId] === true
// 2) whitelist에 해당 userId가 현재 존재함(삭제/과거 잔여 요청 제외)
// 3) 관리자 계정이 아님
export function selectPendingResetUsers({ resetRequests, whitelist, adminIds = RESET_REQUEST_ADMIN_IDS } = {}) {
    const requests = resetRequests || {};
    const roster = whitelist || {};
    const admins = adminIds instanceof Set ? adminIds : new Set(adminIds);

    return Object.entries(requests)
        .filter(([userId, value]) => (
            value === true &&
            Object.prototype.hasOwnProperty.call(roster, userId) &&
            !admins.has(userId)
        ))
        .map(([userId]) => userId)
        .sort((a, b) => a.localeCompare(b, "ko-KR"));
}
