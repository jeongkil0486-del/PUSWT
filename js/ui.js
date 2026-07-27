import {
    dbRef,
    usageLogRef,
    set,
    get,
    remove,
    onValue,
    push,
    runTransaction,
    state,
    screens,
    getBranchLabel
} from "./data.js";
import { clearSession } from "./storage.js";

const MODE_SELF = "본인";
const MODE_CREW = "크루";
const MODE_CHARGE = "충전중";

function getModeDisplayName() {
    if (state.currentMode === MODE_CREW) {
        return `${state.currentUser}(크루)`;
    }
    if (state.currentMode === MODE_CHARGE) {
        return `${state.currentUser}(충전중)`;
    }
    return state.currentUser;
}
function formatElapsedTime(elapsed) {
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    return mins > 0 ? `${mins}분 ${secs}초 전` : `${secs}초 전`;
}

export function switchScreen(target) {
    Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
    screens[target].classList.remove("hidden");

    // loading 화면도 login과 같은 전체화면 잠금 레이아웃을 사용한다.
    const isFullScreenLock = target === "login" || target === "loading";
    document.documentElement.classList.toggle("login-active", isFullScreenLock);
    document.body.classList.toggle("login-active", isFullScreenLock);
}

export function updateBranchBadges() {
    const label = getBranchLabel();
    const mainBadge = document.getElementById("main-branch-badge");
    const adminBadge = document.getElementById("admin-branch-badge");

    if (mainBadge) {
        mainBadge.innerText = label;
    }
    if (adminBadge) {
        adminBadge.innerText = label;
    }
}

export function updateUserHeader() {
    document.getElementById("user-greeting").innerText = `${state.currentUser}님 환영합니다`;
    document.getElementById("date-display").innerText = state.todayString;
    updateBranchBadges();
}

export function setMode(mode) {
    state.currentMode = mode;
    const btnSelf = document.getElementById("btn-mode-self");
    const btnCrew = document.getElementById("btn-mode-crew");
    const btnCharge = document.getElementById("btn-mode-charge");

    btnSelf.className = `btn ${mode === MODE_SELF ? "btn-mode-self" : "btn-secondary"}`;
    btnCrew.className = `btn ${mode === MODE_CREW ? "btn-mode-crew" : "btn-secondary"}`;
    btnCharge.className = `btn ${mode === MODE_CHARGE ? "btn-mode-charge" : "btn-secondary"}`;
}

export function toggleEditMode(button) {
    state.isEditMode = !state.isEditMode;
    if (state.isEditMode) {
        button.classList.replace("btn-secondary", "btn-warning");
        button.style.color = "#333";
        alert("수정 모드가 켜졌습니다.\n원하는 번호를 누르면 현재 사용자를 밀어내고 내 이름으로 등록됩니다.");
        return;
    }

    button.classList.replace("btn-warning", "btn-secondary");
    button.style.color = "white";
}

export function resetEditModeButton() {
    state.isEditMode = false;
    const button = document.getElementById("btn-edit-mode");
    button.classList.remove("btn-warning");
    button.classList.add("btn-secondary");
    button.style.color = "white";
}

export function logoutAction() {
    state.currentUser = null;
    state.isAdmin = false;
    state.currentBoardNumbers = {};
    clearSession();
    location.reload();
}

export function renderGrid(gridElement, totalNumbers, disabledNumbers, numbers, options = {}) {
    const { isAdminView = false, onAdminClear, onToggleNumber } = options;

    // 순서 배열: seatOrder가 있으면 사용, 없으면 기본 순서
    const order = (state.seatOrder && state.seatOrder.length)
        ? state.seatOrder.filter(n => n >= 1 && n <= totalNumbers)
        : Array.from({ length: totalNumbers }, (_, i) => i + 1);

    gridElement.innerHTML = "";
    for (const i of order) {
        const box = document.createElement("div");
        box.className = "number-box";

        // seatName이 있으면 이름만 표시, 없으면 번호만 표시 (숫자 중복 표시 없음)
        const seatLabel = state.seatNames[String(i)];
        if (seatLabel) {
            box.innerHTML = `<span class="seat-label">${seatLabel}</span>`;
        } else {
            box.innerText = i;
        }

        if (disabledNumbers[i]) {
            box.classList.add("disabled");
            box.innerHTML += '<div class="name-tag">사용제한</div>';
        } else if (numbers[i]) {
            const isCharge = numbers[i].includes("(충전중)");
            const isCrew = numbers[i].includes("(크루)");

            if (isCharge) {
                box.classList.add("occupied-charge");
                box.innerHTML += '<div class="name-tag">충전중</div>';
            } else {
                box.classList.add(isCrew ? "occupied-crew" : "occupied-self");
                box.innerHTML += `<div class="name-tag">${numbers[i]}</div>`;
            }

            if (isAdminView && onAdminClear) {
                box.onclick = () => onAdminClear(i, numbers[i]);
            } else if (onToggleNumber) {
                box.onclick = () => onToggleNumber(i, numbers[i], true);
            }
        } else if (!isAdminView && onToggleNumber) {
            box.onclick = () => onToggleNumber(i, null, false);
        }

        gridElement.appendChild(box);
    }
}

let unsubscribeBoardNumbers = null;
let unsubscribeBoardConfig = null;
let latestBoardConfig = {};

function renderBoardFromState() {
    const grid = document.getElementById("number-grid");
    if (!grid) return;

    const total = latestBoardConfig.totalNumbers || 20;
    const disabled = latestBoardConfig.disabledNumbers || {};
    const hidden = latestBoardConfig.hiddenNumbers || {};
    state.seatNames = latestBoardConfig.seatNames || {};
    state.seatOrder = latestBoardConfig.seatOrder || [];

    // hiddenNumbers는 disabled처럼 처리 (합산)
    const mergedDisabled = { ...disabled, ...hidden };

    renderGrid(grid, total, mergedDisabled, state.currentBoardNumbers, {
        onToggleNumber: toggleNumber
    });
}

// system 전체를 구독하지 않고 번호판(numbers)과 설정(config)을 각각 구독한다.
// system/boardState 아래에는 더 이상 계속 커지는 log가 존재하지 않으므로
// 두 경로 모두 번호판 변경 때마다 전체 트리를 다시 내려받지 않는다.
export function listenToBoard() {
    stopListeningToBoard();

    unsubscribeBoardNumbers = onValue(dbRef("system/boardState/numbers"), (snapshot) => {
        state.currentBoardNumbers = snapshot.val() || {};
        renderBoardFromState();
    });

    unsubscribeBoardConfig = onValue(dbRef("system/config"), (snapshot) => {
        latestBoardConfig = snapshot.val() || {};
        renderBoardFromState();
    });
}

export function stopListeningToBoard() {
    unsubscribeBoardNumbers?.();
    unsubscribeBoardConfig?.();
    unsubscribeBoardNumbers = null;
    unsubscribeBoardConfig = null;
}

export async function toggleNumber(num, currentOccupant, isOccupied) {
    if (state.isProcessingClick) {
        return;
    }
    state.isProcessingClick = true;

    try {
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
        const displayName = getModeDisplayName();
        const logRef = usageLogRef(state.todayString);

        if (state.isEditMode && isOccupied) {
            if (currentOccupant.split("(")[0] === state.currentUser) {
                alert("이미 본인이 사용 중인 번호입니다.");
            } else if (confirm(`현재 [${currentOccupant}] 님이 사용 중입니다.\n강제로 내 번호로 수정하시겠습니까?`)) {
                if (state.currentMode === MODE_SELF) {
                    const tasks = [];
                    Object.entries(state.currentBoardNumbers).forEach(([key, value]) => {
                        if (value === state.currentUser) {
                            tasks.push(remove(dbRef(`system/boardState/numbers/${key}`)));
                        }
                    });
                    await Promise.all(tasks);
                }
                await set(dbRef(`system/boardState/numbers/${num}`), displayName);
                await push(logRef, { time: timeStr, num, action: "수정(뺏기)", user: displayName });
            }

            resetEditModeButton();
            return;
        }

        if (isOccupied) {
            const occupantBase = currentOccupant.split("(")[0];
            if (occupantBase !== state.currentUser) {
                alert("본인의 번호판만 반납할 수 있습니다.\n(다른 사람의 번호를 뺏으려면 상단의 [수정] 버튼을 켜주세요)");
                return;
            }

            await remove(dbRef(`system/boardState/numbers/${num}`));
            await push(logRef, { time: timeStr, num, action: "반납", user: currentOccupant });
            return;
        }

        if (state.currentMode === MODE_SELF) {
            const existEntry = Object.entries(state.currentBoardNumbers).find(([, value]) => value === state.currentUser);

            if (existEntry) {
                if (!confirm(`이미 ${existEntry[0]}번을 선택 중입니다. ${num}번으로 자리 이동을 하시겠습니까?`)) {
                    return;
                }

                const result = await runTransaction(dbRef("system/boardState/numbers"), (numbers) => {
                    if (!numbers) {
                        numbers = {};
                    }
                    if (numbers[num] && numbers[num] !== state.currentUser) {
                        return;
                    }
                    Object.keys(numbers).forEach((key) => {
                        if (numbers[key] === state.currentUser) {
                            delete numbers[key];
                        }
                    });
                    numbers[num] = state.currentUser;
                    return numbers;
                });

                if (result.committed) {
                    await push(logRef, { time: timeStr, num, action: "자리이동", user: state.currentUser });
                } else {
                    alert("간발의 차이로 다른 사람이 먼저 번호를 선택했습니다.");
                }
            } else {
                const result = await runTransaction(dbRef(`system/boardState/numbers/${num}`), (currentData) => {
                    if (currentData === null) {
                        return state.currentUser;
                    }
                    return;
                });

                if (result.committed) {
                    await push(logRef, { time: timeStr, num, action: "선택", user: state.currentUser });
                } else {
                    alert("간발의 차이로 다른 사람이 먼저 번호를 선택했습니다.");
                }
            }
        } else {
            const actionLabel = state.currentMode === MODE_CHARGE ? "선택(충전중)" : "선택(크루)";
            const result = await runTransaction(dbRef(`system/boardState/numbers/${num}`), (currentData) => {
                if (currentData === null) {
                    return displayName;
                }
                return;
            });

            if (result.committed) {
                await push(logRef, { time: timeStr, num, action: actionLabel, user: displayName });
            } else {
                alert("간발의 차이로 다른 사람이 먼저 번호를 선택했습니다.");
            }
        }
    } catch (error) {
        console.error("toggleNumber 오류:", error);
        alert("처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
        setTimeout(() => {
            state.isProcessingClick = false;
        }, 150);
    }
}

export async function returnAllNumbers() {
    try {
        const snap = await get(dbRef("system/boardState/numbers"));
        if (!snap.exists()) {
            alert("현재 사용 중인 번호가 없습니다.");
            return;
        }

        const numbers = snap.val();
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
        let hasChanged = false;
        const tasks = [];

        Object.entries(numbers).forEach(([num, name]) => {
            if (name && (
                name === state.currentUser ||
                name === `${state.currentUser}(크루)` ||
                name === `${state.currentUser}(충전중)`
            )) {
                tasks.push(
                    remove(dbRef(`system/boardState/numbers/${num}`)).then(() => push(usageLogRef(state.todayString), {
                        time: timeStr,
                        num,
                        action: "전체반납",
                        user: name.split("(")[0]
                    }))
                );
                hasChanged = true;
            }
        });

        if (!hasChanged) {
            alert("반납할 내 번호가 없습니다.");
            return;
        }

        await Promise.all(tasks);
        alert("내 이름이 들어간 모든 번호가 초기화(반납)되었습니다.");
    } catch (error) {
        console.error("전체 반납 오류:", error);
        alert("처리 중 오류가 발생했습니다.");
    }
}
