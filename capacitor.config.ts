import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.remesas.manzanoapp',
  appName: 'Cambios Manzano',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
      // @ts-ignore
      iconColor: '#8cb33e',
      // @ts-ignore
      smallIcon: 'ic_stat_notification'
    }
  }
};

export default config;
