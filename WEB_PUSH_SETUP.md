# Web Push Notifications Setup

## ⚠️ IMPORTANT: VAPID Key Required

To enable web push notifications in Chrome, you need to add your VAPID key.

### Steps to Get VAPID Key:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **manzanoapp-2f775**
3. Go to **Project Settings** (gear icon)
4. Click on **Cloud Messaging** tab
5. Scroll down to **Web configuration**
6. Under **Web Push certificates**, you'll see your **Key pair** (VAPID key)
7. If no key exists, click **Generate key pair**

### Steps to Add VAPID Key:

1. Copy the VAPID key from Firebase Console
2. Open `public/js/push-notifications.js`
3. Find the line: `vapidKey: 'YOUR_VAPID_KEY_HERE'` (appears twice)
4. Replace `'YOUR_VAPID_KEY_HERE'` with your actual VAPID key
5. Save the file

### Example:
```javascript
const currentToken = await messaging.getToken({
    vapidKey: 'BHxK3Fbz...' // Your actual VAPID key
});
```

## Testing Web Notifications

After adding the VAPID key:

1. Open your app in Chrome
2. You should see a permission prompt
3. Click "Allow"
4. Check the console for: `FCM Token: ...`
5. Send a test notification from Firebase Console → Cloud Messaging

## Current Status

✅ Firebase Messaging SDK added  
✅ Service worker created (`firebase-messaging-sw.js`)  
✅ Dual platform support (native + web)  
✅ **VAPID key configured**

## Testing Web Notifications

1. Open your app in Chrome: `http://localhost:5000` (or your deployment URL)
2. You should see a permission prompt for notifications
3. Click "Allow"
4. Check the console for: `FCM Token: ...`
5. Send a test notification from Firebase Console → Cloud Messaging → Send test message

## Files Modified

- `public/index.html` - Added Firebase Messaging SDK
- `public/js/push-notifications.js` - Dual platform support with VAPID key
- `public/firebase-messaging-sw.js` - Service worker (NEW)

---

**Status:** ✅ **READY FOR TESTING!**
