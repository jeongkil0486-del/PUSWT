export function baseOccupantName(value) {
    return String(value || "").replace(/\((크루|충전중)\)$/, "").trim();
}

export function selectTargetUsers({ whitelist, numbers, targetType, adminIds = [] }) {
    const admins = new Set(adminIds);
    const allUsers = [...new Set(Object.keys(whitelist || {}))].filter((userId) => !admins.has(userId));
    const occupied = new Set(Object.values(numbers || {}).map(baseOccupantName).filter(Boolean));
    if (targetType === "occupied") return allUsers.filter((userId) => occupied.has(userId));
    if (targetType === "unoccupied") return allUsers.filter((userId) => !occupied.has(userId));
    return allUsers;
}

export function collectDevices(targetUsers, tokenTree) {
    const devices = [];
    const usersWithoutTokens = [];
    const seenTokens = new Set();
    for (const userId of targetUsers) {
        const entries = Object.entries(tokenTree?.[userId] || {})
            .filter(([, value]) => value?.active !== false && value?.platform === "android" && value?.token);
        let activeCount = 0;
        for (const [deviceId, value] of entries) {
            if (seenTokens.has(value.token)) continue;
            seenTokens.add(value.token);
            activeCount += 1;
            devices.push({ userId, deviceId, token: value.token });
        }
        if (activeCount === 0) usersWithoutTokens.push(userId);
    }
    return { devices, usersWithoutTokens };
}
