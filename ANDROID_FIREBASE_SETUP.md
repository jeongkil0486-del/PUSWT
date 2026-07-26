# TAS Walkie-Talkie Android / Firebase 설정

## 구현 범위와 배포 순서

이번 변경은 다음 두 단계로 배포하도록 설계되어 있습니다.

1. **1단계 — Capacitor Android + FCM**
   - 웹/PWA와 Android가 같은 Vite 빌드를 사용합니다.
   - 직원 로그인 시 기기별 FCM 토큰을 지점 경로에 저장합니다.
   - 긴급/일반 알림 대상은 Cloud Functions가 Firebase 데이터에서 계산합니다.
   - 기존 `system/userAlarms`, 직원 호출 UI, Realtime Database 진동 알림은 사용하지 않습니다.
2. **2단계 — Authentication/Rules 전환**
   - 새 앱의 첫 로그인은 `migrateLegacyLogin`이 기존 계정을 검증하고 Firebase Authentication 계정을 만듭니다.
   - 충분한 계정이 이전되고 웹/PWA도 새 빌드로 교체된 뒤 `database.rules.json`을 배포합니다.
   - Rules를 먼저 배포하면 기존의 인증되지 않은 구버전 PWA가 차단되므로 순서를 바꾸면 안 됩니다.

기존 지점 경로는 유지됩니다.

- 부산(PUS): `system`, `users`, `history`, `pushTokens`, `notificationLogs`
- 그 외 지점: `branches/{branchCode}/system`, `users`, `history`, `pushTokens`, `notificationLogs`
- 신규(모든 지점 공통, 지점 접두사 분기 없이 `usageLogs/{branchCode}/...`): `usageLogs/{branchCode}/{yyyy-mm-dd}/{logId}`
  (기존 `history/{date}`와 `system/boardState/log`는 더 이상 새로 기록되지 않지만 삭제하지도 않습니다. 옛 데이터 조회가 필요하면 그대로 남아 있습니다.)

## 11. Realtime Database 다운로드 비용 최적화

번호판이 바뀔 때마다 `system` 전체(사용 기록 포함)를 실시간으로 다시 내려받던 구조를 다음과 같이 나눴습니다.

- 번호판 점유 상태: `system/boardState/numbers`만 실시간 구독
- 설정값(총 번호 수, 숨김/제한, 번호명, 순서): `system/config`만 별도 실시간 구독
- 사용 기록(선택/반납/수정 등 로그): `system/boardState`에서 완전히 제거하고 `usageLogs/{branchCode}/{yyyy-mm-dd}/{logId}`에 날짜별로 저장
- 엑셀 추출: 선택한 날짜의 `usageLogs/{branchCode}/{yyyy-mm-dd}`만 `get()`으로 1회 조회 (실시간 구독 아님)
- FCM 토큰(`pushTokens`)과 알림 발송 이력(`notificationLogs`)은 원래도 번호판 구독과 분리된 별도 경로였고, 이번 변경 이후에도 번호판 리스너에 포함되지 않습니다.
- 앱이 백그라운드로 전환되면(`native.js`의 `registerAppStateListener`) 번호판/설정/초기화요청/알림이력 리스너를 모두 해제하고, 포그라운드로 돌아왔을 때만 현재 화면에 맞는 리스너를 다시 겁니다. 백그라운드 중 알림은 FCM 네이티브 푸시로만 수신합니다.
- 오래된 사용 기록 정리: Cloud Functions 예약 함수 `pruneOldUsageLogs`가 매일 새벽 4시(KST)에 실행되어 90일이 지난 `usageLogs/{branchCode}/{yyyy-mm-dd}` 날짜 노드를 지점별로 삭제합니다. 보관 기간은 `functions/index.js`의 `USAGE_LOG_RETENTION_DAYS` 상수로 조정할 수 있습니다.

### 남아 있는 다운로드 비용 위험 경로

- `pruneOldUsageLogs`는 지점별 `usageLogs/{branch}` 전체를 한 번 읽어 날짜 키를 판별한 뒤 오래된 날짜만 삭제합니다. 보관 기간(90일)이 늘어나거나 지점 트래픽이 매우 커지면 이 야간 배치 자체의 1회성 다운로드 용량이 함께 커집니다. 필요하면 날짜 키 목록만 별도 인덱스(예: `usageLogDates/{branch}`)로 관리해 값 전체를 읽지 않도록 추가 최적화할 수 있습니다.
- `system/config`는 자주 바뀌지 않지만 번호명(`seatNames`)이 많아지면(번호 수가 매우 많은 지점) 페이로드가 커질 수 있습니다. 현재 규모(지점당 최대 수십 개 번호)에서는 문제되지 않습니다.
- `notificationLogs`, `system/resetRequests`는 관리자 화면에서만 실시간 구독하며 데이터量이 작아 비용 위험이 낮습니다. 다만 알림 발송이 매우 잦아지면 `notificationLogs`도 날짜 파티션 분리를 고려할 수 있습니다.
- 관리자가 로그인한 상태로 화면을 켜 두면 `system/boardState/numbers`·`system/config` 구독은 계속 유지됩니다(포그라운드 실시간 기능이므로 의도된 동작입니다).

## 1. Firebase Console에서 Android 앱 추가

1. Firebase Console에서 `fltinfo` 프로젝트를 엽니다.
2. 프로젝트 설정 → 내 앱 → Android 앱 추가를 선택합니다.
3. Android 패키지 이름에 정확히 `com.taswt.walkietalkie`를 입력합니다.
4. 앱 닉네임은 `TAS WT` 등으로 입력합니다.
5. `google-services.json`을 다운로드합니다.
6. 실제 파일을 `android/app/google-services.json`에 놓습니다.
7. Firebase Authentication → 로그인 방법에서 **이메일/비밀번호**를 활성화합니다.
8. Cloud Messaging API와 Firebase Cloud Messaging 사용 가능 상태를 확인합니다.

`google-services.json`은 프로젝트별 실제 설정 파일입니다. 저장소에는 임시값이나 가짜 파일을 추가하지 않습니다.

SHA 인증서가 필요한 Firebase 기능을 추가로 사용하는 경우 다음 값들을 Firebase Android 앱에 등록합니다.

```powershell
cd android
.\gradlew.bat signingReport
```

현재 FCM 자체에는 SHA 등록이 필수는 아니지만 Google 로그인, App Check Play Integrity 등을 도입할 때 필요합니다.

## 2. Firebase CLI와 관리자 이전 Secret

프로젝트 루트에서 Firebase CLI에 로그인하고 프로젝트를 확인합니다.

```powershell
npx firebase-tools login
npx firebase-tools use fltinfo
```

기존 관리자 비밀번호를 클라이언트 코드에 다시 넣지 않고, Functions Secret으로 등록합니다.

```powershell
npx firebase-tools functions:secrets:set LEGACY_ADMIN_CREDENTIALS_JSON
```

프롬프트에는 실제 관리자 값으로 다음 형식의 JSON을 입력합니다.

```json
{
  "PUS": { "PUSWT": "실제 비밀번호" },
  "TAE": { "TAEWT": "실제 비밀번호" },
  "CJJ": { "CJJWT": "실제 비밀번호" },
  "GMP": { "GMPWT": "실제 비밀번호" }
}
```

서비스 계정 키를 프런트엔드나 Android 앱에 넣지 않습니다. Admin SDK 자격 증명은 배포된 Cloud Functions 런타임에서만 사용합니다.

## 3. Functions 우선 배포

```powershell
npm install
npm --prefix functions install
npm --prefix functions test
npx firebase-tools deploy --only functions
```

Functions 배포에는 Blaze 요금제와 필요한 API 활성화가 요구될 수 있습니다. 배포 후 새 웹/Android 앱에서 직원과 관리자 로그인을 실제 계정으로 점검합니다.

Functions는 다음을 서버에서 검증합니다.

- 호출자가 Firebase Authentication 관리자이며 요청 지점과 Custom Claim 지점이 같은지
- 대상 유형이 `occupied`, `unoccupied`, `all` 중 하나인지
- 지점 직원만 포함하고 관리자·중복 직원·중복 토큰을 제외하는지
- 빈 메시지와 제목, 최대 길이, 10초 이내 반복 발송인지
- 무효/해지된 FCM 토큰을 발송 결과에 따라 삭제하는지
- `notificationLogs`에 지점별 결과를 기록하는지

## 4. 웹/PWA 배포와 점진 이전

```powershell
npm run build
```

Vercel은 `vercel.json`의 `buildCommand`와 `outputDirectory`에 따라 `dist`를 배포합니다. 새 PWA 로그인도 Android와 동일하게 Firebase Authentication 계정으로 점진 이전됩니다.

운영 확인 항목:

- 각 지점 직원/관리자 로그인 성공
- `authMigrations/{userId}` 기록 생성
- Firebase Authentication 사용자에 `role`, `branch`, `userId` Custom Claims 존재
- 기존 번호 선택·반납·수정·관리·엑셀 기능 정상

확인이 끝나기 전에는 Database Rules를 배포하지 않습니다.

## 5. Database Rules 배포

웹과 Android의 Authentication 전환을 확인한 후에만 실행합니다.

```powershell
npx firebase-tools deploy --only database
```

`database.rules.json`은 지점 간 읽기/쓰기를 차단하고 직원 관리·설정 변경을 관리자 Claim으로 제한합니다. Cloud Functions의 Admin SDK 작업은 Rules의 영향을 받지 않습니다.

## 6. Android 동기화와 디버그 APK

```powershell
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

생성 파일:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

USB 디버깅 기기에 설치:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Android 13 이상에서는 첫 직원 로그인 후 알림 권한 팝업이 표시됩니다. 거부한 경우 앱 상단 안내를 따라 Android 설정 → 앱 → TAS Walkie-Talkie → 알림에서 직접 허용합니다.

## 7. 알림 테스트

실기기에서 다음을 각각 확인합니다.

- 앱 포그라운드: 앱 내부 알림 배너 표시
- 앱 백그라운드: Android 시스템 알림 표시
- 화면 꺼짐/잠금 화면: 시스템 알림 표시
- 최근 앱 목록에서 제거: 시스템 알림 표시
- 알림 탭: 앱 실행 후 직원 번호판 화면 이동
- 긴급 채널: HIGH 중요도, 소리, 잠금 화면, `500-200-500-200-800ms` 진동 패턴
- 일반 채널: DEFAULT 중요도와 일반 소리/진동
- 권한 거부: 앱 상단 설정 안내 표시

Android 정책상 무음 모드나 방해금지 모드를 강제로 우회하지 않습니다. 사용자가 채널 설정을 바꾸면 시스템 설정이 우선합니다.

## 8. 릴리스 서명과 AAB

업로드 키를 한 번만 생성하고 안전하게 백업합니다.

```powershell
keytool -genkeypair -v -keystore taswt-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias taswt-upload
```

키 파일과 비밀번호는 Git에 커밋하지 않습니다. Android Gradle signing config 또는 CI Secret에 연결한 뒤 다음을 실행합니다.

```powershell
npm run android:sync
cd android
.\gradlew.bat bundleRelease
```

출력:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

서명 설정 없이 생성된 AAB는 로컬 구조 검증용이며 Play Console 업로드용으로 사용하면 안 됩니다.

## 9. Play Console 확인 사항

- 앱 이름: `TAS Walkie-Talkie`
- 패키지: `com.taswt.walkietalkie`
- 세로 방향 UI와 휴대전화/태블릿 화면 확인
- Play App Signing 활성화 및 업로드 키 등록
- 개인정보처리방침에 FCM 토큰, 직원 식별자, 지점, 알림 로그 처리 내용 반영
- 데이터 보안 양식에 Firebase Authentication/Realtime Database/FCM 사용 내용 기재
- 알림 권한의 핵심 기능 설명과 스토어 등록정보 일치
- 내부 테스트 트랙에서 4개 지점의 교차 발송 차단 확인
- versionCode를 출시마다 증가

## 10. 알려진 운영 제약

- 실제 FCM 송수신은 실제 `google-services.json`, Firebase 배포, 실기기 없이는 검증할 수 없습니다.
- iOS는 이번 범위에 포함되지 않습니다.
- 기기 설정에서 앱을 강제 종료하거나 알림을 시스템 수준에서 차단한 경우 수신을 보장할 수 없습니다.
- `firebase-functions` 7.3.2-rc.0과 Admin SDK 14.2.0 조합은 현재 npm peer 범위를 맞추기 위해 사용했습니다. 운영 배포 전 Firebase 릴리스 채널의 안정 버전 여부를 다시 확인하십시오.
