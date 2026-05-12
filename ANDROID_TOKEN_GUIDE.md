# Cómo Obtener el FCM Token en Android

## Método 1: Logcat (Android Studio) ⭐ Recomendado

1. **Conecta tu dispositivo Android** por USB
2. **Abre Android Studio**
3. **Abre Logcat**: `View` → `Tool Windows` → `Logcat`
4. **Filtra por "Push"**: Escribe `Push` en la barra de búsqueda
5. **Busca esta línea:**
   ```
   Push registration success, token: cCJ8n-ykSdi1...
   ```
6. **Copia el token** (es una cadena larga)

### Si no aparece el token:

1. Cierra completamente la app en Android
2. Ábrela de nuevo
3. El token debería aparecer en los primeros segundos

## Método 2: Ver en Consola Chrome Remote Debugging

1. Conecta el dispositivo por USB
2. En Chrome de tu PC, ve a: `chrome://inspect`
3. Encuentra tu app en la lista
4. Click en **"inspect"**
5. Ve a la pestaña **Console**
6. Busca: `FCM Token: ...`

## Método 3: Mostrar en la App (Próximamente)

Voy a agregar una opción en la app para mostrar el token en pantalla.

---

## 🧪 Probar Notificación Android

Una vez que tengas el token:

1. Ve a [Firebase Console - Cloud Messaging](https://console.firebase.google.com/project/manzanoapp-2f775/messaging)
2. Click **"Enviar mensaje de prueba"**
3. Pega el token de Android
4. Click **"Probar"**
5. Deberías ver la notificación en tu dispositivo Android

---

## ⚠️ Importante

- El token de **Android** es DIFERENTE al de **Web**
- Cada dispositivo/plataforma tiene su propio token
- El token puede cambiar si desinstalas y reinstal la app

---

## 🐛 Si no aparece el token

**Verifica:**
- [ ] Permisos aceptados en Android
- [ ] `google-services.json` en `android/app/`
- [ ] Plugin instalado: `@capacitor/push-notifications`
- [ ] `npm run cap:sync` ejecutado
- [ ] APK recompilado después del sync
