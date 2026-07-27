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
    for (const branch of ["TAE", "CJJ", "GMP", "CJU", "KWJ", "ICN"]) {
        assert.equal(branchPath(branch), `branches/${branch}`);
        assert.equal(
            branchPath(branch, "system/whitelist"),
            `branches/${branch}/system/whitelist`
        );
    }
});

test("신규 지점(제주/광주/인천)은 각자의 branches/{code} 경로 아래에만 있다", () => {
    assert.equal(branchPath("CJU", "system/whitelist"), "branches/CJU/system/whitelist");
    assert.equal(branchPath("KWJ", "system/whitelist"), "branches/KWJ/system/whitelist");
    assert.equal(branchPath("ICN", "system/whitelist"), "branches/ICN/system/whitelist");
});

test("PUS and other branch paths do not overlap", () => {
    const pusPath = branchPath("PUS", "users/example");

    for (const branch of ["TAE", "CJJ", "GMP", "CJU", "KWJ", "ICN"]) {
        const branchUserPath = branchPath(branch, "users/example");
        assert.notEqual(branchUserPath, pusPath);
        assert.match(branchUserPath, new RegExp(`^branches/${branch}/`));
    }
});

test("신규 지점끼리도 서로 경로가 겹치지 않는다", () => {
    const paths = ["CJU", "KWJ", "ICN"].map((branch) => branchPath(branch, "system/boardState"));
    assert.equal(new Set(paths).size, paths.length);
});
