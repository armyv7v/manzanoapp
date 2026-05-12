# Guía: Sincronizar y Compilar APK

## ✅ Paso 1: Sincronización Completada

Ya ejecutamos `npm run cap:sync` exitosamente. Los archivos están sincronizados.

---

## 📱 Paso 2: Abrir en Android Studio

### Opción A: Desde línea de comandos
```bash
npm run cap:open
```

### Opción B: Manualmente
1. Abre **Android Studio**
2. Click en **"Open"** (o File → Open)
3. Navega a: `c:\Users\EnderJavier\Documents\Proyectos WEB\manzanoapp\android`
4. Click en **"OK"**

**⏳ Espera** a que Android Studio indexe el proyecto (puede tomar 1-2 minutos)

---

## 🔨 Paso 3: Compilar APK

### En Android Studio:

1. **Espera a que termine la sincronización de Gradle**
   - Verás "Gradle sync" en la barra inferior
   - Debe decir "Gradle Build Finished" cuando esté listo

2. **Compilar APK:**
   - Menú: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
   - O usa el atajo: `Ctrl + F9`

3. **Espera la compilación** (1-3 minutos)
   - Verás el progreso en la barra inferior
   - Cuando termine verás: "BUILD SUCCESSFUL"

4. **Localizar el APK:**
   - Click en el link que aparece: **"locate"**
   - O navega manualmente a:
     ```
     c:\Users\EnderJavier\Documents\Proyectos WEB\manzanoapp\android\app\build\outputs\apk\debug\app-debug.apk
     ```

---

## 📲 Paso 4: Instalar en Dispositivo

### Opción A: Desde Android Studio (Recomendado)

1. **Conecta tu dispositivo Android** por USB
2. **Habilita "Depuración USB"** en tu teléfono:
   - Ajustes → Acerca del teléfono
   - Toca 7 veces en "Número de compilación"
   - Vuelve atrás → Opciones de desarrollador
   - Activa "Depuración USB"

3. **En Android Studio:**
   - Arriba verás un dropdown con tu dispositivo
   - Click en el botón **▶ Run** (o `Shift + F10`)
   - La app se instalará y ejecutará automáticamente

### Opción B: Instalación Manual

1. **Copia el APK** desde:
   ```
   c:\Users\EnderJavier\Documents\Proyectos WEB\manzanoapp\android\app\build\outputs\apk\debug\app-debug.apk
   ```

2. **Transfiere a tu teléfono:**
   - Por USB: copia a la carpeta Downloads del teléfono
   - Por correo: envíate el APK y descárgalo en el teléfono

3. **Instala en el teléfono:**
   - Abre el archivo APK desde el teléfono
   - Acepta "Instalar desde fuentes desconocidas" si te lo pide
   - Click en **Instalar**

---

## ✅ Paso 5: Verificar Funcionamiento

Una vez instalada la app:

### Verifica el Carrusel:
- ✅ El header debe mostrar tasas rotando automáticamente cada 3 segundos
- ✅ Debe mostrar VES, COP, PEN con sus banderas

### Verifica Notificaciones:
- ✅ Las notificaciones push deben funcionar (ya funcionaban antes)
- ✅ Los tokens FCM se guardan automáticamente

### Debugging (opcional):
Si quieres ver los logs:
1. Conecta el dispositivo por USB
2. En Android Studio: **View** → **Tool Windows** → **Logcat**
3. Filtra por "chromium" o "console" para ver logs de JavaScript

---

## 🐛 Solución de Problemas

### Si Gradle falla al sincronizar:
```bash
cd android
./gradlew clean
./gradlew build
```

### Si el APK no compila:
1. **Build** → **Clean Project**
2. **Build** → **Rebuild Project**
3. Intenta de nuevo: **Build APK(s)**

### Si la app no se instala:
- Desinstala la versión anterior primero
- Verifica que "Depuración USB" esté habilitada
- Verifica que "Instalar desde fuentes desconocidas" esté permitido

---

## 📝 Comandos Rápidos de Referencia

```bash
# Sincronizar cambios
npm run cap:sync

# Abrir Android Studio
npm run cap:open

# Compilar desde línea de comandos (opcional)
cd android
./gradlew assembleDebug

# El APK estará en:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## ✨ ¡Listo!

Ahora tu app está actualizada con:
- ✅ Carrusel de tasas rotativo
- ✅ Notificaciones web (para navegador)
- ✅ Todo funcionando en Android nativo

**¿Necesitas ayuda con algún paso específico?**
