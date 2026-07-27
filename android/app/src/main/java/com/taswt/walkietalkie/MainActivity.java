package com.taswt.walkietalkie;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15(targetSdk 35)부터는 edge-to-edge가 시스템에 의해 강제되므로,
        // 그보다 낮은 버전에서도 동일하게 동작하도록 명시적으로 켠다.
        // 이렇게 해야 WebView가 시스템 바 인셋을 받아 CSS env(safe-area-inset-*)
        // 값을 정상적으로 계산할 수 있다. 상태바 자체를 숨기지는 않는다.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        boolean isDebuggable =
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebuggable);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);

        NotificationChannel urgent = new NotificationChannel(
            "urgent_alerts",
            "긴급 알림",
            NotificationManager.IMPORTANCE_HIGH
        );
        urgent.setDescription("즉시 확인이 필요한 지점 긴급 알림");
        urgent.enableVibration(true);
        urgent.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 800 });
        urgent.enableLights(true);
        urgent.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(urgent);

        NotificationChannel general = new NotificationChannel(
            "branch_notices",
            "지점 알림",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        general.setDescription("현재 지점의 일반 공지");
        general.enableVibration(true);
        general.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(general);
    }
}
