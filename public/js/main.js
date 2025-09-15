﻿// Demo/hosting detection
(function(){
  try {
    const __proj = (firebase.app && firebase.app().options && firebase.app().options.projectId) || '';
    window.IS_DEMO = (typeof __proj === 'string' && __proj.startsWith('demo-')) || ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '5000');
    if (window.IS_DEMO) console.log('Modo Demo detectado.');
  } catch (e) { window.IS_DEMO = ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '5000'); }
})();
// --- Firebase Initialization ---
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// --- State Management ---
let currentUser = null;
let currentExchangeRate = 0;
let isAdmin = false;
let ordersListener = null; // To hold the unsubscribe function for the orders listener

let orderIdToProcess = null; // To store the ID of the order being processed by the admin
// --- UI Helper Functions ---

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
  el.classList.toggle('text-green-600', isSuccess === true);
  el.classList.toggle('text-red-500', isSuccess === false);
}

/**
 * Shows a custom modal alert.
 * @param {string} message The message to display.
 */
function showCustomAlert(message) {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const closeBtn = document.getElementById('custom-alert-btn');
    
    messageEl.textContent = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    closeBtn.onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
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
  const rateDisplay = document.getElementById('exchange-rate-display');
  const loadingSpinner = document.getElementById('loading-spinner');

  // Order Submission & Modal Elements
  const formTransferencia = document.getElementById('remittance-form-transferencia');
  const formPagoMovil = document.getElementById('remittance-form-pago-movil');
  const formRecargaSaldo = document.getElementById('remittance-form-recarga-saldo');
  const uploadModal = document.getElementById('upload-modal');
  const confirmUploadBtn = document.getElementById('confirm-upload-btn');
  let lastOrderId = null; // To store the ID of the order just created

  // Admin Upload Modal Elements
  const adminUploadModal = document.getElementById('admin-upload-modal');
  const adminScreenshotInput = document.getElementById('admin-screenshot-input');
  const adminUploadBtn = document.getElementById('admin-upload-btn');
  const adminCancelUploadBtn = document.getElementById('admin-cancel-upload-btn');

  // Order display elements
  const ordersListPending = document.getElementById('orders-list-pending');
  const ordersListPaid = document.getElementById('orders-list-paid');
  const noOrdersPendingMessage = document.getElementById('no-orders-pending-message');
  const noOrdersPaidMessage = document.getElementById('no-orders-paid-message');
  const orderFilter = document.getElementById('order-filter');

  // CLP/VES Calculation elements
  const clpInputs = [
      document.getElementById('clp-amount-transferencia'),
      document.getElementById('clp-amount-pm'),
      document.getElementById('clp-amount-rs')
  ];
  const vesDisplays = [
      document.getElementById('ves-amount-transferencia'),
      document.getElementById('ves-amount-pm'),
      document.getElementById('ves-amount-rs')
  ];

  // Balance Management Elements
  const vesBalanceDisplay = document.getElementById('ves-balance-display');
  const balanceAmountInput = document.getElementById('balance-amount');
  const addBalanceBtn = document.getElementById('add-balance-btn');
  const subtractBalanceBtn = document.getElementById('subtract-balance-btn');
  const balanceMessage = document.getElementById('balance-message');
  const balanceHistoryList = document.getElementById('balance-history-list');
  const noBalanceHistoryMessage = document.getElementById('no-balance-history-message');

  // Balance Modal Elements
  const loadBalanceModal = document.getElementById('load-balance-modal');
  const loadBankSelect = document.getElementById('load-bank-select');
  const loadBankConfirmBtn = document.getElementById('load-bank-confirm-btn');
  const loadBankCancelBtn = document.getElementById('load-bank-cancel-btn');

  // Paste buttons
  const pasteBtnTransferencia = document.getElementById('paste-btn-transferencia');
  const pasteBtnPagoMovil = document.getElementById('paste-btn-pago-movil');
  const pasteBtnRecargaSaldo = document.getElementById('paste-btn-recarga-saldo');

  // Example toggles
  const showExampleTransferencia = document.getElementById('show-example-transferencia');
  const showExamplePagoMovil = document.getElementById('show-example-pago-movil');
  const showExampleRecargaSaldo = document.getElementById('show-example-recarga-saldo');

  const exampleTransferencia = document.getElementById('example-transferencia');
  const examplePagoMovil = document.getElementById('example-pago-movil');
  const exampleRecargaSaldo = document.getElementById('example-recarga-saldo');

  // Historical Search Elements
  const historicalDateStart = document.getElementById('Histórical-date-start');
  const historicalDateEnd = document.getElementById('Histórical-date-end');
  const historicalDateTodayBtn = document.getElementById('Histórical-date-today');
  const historicalDateYesterdayBtn = document.getElementById('Histórical-date-yesterday');
  const historicalDate7DaysBtn = document.getElementById('historical-date-7days');
  const historicalStatusFilters = document.getElementById('Histórical-status-filters');
  const exportExcelBtn = document.getElementById('export-excel-btn');
  const historicalSearchSummary = document.getElementById('Histórical-search-summary');
  const historicalOrdersList = document.getElementById('Histórical-orders-list');
  const noHistoricalOrdersMessage = document.getElementById('no-Histórical-orders-message');

  // Client List Elements
  const clientsSearchInput = document.getElementById('clients-search');
  const copyClientsBtn = document.getElementById('copy-clients-btn');
  const clientsCountDisplay = document.getElementById('clients-count');
  const clientsList = document.getElementById('clients-list');

  // Cedula inputs for autocomplete
  const cedulaInputs = [
      document.getElementById('cedula-transferencia'),
      document.getElementById('cedula-pm'),
      document.getElementById('cedula-rs')
  ];

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

  // State for balance modal
  let amountToLoad = 0;
  let historicalOrdersData = []; // To store data for Excel export
  let fullClientList = []; // Holds the raw client data

  // --- UI Control Logic (The Definitive Solution) ---

  /**
   * Calculates and updates the VES amount display based on CLP input.
   * @param {HTMLInputElement} clpInput The input element for CLP amount.
   * @param {HTMLSpanElement} vesDisplay The span element to display the VES amount.
   */
  const updateVesAmount = (clpInput, vesDisplay) => {
      const clpAmount = parseFloat(clpInput.value);
      if (!isNaN(clpAmount) && currentExchangeRate > 0) {
          const vesAmount = clpAmount * currentExchangeRate;
          vesDisplay.textContent = vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' VES';
      } else {
          vesDisplay.textContent = '0,00 VES';
      }
  };

  /**
   * Centralized function to control the admin section's visibility using only CSS classes.
   * @param {'login' | 'panel' | 'hidden'} state The desired state.
   */
  const renderAdminViewState = (state) => {
    console.log(`[Render] Admin state -> ${state}`);

    // Control the main admin container
    adminInterface.classList.toggle('hidden', state === 'hidden');

    // Control the children (login form vs. admin panel)
    adminLogin.classList.toggle('hidden', state !== 'login');
    adminPanel.classList.toggle('hidden', state !== 'panel');
  };

  /** Manages the visibility of the main application interfaces (User vs Admin). */
  const switchMainView = (view) => {
      console.log(`[View] -> ${view}`);
      const isUserView = view === 'user';

      // Toggle main interfaces
      userInterface.classList.toggle('hidden', !isUserView);
      // Hacemos que esta función sea más inteligente:
      if (isUserView) {
          renderAdminViewState('hidden'); // Si es vista de usuario, siempre ocultar admin.
      } else {
          renderAdminViewState(isAdmin ? 'panel' : 'login'); // Si es vista admin, mostrar panel o login según el estado.
      }

      // Update button styles
      showUserFormBtn.classList.toggle('bg-blue-700', isUserView);
      showUserFormBtn.classList.toggle('ring-2', isUserView);
      showUserFormBtn.classList.toggle('ring-blue-300', isUserView);

      showAdminLoginBtn.classList.toggle('bg-blue-700', !isUserView);
      showAdminLoginBtn.classList.toggle('ring-2', !isUserView);
      showAdminLoginBtn.classList.toggle('ring-blue-300', !isUserView);

      if (!isUserView) {
        try { adminInterface.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      }
  };

  /** Switches the active tab in the user interface. */
  const switchTab = (selectedTab) => {
      tabs.forEach((tab, index) => {
          const pane = tabPanes[index];
          const isSelected = tab === selectedTab;
          
          tab.classList.toggle('bg-white', isSelected);
          tab.classList.toggle('text-blue-600', isSelected);
          tab.classList.toggle('text-gray-700', !isSelected);
          tab.classList.toggle('hover:bg-gray-300', !isSelected);
          pane.classList.toggle('hidden', !isSelected);
      });
  };

  /**
   * Renders a single order card into an HTML string.
   * @param {firebase.firestore.DocumentSnapshot} doc - The order document snapshot.
   * @returns {string} The HTML string for the order card.
   */
  const renderOrder = (doc) => {
      const order = doc.data();
      const orderId = doc.id;
      const createdAt = order.createdAt ? order.createdAt.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

      const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
      const vesAmount = (order.vesAmount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });

      let details = '';
      switch (order.type) {
          case 'transferencia':
              details = `
                  <p class="text-sm"><span class="font-semibold">Banco:</span> ${order.bank || 'N/A'}</p>
                  <p class="text-sm"><span class="font-semibold">Tipo:</span> ${order.accountType || 'N/A'}</p>
                  <p class="text-sm truncate"><span class="font-semibold">Cuenta:</span> ${order.accountNumber || 'N/A'}</p>
              `;
              break;
          case 'pago-movil':
              details = `
                  <p class="text-sm"><span class="font-semibold">Teléfono:</span> ${order.phone || 'N/A'}</p>
                  <p class="text-sm"><span class="font-semibold">Banco:</span> ${order.bank || 'N/A'}</p>
              `;
              break;
          case 'recarga-saldo':
              details = `<p class="text-sm"><span class="font-semibold">Teléfono:</span> ${order.phone || 'N/A'}</p>`;
              break;
      }

      let statusBadge = '';
      let actionButtons = '';
      let debtorCheckbox = '';

      switch (order.status) {
          case 'Pendiente de pago':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-amber-600 bg-amber-200">${order.status}</span>`;
              actionButtons = `
                  <button data-id="${orderId}" class="mark-paid-btn bg-green-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-600">Pagar</button>
                  <button data-id="${orderId}" class="cancel-order-btn bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600">Cancelar</button>
              `;
              break;
          case 'Pagado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">${order.status}</span>`;
              if (order.proofUrl) {
                  const shareText = encodeURIComponent(`Comprobante de pago para ${order.clientName}`);
                  const shareUrl = encodeURIComponent(order.proofUrl);
                  actionButtons = `
                    <div class="flex items-center space-x-2">
                        <a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200" title="Compartir en WhatsApp">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                        </a>
                        <a href="https://t.me/share/url?url=${shareUrl}&text=${shareText}" target="_blank" rel="noopener noreferrer" class="p-2 rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200" title="Compartir en Telegram">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32C9.173 7.99 10.438 7.02 10.63 6.82c.195-.2.323-.346.135-.525-.188-.18-.51-.05-.75.056l-2.433.972c-.245.097-.45.18-.6.255-.149.075-.303.14-.4.18s-.18.08-.27.05-.18-.05-.25-.11-.18-.12-.21-.15c-.03-.03-.05-.06-.06-.08l-.003-.004c-.02-.04-.03-.09-.03-.14v-.002c.002-.05.01-.09.02-.13.01-.03.03-.06.05-.09.04-.06.1-.12.18-.18.09-.07.2-.13.34-.19.14-.06.3-.11.48-.17.18-.06.38-.12.58-.18.2-.06.4-.12.6-.18.2-.06.4-.12.58-.17.18-.06.35-.11.5-.16.15-.05.29-.09.4-.12.12-.03.23-.06.33-.09.1-.03.2-.05.28-.07.08-.02.15-.04.21-.05.06-.01.12-.02.17-.03.05-.01.1-.01.14-.02.04-.01.08-.01.12-.01.02 0 .03 0 .04 0 .01 0 .02 0 .03 0 .01 0 .02 0 .02 0 .01 0 .01 0 .01 0z"/></svg>
                        </a>
                        <a href="mailto:?subject=${shareText}&body=Hola,%0D%0A%0D%0AAdjunto el comprobante de pago:%0D%0A${shareUrl}" class="p-2 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300" title="Compartir por Email">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 16 16"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z"/></svg>
                        </a>
                    </div>`;
              }
              debtorCheckbox = `
                  <div class="mt-3 pt-3 border-t border-gray-200 flex items-center">
                      <input type="checkbox" id="deudor-${orderId}" data-id="${orderId}" class="deudor-checkbox h-4 w-4 text-orange-500 focus:ring-orange-400 border-gray-300 rounded" ${order.isDebtor ? 'checked' : ''}>
                      <label for="deudor-${orderId}" class="ml-2 block text-sm text-orange-600 font-semibold">Deudor</label>
                  </div>
              `;
              break;
          case 'Cancelado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-red-600 bg-red-200">${order.status}</span>`;
              break;
      }

      return `
          <div class="p-4 rounded-lg shadow-md bg-white border-2 ${order.isDebtor ? 'border-orange-400' : 'border-transparent'}" data-status="${order.status}">
              <div class="flex justify-between items-start mb-2">
                  <div>
                      <p class="font-bold text-gray-800">${order.clientName}</p>
                      <p class="text-sm text-gray-500">CI: ${order.cedula}</p>
                  </div>
                  ${statusBadge}
              </div>
              <div class="my-2 p-2 bg-gray-50 rounded space-y-1">
                  ${details}
              </div>
              <div class="flex justify-between items-center mt-2">
                  <div>
                      <p class="font-semibold text-blue-600">${clpAmount}</p>
                      <p class="font-semibold text-green-600">${vesAmount} VES</p>
                  </div>
                  <div class="text-xs text-gray-500">${createdAt}</div>
              </div>
              <div class="flex justify-end space-x-2 mt-3">
                  ${actionButtons}
              </div>
              ${debtorCheckbox}
          </div>
      `;
  };

  /** Applies the current filter to the visible orders. */
  const applyOrderFilter = () => {
      const filterValue = orderFilter.value;
      const allOrderCards = document.querySelectorAll('#orders-list-pending > div, #orders-list-paid > div');

      allOrderCards.forEach(card => {
          const orderStatus = card.dataset.status;
          const isVisible = (filterValue === 'Todos') || (orderStatus === filterValue);
          card.style.display = isVisible ? 'block' : 'none';
      });
  };

  /** Attaches a real-time listener for today's orders. */
  const attachOrdersListener = () => {
      console.log('[Listener] Adjuntando listener de pedidos...');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ordersQuery = db.collection('orders')
          .where('createdAt', '>=', today)
          .orderBy('createdAt', 'desc');

      ordersListener = ordersQuery.onSnapshot(snapshot => {
          console.log(`[Listener] Se recibió un snapshot con ${snapshot.size} documentos.`);
          ordersListPending.innerHTML = '';
          ordersListPaid.innerHTML = '';
          let pendingCount = 0;
          let paidCount = 0;

          if (snapshot.empty) {
              noOrdersPendingMessage.classList.remove('hidden');
              noOrdersPaidMessage.classList.remove('hidden');
              return;
          }

          snapshot.forEach(doc => {
              const order = doc.data();
              const orderHtml = renderOrder(doc);
              if (order.status === 'Pagado') {
                  ordersListPaid.innerHTML += orderHtml;
                  paidCount++;
              } else { // 'Pendiente de pago' or 'Cancelado'
                  ordersListPending.innerHTML += orderHtml;
                  pendingCount++;
              }
          });

          noOrdersPendingMessage.classList.toggle('hidden', pendingCount > 0);
          noOrdersPaidMessage.classList.toggle('hidden', paidCount > 0);
          applyOrderFilter();
      }, error => {
          console.error("Error fetching orders: ", error);
          const errorMessage = "Error al cargar pedidos. Revisa la consola (F12).";
          noOrdersPendingMessage.textContent = errorMessage;
          noOrdersPaidMessage.textContent = errorMessage;
          noOrdersPendingMessage.classList.remove('hidden');
          noOrdersPaidMessage.classList.remove('hidden');
          noOrdersPendingMessage.classList.add('text-red-500', 'font-bold', 'p-4');
          noOrdersPaidMessage.classList.add('text-red-500', 'font-bold', 'p-4');
          if (error.code === 'failed-precondition') {
              const detailedMessage = 'Error: La base de datos requiere un índice para esta consulta. Por favor, abre la consola del navegador (F12), busca el error de Firebase y haz clic en el enlace que proporciona para crear el índice automáticamente.';
              showCustomAlert(detailedMessage); // Usamos un alert para que sea imposible de ignorar.
              noOrdersPendingMessage.innerHTML = '<b>ACCIÓN REQUERIDA:</b> Se necesita un índice de base de datos. Revisa la consola (F12) y haz clic en el enlace de error de Firebase.';
              noOrdersPaidMessage.innerHTML = '<b>ACCIÓN REQUERIDA:</b> Se necesita un índice de base de datos. Revisa la consola (F12) y haz clic en el enlace de error de Firebase.';
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
                  switchMainView('admin');
                  if (!ordersListener) {
                      attachOrdersListener(); // Attach listener if admin
                      fetchAndRenderClients(); // Fetch clients when admin logs in
                  }
              } else {
                  console.log(`Usuario ${user.email} logueado, pero no es admin.`);
                  if (ordersListener) {
                      ordersListener(); // Detach listener if not admin
                      ordersListener = null;
                  }
                  switchMainView('user');
              }
          });
      } else { // No user logged in
          isAdmin = false;
          currentUser = null;
          userIdDisplay.textContent = '';
          if (ordersListener) {
              ordersListener(); // Detach listener on logout
              ordersListener = null;
          }
          fullClientList = [];
          renderClientList([]);
          switchMainView('user');
      }
  };

  // --- Firebase Logic ---

  auth.onAuthStateChanged(updateUIForUser);

  // Listen for real-time updates to the exchange rate
  const rateRef = db.collection('config').doc('rate');
  rateRef.onSnapshot((doc) => {
      if (doc.exists) {
          currentExchangeRate = doc.data().value;
          rateDisplay.textContent = `Tasa de cambio: 1 CLP = ${currentExchangeRate.toFixed(4)} VES`;
      } else {
          rateDisplay.textContent = 'Tasa no disponible';
          console.log("No se encontró el documento de la tasa de cambio!");
      }
  }, (error) => {
      console.error("Error al obtener la tasa de cambio:", error);
      rateDisplay.textContent = 'Error al cargar tasa';
  });

  // Listen for real-time updates to the balance
  const balanceRef = db.collection('config').doc('balance');
  balanceRef.onSnapshot((doc) => {
      if (doc.exists) {
          const balance = doc.data().current || 0;
          // Formatear como moneda venezolana
          vesBalanceDisplay.textContent = balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' VES';
      } else {
          vesBalanceDisplay.textContent = '0,00 VES';
          console.log("No se encontró el documento de saldo.");
      }
  }, (error) => {
      console.error("Error al obtener el saldo:", error);
      vesBalanceDisplay.textContent = 'Error';
  });

  // Listen for real-time updates to balance history
  const balanceHistoryRef = db.collection('balance_history');
  balanceHistoryRef.orderBy('timestamp', 'desc').limit(50).onSnapshot((snapshot) => {
      if (snapshot.empty) {
          noBalanceHistoryMessage.classList.remove('hidden');
          balanceHistoryList.innerHTML = '';
          return;
      }
      noBalanceHistoryMessage.classList.add('hidden');
      balanceHistoryList.innerHTML = '';
      snapshot.forEach(doc => {
          const history = doc.data();
          const date = history.timestamp ? history.timestamp.toDate().toLocaleString('es-VE') : 'Fecha no disponible';
          const amount = history.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 });
          const isAdd = history.type === 'add';
          const colorClass = isAdd ? 'text-green-600' : 'text-red-600';
          const sign = isAdd ? '+' : '-';
          const bankInfo = isAdd ? `(${history.bank})` : '';

          const historyElement = document.createElement('div');
          historyElement.className = `p-2 rounded-lg ${isAdd ? 'bg-green-50' : 'bg-red-50'}`;
          historyElement.innerHTML = `
              <div class="flex justify-between items-center">
                  <p class="font-semibold ${colorClass}">${sign} ${amount} VES <span class="text-gray-600 font-normal text-sm">${bankInfo}</span></p>
                  <p class="text-xs text-gray-500">${date}</p>
              </div>
          `;
          balanceHistoryList.appendChild(historyElement);
      });
  });

  // --- Paste from Clipboard Logic ---

  /**
   * Handles pasting data from the clipboard into a form, based on line order.
   * @param {string[]} fieldIds - An ordered array of form field IDs.
   * @param {string} messageElementId - The ID of the element to show feedback messages.
   */
  const handlePasteData = async (fieldIds, messageElementId) => {
    try {
      const text = await navigator.clipboard.readText();
      // Split by newline, filter out empty lines, and trim whitespace.
      const values = text.split('\n').map(line => line.trim()).filter(line => line);
      let fieldsPasted = 0;

      // Iterate over the field IDs and assign values from the clipboard
      for (let i = 0; i < fieldIds.length; i++) {
        if (i >= values.length) break; // Stop if we run out of values

        const fieldId = fieldIds[i];
        let value = values[i];
        
        const inputElement = document.getElementById(fieldId);
        if (fieldId) {
          if (inputElement) {
            // Special handling for 'cédula' to remove non-numeric characters
            if (fieldId.includes('cedula')) {
              value = value.replace(/[^0-9]/g, '');
            }
            inputElement.value = value;
            fieldsPasted++;
          }
        }
      }

      if (fieldsPasted > 0) {
        showMessage(messageElementId, `Se pegaron ${fieldsPasted} campos.`, true);
        
        // Manually trigger the input event on the CLP amount field to update the VES calculation
        const clpFieldId = fieldIds.find(id => id.includes('clp-amount'));
        if (clpFieldId) {
            const clpInput = document.getElementById(clpFieldId);
            if (clpInput) {
                clpInput.dispatchEvent(new Event('input'));
            }
        }
      } else {
        showMessage(messageElementId, 'No se encontraron datos válidos para pegar.', false);
      }

    } catch (err) {
      console.error('Error al leer el portapapeles:', err);
      const errorMessage = 'El navegador bloqueó el acceso al portapapeles. Busca un ícono en la barra de direcciones para conceder el permiso.';
      showMessage(messageElementId, errorMessage, false);
    }
  };

  // Ordered field IDs for each form for pasting
  const transferenciaFields = [
    'name-transferencia',
    'cedula-transferencia',
    'bank-transferencia',
    'account-type-transferencia',
    'account-number-transferencia',
    'clp-amount-transferencia'
  ];

  const pagoMovilFields = [
    'name-pm',
    'cedula-pm',
    'phone-pm',
    'bank-pm',
    'clp-amount-pm'
  ];

  const recargaSaldoFields = [
    'name-rs',
    'cedula-rs',
    'phone-rs',
    'clp-amount-rs'
   ];

  /**
   * Handles the submission of a new order form.
   * @param {Event} e The form submission event.
   * @param {'transferencia' | 'pago-movil' | 'recarga-saldo'} type The type of order.
   */
  const handleOrderSubmit = async (e, type) => {
      e.preventDefault();
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');

      const form = e.target;
      const messageElId = form.querySelector('p[id^="user-message-"]').id;

      try {
          let orderData = {
              type: type,
              status: 'Pendiente de pago',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              clientName: form.querySelector('input[id^="name-"]').value,
              cedula: form.querySelector('input[id^="cedula-"]').value.replace(/[^0-9]/g, ''),
              clpAmount: parseFloat(form.querySelector('input[id^="clp-amount-"]').value),
          };
          
          if (isNaN(orderData.clpAmount) || orderData.clpAmount <= 0) {
              showMessage(messageElId, 'El monto en CLP debe ser un número válido y mayor a cero.', false);
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
              return;
          }

          orderData.vesAmount = orderData.clpAmount * currentExchangeRate;

          // Add type-specific fields
          if (type === 'transferencia') {
              orderData.bank = form.querySelector('#bank-transferencia').value;
              orderData.accountType = form.querySelector('#account-type-transferencia').value;
              orderData.accountNumber = form.querySelector('#account-number-transferencia').value;
          } else if (type === 'pago-movil') {
              orderData.phone = form.querySelector('#phone-pm').value;
              orderData.bank = form.querySelector('#bank-pm').value;
          } else if (type === 'recarga-saldo') {
              orderData.phone = form.querySelector('#phone-rs').value;
          }

          const docRef = await db.collection('orders').add(orderData);
          lastOrderId = docRef.id;
          form.reset();
          vesDisplays.forEach(span => span.textContent = '0,00 VES');
          
          // If admin is creating the order, refresh the client list
          if (isAdmin) {
              fetchAndRenderClients();
          }

          showMessage(messageElId, 'Pedido creado. Sube el comprobante.', true);
          
          uploadModal.classList.remove('hidden');
          uploadModal.classList.add('flex');

      } catch (error) {
          console.error("Error al crear el pedido:", error);
          showMessage(messageElId, `Error al crear el pedido: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  // --- Event Listeners ---

  showUserFormBtn.addEventListener('click', () => switchMainView('user'));
  showAdminLoginBtn.addEventListener('click', () => switchMainView('admin'));
  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab)));

  // Admin Login
  adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value;
      const password = document.getElementById('admin-password').value;

      if (window.IS_DEMO) {
          if (password !== 'admin') {
              showMessage('login-message', 'Contraseña incorrecta. En modo demo, usa "admin".', false);
              return;
          }
          userIdDisplay.textContent = `Conectado como: ${email || 'demo@local.dev'} (Modo Demo)`;
          isAdmin = true;
          // Usamos la función central para asegurar que la vista se renderice correctamente
          switchMainView('admin');
          // FIX: En modo demo, el listener de pedidos debe adjuntarse manualmente aquí
          if (!ordersListener) {
              attachOrdersListener();
          }
          return;
      }

      auth.signInWithEmailAndPassword(email, password)
          .catch((error) => {
              console.error("Error de inicio de sesión:", error);
              showMessage('login-message', `Error: ${error.message}`, false);
          });
  });

  // Admin Logout
  adminLogoutBtn.addEventListener('click', () => {
      // Manejar el logout en modo demo, que no usa Firebase Auth
      if (window.IS_DEMO && isAdmin) {
          isAdmin = false;
          userIdDisplay.textContent = '';
          switchMainView('user'); // Volver a la vista de usuario
          // FIX: Desconectar el listener de pedidos al cerrar sesión en modo demo
          if (ordersListener) {
              ordersListener();
              ordersListener = null;
              console.log('[Listener] Listener de pedidos desconectado para modo demo.');

              // Clear client list on demo logout
              fullClientList = [];
              renderClientList([]);
              clientsSearchInput.value = '';
          }
          return;
      }
      auth.signOut(); // Para usuarios reales, onAuthStateChanged se encargará de actualizar la UI
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

      // Use .set() to update the document.
      rateRef.set({
              value: newRate,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          })
          .then(() => {
              showMessage('rate-message', '¡Tasa actualizada con éxito!', true);
              newRateInput.value = '';
          })
          .catch((error) => {
              console.error("Error al actualizar la tasa: ", error);
              showMessage('rate-message', `Error: ${error.message}`, false);
          });
  });

  // Admin: Balance Management
  addBalanceBtn.addEventListener('click', () => {
      const amount = parseFloat(balanceAmountInput.value);
      if (isNaN(amount) || amount <= 0) {
          showMessage('balance-message', 'Ingresa un monto válido para cargar.', false);
          return;
      }
      amountToLoad = amount;
      loadBalanceModal.classList.remove('hidden');
      loadBalanceModal.classList.add('flex');
  });

  loadBankCancelBtn.addEventListener('click', () => {
      loadBalanceModal.classList.add('hidden');
      loadBalanceModal.classList.remove('flex');
      amountToLoad = 0;
  });

  loadBankConfirmBtn.addEventListener('click', () => {
      const bank = loadBankSelect.value;

      const balanceHistoryRef = db.collection('balance_history').doc();
      const balanceRef = db.collection('config').doc('balance');
      const batch = db.batch();

      batch.set(balanceHistoryRef, {
          amount: amountToLoad,
          type: 'add',
          bank: bank,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      batch.set(balanceRef, { current: firebase.firestore.FieldValue.increment(amountToLoad) }, { merge: true });

      batch.commit().then(() => {
          showMessage('balance-message', `Se cargaron ${amountToLoad.toLocaleString('es-VE')} VES exitosamente.`, true);
          balanceAmountInput.value = '';
          loadBalanceModal.classList.add('hidden');
          loadBalanceModal.classList.remove('flex');
          amountToLoad = 0;
      }).catch(error => {
          console.error("Error al cargar saldo: ", error);
          showMessage('balance-message', `Error: ${error.message}`, false);
      });
  });

  subtractBalanceBtn.addEventListener('click', () => {
      const amount = parseFloat(balanceAmountInput.value);
      if (isNaN(amount) || amount <= 0) {
          showMessage('balance-message', 'Ingresa un monto válido para restar.', false);
          return;
      }

      const balanceHistoryRef = db.collection('balance_history').doc();
      const balanceRef = db.collection('config').doc('balance');
      const batch = db.batch();

      batch.set(balanceHistoryRef, { amount: amount, type: 'subtract', timestamp: firebase.firestore.FieldValue.serverTimestamp() });
      batch.set(balanceRef, { current: firebase.firestore.FieldValue.increment(-amount) }, { merge: true });

      batch.commit().then(() => {
          showMessage('balance-message', `Se restaron ${amount.toLocaleString('es-VE')} VES exitosamente.`, true);
          balanceAmountInput.value = '';
      }).catch(error => {
          console.error("Error al restar saldo: ", error);
          showMessage('balance-message', `Error: ${error.message}`, false);
      });
  });

  // --- Initial App Setup ---
  // onAuthStateChanged handles the initial view, but we can set a default
  // while waiting for the auth state.
  switchMainView('user');
  switchTab(tabs[0]); // Set default tab

  // Attach paste event listeners
  pasteBtnTransferencia.addEventListener('click', () => handlePasteData(transferenciaFields, 'user-message-transferencia'));
  pasteBtnPagoMovil.addEventListener('click', () => handlePasteData(pagoMovilFields, 'user-message-pm'));
  pasteBtnRecargaSaldo.addEventListener('click', () => handlePasteData(recargaSaldoFields, 'user-message-rs'));

  // Show/Hide paste examples
  showExampleTransferencia.addEventListener('click', (e) => {
      e.preventDefault();
      exampleTransferencia.classList.toggle('hidden');
  });

  showExamplePagoMovil.addEventListener('click', (e) => {
      e.preventDefault();
      examplePagoMovil.classList.toggle('hidden');
  });

  showExampleRecargaSaldo.addEventListener('click', (e) => {
      e.preventDefault();
      exampleRecargaSaldo.classList.toggle('hidden');
  });

  // Add event listeners for real-time CLP to VES calculation
  clpInputs.forEach((input, index) => {
      if (input) {
          input.addEventListener('input', () => updateVesAmount(input, vesDisplays[index]));
      }
  });

  // Listen for order filter changes
  orderFilter.addEventListener('change', applyOrderFilter);

  // Use event delegation for order action buttons
  ordersListPending.addEventListener('click', async (e) => {
      const target = e.target;
      const orderId = target.dataset.id;

      if (!orderId || !target.closest('button')) return;

      if (target.classList.contains('mark-paid-btn')) {
          // NEW: Open modal to upload proof before paying
          orderIdToProcess = orderId;
          showMessage('admin-upload-message', '', true);
          adminScreenshotInput.value = ''; // Clear previous file selection
          adminUploadModal.classList.remove('hidden');
          adminUploadModal.classList.add('flex');

      } else if (target.classList.contains('cancel-order-btn')) {
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');
          try {
              await db.collection('orders').doc(orderId).update({ status: 'Cancelado' });
              showMessage('rate-message', 'Pedido cancelado.', true);
          } catch (error) {
              console.error("Error updating order status:", error);
              showMessage('rate-message', `Error: ${error.message}`, false);
          } finally {
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
          }
      }
  });

  // Add listener for debtor checkbox on the paid list
  ordersListPaid.addEventListener('click', async (e) => {
      const target = e.target;
      if (!target.classList.contains('deudor-checkbox')) return;

      const orderId = target.dataset.id;
      const isDebtor = target.checked;

      try {
          await db.collection('orders').doc(orderId).update({ isDebtor: isDebtor });
          showMessage('rate-message', `Pedido actualizado.`, true);
      } catch (error) {
          console.error("Error updating debtor status:", error);
          showMessage('rate-message', `Error al actualizar: ${error.message}`, false);
          target.checked = !isDebtor; // Revert checkbox on error
      }
  });

  // Admin Modal: Cancel Upload
  adminCancelUploadBtn.addEventListener('click', () => {
      adminUploadModal.classList.add('hidden');
      adminUploadModal.classList.remove('flex');
      orderIdToProcess = null;
  });

  // Admin Modal: Confirm Payment and Upload
  adminUploadBtn.addEventListener('click', async () => {
      if (!orderIdToProcess) {
          return showMessage('admin-upload-message', 'Error: No se ha seleccionado ningún pedido.', false);
      }

      const file = adminScreenshotInput.files[0];
      if (!file) {
          return showMessage('admin-upload-message', 'Por favor, selecciona un archivo de imagen.', false);
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      showMessage('admin-upload-message', 'Subiendo comprobante...', true);

      try {
          // 1. Upload file to Storage
          const filePath = `proofs/${orderIdToProcess}/${file.name}`;
          const fileRef = storage.ref(filePath);
          const uploadTask = await fileRef.put(file);
          const proofUrl = await uploadTask.ref.getDownloadURL();

          // 2. Get order data to know how much to subtract from balance
          const orderRef = db.collection('orders').doc(orderIdToProcess);
          const balanceRef = db.collection('config').doc('balance');

          const orderDoc = await orderRef.get();
          if (!orderDoc.exists) throw new Error("El pedido ya no existe.");
          
          const vesToSubtract = orderDoc.data().vesAmount;
          if (typeof vesToSubtract !== 'number' || vesToSubtract <= 0) {
              throw new Error("El monto en VES del pedido no es válido para ser descontado.");
          }

          // 3. Use a batch to update Firestore atomically
          const batch = db.batch();
          batch.update(orderRef, { status: 'Pagado', proofUrl: proofUrl });
          batch.update(balanceRef, { current: firebase.firestore.FieldValue.increment(-vesToSubtract) });
          await batch.commit();

          showMessage('rate-message', 'Pedido pagado y saldo descontado.', true);
          
          // 4. Close modal and clean up
          adminCancelUploadBtn.click();
      } catch (error) {
          console.error("Error al confirmar el pago:", error);
          showMessage('admin-upload-message', `Error: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  });

  // --- Historical Search & Client List Logic ---

  /**
   * Sets the date inputs to a specific range and triggers a search.
   * @param {Date} start The start date.
   * @param {Date} end The end date.
   */
  const setDateRangeAndSearch = (start, end) => {
      historicalDateStart.valueAsDate = start;
      historicalDateEnd.valueAsDate = end;
      handleHistoricalSearch();
  };

  historicalDateTodayBtn.addEventListener('click', () => {
      const today = new Date();
      setDateRangeAndSearch(today, today);
  });

  historicalDateYesterdayBtn.addEventListener('click', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setDateRangeAndSearch(yesterday, yesterday);
  });

  historicalDate7DaysBtn.addEventListener('click', () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      setDateRangeAndSearch(start, end);
  });

  historicalStatusFilters.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
          historicalStatusFilters.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
          e.target.classList.add('active');
          handleHistoricalSearch();
      }
  });

  /** Fetches and displays historical orders based on selected filters. */
  const handleHistoricalSearch = async () => {
      const startDateVal = historicalDateStart.valueAsDate;
      const endDateVal = historicalDateEnd.valueAsDate;

      if (!startDateVal || !endDateVal) {
          return; // Don't search if dates are not set
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      historicalOrdersList.innerHTML = '';
      noHistoricalOrdersMessage.classList.add('hidden');
      exportExcelBtn.disabled = true;

      const start = new Date(startDateVal);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDateVal);
      end.setHours(23, 59, 59, 999);

      const activeStatusBtn = historicalStatusFilters.querySelector('button.active');
      const statusFilter = activeStatusBtn ? activeStatusBtn.dataset.status : 'Todos';

      try {
          // Firestore limitation: Cannot have inequality filters on multiple fields.
          // So, we fetch by date range first, then filter by status on the client-side.
          const query = db.collection('orders')
              .where('createdAt', '>=', start)
              .where('createdAt', '<=', end)
              .orderBy('createdAt', 'desc');
          
          const snapshot = await query.get();

          let allOrders = [];
          snapshot.forEach(doc => {
              allOrders.push({ id: doc.id, ...doc.data() });
          });

          // Now, filter by status on the client side
          const filteredOrders = (statusFilter === 'Todos')
              ? allOrders
              : allOrders.filter(order => order.status === statusFilter);


          if (filteredOrders.length === 0) {
              noHistoricalOrdersMessage.classList.remove('hidden');
              historicalSearchSummary.textContent = 'No se encontraron pedidos para los filtros seleccionados.';
              historicalOrdersData = [];
          } else {
              let totalCLP = 0;
              let totalVES = 0;
              historicalOrdersData = [];

              filteredOrders.forEach(order => {
                  // We need to simulate a doc snapshot for renderOrder
                  const mockDoc = { id: order.id, data: () => order };
                  historicalOrdersList.innerHTML += renderOrder(mockDoc);
                  historicalOrdersData.push(order);
                  if (order.status === 'Pagado') {
                      totalCLP += order.clpAmount || 0;
                      totalVES += order.vesAmount || 0;
                  }
              });
              historicalSearchSummary.textContent = `Se encontraron ${filteredOrders.length} pedidos. Total Pagado: ${totalCLP.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'})} / ${totalVES.toLocaleString('es-VE')} VES.`;
              exportExcelBtn.disabled = false;
          }
      } catch (error) {
          console.error("Error en búsqueda histórica:", error);
          historicalSearchSummary.textContent = 'Error al realizar la búsqueda.';
          if (error.code === 'failed-precondition') {
              const detailedMessage = 'Error: La base de datos requiere un índice para esta consulta. Por favor, abre la consola del navegador (F12), busca el error de Firebase y haz clic en el enlace que proporciona para crear el índice automáticamente.';
              showCustomAlert(detailedMessage);
              noHistoricalOrdersMessage.innerHTML = '<b>ACCIÓN REQUERIDA:</b> Se necesita un índice de base de datos. Revisa la consola (F12) y haz clic en el enlace de error de Firebase.';
              noHistoricalOrdersMessage.classList.remove('hidden');
          }
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  /** Exports the currently fetched historical orders to an Excel file. */
  const exportHistoricalOrdersToExcel = () => {
      if (historicalOrdersData.length === 0) {
          showCustomAlert('No hay datos para exportar. Realiza una búsqueda primero.');
          return;
      }
      const dataToExport = historicalOrdersData.map(order => ({
          'Fecha': order.createdAt ? order.createdAt.toDate().toLocaleString('es-CL') : 'N/A', 'Cliente': order.clientName, 'Cédula': order.cedula, 'Tipo': order.type, 'Monto CLP': order.clpAmount, 'Monto VES': order.vesAmount, 'Estado': order.status, 'Banco': order.bank || '', 'Teléfono': order.phone || '', 'Nro. Cuenta': order.accountNumber || '', 'Tipo Cuenta': order.accountType || '', 'Deudor': order.isDebtor ? 'Sí' : 'No'
      }));
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialPedidos');
      const startDate = historicalDateStart.value;
      const endDate = historicalDateEnd.value;
      XLSX.writeFile(workbook, `Historial_Pedidos_${startDate}_a_${endDate}.xlsx`);
  };

  exportExcelBtn.addEventListener('click', exportHistoricalOrdersToExcel);

  /** Fetches all orders to build a unique client list with their latest data. */
  const fetchAndRenderClients = async () => {
      try {
          // Order by createdAt to ensure we can get the latest data for each client.
          // This query requires a single-field index on createdAt (desc), which we define in firestore.indexes.json
          const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
          const clientsMap = new Map();
          snapshot.forEach(doc => {
              const order = doc.data();
              // Since we are ordered by descending date, the first time we see a cedula, it's the latest one.
              if (order.cedula && order.clientName && !clientsMap.has(order.cedula)) {
                  clientsMap.set(order.cedula, { ...order, id: doc.id }); // Store the whole last order data
              }
          });
          fullClientList = Array.from(clientsMap.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
          renderClientList(fullClientList);
      } catch (error) {
          console.error("Error fetching clients:", error);
          clientsList.innerHTML = `<p class="text-red-500">Error al cargar la lista de clientes.</p>`;
          if (error.code === 'failed-precondition') {
              showCustomAlert('Error: La base de datos requiere un índice para la lista de clientes. Por favor, abre la consola (F12) y crea el índice que solicita Firebase.');
          }
      }
  };

  /** Renders a list of clients into the DOM. */
  const renderClientList = (clients) => {
      clientsList.innerHTML = '';
      if (clients.length === 0) {
          clientsList.innerHTML = `<p class="text-gray-500">No se encontraron clientes.</p>`;
      } else {
          clients.forEach(client => {
              const clientEl = document.createElement('div');
              clientEl.className = 'p-3 hover:bg-gray-100 rounded-lg flex justify-between items-center border border-gray-200';
              clientEl.innerHTML = `
                  <div>
                      <p class="font-semibold text-gray-800">${client.clientName}</p>
                      <p class="text-sm text-gray-600 font-mono">${client.cedula}</p>
                  </div>
                  <button data-cedula="${client.cedula}" data-name="${client.clientName}" class="copy-client-btn bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-semibold hover:bg-blue-200">Copiar</button>
              `;
              clientsList.appendChild(clientEl);
          });
      }
      clientsCountDisplay.textContent = clients.length;
  };

  clientsSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      if (!searchTerm) {
          renderClientList(fullClientList);
          return;
      }
      const filteredClients = fullClientList.filter(client => client.clientName.toLowerCase().includes(searchTerm) || client.cedula.includes(searchTerm));
      renderClientList(filteredClients);
  });

  copyClientsBtn.addEventListener('click', () => {
      const visibleClients = Array.from(clientsList.children).map(el => {
          const name = el.querySelector('p:first-child').textContent;
          const cedula = el.querySelector('p:last-child').textContent;
          return `${name}\t${cedula}`;
      }).join('\n');
      if (!visibleClients) {
          showCustomAlert('No hay clientes en la lista para copiar.');
          return;
      }
      navigator.clipboard.writeText(visibleClients).then(() => {
          showCustomAlert('Lista de clientes copiada al portapapeles.');
      }).catch(err => {
          console.error('Error al copiar la lista de clientes:', err);
          showCustomAlert('No se pudo copiar la lista.');
      });
  });

  // Add event listeners for order form submissions
  formTransferencia.addEventListener('submit', (e) => handleOrderSubmit(e, 'transferencia'));
  formPagoMovil.addEventListener('submit', (e) => handleOrderSubmit(e, 'pago-movil'));
  formRecargaSaldo.addEventListener('submit', (e) => handleOrderSubmit(e, 'recarga-saldo'));

  // Handle the simulated upload confirmation
  confirmUploadBtn.addEventListener('click', () => {
      uploadModal.classList.add('hidden');
      uploadModal.classList.remove('flex');
      lastOrderId = null; // Reset the stored order ID
      
      // Find the currently active message element to show the final confirmation
      const activeTabPane = document.querySelector('.tab-pane:not(.hidden)');
      if (activeTabPane) {
          const messageElId = activeTabPane.querySelector('p[id^="user-message-"]').id;
          showMessage(messageElId, '¡Comprobante "subido" con éxito!', true);
      }
  });

  // Autocomplete for Cedula
  cedulaInputs.forEach(input => {
      if (input) {
          input.addEventListener('blur', (e) => {
              const cedulaValue = e.target.value.replace(/[^0-9]/g, '');
              if (!cedulaValue || fullClientList.length === 0) return;

              const clientLastOrder = fullClientList.find(c => c.cedula === cedulaValue);
              
              if (clientLastOrder) {
                  const form = e.target.closest('form');
                  if (!form) return;

                  const formId = form.id;
                  const messageElId = form.querySelector('p[id^="user-message-"]').id;

                  // Autocomplete common field: Name
                  form.querySelector('input[id^="name-"]').value = clientLastOrder.clientName;

                  // Autocomplete specific fields if the form type matches the client's last order type
                  if (formId === 'remittance-form-transferencia' && clientLastOrder.type === 'transferencia') {
                      form.querySelector('#bank-transferencia').value = clientLastOrder.bank || '';
                      form.querySelector('#account-type-transferencia').value = clientLastOrder.accountType || 'ahorro';
                      form.querySelector('#account-number-transferencia').value = clientLastOrder.accountNumber || '';
                  } else if (formId === 'remittance-form-pago-movil' && clientLastOrder.type === 'pago-movil') {
                      form.querySelector('#phone-pm').value = clientLastOrder.phone || '';
                      form.querySelector('#bank-pm').value = clientLastOrder.bank || '';
                  } else if (formId === 'remittance-form-recarga-saldo' && clientLastOrder.type === 'recarga-saldo') {
                      form.querySelector('#phone-rs').value = clientLastOrder.phone || '';
                  }
                  
                  showMessage(messageElId, `Datos de ${clientLastOrder.clientName} autocompletados.`, true);
              }
          });
      }
  });

  // Copy individual client data from the client list
  clientsList.addEventListener('click', (e) => {
      const target = e.target.closest('.copy-client-btn');
      if (!target) return;

      const name = target.dataset.name;
      const cedula = target.dataset.cedula;
      
      // Format for pasting into a new order (name on first line, cedula on second)
      const textToCopy = `${name}\n${cedula}`;

      navigator.clipboard.writeText(textToCopy).then(() => {
          showCustomAlert(`Datos de "${name}" copiados al portapapeles.`);
      }).catch(err => {
          console.error('Error al copiar datos del cliente:', err);
          showCustomAlert('No se pudo copiar la información.');
      });
  });

});
