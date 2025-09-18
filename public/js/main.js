﻿﻿﻿﻿﻿// Demo/hosting detection
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
let ordersListener = null; // To hold the unsubscribe function for the orders listener.
let accountsListener = null; // To hold the listener for the accounts collection.
let paymentData = {}; // To store all data related to a payment process
let isInitialOrdersLoad = true; // To prevent notification sound on first load

// --- Constants ---
const venezuelanBanks = [
    "100% Banco", "Activo", "Agrícola de Venezuela", "Bancamiga", "Bancaribe", "Bancrecer", "Banesco", "Bangente", "Banplus", "BFC (Banco Fondo Común)", "Bicentenario", "BNC (Banco Nacional de Crédito)", "Caroní", "DelSur", "Exterior", "Internacional de Desarrollo", "Mercantil", "Mi Banco", "N58 Banco Digital", "Plaza", "Provincial", "Sofitasa", "Tesoro", "Venezolano de Crédito", "Venezuela", "BANFANB"
].sort();

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
  const orderConfirmModal = document.getElementById('order-confirm-modal');
  const orderConfirmDetails = document.getElementById('order-confirm-details');
  const orderFinalConfirmBtn = document.getElementById('order-final-confirm-btn');
  const orderFinalCancelBtn = document.getElementById('order-final-cancel-btn');

  // Admin Upload Modal Elements
  const adminUploadModal = document.getElementById('admin-upload-modal');
  const adminScreenshotInput = document.getElementById('admin-screenshot-input');
  const adminUploadBtn = document.getElementById('admin-upload-btn');
  const adminCancelUploadBtn = document.getElementById('admin-cancel-upload-btn');

  // Payment Source Modal Elements
  const selectPaymentSourceModal = document.getElementById('select-payment-source-modal');
  const paymentSourceOrderDetails = document.getElementById('payment-source-order-details');
  const paymentSourceList = document.getElementById('payment-source-list');
  const paymentFeeDetails = document.getElementById('payment-fee-details');
  const paymentSourceNextBtn = document.getElementById('payment-source-next-btn');
  const paymentSourceCancelBtn = document.getElementById('payment-source-cancel-btn');

  // Order display elements
  const ordersListPending = document.getElementById('orders-list-pending');
  const ordersListPaid = document.getElementById('orders-list-paid');
  const noOrdersPendingMessage = document.getElementById('no-orders-pending-message');
  const noOrdersPaidMessage = document.getElementById('no-orders-paid-message');
  const orderFilter = document.getElementById('order-filter');
  const pendingSummaryDisplay = document.getElementById('pending-summary');
  const paidSummaryDisplay = document.getElementById('paid-summary');

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

  // Balance History Elements (New)
  const balanceHistoryStartInput = document.getElementById('balance-history-start');
  const balanceHistoryEndInput = document.getElementById('balance-history-end');
  const balanceHistoryTodayBtn = document.getElementById('balance-history-today');
  const balanceHistoryYesterdayBtn = document.getElementById('balance-history-yesterday');
  const balanceHistory7DaysBtn = document.getElementById('balance-history-7days');
  const balanceHistorySearchBtn = document.getElementById('balance-history-search-btn');
  const exportBalanceExcelBtn = document.getElementById('export-balance-excel-btn');
  const balanceHistoryHeader = document.getElementById('balance-history-header');

  // Balance Modal Elements
  const balanceOperationModal = document.getElementById('balance-operation-modal');
  const balanceOpTitle = document.getElementById('balance-op-title');
  const balanceOpBankSection = document.getElementById('balance-op-bank-section');
  const balanceOpBankSelect = document.getElementById('balance-op-bank-select');
  const balanceOpHolderSelect = document.getElementById('balance-op-holder-select');
  const balanceOpNoteInput = document.getElementById('balance-op-note-input');
  const balanceOpConfirmBtn = document.getElementById('balance-op-confirm-btn');
  const balanceOpCancelBtn = document.getElementById('balance-op-cancel-btn');
  const balanceConfirmModal = document.getElementById('balance-confirm-modal');
  const balanceConfirmTitle = document.getElementById('balance-confirm-title');
  const balanceConfirmDetails = document.getElementById('balance-confirm-details');
  const balanceFinalConfirmBtn = document.getElementById('balance-final-confirm-btn');
  const balanceFinalCancelBtn = document.getElementById('balance-final-cancel-btn');

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
  const clientsCountDisplay = document.getElementById('clients-count');
  const clientsList = document.getElementById('clients-list');
  const clientSortNameBtn = document.getElementById('client-sort-name');
  const clientSortCedulaBtn = document.getElementById('client-sort-cedula');
  const clientPaginationControls = document.getElementById('client-pagination-controls');
  const clientPaginationPrevBtn = document.getElementById('client-pagination-prev');
  const clientPaginationNextBtn = document.getElementById('client-pagination-next');
  const clientPaginationInfo = document.getElementById('client-pagination-info');
  const addClientBtn = document.getElementById('add-client-btn');

  // Add Client Modal Elements
  const addClientModal = document.getElementById('add-client-modal');
  const addClientCloseBtn = document.getElementById('add-client-close-btn');
  const addClientMessage = document.getElementById('add-client-message');
  const addClientTabs = document.querySelectorAll('.add-client-tab');
  const addClientFormTransferencia = document.getElementById('add-client-form-transferencia');
  const addClientFormPagoMovil = document.getElementById('add-client-form-pago-movil');
  const addClientFormRecarga = document.getElementById('add-client-form-recarga');
  const pasteBtnAddClientTransferencia = document.getElementById('paste-btn-add-client-transferencia');
  const pasteBtnAddClientPm = document.getElementById('paste-btn-add-client-pm');
  const pasteBtnAddClientRecarga = document.getElementById('paste-btn-add-client-recarga');
  const addClientCedulaInputs = [
      document.getElementById('add-client-cedula-transferencia'),
      document.getElementById('add-client-cedula-pm'),
      document.getElementById('add-client-cedula-recarga')
  ];

  // Transfer Funds Modal Elements
  const openTransferFundsModalBtn = document.getElementById('open-transfer-funds-modal-btn');
  const transferFundsModal = document.getElementById('transfer-funds-modal');
  const transferFundsCloseBtn = document.getElementById('transfer-funds-close-btn');
  const transferFundsForm = document.getElementById('transfer-funds-form');

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
  let orderDataToConfirm = {};
  let balanceOperationData = {};
  let accountsData = []; // To store real-time account balances
  let balanceHistoryData = []; // To store data for Excel export
  let historicalOrdersData = []; // To store data for Excel export
  let fullClientList = []; // Holds the raw client data

  // Client list pagination and sorting state
  let clientListPage = 1;
  const CLIENTS_PER_PAGE = 5;
  let clientListSortBy = 'name'; // 'name' or 'cedula'
  let filteredClientList = [];

  /** Populates all bank select dropdowns with a standard list of Venezuelan banks. */
  const populateBankSelects = () => {
      const bankSelects = document.querySelectorAll('.bank-select');
      const optionsHtml = venezuelanBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      
      bankSelects.forEach(select => {
          select.innerHTML = `<option value="">Seleccione un banco...</option>${optionsHtml}`;
      });
  };

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
      const vesAmount = (order.vesAmount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      let typeTag = '';
      let debtorButton = '';

      switch (order.type) {
          case 'transferencia':
              typeTag = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">Transferencia</span>`;
              break;
          case 'pago-movil':
              typeTag = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-purple-600 bg-purple-200">Pago Móvil</span>`;
              break;
          case 'recarga-saldo':
              typeTag = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-teal-600 bg-teal-200">Recarga</span>`;
              break;
      }

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
                    <a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600 transition-transform transform hover:scale-105">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                        <span>Compartir</span>
                    </a>
                  `;
              }

              const isDebtor = !!order.isDebtor;
              const debtorButtonText = isDebtor ? 'Quitar Deudor' : 'Marcar Deudor';
              const debtorButtonClasses = isDebtor 
                  ? 'bg-orange-500 text-white' // Active state
                  : 'bg-orange-100 text-orange-700'; // Inactive state

              debtorButton = `
                  <button data-id="${orderId}" data-is-debtor="${isDebtor}" class="debtor-toggle-btn ${debtorButtonClasses} px-3 py-1 rounded-lg text-sm font-semibold hover:opacity-80 transition-opacity">
                      ${debtorButtonText}
                  </button>
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
                  <div class="flex flex-col items-end gap-2 text-right">
                    ${statusBadge}
                    ${typeTag}
                  </div>
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
              ${order.status === 'Pagado' ? `
                <div class="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                    ${debtorButton}
                    ${actionButtons}
                </div>
              ` : `
                <div class="flex justify-end space-x-2 mt-3">
                    ${actionButtons}
                </div>
              `}
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
          // --- Sound Notification Logic ---
          snapshot.docChanges().forEach(change => {
              if (change.type === 'added' && !isInitialOrdersLoad) {
                  const order = change.doc.data();
                  if (order.status === 'Pendiente de pago') {
                      console.log('Nuevo pedido pendiente, reproduciendo sonido.');
                      const notificationSound = document.getElementById('notification-sound');
                      if (notificationSound) {
                          notificationSound.play().catch(error => {
                              console.warn("No se pudo reproducir el sonido de notificación. El usuario debe interactuar con la página primero.", error);
                          });
                      }
                  }
              }
          });
          isInitialOrdersLoad = false; // Set flag after first run

          console.log(`[Listener] Se recibió un snapshot con ${snapshot.size} documentos.`);
          ordersListPending.innerHTML = '';
          ordersListPaid.innerHTML = '';
          
          let pendingOrdersCount = 0;
          let pendingVesTotal = 0;
          let paidCount = 0;
          let paidVesTotal = 0;

          if (snapshot.empty) {
              noOrdersPendingMessage.classList.remove('hidden');
              noOrdersPaidMessage.classList.remove('hidden');
              // Clear summaries when there are no orders
              pendingSummaryDisplay.textContent = '0 Pedidos / 0,00 VES';
              paidSummaryDisplay.textContent = '0 Pedidos / 0,00 VES';
              return;
          }

          snapshot.forEach(doc => {
              const order = doc.data();
              // Do not render dummy client registration orders in the list
              if (order.status === 'Cliente Registrado') {
                  return;
              }

              const orderHtml = renderOrder(doc);
              if (order.status === 'Pagado') {
                  ordersListPaid.innerHTML += orderHtml;
                  paidCount++;
                  paidVesTotal += order.vesAmount || 0;
              } else { // 'Pendiente de pago' or 'Cancelado'
                  ordersListPending.innerHTML += orderHtml;
                  // Only count orders with "Pendiente de pago" status for the summary
                  if (order.status === 'Pendiente de pago') {
                      pendingOrdersCount++;
                      pendingVesTotal += order.vesAmount || 0;
                  }
              }
          });

          // Update summary displays with formatted totals
          pendingSummaryDisplay.textContent = `${pendingOrdersCount} Pedidos / ${pendingVesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
          paidSummaryDisplay.textContent = `${paidCount} Pedidos / ${paidVesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;

          noOrdersPendingMessage.classList.toggle('hidden', ordersListPending.children.length > 0);
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
          // Force refresh of the token to get the latest custom claims (like 'admin')
          user.getIdTokenResult(true).then(idTokenResult => {
              isAdmin = !!idTokenResult.claims.admin;
              userIdDisplay.textContent = `Conectado como: ${user.email}`;
              if (isAdmin) {
                  switchMainView('admin');
                  if (!ordersListener) {
                      attachOrdersListener(); // Attach listener if admin
                      fetchAndRenderClients(); // Fetch clients when admin logs in
                      // Attach listener and provide a callback to run after the first data load
                      attachAccountsListener(() => {
                          // Load today's balance history by default, only after accounts are loaded
                          const today = new Date();
                          const start = new Date(today);
                          start.setHours(0, 0, 0, 0);
                          const end = new Date(today);
                          end.setHours(23, 59, 59, 999);
                          balanceHistoryStartInput.valueAsDate = today;
                          balanceHistoryEndInput.valueAsDate = today;
                          fetchAndRenderBalanceHistory(start, end);
                      });
                  }
              } else {
                  console.log(`Usuario ${user.email} logueado, pero no es admin.`);
                  if (ordersListener) {
                      ordersListener(); // Detach listener if not admin
                      ordersListener = null;
                  }
                  isInitialOrdersLoad = true; // Reset flag
                  if (accountsListener) {
                      accountsListener();
                      accountsListener = null;
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
          isInitialOrdersLoad = true; // Reset flag on logout
          if (accountsListener) {
              accountsListener();
              accountsListener = null;
          }
          fullClientList = [];
          updateClientView();
          // Clear balance history on logout
          balanceHistoryList.innerHTML = '';
          noBalanceHistoryMessage.textContent = 'Selecciona un rango de fechas para ver los movimientos.';
          noBalanceHistoryMessage.classList.remove('hidden');
          if (balanceHistoryHeader) balanceHistoryHeader.classList.add('hidden');
          balanceHistoryData = [];
          exportBalanceExcelBtn.disabled = true;
          switchMainView('user');
      }
  };

  // --- Firebase Logic ---

  auth.onAuthStateChanged(updateUIForUser);

  /**
   * Renders a single balance history item into an HTML element.
   * @param {object} history - The history data object.
   * @returns {HTMLDivElement} The HTML element for the history item.
   */
  const renderBalanceHistoryItem = (history) => {
      const date = history.timestamp ? history.timestamp.toDate().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
      const formattedAmount = history.amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedBalance = history.runningBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      let description = history.note || '';
      let debit = '';
      let credit = '';

      if (history.type === 'add') {
          credit = formattedAmount;
          if (!description) description = `Carga de Saldo: ${history.holder}`;
      } else if (history.type === 'fee') {
          debit = formattedAmount;
          if (!description) description = `Comisión Bancaria`;
      } else { // subtract
          debit = formattedAmount;
          if (!description) description = `Pago de Pedido`;
      }

      const bank = history.bank || '';

      const historyElement = document.createElement('tr');
      historyElement.className = `border-b border-gray-200 hover:bg-gray-50`;
      historyElement.innerHTML = `
          <td class="p-2 text-gray-600 whitespace-nowrap">${date}</td>
          <td class="p-2 text-gray-800 truncate" title="${description}">${description}</td>
          <td class="p-2 text-gray-600 truncate" title="${bank}">${bank}</td>
          <td class="p-2 font-mono text-right text-red-600">${debit}</td>
          <td class="p-2 font-mono text-right text-green-600">${credit}</td>
          <td class="p-2 font-mono font-semibold text-right text-blue-700">${formattedBalance}</td>
          `;
      return historyElement;
  };

  /** Renders the list of accounts with their balances. */
  const renderAccountsBalanceList = () => {
    const accountsListEl = document.getElementById('accounts-balance-list');
    if (!accountsListEl) return;

    if (accountsData.length === 0) {
        accountsListEl.innerHTML = '<p class="text-gray-500">No hay cuentas con saldo registradas.</p>';
        return;
    }

    accountsListEl.innerHTML = '';
    // Sort by holder name
    const sortedAccounts = [...accountsData].sort((a, b) => a.holder.localeCompare(b.holder));

    sortedAccounts.forEach(account => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center p-2 bg-blue-50 rounded-lg';
        el.innerHTML = `
            <p class="font-medium text-gray-700">${account.holder} - ${account.bank}</p>
            <p class="font-semibold text-blue-700">${account.balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</p>
        `;
        accountsListEl.appendChild(el);
    });
  };

  /** Renders or refreshes the list of accounts in the payment source modal. */
  const renderPaymentSourceList = () => {
      if (!paymentData.orderData) return; // Don't render if no payment is active

      const { orderData } = paymentData;
      const previouslySelectedId = paymentSourceList.querySelector('input:checked')?.value;

      paymentSourceList.innerHTML = '';
      accountsData.forEach(account => {
          const fee = calculateFee(orderData, account);
          const totalDebit = orderData.vesAmount + fee;
          const hasEnoughBalance = account.balance >= totalDebit;
          const radioId = `account-${account.id}`;
          const accountEl = document.createElement('div');
          accountEl.innerHTML = `
              <label for="${radioId}" class="flex items-center p-3 rounded-lg border transition-all ${hasEnoughBalance ? 'cursor-pointer hover:bg-gray-100' : 'opacity-50 bg-gray-200'}">
                  <input type="radio" name="payment-source" id="${radioId}" value="${account.id}" class="mr-3" ${!hasEnoughBalance ? 'disabled' : ''} ${account.id === previouslySelectedId ? 'checked' : ''}>
                  <div class="flex-grow">
                      <p class="font-semibold">${account.holder} - ${account.bank}</p>
                      <p class="text-sm text-gray-600">Disponible: ${account.balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</p>
                  </div>
              </label>
          `;
          paymentSourceList.appendChild(accountEl);
      });

      // After re-rendering, if an item was selected, re-trigger the 'change' event to update the UI
      if (previouslySelectedId) {
          const previouslySelectedRadio = document.getElementById(`account-${previouslySelectedId}`);
          if (previouslySelectedRadio && !previouslySelectedRadio.disabled) {
              previouslySelectedRadio.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
              // The previously selected account is no longer valid, so reset the UI
              paymentFeeDetails.classList.add('hidden');
              paymentSourceNextBtn.disabled = true;
          }
      } else {
        paymentFeeDetails.classList.add('hidden');
        paymentSourceNextBtn.disabled = true;
      }
  };

  /** Attaches a real-time listener for the accounts collection. */
  const attachAccountsListener = (onFirstLoadCallback) => {
    console.log('[Listener] Adjuntando listener de cuentas...');
    if (accountsListener) {
        accountsListener(); // Detach previous listener
    }

    let isFirstLoad = true;

    accountsListener = db.collection('accounts').onSnapshot(snapshot => {
        let totalBalance = 0;
        accountsData = [];
        snapshot.forEach(doc => {
            const account = { id: doc.id, ...doc.data() };
            accountsData.push(account);
            totalBalance += account.balance || 0;
        });

        // Update global balance display
        vesBalanceDisplay.textContent = totalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' VES';
        
        // Render the list of individual account balances
        renderAccountsBalanceList();

        // NEW: Refresh the payment source modal if it's active
        renderPaymentSourceList();

        // If it's the first time this listener runs, execute the callback
        if (isFirstLoad && typeof onFirstLoadCallback === 'function') {
            onFirstLoadCallback();
            isFirstLoad = false;
        }

    }, error => {
        console.error("Error en listener de cuentas:", error);
        vesBalanceDisplay.textContent = 'Error';
        document.getElementById('accounts-balance-list').innerHTML = '<p class="text-red-500">Error al cargar saldos.</p>';
    });
  };

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
        if (inputElement) {
            if (inputElement.classList.contains('bank-select')) {
                // It's a bank dropdown. Find the best match.
                const lowerCaseValue = value.toLowerCase().trim();
                let bestMatch = venezuelanBanks.find(bank => bank.toLowerCase() === lowerCaseValue);
                if (!bestMatch) {
                    bestMatch = venezuelanBanks.find(bank => bank.toLowerCase().includes(lowerCaseValue));
                }
                inputElement.value = bestMatch || ""; // Set to the found match or empty if no match
            } else {
            // Special handling for 'cédula' to remove non-numeric characters
            if (fieldId.includes('cedula')) {
              value = value.replace(/[^0-9]/g, '');
            }
            inputElement.value = value;
          }
          fieldsPasted++;
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

  // Ordered field IDs for each form for pasting in the Add Client modal
  const addClientTransferenciaFields = [
      'add-client-name-transferencia',
      'add-client-cedula-transferencia',
      'add-client-bank-transferencia',
      'add-client-account-type-transferencia',
      'add-client-account-number-transferencia'
  ];
  const addClientPagoMovilFields = [
      'add-client-name-pm',
      'add-client-cedula-pm',
      'add-client-phone-pm',
      'add-client-bank-pm'
  ];
  const addClientRecargaFields = [
      'add-client-name-recarga',
      'add-client-cedula-recarga',
      'add-client-phone-recarga'
  ];
  /**
   * Handles the submission of a new order form.
   * @param {Event} e The form submission event.
   * @param {'transferencia' | 'pago-movil' | 'recarga-saldo'} type The type of order.
   */
  const handleOrderSubmit = async (e, type) => {
      e.preventDefault();
      const form = e.target;
      const messageElId = form.querySelector('p[id^="user-message-"]').id;

      let orderData = {
          type: type,
          status: 'Pendiente de pago',
          // createdAt will be added on final confirmation
          clientName: form.querySelector('input[id^="name-"]').value,
          cedula: form.querySelector('input[id^="cedula-"]').value.replace(/[^0-9]/g, ''),
          clpAmount: parseFloat(form.querySelector('input[id^="clp-amount-"]').value),
      };
      
      if (isNaN(orderData.clpAmount) || orderData.clpAmount <= 0) {
          showMessage(messageElId, 'El monto en CLP debe ser un número válido y mayor a cero.', false);
          return;
      }

      orderData.vesAmount = orderData.clpAmount * currentExchangeRate;

      let detailsHtml = `
        <p><span class="font-semibold">Nombre:</span> ${orderData.clientName}</p>
        <p><span class="font-semibold">Cédula:</span> ${orderData.cedula}</p>
      `;

      // Add type-specific fields
      if (type === 'transferencia') {
          orderData.bank = form.querySelector('#bank-transferencia').value;
          orderData.accountType = form.querySelector('#account-type-transferencia').value;
          orderData.accountNumber = form.querySelector('#account-number-transferencia').value;
          detailsHtml += `
            <p><span class="font-semibold">Banco:</span> ${orderData.bank}</p>
            <p><span class="font-semibold">Tipo Cuenta:</span> ${orderData.accountType}</p>
            <p><span class="font-semibold">Nro. Cuenta:</span> ${orderData.accountNumber}</p>
          `;
      } else if (type === 'pago-movil') {
          orderData.phone = form.querySelector('#phone-pm').value;
          orderData.bank = form.querySelector('#bank-pm').value;
          detailsHtml += `
            <p><span class="font-semibold">Teléfono:</span> ${orderData.phone}</p>
            <p><span class="font-semibold">Banco:</span> ${orderData.bank}</p>
          `;
      } else if (type === 'recarga-saldo') {
          orderData.phone = form.querySelector('#phone-rs').value;
          detailsHtml += `<p><span class="font-semibold">Teléfono:</span> ${orderData.phone}</p>`;
      }

      detailsHtml += `
        <div class="border-t mt-4 pt-4">
            <p><span class="font-semibold">Monto CLP:</span> ${orderData.clpAmount.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'})}</p>
            <p><span class="font-semibold">Monto a Recibir (VES):</span> ${orderData.vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      `;

      // Store data and show modal
      orderDataToConfirm = { data: orderData, form: form };
      orderConfirmDetails.innerHTML = detailsHtml;
      orderConfirmModal.classList.remove('hidden');
      orderConfirmModal.classList.add('flex');
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
              attachAccountsListener();
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
              isInitialOrdersLoad = true; // Reset flag

              if (balanceHistoryListener) {
                  balanceHistoryListener();
                  balanceHistoryListener = null;
              }
              if (accountsListener) {
                  accountsListener();
                  accountsListener = null;
              }

              // Clear client list on demo logout
              fullClientList = [];
              updateClientView();
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
  const openBalanceOperationModal = (type) => {
      const amount = parseFloat(balanceAmountInput.value);
      const message = type === 'add' ? 'Ingresa un monto válido para cargar.' : 'Ingresa un monto válido para restar.';
      if (isNaN(amount) || amount <= 0) {
          showMessage('balance-message', message, false);
          return;
      }

      balanceOperationData = { amount, type };
      
      // Configure and show the first modal
      balanceOpTitle.textContent = type === 'add' ? 'Cargar Saldo' : 'Restar Saldo';
      balanceOpNoteInput.value = ''; // Clear previous note
      // The bank and holder selection is always needed to identify the account
      balanceOpBankSection.style.display = 'block';
      
      balanceOperationModal.classList.remove('hidden');
      balanceOperationModal.classList.add('flex');
  };

  addBalanceBtn.addEventListener('click', () => openBalanceOperationModal('add'));
  subtractBalanceBtn.addEventListener('click', () => openBalanceOperationModal('subtract'));

  // Listener for the first modal's "Next" button
  balanceOpConfirmBtn.addEventListener('click', () => {
      // Collect data from the first modal
      balanceOperationData.holder = balanceOpHolderSelect.value;
      balanceOperationData.note = balanceOpNoteInput.value.trim();
      balanceOperationData.bank = balanceOpBankSelect.value; // Always get the bank

      // Build confirmation details
      const { type, amount, bank, holder, note } = balanceOperationData;
      const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const operationText = type === 'add' ? 'Cargar' : 'Restar';

      let detailsHtml = `
          <p><span class="font-semibold">Operación:</span> ${operationText}</p>
          <p><span class="font-semibold">Monto:</span> ${formattedAmount} VES</p>
          <p><span class="font-semibold">Titular:</span> ${holder}</p>
      `;
      if (bank) {
          detailsHtml += `<p><span class="font-semibold">Banco:</span> ${bank}</p>`;
      }
      if (note) {
          detailsHtml += `<p><span class="font-semibold">Nota:</span> ${note}</p>`;
      }

      balanceConfirmDetails.innerHTML = detailsHtml;
      balanceConfirmTitle.textContent = `Confirmar ${operationText} de Saldo`;

      // Show confirmation modal
      balanceOperationModal.classList.add('hidden');
      balanceOperationModal.classList.remove('flex');
      balanceConfirmModal.classList.remove('hidden');
      balanceConfirmModal.classList.add('flex');
  });

  // Listener for the final confirmation button
  balanceFinalConfirmBtn.addEventListener('click', async () => {
      const { type, amount, bank, holder, note } = balanceOperationData;

      if (!bank || !holder) {
          showMessage('balance-message', 'Error: El titular y el banco son obligatorios.', false);
          balanceConfirmModal.classList.add('hidden');
          balanceConfirmModal.classList.remove('flex');
          balanceOperationData = {};
          return;
      }

      // Generate a deterministic ID for the account document
      const accountId = `${holder.toUpperCase().replace(/ /g, '_')}_${bank.toUpperCase().replace(/ /g, '_')}`;
      const accountRef = db.collection('accounts').doc(accountId);
      const balanceHistoryRef = db.collection('balance_history').doc();
      const batch = db.batch();

      const historyData = {
          amount: amount,
          type: type,
          holder: holder,
          bank: bank, // Always include bank and holder to identify the account
          note: note,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      const increment = type === 'add' ? amount : -amount;
      batch.set(balanceHistoryRef, historyData);
      
      // Increment the specific account's balance
      batch.set(accountRef, { 
          holder: holder,
          bank: bank,
          balance: firebase.firestore.FieldValue.increment(increment) 
      }, { merge: true });

      try {
          await batch.commit();
          const successMessage = type === 'add' 
              ? `Se cargaron ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES exitosamente.`
              : `Se restaron ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES exitosamente.`;
          showMessage('balance-message', successMessage, true);
          balanceAmountInput.value = '';
      } catch (error) {
          console.error("Error al procesar operación de saldo: ", error);
          showMessage('balance-message', `Error: ${error.message}`, false);
      } finally {
          // Hide all modals and reset state
          balanceConfirmModal.classList.add('hidden');
          balanceConfirmModal.classList.remove('flex');
          balanceOperationData = {};
      }
  });

  // Cancel buttons
  balanceOpCancelBtn.addEventListener('click', () => {
      balanceOperationModal.classList.add('hidden');
      balanceOperationModal.classList.remove('flex');
      balanceOperationData = {};
  });

  balanceFinalCancelBtn.addEventListener('click', () => {
      // Go back to the previous modal
      balanceConfirmModal.classList.add('hidden');
      balanceConfirmModal.classList.remove('flex');
      balanceOperationModal.classList.remove('hidden');
      balanceOperationModal.classList.add('flex');
  });

  // --- Initial App Setup ---
  // onAuthStateChanged handles the initial view, but we can set a default
  // while waiting for the auth state.
  switchMainView('user');
  switchTab(tabs[0]); // Set default tab
  populateBankSelects(); // Populate all bank dropdowns

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
          // NEW: Open modal to select payment source
          openPaymentSourceModal(orderId);

      } else if (target.classList.contains('cancel-order-btn')) {
          // Logic for canceling an order
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

  // Add listener for debtor toggle button on the paid list
  ordersListPaid.addEventListener('click', async (e) => {
      const debtorToggleBtn = e.target.closest('.debtor-toggle-btn');
      if (!debtorToggleBtn) return;

      const orderId = debtorToggleBtn.dataset.id;
      const currentIsDebtor = debtorToggleBtn.dataset.isDebtor === 'true';
      const newIsDebtor = !currentIsDebtor;

      debtorToggleBtn.disabled = true; // Prevent double clicks

      try {
          await db.collection('orders').doc(orderId).update({ isDebtor: newIsDebtor });
          showMessage('rate-message', 'Estado de deudor actualizado.', true);
          // The onSnapshot listener will re-render the UI, so no need to manually update the button
      } catch (error) {
          console.error("Error updating debtor status:", error);
          showMessage('rate-message', `Error al actualizar: ${error.message}`, false);
          debtorToggleBtn.disabled = false; // Re-enable on error
      }
  });

  /**
   * Calculates the fee for a given order and source account.
   * @param {object} order - The order data.
   * @param {object} sourceAccount - The source account data.
   * @returns {number} The calculated fee.
   */
  const calculateFee = (order, sourceAccount) => {
      const amount = order.vesAmount;
      switch (order.type) {
          case 'pago-movil':
              if (amount > 47) return amount * 0.003; // 0.3%
              if (amount > 46) return 0.13;
              return 0;
          case 'transferencia':
              // Check for inter-bank transfer
              if (sourceAccount.bank !== order.bank) {
                  return amount * 0.003; // 0.3%
              }
              return 0;
          case 'recarga-saldo':
          default:
              return 0;
      }
  };

  /** Opens the modal to select the payment source account. */
  const openPaymentSourceModal = async (orderId) => {
      try {
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');

          const orderDoc = await db.collection('orders').doc(orderId).get();
          if (!orderDoc.exists) throw new Error("El pedido no existe.");

          const orderData = orderDoc.data();
          paymentData = { orderId, orderData }; // Store initial data

          // Display order details in the modal
          paymentSourceOrderDetails.innerHTML = `<p><b>Cliente:</b> ${orderData.clientName}</p><p><b>Monto a Pagar:</b> ${orderData.vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</p>`;

          // Render account options
          renderPaymentSourceList();

          // Reset modal state
          paymentFeeDetails.classList.add('hidden');
          paymentSourceNextBtn.disabled = true;

          selectPaymentSourceModal.classList.remove('hidden');
          selectPaymentSourceModal.classList.add('flex');

      } catch (error) {
          console.error("Error al abrir modal de pago:", error);
          showCustomAlert(`Error: ${error.message}`);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  // Listener for account selection in the payment modal
  paymentSourceList.addEventListener('change', (e) => {
      if (e.target.name === 'payment-source') {
          const selectedAccountId = e.target.value;
          const selectedAccount = accountsData.find(acc => acc.id === selectedAccountId);
          
          if (selectedAccount) {
              const fee = calculateFee(paymentData.orderData, selectedAccount);
              paymentData.selectedAccountId = selectedAccountId;
              paymentData.fee = fee;

              paymentFeeDetails.innerHTML = `Comisión calculada: <b>${fee.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</b>. Total a descontar: <b>${(paymentData.orderData.vesAmount + fee).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</b>.`;
              paymentFeeDetails.classList.remove('hidden');
              paymentSourceNextBtn.disabled = false;
          }
      }
  });

  // Listeners for the payment source modal buttons
  paymentSourceNextBtn.addEventListener('click', () => {
      selectPaymentSourceModal.classList.add('hidden');
      selectPaymentSourceModal.classList.remove('flex');
      
      // Open the next modal (screenshot upload)
      showMessage('admin-upload-message', '', true);
      adminScreenshotInput.value = ''; // Clear previous file selection
      adminUploadModal.classList.remove('hidden');
      adminUploadModal.classList.add('flex');
  });

  paymentSourceCancelBtn.addEventListener('click', () => {
      selectPaymentSourceModal.classList.add('hidden');
      selectPaymentSourceModal.classList.remove('flex');
      paymentData = {}; // Clear payment state
  });

  // Admin Modal: Cancel Upload
  adminCancelUploadBtn.addEventListener('click', () => {
      adminUploadModal.classList.add('hidden');
      adminUploadModal.classList.remove('flex');
      paymentData = {}; // Clear payment state
  });

  // Admin Modal: Confirm Payment and Upload
  adminUploadBtn.addEventListener('click', async () => {
      if (!paymentData.orderId || !paymentData.selectedAccountId) {
          return showMessage('admin-upload-message', 'Error: No se ha seleccionado ningún pedido o cuenta de origen.', false);
      }

      const file = adminScreenshotInput.files[0];
      if (!file) {
          return showMessage('admin-upload-message', 'Por favor, selecciona el archivo del comprobante.', false);
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      showMessage('admin-upload-message', 'Subiendo comprobante...', true);

      const { orderId, orderData, selectedAccountId, fee } = paymentData;

      try {
          const selectedAccount = accountsData.find(acc => acc.id === selectedAccountId);
          if (!selectedAccount) {
              throw new Error("La cuenta de origen seleccionada ya no es válida. Por favor, cancela y vuelve a intentarlo.");
          }

          // 1. Upload file to Storage
          const filePath = `proofs/${orderId}/${file.name}`;
          const fileRef = storage.ref(filePath);
          const uploadTask = await fileRef.put(file);
          const proofUrl = await uploadTask.ref.getDownloadURL();

          // 2. Prepare batch write
          const orderRef = db.collection('orders').doc(orderId);
          const accountRef = db.collection('accounts').doc(selectedAccountId);
          const paymentHistoryRef = db.collection('balance_history').doc();
          const feeHistoryRef = db.collection('balance_history').doc();
          const batch = db.batch();

          // Update order
          batch.update(orderRef, { status: 'Pagado', proofUrl: proofUrl });
          // Decrement account balance (using set with merge for robustness)
          batch.set(accountRef, { balance: firebase.firestore.FieldValue.increment(-(orderData.vesAmount + fee)) }, { merge: true });
          // Create history for payment
          batch.set(paymentHistoryRef, { 
              amount: orderData.vesAmount, 
              type: 'subtract', 
              note: `Pago pedido ${orderId.substring(0, 5)}`, 
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              holder: selectedAccount.holder,
              bank: selectedAccount.bank
          });
          // Create history for fee if it exists
          if (fee > 0) {
              batch.set(feeHistoryRef, { 
                  amount: fee, 
                  type: 'fee', 
                  note: `Comisión pedido ${orderId.substring(0, 5)}`, 
                  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                  holder: selectedAccount.holder,
                  bank: selectedAccount.bank
              });
          }

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
              ? allOrders.filter(o => o.status !== 'Cliente Registrado')
              : allOrders.filter(order => order.status === statusFilter && order.status !== 'Cliente Registrado');


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
              historicalSearchSummary.textContent = `Se encontraron ${filteredOrders.length} pedidos. Total Pagado: ${totalCLP.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'})} / ${totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES.`;
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

  // --- Balance History Logic (New) ---

  const fetchAndRenderBalanceHistory = async (start, end) => {
      if (!start || !end) {
          balanceHistoryList.innerHTML = '';
          noBalanceHistoryMessage.textContent = 'Selecciona un rango de fechas para ver los movimientos.';
          noBalanceHistoryMessage.classList.remove('hidden');
          balanceHistoryHeader.classList.add('hidden');
          exportBalanceExcelBtn.disabled = true;
          balanceHistoryData = [];
          return;
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      balanceHistoryList.innerHTML = '';
      noBalanceHistoryMessage.classList.add('hidden');
      balanceHistoryHeader.classList.add('hidden');

      try {
          // 1. Get the total current balance from all accounts to calculate running balance
          const totalCurrentBalance = accountsData.reduce((sum, acc) => sum + (acc.balance || 0), 0);

          const query = db.collection('balance_history')
              .where('timestamp', '>=', start)
              .where('timestamp', '<=', end)
              .orderBy('timestamp', 'desc');
          
          const snapshot = await query.get();

          if (snapshot.empty) {
              noBalanceHistoryMessage.textContent = 'No se encontraron movimientos en el rango de fechas seleccionado.';
              noBalanceHistoryMessage.classList.remove('hidden');
              balanceHistoryData = [];
              exportBalanceExcelBtn.disabled = true;
          } else {
              balanceHistoryHeader.classList.remove('hidden');
              
              let runningBalance = totalCurrentBalance;
              const movementsWithBalance = [];

              // 2. Iterate backwards (from newest to oldest) to calculate historical running balances
              snapshot.docs.forEach(doc => {
                  const movement = doc.data();
                  
                  // The balance for this row is the running balance *before* we revert this transaction
                  movementsWithBalance.push({ ...movement, runningBalance });

                  // Update the running balance for the *next* (older) item
                  if (movement.type === 'add') {
                      runningBalance -= movement.amount; // To get the balance before this credit, we subtract it
                  } else { // 'subtract' or 'fee'
                      runningBalance += movement.amount; // To get the balance before this debit, we add it back
                  }
              });

              balanceHistoryData = movementsWithBalance; // Store for export
              balanceHistoryData.forEach(item => {
                  const historyElement = renderBalanceHistoryItem(item);
                  balanceHistoryList.appendChild(historyElement);
              });
              exportBalanceExcelBtn.disabled = false;
          }
      } catch (error) {
          console.error("Error fetching balance history:", error);
          noBalanceHistoryMessage.textContent = 'Error al cargar el historial.';
          noBalanceHistoryMessage.classList.remove('hidden');
          balanceHistoryData = [];
          exportBalanceExcelBtn.disabled = true;
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  balanceHistoryTodayBtn.addEventListener('click', () => {
      const today = new Date();
      balanceHistoryStartInput.valueAsDate = today;
      balanceHistoryEndInput.valueAsDate = today;
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistoryYesterdayBtn.addEventListener('click', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      balanceHistoryStartInput.valueAsDate = yesterday;
      balanceHistoryEndInput.valueAsDate = yesterday;
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistory7DaysBtn.addEventListener('click', () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      balanceHistoryStartInput.valueAsDate = start;
      balanceHistoryEndInput.valueAsDate = end;
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistorySearchBtn.addEventListener('click', () => {
      const startDateVal = balanceHistoryStartInput.valueAsDate;
      const endDateVal = balanceHistoryEndInput.valueAsDate;

      if (!startDateVal || !endDateVal) {
          showCustomAlert('Por favor, selecciona un rango de fechas para buscar.');
          return;
      }

      const start = new Date(startDateVal);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDateVal);
      end.setHours(23, 59, 59, 999);

      fetchAndRenderBalanceHistory(start, end);
  });

  const exportBalanceHistoryToExcel = () => {
      if (balanceHistoryData.length === 0) {
          showCustomAlert('No hay datos para exportar. Realiza una búsqueda primero.');
          return;
      }

      const dataToExport = balanceHistoryData.map(item => {
          let description = item.note || '';
          let debit = '';
          let credit = '';

          if (item.type === 'add') {
              credit = item.amount;
              if (!description) description = `Carga de Saldo: ${item.holder}`;
          } else { // subtract or fee
              debit = item.amount;
              if (!description) description = item.type === 'fee' ? 'Comisión Bancaria' : 'Pago de Pedido';
          }

          return {
              'Fecha': item.timestamp ? item.timestamp.toDate().toLocaleString('es-CL') : 'N/A',
              'Descripción': description,
              'Banco': item.bank || '',
              'Cargo': debit,
              'Abono': credit,
              'Saldo': item.runningBalance
          };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialSaldo');
      const startDate = balanceHistoryStartInput.value;
      const endDate = balanceHistoryEndInput.value;
      XLSX.writeFile(workbook, `Historial_Saldo_${startDate}_a_${endDate}.xlsx`);
  };

  exportBalanceExcelBtn.addEventListener('click', exportBalanceHistoryToExcel);

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
          fullClientList = Array.from(clientsMap.values());
          updateClientView();
      } catch (error) {
          console.error("Error fetching clients:", error);
          clientsList.innerHTML = `<p class="text-red-500">Error al cargar la lista de clientes.</p>`;
          if (error.code === 'failed-precondition') {
              showCustomAlert('Error: La base de datos requiere un índice para la lista de clientes. Por favor, abre la consola (F12) y crea el índice que solicita Firebase.');
          }
      }
  };

  /** Renders the current page of the client list. */
  const renderClientListPage = () => {
      clientsList.innerHTML = '';
      const showPagination = filteredClientList.length > CLIENTS_PER_PAGE;
      clientPaginationControls.classList.toggle('hidden', !showPagination);
      clientPaginationControls.classList.toggle('flex', showPagination);
      if (filteredClientList.length === 0) {
          clientsList.innerHTML = `<p class="text-gray-500">No se encontraron clientes.</p>`;
          clientsCountDisplay.textContent = 0;
          return;
      }

      const totalPages = Math.ceil(filteredClientList.length / CLIENTS_PER_PAGE);
      clientListPage = Math.max(1, Math.min(clientListPage, totalPages)); // Clamp page number

      const start = (clientListPage - 1) * CLIENTS_PER_PAGE;
      const end = start + CLIENTS_PER_PAGE;
      const clientsToRender = filteredClientList.slice(start, end);

      clientsToRender.forEach(client => {
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

      // Update pagination UI
      clientPaginationInfo.textContent = `Página ${clientListPage} de ${totalPages}`;
      clientPaginationPrevBtn.disabled = clientListPage === 1;
      clientPaginationNextBtn.disabled = clientListPage === totalPages;
      clientsCountDisplay.textContent = filteredClientList.length;

      // Update sort button styles
      clientSortNameBtn.classList.toggle('bg-blue-500', clientListSortBy === 'name');
      clientSortNameBtn.classList.toggle('text-white', clientListSortBy === 'name');
      clientSortNameBtn.classList.toggle('bg-gray-200', clientListSortBy !== 'name');

      clientSortCedulaBtn.classList.toggle('bg-blue-500', clientListSortBy === 'cedula');
      clientSortCedulaBtn.classList.toggle('text-white', clientListSortBy === 'cedula');
      clientSortCedulaBtn.classList.toggle('bg-gray-200', clientListSortBy !== 'cedula');
  };

  /** Filters, sorts, and renders the client list. */
  const updateClientView = () => {
      const searchTerm = clientsSearchInput.value.toLowerCase();
      
      // 1. Filter
      if (searchTerm) {
          filteredClientList = fullClientList.filter(client => 
              client.clientName.toLowerCase().includes(searchTerm) || 
              client.cedula.includes(searchTerm)
          );
      } else {
          filteredClientList = [...fullClientList];
      }

      // 2. Sort
      if (clientListSortBy === 'name') {
          filteredClientList.sort((a, b) => a.clientName.localeCompare(b.clientName));
      } else if (clientListSortBy === 'cedula') {
          filteredClientList.sort((a, b) => a.cedula.localeCompare(b.cedula, undefined, { numeric: true }));
      }

      // 3. Render
      renderClientListPage();
  };

  // New event listeners for client list
  clientsSearchInput.addEventListener('input', () => {
      clientListPage = 1;
      updateClientView();
  });

  clientSortNameBtn.addEventListener('click', () => {
      clientListSortBy = 'name';
      clientListPage = 1;
      updateClientView();
  });

  clientSortCedulaBtn.addEventListener('click', () => {
      clientListSortBy = 'cedula';
      clientListPage = 1;
      updateClientView();
  });

  clientPaginationPrevBtn.addEventListener('click', () => {
      if (clientListPage > 1) {
          clientListPage--;
          renderClientListPage();
      }
  });

  clientPaginationNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredClientList.length / CLIENTS_PER_PAGE);
      if (clientListPage < totalPages) {
          clientListPage++;
          renderClientListPage();
      }
  });

  // Add event listeners for order form submissions
  formTransferencia.addEventListener('submit', (e) => handleOrderSubmit(e, 'transferencia'));
  formPagoMovil.addEventListener('submit', (e) => handleOrderSubmit(e, 'pago-movil'));
  formRecargaSaldo.addEventListener('submit', (e) => handleOrderSubmit(e, 'recarga-saldo'));

  // Listeners for the new order confirmation modal
  orderFinalConfirmBtn.addEventListener('click', async () => {
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      orderConfirmModal.classList.add('hidden');
      orderConfirmModal.classList.remove('flex');

      const { data, form } = orderDataToConfirm;
      const messageElId = form.querySelector('p[id^="user-message-"]').id;

      try {
          // Add timestamp just before sending
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

          await db.collection('orders').add(data);
          
          form.reset();
          vesDisplays.forEach(span => span.textContent = '0,00 VES');
          
          if (isAdmin) {
              fetchAndRenderClients();
          }

          showMessage(messageElId, '¡Pedido enviado con éxito!', true);
          
      } catch (error) {
          console.error("Error al crear el pedido:", error);
          showMessage(messageElId, `Error al crear el pedido: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
          orderDataToConfirm = {}; // Clear state
      }
  });

  orderFinalCancelBtn.addEventListener('click', () => {
      orderConfirmModal.classList.add('hidden');
      orderConfirmModal.classList.remove('flex');
      orderDataToConfirm = {}; // Clear state
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

      const cedula = target.dataset.cedula;
      const clientData = fullClientList.find(c => c.cedula === cedula);

      if (!clientData) {
          showCustomAlert('Error: No se encontraron los datos completos del cliente.');
          return;
      }

      let dataToCopy = [];
      let formTypeMessage = '';

      // Build the text to copy based on the last order type
      switch (clientData.type) {
          case 'transferencia':
              dataToCopy = [
                  clientData.clientName || '',
                  clientData.cedula || '',
                  clientData.bank || '',
                  clientData.accountType || '',
                  clientData.accountNumber || '',
                  '' // Leave CLP amount empty
              ];
              formTypeMessage = 'Transferencia';
              break;
          case 'pago-movil':
              dataToCopy = [
                  clientData.clientName || '',
                  clientData.cedula || '',
                  clientData.phone || '',
                  clientData.bank || '',
                  '' // Leave CLP amount empty
              ];
              formTypeMessage = 'Pago Móvil';
              break;
          case 'recarga-saldo':
              dataToCopy = [
                  clientData.clientName || '',
                  clientData.cedula || '',
                  clientData.phone || '',
                  '' // Leave CLP amount empty
              ];
              formTypeMessage = 'Recarga de Saldo';
              break;
          default:
              showCustomAlert('Tipo de pedido anterior desconocido. No se pueden copiar los datos.');
              return;
      }
      
      const textToCopy = dataToCopy.join('\n');

      navigator.clipboard.writeText(textToCopy).then(() => {
          showCustomAlert(`Datos de "${clientData.clientName}" copiados. Pégalos en el formulario de tipo "${formTypeMessage}".`);
      }).catch(err => {
          console.error('Error al copiar datos del cliente:', err);
          showCustomAlert('No se pudo copiar la información.');
      });
  });

  // --- Add Client Modal Logic ---

  addClientBtn.addEventListener('click', () => {
      addClientModal.classList.remove('hidden');
      addClientModal.classList.add('flex');
      addClientMessage.textContent = '';
      [addClientFormTransferencia, addClientFormPagoMovil, addClientFormRecarga].forEach(form => form.reset());
  });

  addClientCloseBtn.addEventListener('click', () => {
      addClientModal.classList.add('hidden');
      addClientModal.classList.remove('flex');
  });

  addClientTabs.forEach(tab => {
      tab.addEventListener('click', () => {
          const formType = tab.dataset.form;
          
          addClientTabs.forEach(t => {
              const isSelected = t === tab;
              t.classList.toggle('bg-white', isSelected);
              t.classList.toggle('text-blue-600', isSelected);
              t.classList.toggle('text-gray-700', !isSelected);
          });

          [addClientFormTransferencia, addClientFormPagoMovil, addClientFormRecarga].forEach(form => {
              form.classList.toggle('hidden', !form.id.includes(formType));
          });
      });
  });

  const handleAddClientSubmit = async (e) => {
      e.preventDefault();
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      showMessage('add-client-message', 'Verificando datos...', true);

      const form = e.target;
      const type = form.querySelector('input[name="type"]').value;
      
      const clientData = {
          type: type,
          status: 'Cliente Registrado',
          clpAmount: 0,
          vesAmount: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (type === 'transferencia') {
          clientData.clientName = form.querySelector('#add-client-name-transferencia').value;
          clientData.cedula = form.querySelector('#add-client-cedula-transferencia').value.replace(/[^0-9]/g, '');
          clientData.bank = form.querySelector('#add-client-bank-transferencia').value;
          clientData.accountType = form.querySelector('#add-client-account-type-transferencia').value;
          clientData.accountNumber = form.querySelector('#add-client-account-number-transferencia').value;
      } else if (type === 'pago-movil') {
          clientData.clientName = form.querySelector('#add-client-name-pm').value;
          clientData.cedula = form.querySelector('#add-client-cedula-pm').value.replace(/[^0-9]/g, '');
          clientData.phone = form.querySelector('#add-client-phone-pm').value;
          clientData.bank = form.querySelector('#add-client-bank-pm').value;
      } else { // recarga
          clientData.clientName = form.querySelector('#add-client-name-recarga').value;
          clientData.cedula = form.querySelector('#add-client-cedula-recarga').value.replace(/[^0-9]/g, '');
          clientData.phone = form.querySelector('#add-client-phone-recarga').value;
      }

      try {
          const existingOrdersQuery = db.collection('orders').where('cedula', '==', clientData.cedula);
          const snapshot = await existingOrdersQuery.get();
          let isDuplicate = false;

          snapshot.forEach(doc => {
              const existingOrder = doc.data();
              if (type === 'transferencia' && existingOrder.type === 'transferencia' && existingOrder.accountNumber === clientData.accountNumber) {
                  isDuplicate = true;
              }
              if ((type === 'pago-movil' || type === 'recarga-saldo') && (existingOrder.type === 'pago-movil' || existingOrder.type === 'recarga-saldo') && existingOrder.phone === clientData.phone) {
                  isDuplicate = true;
              }
          });

          if (isDuplicate) {
              throw new Error('Este método de pago ya existe para este cliente.');
          }

          await db.collection('orders').add(clientData);

          showMessage('add-client-message', '¡Cliente guardado con éxito!', true);
          await fetchAndRenderClients();
          
          setTimeout(() => {
              addClientModal.classList.add('hidden');
              addClientModal.classList.remove('flex');
          }, 1500);

      } catch (error) {
          console.error("Error al guardar cliente:", error);
          showMessage('add-client-message', `Error: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  [addClientFormTransferencia, addClientFormPagoMovil, addClientFormRecarga].forEach(form => {
      form.addEventListener('submit', handleAddClientSubmit);
  });

  // Paste buttons for Add Client Modal
  pasteBtnAddClientTransferencia.addEventListener('click', () => handlePasteData(addClientTransferenciaFields, 'add-client-message'));
  pasteBtnAddClientPm.addEventListener('click', () => handlePasteData(addClientPagoMovilFields, 'add-client-message'));
  pasteBtnAddClientRecarga.addEventListener('click', () => handlePasteData(addClientRecargaFields, 'add-client-message'));

  // Autocomplete for "Add Client" modal
  addClientCedulaInputs.forEach(input => {
      if (input) {
          input.addEventListener('blur', (e) => {
              const cedulaValue = e.target.value.replace(/[^0-9]/g, '');
              // Clear message on every blur, then show if client found
              showMessage('add-client-message', '', true); 
              if (!cedulaValue || fullClientList.length === 0) return;

              const clientLastOrder = fullClientList.find(c => c.cedula === cedulaValue);
              
              if (clientLastOrder) {
                  const form = e.target.closest('form');
                  if (!form) return;

                  // Autocomplete name field
                  const nameInput = form.querySelector('input[id^="add-client-name-"]');
                  if (nameInput) {
                      nameInput.value = clientLastOrder.clientName;
                  }
                  
                  // Show message
                  showMessage('add-client-message', 'Cliente registrado. ¿Deseas agregar otra cuenta?', true);
              }
          });
      }
  });

  // --- Transfer Funds Modal Logic ---
  const transferFromAccountSelect = document.getElementById('transfer-from-account');
  const transferToAccountSelect = document.getElementById('transfer-to-account');
  const transferAmountInput = document.getElementById('transfer-amount');
  const transferFeeDetails = document.getElementById('transfer-fee-details');
  const transferFundsMessage = document.getElementById('transfer-funds-message');

  const populateTransferAccountSelects = () => {
      const optionsHtml = accountsData.map(acc => 
          `<option value="${acc.id}">${acc.holder} - ${acc.bank} (${acc.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})} VES)</option>`
      ).join('');
      transferFromAccountSelect.innerHTML = `<option value="">Seleccione origen...</option>${optionsHtml}`;
      transferToAccountSelect.innerHTML = `<option value="">Seleccione destino...</option>${optionsHtml}`;
  };  
  
  openTransferFundsModalBtn.addEventListener('click', () => {
      populateTransferAccountSelects();
      transferFundsForm.reset();
      transferFeeDetails.classList.add('hidden');
      transferFundsMessage.textContent = '';
      transferFundsModal.classList.remove('hidden');
      transferFundsModal.classList.add('flex');
  });

  transferFundsCloseBtn.addEventListener('click', () => {
      transferFundsModal.classList.add('hidden');
      transferFundsModal.classList.remove('flex');
  });

  const updateTransferForm = () => {
      const fromId = transferFromAccountSelect.value;
      const toId = transferToAccountSelect.value;
      const amount = parseFloat(transferAmountInput.value) || 0;

      Array.from(transferToAccountSelect.options).forEach(opt => {
          opt.disabled = (opt.value === fromId && fromId !== "");
      });

      if (fromId && toId && fromId !== toId && amount > 0) {
          const fromAccount = accountsData.find(acc => acc.id === fromId);
          const toAccount = accountsData.find(acc => acc.id === toId);
          if (fromAccount && toAccount) {
              const fee = (fromAccount.bank !== toAccount.bank) ? amount * 0.003 : 0;
              const totalDebit = amount + fee;
              transferFeeDetails.innerHTML = `Comisión por transferencia interbancaria: <b>${fee.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</b>. Total a debitar: <b>${totalDebit.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</b>.`;
              transferFeeDetails.classList.remove('hidden');
          }
      } else {
          transferFeeDetails.classList.add('hidden');
      }
  };

  transferFromAccountSelect.addEventListener('change', updateTransferForm);
  transferToAccountSelect.addEventListener('change', updateTransferForm);
  transferAmountInput.addEventListener('input', updateTransferForm);

  transferFundsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      showMessage('transfer-funds-message', 'Procesando transferencia...', true);

      const fromAccountId = transferFromAccountSelect.value;
      const toAccountId = transferToAccountSelect.value;
      const amount = parseFloat(transferAmountInput.value);

      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
          showMessage('transfer-funds-message', 'Debe seleccionar cuentas de origen y destino diferentes.', false);
          loadingSpinner.classList.add('hidden'); return;
      }
      if (isNaN(amount) || amount <= 0) {
          showMessage('transfer-funds-message', 'El monto debe ser un número positivo.', false);
          loadingSpinner.classList.add('hidden'); return;
      }

      const fromAccount = accountsData.find(acc => acc.id === fromAccountId);
      const toAccount = accountsData.find(acc => acc.id === toAccountId);
      const fee = (fromAccount.bank !== toAccount.bank) ? amount * 0.003 : 0;
      const totalDebit = amount + fee;

      if (fromAccount.balance < totalDebit) {
          showMessage('transfer-funds-message', 'Saldo insuficiente en la cuenta de origen para cubrir el monto y la comisión.', false);
          loadingSpinner.classList.add('hidden'); return;
      }

      try {
          const fromAccountRef = db.collection('accounts').doc(fromAccountId);
          const toAccountRef = db.collection('accounts').doc(toAccountId);
          const batch = db.batch();
          const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

          batch.update(fromAccountRef, { balance: firebase.firestore.FieldValue.increment(-totalDebit) });
          batch.update(toAccountRef, { balance: firebase.firestore.FieldValue.increment(amount) });
          batch.set(db.collection('balance_history').doc(), { amount, type: 'subtract', note: `Transferencia a ${toAccount.holder}`, timestamp: serverTimestamp, holder: fromAccount.holder, bank: fromAccount.bank });
          if (fee > 0) batch.set(db.collection('balance_history').doc(), { amount: fee, type: 'fee', note: `Comisión por transferencia interna`, timestamp: serverTimestamp, holder: fromAccount.holder, bank: fromAccount.bank });
          batch.set(db.collection('balance_history').doc(), { amount, type: 'add', note: `Transferencia desde ${fromAccount.holder}`, timestamp: serverTimestamp, holder: toAccount.holder, bank: toAccount.bank });

          await batch.commit();
          // The accountsListener will automatically refresh the payment modal.
          // We just need to close this transfer modal.
          transferFundsCloseBtn.click();
      } catch (error) {
          console.error("Error en transferencia de fondos:", error);
          showMessage('transfer-funds-message', `Error: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  });
});
