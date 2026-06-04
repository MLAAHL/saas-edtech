package com.mlaahl.parent;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Apply settings immediately
        applySystemBarSettings();
        
        // Create notification channel for Android 8+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "attendance_alerts",
                "Attendance Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifies parents when student is absent");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500});
            channel.enableLights(true);
            channel.setLightColor(Color.RED);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBarSettings();
        }
    }

    private void applySystemBarSettings() {
        Window window = getWindow();
        
        // 1. Force the layout to respect system bars (Fixes overlap)
        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        // 2. Set exact colors from web app
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.parseColor("#F8F9FA")); // Top of gradient
            window.setNavigationBarColor(Color.parseColor("#E9ECEF")); // Bottom of gradient
        }

        // Disable contrast enforcement to ensure exact color match
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // 3. Force dark icons (Black/Gray)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        } else {
            View decorView = window.getDecorView();
            int flags = decorView.getSystemUiVisibility();
            
            // Remove fullscreen flags that cause overlap
            flags &= ~View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            flags &= ~View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
            
            // Set light status bar (Black icons)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            // Set light navigation bar (Black icons)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            decorView.setSystemUiVisibility(flags);
        }
    }
}
