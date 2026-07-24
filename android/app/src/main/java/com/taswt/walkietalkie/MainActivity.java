package com.taswt.walkietalkie;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
