# Configuración de Firebase para Android

## Pasos para configurar Firebase Cloud Messaging (FCM)

### 1. Acceder a Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto existente de Remesas

### 2. Agregar Aplicación Android

1. En la página de inicio del proyecto, haz clic en el ícono de Android (o "Agregar app" > "Android")
2. Completa el formulario de registro:
   - **Nombre del paquete de Android**: `com.remesas.manzanoapp`
   - **Sobrenombre de la app** (opcional): Remesas Venezuela-Chile
   - **Certificado de firma de depuración SHA-1** (opcional por ahora)
3. Haz clic en "Registrar app"

### 3. Descargar google-services.json

1. Descarga el archivo `google-services.json` que aparece después de registrar la app
2. **IMPORTANTE**: Copia este archivo a la siguiente ubicación:
   ```
   android/app/google-services.json
   ```
3. La ruta completa debe ser:
   ```
   c:\Users\EnderJavier\Documents\Proyectos WEB\manzanoapp\android\app\google-services.json
   ```

### 4. Habilitar Firebase Cloud Messaging

1. En Firebase Console, ve a **Build** > **Cloud Messaging**
2. Si es la primera vez, habilita la API de Cloud Messaging
3. No necesitas configurar nada más aquí por ahora, las credenciales ya están en `google-services.json`

### 5. Verificar la Configuración

Una vez copiado el archivo `google-services.json`:

1. Abre el proyecto en Android Studio:
   ```powershell
   npm run cap:open
   ```
2. Android Studio debería reconocer automáticamente el archivo
3. Sincroniza Gradle (Android Studio lo hará automáticamente o usa el botón "Sync Now")

## Estructura del Proyecto

```
manzanoapp/
├── android/
│   ├── app/
│   │   ├── google-services.json  ← ARCHIVO DE FIREBASE AQUÍ
│   │   ├── build.gradle          ← Configurado con Firebase
│   │   └── src/
│   ├── build.gradle              ← Plugin de Google Services
│   └── ...
├── public/
│   ├── js/
│   │   ├── push-notifications.js ← Lógica de notificaciones
│   │   └── main.js
│   └── index.html
├── capacitor.config.ts           ← Configuración de Capacitor
└── package.json
```

## Cómo Funcionan las Notificaciones Push

### En la App

1. Cuando el usuario abre la app por primera vez, se solicitan permisos de notificaciones
2. Si se conceden, la app se registra con FCM y recibe un **token único**
3. Este token se guarda en Firestore en la colección `users` bajo el UID del usuario
4. El token se usa para enviar notificaciones específicas a ese dispositivo

### Desde Firebase Console (Prueba Manual)

1. Ve a **Build** > **Cloud Messaging** > **Send your first message**
2. Escribe un título y mensaje
3. Selecciona "Android app" como objetivo
4. Envía la notificación de prueba

### Desde Cloud Functions (Automático)

Puedes crear Cloud Functions que envíen notificaciones automáticamente cuando:
- Se crea un nuevo pedido
- Cambia el estado de un pedido
- Se actualiza la tasa de cambio

## Próximos Pasos

1. ✅ Descargar `google-services.json` de Firebase Console
2. ✅ Copiar el archivo a `android/app/google-services.json`
3. ✅ Sincronizar el proyecto: `npm run cap:sync`
4. ✅ Abrir en Android Studio: `npm run cap:open`
5. ✅ Compilar y probar en un dispositivo físico
6. ⏳ (Opcional) Crear Cloud Functions para notificaciones automáticas

## Notas Importantes

- Las notificaciones push **NO funcionan en el emulador de Android**, necesitas un dispositivo físico
- El archivo `google-services.json` contiene claves de API, **NO lo subas a Git** (ya está en `.gitignore`)
- Cada vez que hagas cambios en el código web, ejecuta `npm run cap:sync` para copiarlos al proyecto Android
