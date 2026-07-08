import { db, ref, get, state } from './data.js';

export async function exportExcel() {
    try {
        const targetDate = document.getElementById('export-date').value;
        if (!targetDate) {
            alert('다운로드할 날짜를 선택해주세요.');
            return;
        }

        let logData = {};
        if (targetDate === state.todayString) {
            const todaySnap = await get(ref(db, 'system/boardState'));
            if (todaySnap.exists() && todaySnap.val().log) {
                logData = todaySnap.val().log;
            }
        } else {
            const historySnap = await get(ref(db, `history/${targetDate}`));
            if (historySnap.exists() && historySnap.val().log) {
                logData = historySnap.val().log;
            }
        }

        const logEntries = Object.values(logData);
        if (logEntries.length === 0) {
            alert(`${targetDate} 일자의 기록이 존재하지 않습니다.`);
            return;
        }

        const excelData = logEntries.map((log) => ({
            날짜: targetDate,
            시간: log.time,
            작업: log.action,
            직원명: log.user,
            번호: log.num
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '사용기록');
        XLSX.writeFile(workbook, `번호판기록_${targetDate}.xlsx`);
    } catch (error) {
        console.error(error);
        alert('엑셀 추출 중 오류가 발생했습니다.');
    }
}
