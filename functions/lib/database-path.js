export function branchPath(branch, path = "") {
    const cleanPath = String(path || "")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

    if (branch === "PUS") {
        return cleanPath || "/";
    }

    return cleanPath
        ? `branches/${branch}/${cleanPath}`
        : `branches/${branch}`;
}
