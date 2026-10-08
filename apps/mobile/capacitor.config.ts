import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.levelup.mobile',
  appName: 'Level Up',
  webDir: 'dist/mobile/browser',
  backgroundColor: '#0b1a14',
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 600, backgroundColor: '#0b1a14', showSpinner: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#8fd6a8' },
  },
};

export default config;
