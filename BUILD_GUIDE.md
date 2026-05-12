# Guía de Construcción y Deployment - App Android

## Requisitos Previos

- ✅ Android Studio instalado
- ✅ JDK 11 o superior
- ✅ Firebase configurado con `google-services.json`
- ✅ Código sincronizado con `npm run cap:sync`

## Pasos para Compilar la App

### 1. Abrir Proyecto en Android Studio

```powershell
# Desde la raíz del proyecto
npm run cap:open
```

Esto abrirá el proyecto Android en Android Studio.

### 2. Sincronizar Gradle

Android Studio automáticamente sincronizará Gradle files. Si no lo hace:
- Click en "File" > "Sync Project with Gradle Files"
- O usa el botón "Sync Now" en la barra superior

### 3. Compilar APK

#### Opción A: Desde Android Studio (Recomendado)

1. **Build Menu** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
2. Espera a que termine la compilación
3. Click en "locate" en la notificación para encontrar el APK
4. El APK estará en: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Opción B: Desde Línea de Comandos

```powershell
# Navega al directorio android
cd android

# Compila el APK debug
.\gradlew assembleDebug

# El APK estará en: app\build\outputs\apk\debug\app-debug.apk
```

### 4. Instalar en Dispositivo

#### Conectar Dispositivo Físico

1. Habilita "Opciones de Desarrollador" en tu Android:
   - Ve a Configuración > Acerca del teléfono
   - Toca 7 veces en "Número de compilación"
2. Habilita "Depuración USB" en Opciones de Desarrollador
3. Conecta el dispositivo por USB al PC
4. Acepta la autorización de depuración en el teléfono

#### Desde Android Studio

1. Asegúrate de que tu dispositivo aparezca en la lista de dispositivos
2. Click en el botón "Run" (▶) o presiona Shift+F10
3. La app se instalará y abrirá automáticamente

#### Desde Línea de Comandos

```powershell
# Verifica que el dispositivo esté conectado
adb devices

# Instala el APK
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

## Probar Notificaciones Push

### 1. Primera Ejecución

1. Abre la app en el dispositivo
2. La app solicitará permisos de notificaciones - **ACEPTA**
3. El token FCM se registrará automáticamente
4. Verifica en la consola de Android Studio (Logcat) el mensaje: "Push registration success, token: ..."

### 2. Enviar Notificación de Prueba desde Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. **Build** > **Cloud Messaging** > **Send your first message**
4. Completa:
   - **Título**: "Prueba de Notificación"
   - **Mensaje**: "Esta es una prueba desde Firebase Console"
5. Click **Next**
6. **Target**: Selecciona tu app Android
7. Click **Next** hasta llegar a **Review**
8. Click **Publish**

### 3. Probar Notificaciones Automáticas

#### Desplegar Cloud Functions

```powershell
# Desde la raíz del proyecto
firebase deploy --only functions
```

#### Crear un Pedido de Prueba

1. Abre la app
2. Click en "Hacer Pedido"
3. Completa el formulario
4. Envía el pedido
5. **Los administradores deberían recibir una notificación automáticamente**

## Troubleshooting

### ❌ "No admin tokens found, skipping notification"

**Problema**: No hay usuarios administradores con tokens FCM registrados.

**Solución**:
1. Asegúrate de que un usuario administrador tenga la app instalada
2. Verifica en Firestore que el documento del usuario tenga:
   - `isAdmin: true`
   - `fcmToken: "token_value"`

### ❌ APK no se instala

**Problema**: "App not installed" o error similar.

**Solución**:
```powershell
# Desinstala la versión anterior primero
adb uninstall com.remesas.manzanoapp

# Reinstala
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### ❌ Las notificaciones no llegan

**Verificar**:
1. ✅ `google-services.json` está en `android/app/`
2. ✅ Permisos de notificaciones aceptados en el dispositivo
3. ✅ Firebase Cloud Messaging habilitado en Firebase Console
4. ✅ El token FCM se guardó correctamente en Firestore
5. ✅ Cloud Functions desplegadas: `firebase deploy --only functions`

### ❌ Gradle sync failed

**Problema**: Error al sincronizar Gradle.

**Solución**:
1. Verifica tu conexión a internet
2. En Android Studio: File > Invalidate Caches > Invalidate and Restart
3. Borra la carpeta `.gradle` en `android/` y vuelve a sincronizar

## Generar APK de Release (Producción)

### 1. Crear Keystore (Primera vez)

```powershell
# Windows
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

Guarda el keystore en un lugar seguro y **NO LO SUBAS A GIT**.

### 2. Configurar Firma

Edita `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("path/to/my-release-key.keystore")
            storePassword "your-store-password"
            keyAlias "my-key-alias"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 3. Compilar APK Release

```powershell
cd android
.\gradlew assembleRelease
```

El APK estará en: `android/app/build/outputs/apk/release/app-release.apk`

## Workflow de Desarrollo

### Hacer Cambios en el Código Web

```powershell
# 1. Edita archivos en public/
# 2. Si modificaste CSS
npm run build

# 3. Sincroniza con Android
npm run cap:sync

# 4. Re-ejecuta la app desde Android Studio o reinstala el APK
```

### Comandos Útiles

```powershell
# Sincronizar código
npm run cap:sync

# Abrir Android Studio
npm run cap:open

# Ver logs en tiempo real
adb logcat

# Limpiar build
cd android
.\gradlew clean
```

## Próximos Pasos

1. ✅ Probar la app en múltiples dispositivos Android
2. ✅ Verificar que las notificaciones funcionen correctamente
3. ✅ Probar flujo completo: crear pedido → recibir notificación → actualizar estado → recibir notificación
4. ⏳ Generar APK de release para distribución
5. ⏳ (Opcional) Publicar en Google Play Store

## Recursos Adicionales

- [Documentación de Capacitor](https://capacitorjs.com/docs)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Android Studio User Guide](https://developer.android.com/studio/intro)
