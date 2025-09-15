﻿// --- Firebase Initialization ---
const db = firebase.firestore();
const auth = firebase.auth();
const functions = firebase.functions();
const storage = firebase.storage();

// --- State Management ---
let currentUser = null;
let currentExchangeRate = 0;
let isAdmin = false;

// --- UI Helper Functions ---

/**
 * Toggles the visibility of an element, correctly handling flex display.
 * @param {string} elementId The ID of the element to toggle.
 * @param {boolean} show True to show the element, false to hide it.
 */
function toggleFlexElement(elementId, show) {
  const element = document.getElementById(elementId);
  if (!element) {
      console.error(`Element with ID "${elementId}" not found.`);
      return;
  }
  if (show) {
      element.classList.remove('hidden');
      element.classList.add('flex');
  } else {
      element.classList.add('hidden');
      element.classList.remove('flex');
  }
}

/**
 * Displays a message in a specific element, with optional success/error styling.
 * @param {string} elementId The ID of the message element.
 * @param {string} message The text to display.
 * @param {boolean} isSuccess True for green text, false for red text.
 */
function showMessage(elementId, message, isSuccess) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  if (isSuccess === true) {
      el.classList.remove('text-red-500');
      el.classList.add('text-green-600');
  } else if (isSuccess === false) {
      el.classList.remove('text-green-600');
      el.classList.add('text-red-500');
  }
}

// --- Main Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element Selectors ---
  const showUserFormBtn = document.getElementById('show-user-form-btn');
  const showAdminLoginBtn = document.getElementById('show-admin-login-btn');
  const userInterface = document.getElementById('user-interface');
  const adminInterface = document.getElementById('admin-interface');
  const adminLogin = document.getElementById('admin-login');
  const adminPanel = document.getElementById('admin-panel');
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  const rateForm = document.getElementById('rate-form');
  const userIdDisplay = document.getElementById('user-id-display');

  // Tabs
  const tabs = [
      document.getElementById('tab-transferencia'),
      document.getElementById('tab-pago-movil'),
      document.getElementById('tab-recarga-saldo')
  ];
  const tabPanes = [
      document.getElementById('content-transferencia'),
      document.getElementById('content-pago-movil'),
      document.getElementById('content-recarga-saldo')
  ];

  // --- UI Logic ---

  /** Manages the visibility of the main application interfaces (User vs Admin). */
  const switchMainView = (view) => {
      if (view === 'user') {
          userInterface.classList.remove('hidden');
          adminInterface.classList.add('hidden');
          showUserFormBtn.classList.add('bg-blue-700', 'ring-2', 'ring-blue-300');
          showAdminLoginBtn.classList.remove('bg-blue-700', 'ring-2', 'ring-blue-300');
      } else { // 'admin'
          userInterface.classList.add('hidden');
          adminInterface.classList.remove('hidden');
          showAdminLoginBtn.classList.add('bg-blue-700', 'ring-2', 'ring-blue-300');
          showUserFormBtn.classList.remove('bg-blue-700', 'ring-2', 'ring-blue-300');
      }
  };

  /** Switches the active tab in the user interface. */
  const switchTab = (selectedTab) => {
      tabs.forEach((tab, index) => {
          const pane = tabPanes[index];
          if (tab === selectedTab) {
              tab.classList.add('bg-white', 'text-blue-600');
              tab.classList.remove('text-gray-700', 'hover:bg-gray-300');
              pane.classList.remove('hidden');
          } else {
              tab.classList.remove('bg-white', 'text-blue-600');
              tab.classList.add('text-gray-700', 'hover:bg-gray-300');
              pane.classList.add('hidden');
          }
      });
  };

  /** Updates the UI based on the user's authentication and admin status. */
  const updateUIForUser = (user) => {
      currentUser = user;
      if (user) {
          user.getIdTokenResult().then(idTokenResult => {
              isAdmin = !!idTokenResult.claims.admin;
              userIdDisplay.textContent = `Conectado como: ${user.email}`;
              if (isAdmin) {
                  adminLogin.classList.add('hidden');
                  adminPanel.classList.remove('hidden');
                  switchMainView('admin'); // Automatically switch to admin view if user is admin
              } else {
                  adminLogin.classList.remove('hidden');
                  adminPanel.classList.add('hidden');
              }
          });
      } else { // No user logged in
          isAdmin = false;
          currentUser = null;
          userIdDisplay.textContent = '';
          adminLogin.classList.remove('hidden');
          adminPanel.classList.add('hidden');
          switchMainView('user'); // Default to user view
      }
  };

  // --- Firebase Logic ---

  // Listen for authentication state changes
  auth.onAuthStateChanged(user => {
      updateUIForUser(user);
  });

  // Listen for real-time updates to the exchange rate
  const rateRef = db.collection('config').doc('rate');
  rateRef.onSnapshot((doc) => {
      const rateDisplay = document.getElementById('exchange-rate-display');
      if (doc.exists) {
          const rateData = doc.data();
          currentExchangeRate = rateData.value;
          rateDisplay.textContent = `Tasa de cambio: 1 CLP = ${currentExchangeRate.toFixed(2)} VES`;
      } else {
          rateDisplay.textContent = 'Tasa no disponible';
          console.log("No se encontró el documento de la tasa de cambio!");
      }
  }, (error) => {
      console.error("Error al obtener la tasa de cambio:", error);
      document.getElementById('exchange-rate-display').textContent = 'Error al cargar tasa';
  });

  // --- Event Listeners ---

  showUserFormBtn.addEventListener('click', () => switchMainView('user'));
  showAdminLoginBtn.addEventListener('click', () => switchMainView('admin'));
  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab)));

  // Admin Login
  adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value;
      const password = document.getElementById('admin-password').value;
      auth.signInWithEmailAndPassword(email, password)
          .catch((error) => {
              console.error("Error de inicio de sesión:", error);
              showMessage('login-message', `Error: ${error.message}`, false);
          });
  });

  // Admin Logout
  adminLogoutBtn.addEventListener('click', () => {
      auth.signOut().then(() => console.log("Admin cerró sesión."));
  });

  // Admin: Update Exchange Rate
  rateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newRateInput = document.getElementById('new-rate');
      const newRate = parseFloat(newRateInput.value);

      if (isNaN(newRate) || newRate <= 0) {
          showMessage('rate-message', 'Por favor, ingresa un número válido.', false);
          return;
      }

      // The reference is to the 'config' collection and 'rate' document
      const rateRef = db.collection('config').doc('rate');
      
      // Use .set() to update the document.
      rateRef.set({
              value: newRate,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          })
          .then(() => {
              console.log("Tasa actualizada con éxito!");
              showMessage('rate-message', '¡Tasa actualizada con éxito!', true);
              newRateInput.value = ''; // Clear the input
          })
          .catch((error) => {
              // This catches the permission error and displays it instead of crashing.
              console.error("Error al actualizar la tasa: ", error);
              showMessage('rate-message', `Error: ${error.message}`, false);
          });
  });

  // --- Initial App Setup ---
  switchMainView('user'); // Set default view
  switchTab(tabs[0]); // Set default tab
});
