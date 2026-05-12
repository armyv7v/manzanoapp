# Guía de Troubleshooting: Notificaciones Push

## 🔍 Diagnóstico Web

### Paso 1: Abre la página de prueba
```
https://manzanoapp-2f775.web.app/test-notifications.html
```

Esta página te ayudará a:
- ✅ Verificar permisos de notificación
- ✅ Comprobar service worker
- ✅ Obtener FCM token
- ✅ Probar notificación local

### Paso 2: Sigue las instrucciones en la página

1. **Permisos**: Click en "Solicitar Permisos" y acepta
2. **Service Worker**: Debe estar "Registrado"
3. **FCM Token**: Click en "Obtener Token" y cópialo
4. **Notificación Local**: Prueba que las notificaciones básicas funcionen

### Paso 3: Enviar desde Firebase Console

1. Ve a: https://console.firebase.google.com/project/manzanoapp-2f775/messaging
2. Click "Send test message"
3. Pega el FCM token copiado
4. Click "Test"

---

## 📱 Diagnóstico Android

### Verificar en Android Studio

**1. AndroidManifest.xml debe tener:**

```xml
<!-- Permisos para notificaciones (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

<!-- Permisos FCM -->
<uses-permission android:name="com.google.android.c2dm.permission.RECEIVE"/>
```

**Ubicación:** `android/app/src/main/AndroidManifest.xml`

### Verificar en Logcat (Android Studio)

1. Conecta el dispositivo
2. Abre **Logcat** (View → Tool Windows → Logcat)
3. Filtra por: `chromium` o `PushNotifications`
4. Busca:
   - ✅ "Push registration success"
   - ✅ "FCM Token: ..."
   - ❌ Cualquier error

### Permisos en el Dispositivo

1. Abre **Ajustes** del teléfono
2. Ve a **Apps** → **Cambios Manzano**
3. **Notificaciones** → Verifica que estén **activadas**

### Enviar Notificación de Prueba

Desde Firebase Console (igual que web):
1. Usa el FCM token del logcat de Android
2. Envía test message
3. Verifica que llegue (incluso con app cerrada)

---

## 🔧 Soluciones Comunes

### Web: Service Worker no registrado

**Problema:** Service worker no aparece en la página de prueba

**Solución:**
```bash
# Despliega nuevamente
firebase deploy --only hosting
```

Luego hard refresh: `Ctrl + Shift + R`

### Web: Token no se genera

**Problema:** Error al obtener FCM token

**Posibles causas:**
1. Permisos denegados → Restablece en configuración del navegador
2. VAPID key incorrecta → Ya está configurada correctamente
3. Service worker no activo → Verifica en DevTools → Application → Service Workers

### Android: No recibe notificaciones

**Problema:** App Android no muestra notificaciones

**Checklist:**
- [ ] `google-services.json` en `android/app/`
- [ ] Permisos en AndroidManifest.xml
- [ ] `npm run cap:sync` ejecutado después de cambios
- [ ] APK recompilado e instalado
- [ ] Permisos aceptados en el dispositivo

### Android: Plugin no disponible

**Problema:** "PushNotifications plugin not available"

**Solución:**
```bash
# Reinstalar plugin
npm install @capacitor/push-notifications@latest

# Sincronizar
npm run cap:sync

# Recompilar APK
```

---

## 📊 Casos de Prueba

### Test 1: Notificación Local (Web)
- Página de prueba → "Enviar Notificación Local"
- **Esperado:** Notificación aparece

### Test 2: Notificación FCM (Web)
- Firebase Console → Send test message
- **Esperado:** Notificación aparece en navegador

### Test 3: Notificación FCM (Android)
- Firebase Console → Send test message
- **Esperado:** Notificación aparece en Android

### Test 4: Background (Android)
- Cierra la app completamente
- Envía notificación desde Firebase Console  
- **Esperado:** Notificación aparece en bandeja

---

## 📝 Logs Útiles

### Web (Consola del Navegador):
```
✅ "Notification permission granted"
✅ "FCM Token: ..."
✅ Service worker active
```

### Android (Logcat):
```
✅ "Push registration success"
✅ "FCM token saved to Firestore"
✅ "Push received: ..."
```

---

## ⚠️ Notas Importantes

1. **Web:** Las notificaciones web NO funcionan si:
   - El sitio no es HTTPS (Firebase Hosting ya es HTTPS ✅)
   - El navegador no soporta service workers
   - Los permisos fueron denegados permanentemente

2. **Android:** Las notificaciones requieren:
   - Android 6.0+ para permisos en runtime
   - Android 13+ requiere permiso POST_NOTIFICATIONS explícito
   - Google Play Services instalado

3. **Testing:** Siempre prueba con:
   - App en primer plano (foreground)
   - App en segundo plano (background)
   - App completamente cerrada

---

## 🆘 Si Nada Funciona

1. Verifica en Firebase Console que Cloud Messaging esté habilitado
2. Comprueba que el proyecto Firebase sea el correcto
3. Verifica que las API keys coincidan
4. Revisa los logs completos de consola/logcat

**Siguiente paso:** Comparte los logs para diagnóstico detallado
