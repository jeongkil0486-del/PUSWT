export const DEFAULT_BRANCH = "PUS";

export const BRANCH_OPTIONS = [
    { code: "PUS", label: "부산" },
    { code: "TAE", label: "대구" },
    { code: "CJJ", label: "청주" },
    { code: "GMP", label: "김포" },
    { code: "CJU", label: "제주" },
    { code: "KWJ", label: "광주" },
    { code: "ICN", label: "인천" }
];

export function normalizeBranch(branchCode) {
    const normalized = String(branchCode || DEFAULT_BRANCH).toUpperCase();
    return BRANCH_OPTIONS.some((branch) => branch.code === normalized) ? normalized : DEFAULT_BRANCH;
}
