import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.uce.flowday',
  appName: 'Flowday',
  webDir: 'dist-android',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      iconColor: '#5082ef',
    },
  },
};

export default config;
