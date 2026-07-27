import test from "node:test";
import assert from "node:assert/strict";
import { branchPath } from "../lib/database-path.js";

test("PUS root is never an empty path", () => {
    assert.equal(branchPath("PUS"), "/");
});

test("PUS child paths stay at the database root", () => {
    assert.equal(branchPath("PUS", "system/whitelist"), "system/whitelist");
    assert.equal(branchPath("PUS", "/authMigrations/"), "authMigrations");
});

test("other branches stay below their branch roots", () => {
    for (const branch of ["TAE", "CJJ", "GMP"]) {
        assert.equal(branchPath(branch), `branches/${branch}`);
        assert.equal(
            branchPath(branch, "system/whitelist"),
            `branches/${branch}/system/whitelist`
        );
    }
});

test("PUS and other branch paths do not overlap", () => {
    const pusPath = branchPath("PUS", "users/example");

    for (const branch of ["TAE", "CJJ", "GMP"]) {
        const branchUserPath = branchPath(branch, "users/example");
        assert.notEqual(branchUserPath, pusPath);
        assert.match(branchUserPath, new RegExp(`^branches/${branch}/`));
    }
});
