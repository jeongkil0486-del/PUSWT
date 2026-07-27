import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BRANCH, BRANCH_OPTIONS, normalizeBranch } from "../lib/branches.js";

test("기존 지점은 그대로 정규화된다", () => {
    assert.equal(normalizeBranch("PUS"), "PUS");
    assert.equal(normalizeBranch("TAE"), "TAE");
    assert.equal(normalizeBranch("CJJ"), "CJJ");
    assert.equal(normalizeBranch("GMP"), "GMP");
});

test("신규 지점(제주/광주/인천)이 정상적으로 정규화된다", () => {
    assert.equal(normalizeBranch("CJU"), "CJU");
    assert.equal(normalizeBranch("KWJ"), "KWJ");
    assert.equal(normalizeBranch("ICN"), "ICN");
});

test("소문자로 들어와도 대문자로 정규화된다", () => {
    assert.equal(normalizeBranch("cju"), "CJU");
    assert.equal(normalizeBranch("kwj"), "KWJ");
    assert.equal(normalizeBranch("icn"), "ICN");
});

test("등록되지 않은 지점 코드는 기본 지점(PUS)으로 대체된다", () => {
    assert.equal(normalizeBranch("XXX"), DEFAULT_BRANCH);
    assert.equal(normalizeBranch(""), DEFAULT_BRANCH);
    assert.equal(normalizeBranch(undefined), DEFAULT_BRANCH);
});

test("BRANCH_OPTIONS는 요청된 순서와 라벨로 7개 지점을 담는다", () => {
    assert.deepEqual(BRANCH_OPTIONS, [
        { code: "PUS", label: "부산" },
        { code: "TAE", label: "대구" },
        { code: "CJJ", label: "청주" },
        { code: "GMP", label: "김포" },
        { code: "CJU", label: "제주" },
        { code: "KWJ", label: "광주" },
        { code: "ICN", label: "인천" }
    ]);
});
