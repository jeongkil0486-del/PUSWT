import { usageLogRef, get, state, getBranchLabel } from "./data.js";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export async function exportExcel() {
    try {
        const targetDate = document.getElementById("export-date").value;
        if (!targetDate) {
            alert("다운로드할 날짜를 선택해주세요.");
            return;
        }

        // usageLogs/{branch}/{yyyy-mm-dd}에서 선택한 날짜의 로그만 일회성으로 조회한다.
        // (번호판 실시간 경로와는 무관하므로 매번 전체 데이터를 내려받지 않는다)
        const logSnap = await get(usageLogRef(targetDate));
        const logData = logSnap.exists() ? logSnap.val() : {};

        const logEntries = Object.values(logData);
        if (logEntries.length === 0) {
            alert(`${targetDate} 일자의 기록이 존재하지 않습니다.`);
            return;
        }

        const excelData = logEntries.map((log) => ({
            지점: getBranchLabel(),
            날짜: targetDate,
            시간: log.time,
            작업: log.action,
            직원명: log.user,
            번호: log.num
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "사용기록");
        const fileName = `번호판기록_${state.currentBranch}_${targetDate}.xlsx`;
        if (Capacitor.isNativePlatform()) {
            const data = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
            const saved = await Filesystem.writeFile({
                path: fileName,
                data,
                directory: Directory.Cache,
                recursive: true
            });
            await Share.share({
                title: `${targetDate} 무전기 사용 기록`,
                text: `${getBranchLabel()} 지점 일별 사용 기록`,
                files: [saved.uri],
                dialogTitle: "엑셀 파일 공유"
            });
        } else {
            XLSX.writeFile(workbook, fileName);
        }
    } catch (error) {
        console.error(error);
        alert("엑셀 추출 중 오류가 발생했습니다.");
    }
}
