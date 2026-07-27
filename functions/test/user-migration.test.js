import test from "node:test";
import assert from "node:assert/strict";
import { updateMigratedUser } from "../lib/user-migration.js";

function createUserRef(initialValue) {
    let value = initialValue ? structuredClone(initialValue) : null;
    let lastUpdate = null;

    return {
        async update(patch) {
            lastUpdate = structuredClone(patch);
            value = { ...(value || {}), ...patch };
        },
        get value() {
            return value;
        },
        get lastUpdate() {
            return lastUpdate;
        }
    };
}

test("migration preserves the existing password and other user fields", async () => {
    const userRef = createUserRef({
        pw: "existing-password",
        name: "Existing User",
        department: "Operations",
        role: "legacy",
        authUid: "old-uid",
        migratedAt: 1
    });

    await updateMigratedUser(userRef, { uid: "PUS:new-uid", migratedAt: 1234 });

    assert.deepEqual(userRef.value, {
        pw: "existing-password",
        name: "Existing User",
        department: "Operations",
        role: "user",
        authUid: "PUS:new-uid",
        migratedAt: 1234
    });
    assert.deepEqual(userRef.lastUpdate, {
        role: "user",
        authUid: "PUS:new-uid",
        migratedAt: 1234
    });
});

test("migration creates the expected fields on an empty user node", async () => {
    const userRef = createUserRef(null);

    await updateMigratedUser(userRef, { uid: "PUS:new-uid", migratedAt: 1234 });

    assert.deepEqual(userRef.value, {
        role: "user",
        authUid: "PUS:new-uid",
        migratedAt: 1234
    });
});
