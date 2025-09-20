﻿﻿﻿﻿﻿﻿﻿// Demo/hosting detection
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
let isAdmin = false;
let exchangeRates = {}; // Replaces currentExchangeRate
let ordersListener = null; // To hold the unsubscribe function for the orders listener.
let userOrdersListener = null; // To hold the listener for the user's own orders.
let userOwnOrders = []; // To hold the user's own orders for autocomplete.
let accountsListener = null; // To hold the listener for the accounts collection.
let paymentData = {}; // To store all data related to a payment process
let isInitialOrdersLoad = true; // To prevent notification sound on first load
let userSelectedCountry = 'VE'; // Default country for the user forms
let adminSelectedCountry = 'VE'; // Default country for the admin panel
let isStoreOpen = true; // Default to open, will be updated from DB

// --- Constants ---
const venezuelanBanks = [
    "100% Banco", "Activo", "Agrícola de Venezuela", "Bancamiga", "Bancaribe", "Bancrecer", "Banesco", "Bangente", "Banplus", "BFC (Banco Fondo Común)", "Bicentenario", "BNC (Banco Nacional de Crédito)", "Caroní", "DelSur", "Exterior", "Internacional de Desarrollo", "Mercantil", "Mi Banco", "N58 Banco Digital", "Plaza", "Provincial", "Sofitasa", "Tesoro", "Venezolano de Crédito", "Venezuela", "BANFANB"
].sort();

const colombianBanks = [
    "ALIANZA FIDUCIARIA", "BANCAMIA S.A", "BANCO AGRARIO", "BANCO AV VILLAS", "BANCO BBVA COLOMBIA S.A", "BANCO CAJA SOCIAL", "BANCO COOPERATIVO COOPCENTRAL", "BANCO CREDIFINANCIERA", "BANCO DAVIVIENDA", "BANCO DE BOGOTA", "BANCO DE OCCIDENTE", "BANCO FALABELLA", "BANCO FINANDINA S.A. BIC", "BANCO GNB SUDAMERIS", "BANCO ITAU", "BANCO MUNDO MUJER S.A.", "BANCO PICHINCHA S.A", "BANCO POPULAR", "BANCO PROCREDIT", "BANCO SANTANDER COLOMBIA", "BANCO SERFINANZA", "BANCO UNION antes GIROS", "BANCOLOMBIA", "BANCOOMEVA S.A.", "CFA COOPERATIVA FINANCIERA", "CITIBANK", "COLTEFINANCIERA", "CONFIAR COOPERATIVA FINANCIERA", "COOFINEP COOPERATIVA FINANCIERA", "COTRAFA", "CREZCAMOS S.A. COMPAÑÍA DE FINANCIAMIENTO", "DALE", "DAVIPLATA", "IRIS", "JFK COOPERATIVA FINANCIERA", "JP MORGAN", "LULO BANK", "MOVII S.A.", "NEQUI", "NU. COLOMBIA COMPAÑIA DE FINANCIAMIENTO S.A.", "RAPPIPAY", "RAPPIPAY DAVIPLATA", "SCOTIABANK COLPATRIA", "UALÁ"
].sort();

const peruvianBanks = [
    "Banco BanBif", "Banco de Crédito del Perú", "Banco de la Nación", "Banco Falabella", "Banco GNB", "Banco Pichincha", "Banco Ripley", "Banco Santander", "Bancom", "Bank of China", "BBVA", "BCI Perú", "Citibank", "COFIDE", "ICBC", "Interbank", "Mibanco", "Scotiabank"
].sort();

const currencyFlags = {
    VES: '🇻🇪',
    COP: '🇨🇴',
    PEN: '🇵🇪',
    ARS: '🇦🇷',
    USD: '🇺🇸',
    EUR: '🇪🇺'
};

const supportedCountries = {
    VES: { name: 'Venezuela', flag: '🇻🇪' },
    COP: { name: 'Colombia', flag: '🇨🇴' },
    PEN: { name: 'Perú', flag: '🇵🇪' },
    ARS: { name: 'Argentina', flag: '🇦🇷' },
    USD: { name: 'EE.UU.', flag: '🇺🇸' },
    EUR: { name: 'Europa', flag: '🇪🇺' },
};

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
    
    messageEl.innerHTML = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    closeBtn.onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
}

/**
 * Shows a toast notification at the bottom-right of the screen.
 * @param {string} message The message to display in the toast.
 */
function showToastNotification(message) {
    const toast = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;

    // Show the toast
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    // Hide it after 5 seconds
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 5000);
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
  const rateCurrencySelect = document.getElementById('rate-currency-select'); // NEW
  const userIdDisplay = document.getElementById('user-id-display');
  const tickerContent = document.getElementById('ticker-content'); // NEW
  const mainActionBtn = document.getElementById('main-action-btn');
  const userCountrySelector = document.getElementById('user-country-selector');
  const adminCountrySelector = document.getElementById('admin-country-selector');
  const loadingSpinner = document.getElementById('loading-spinner');

  // Customer Auth Modal Elements
  const customerAuthModal = document.getElementById('customer-auth-modal');
  const customerAuthCloseBtn = document.getElementById('customer-auth-close-btn');
  const customerAuthTabs = document.querySelectorAll('.customer-auth-tab');
  const customerLoginForm = document.getElementById('customer-login-form');
  const customerRegisterForm = document.getElementById('customer-register-form');
  const forgotPasswordLink = document.getElementById('forgot-password-link');

  // Store Status Elements (New)
  const storeStatusIndicator = document.getElementById('store-status-indicator');
  const openStoreBtn = document.getElementById('open-store-btn');
  const closeStoreBtn = document.getElementById('close-store-btn');
  const storeStatusMessage = document.getElementById('store-status-message');
  const storeClosedMessage = document.getElementById('store-closed-message');

  // Notification Elements
  const notificationsSection = document.getElementById('notifications-section');
  const enableNotificationsBtn = document.getElementById('enable-notifications-btn');

  // Order Submission & Modal Elements
  const formTransferencia = document.getElementById('remittance-form-transferencia');
  const formPagoMovil = document.getElementById('remittance-form-pago-movil');
  const formRecargaSaldo = document.getElementById('remittance-form-recarga-saldo');
  const orderConfirmModal = document.getElementById('order-confirm-modal');
  const orderConfirmDetails = document.getElementById('order-confirm-details');
  const orderFinalConfirmBtn = document.getElementById('order-final-confirm-btn');
  const orderFinalCancelBtn = document.getElementById('order-final-cancel-btn');

  // User Order History Elements
  const userOrdersSection = document.getElementById('user-orders-section');
  const userOrdersList = document.getElementById('user-orders-list');
  const noUserOrdersMessage = document.getElementById('no-user-orders-message');

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
  const destinationAmountDisplays = [
      document.getElementById('destination-amount-transferencia'),
      document.getElementById('destination-amount-pm'),
      document.getElementById('destination-amount-rs')
  ];
  const destinationCurrencyLabels = [
      document.getElementById('destination-currency-label-transferencia'),
      document.getElementById('destination-currency-label-pm'),
      document.getElementById('destination-currency-label-rs')
  ];

  // Balance Management Elements
  const bankDetailsTransferencia = document.getElementById('bank-details-transferencia');
  const docTypeTransferencia = document.getElementById('doc-type-transferencia');
  const docNumberLabelTransferencia = document.getElementById('doc-number-label-transferencia');
  const bankPmDiv = document.getElementById('bank-pm').closest('div');


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
  const chileTimeZone = 'America/Santiago';

  /**
   * Formats a Date object into a string using the Chilean timezone.
   * @param {Date} date The date to format.
   * @param {object} options Intl.DateTimeFormat options.
   * @returns {string} The formatted date string.
   */
  const formatInChileanTime = (date, options) => {
      if (!date) return 'N/A';
      return date.toLocaleString('es-CL', { timeZone: chileTimeZone, ...options });
  };

  /**
   * Gets a Date object representing a specific date in Chile, adjusted for UTC to be used in date pickers.
   * This avoids timezone issues where "today" might be "yesterday" or "tomorrow" for the user.
   * @param {Date} date The date to convert.
   * @returns {Date} A Date object set to midnight UTC for the given date in Chile.
   */
  const getChileanDateForPicker = (date) => {
      // Get the date string (YYYY-MM-DD) for the given date in Chile's timezone.
      const dateStringInChile = date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      // Creating a new Date from 'YYYY-MM-DD' string gives a Date object at UTC midnight for that day.
      return new Date(dateStringInChile);
  };
  const populateBankSelects = () => {
      const bankSelects = document.querySelectorAll('.bank-select');
      const optionsHtml = venezuelanBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      
      bankSelects.forEach(select => {
          select.innerHTML = `<option value="">Seleccione un banco...</option>${optionsHtml}`;
      });
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

  /** Fetches all orders to build a unique client list with their latest data. */
  const fetchAndRenderClients = async () => {
      try {
          // Order by createdAt to ensure we can get the latest data for each client.
          const snapshot = await db.collection('orders')
              .where('country', '==', adminSelectedCountry)
              .orderBy('createdAt', 'desc')
              .get();
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

  /** Renders the country selector tabs in the admin panel. */
  const renderAdminCountrySelector = () => {
      adminCountrySelector.innerHTML = '';
      Object.entries(supportedCountries).forEach(([code, { name, flag }]) => {
          const isActive = code === adminSelectedCountry;
          const button = document.createElement('button');
          button.dataset.country = code;
          button.className = `country-tab-btn flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors shadow-sm ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`;
          button.innerHTML = `${flag} <span>${name}</span>`;
          adminCountrySelector.appendChild(button);
      });
  };

  /** Renders the country selector tabs in the user panel. */
  const renderUserCountrySelector = () => {
      if (!userCountrySelector) return;

      userCountrySelector.innerHTML = '';
      const availableCountries = Object.entries(supportedCountries).filter(([code, _]) => exchangeRates[code] > 0);

      // If there are multiple countries, show the selector tabs
      if (availableCountries.length > 1) {
          userCountrySelector.classList.remove('hidden');

          // Check if the currently selected country is still available. If not, default to the first available one.
          const isSelectedCountryAvailable = availableCountries.some(([code, _]) => code === userSelectedCountry);
          if (!isSelectedCountryAvailable) {
              userSelectedCountry = availableCountries[0][0]; // Default to the first in the list
          }

          availableCountries.forEach(([code, { name, flag }]) => {
              const isActive = code === userSelectedCountry;
              const button = document.createElement('button');
              button.dataset.country = code;
              button.className = `country-tab-btn flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors shadow-sm ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`;
              button.innerHTML = `${flag} <span>${name}</span>`;
              userCountrySelector.appendChild(button);
          });
      } else {
          // Otherwise, hide the selector.
          userCountrySelector.classList.add('hidden');
          // And if there's only one country, make sure it's the selected one.
          if (availableCountries.length === 1) {
              const singleCountryCode = availableCountries[0][0];
              if (userSelectedCountry !== singleCountryCode) {
                  userSelectedCountry = singleCountryCode;
              }
          }
      }
  };

  // --- UI Control Logic (The Definitive Solution) ---

  /**
   * Renders the exchange rate ticker.
   */
  const renderExchangeRateTicker = () => {
      if (!tickerContent) return;

      const availableRates = Object.entries(exchangeRates)
          .filter(([currency, rate]) => rate > 0);

      let ratesPartHtml = '';
      if (availableRates.length === 0) {
          ratesPartHtml = '<span>No hay tasas de cambio disponibles.</span>';
      } else {
          ratesPartHtml = availableRates
              .map(([currency, rate]) => {
                  const flag = currencyFlags[currency] || '🏳️';
                  let formattedRate;
                  if (currency === 'PEN') {
                      // Special case for PEN to show 5 decimal places
                      formattedRate = rate.toLocaleString('es-CL', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
                  } else {
                      formattedRate = rate.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                  }
                  return `<span class="flex items-center gap-2">${flag} 1 CLP = ${formattedRate} ${currency}</span>`;
              })
              .join('');
      }
      
      const birthdayMessage = '<span class="font-bold text-purple-700">🎂🥳 Feliz Cumpleaños!!! Jefecito Nestor!! 🎁🎉</span>';
      const fullTickerHtml = birthdayMessage + ratesPartHtml;
      // Duplicate the content for a smooth, continuous loop
      tickerContent.innerHTML = fullTickerHtml + fullTickerHtml;
  };

  /**
   * Calculates and updates the VES amount display based on CLP input.
   * @param {HTMLInputElement} clpInput The input element for CLP amount.
   * @param {HTMLSpanElement} vesDisplay The span element to display the VES amount.
   */
  const updateDestinationAmount = (clpInput, display) => {
      const clpAmount = parseFloat(clpInput.value);
      const rate = exchangeRates[userSelectedCountry] || 0;
      const currencyCode = userSelectedCountry;

      if (!isNaN(clpAmount) && rate > 0) {
          const destAmount = clpAmount * rate;
          display.textContent = `${destAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
      } else {
          display.textContent = `0,00 ${currencyCode}`;
      }
  };

  /** Updates the user forms based on the selected country. */
  const updateUserFormsForCountry = () => {
      const isVenezuela = userSelectedCountry === 'VES';
      const isColombia = userSelectedCountry === 'COP';
      const isPeru = userSelectedCountry === 'PEN';
      const currencyName = supportedCountries[userSelectedCountry]?.name.replace('EE.UU.', 'Dólares').replace('Europa', 'Euros') || userSelectedCountry;

      // Toggle tabs
      const pagoMovilTab = document.getElementById('tab-pago-movil');
      const recargaSaldoTab = document.getElementById('tab-recarga-saldo');
      pagoMovilTab.style.display = isVenezuela ? 'block' : 'none';
      recargaSaldoTab.style.display = isVenezuela ? 'block' : 'none';

      // If a non-VE country is selected, check if one of the now-hidden tabs was active.
      if (!isVenezuela) {
          const activeTab = tabs.find(tab => tab.classList.contains('bg-white'));
          // If the active tab is one of the ones we just hid, switch to the 'transferencia' tab.
          if (activeTab && (activeTab.id === 'tab-pago-movil' || activeTab.id === 'tab-recarga-saldo')) {
              switchTab(document.getElementById('tab-transferencia'));
          }
      }

      // Toggle VE-specific fields
      bankDetailsTransferencia.style.display = (isVenezuela || isColombia || isPeru) ? 'contents' : 'none';
      docTypeTransferencia.classList.toggle('hidden', !(isColombia || isPeru));
      docNumberLabelTransferencia.textContent = (isColombia || isPeru) ? 'Número de Documento' : 'Cédula';

      // Dynamically update doc type options
      const docTypeSelect = document.getElementById('doc-type-transferencia');
      if (isPeru) {
          docTypeSelect.innerHTML = `
              <option value="DNI">DNI</option>
              <option value="PSP">Pasaporte (PSP)</option>
          `;
      } else if (isColombia) {
          docTypeSelect.innerHTML = `
              <option value="CC">Cédula de Ciudadanía (CC)</option>
              <option value="PPT">Permiso por Protección Temporal (PPT)</option>
          `;
      }

      const bankSelect = document.getElementById('bank-transferencia');
      bankSelect.required = (isVenezuela || isColombia || isPeru);

      let bankOptions = '';
      if (isVenezuela) {
          bankOptions = venezuelanBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      } else if (isColombia) {
          bankOptions = colombianBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      } else if (isPeru) {
          bankOptions = peruvianBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      }
      bankSelect.innerHTML = `<option value="">Seleccione un banco...</option>${bankOptions}`;

      bankPmDiv.style.display = isVenezuela ? 'block' : 'none';

      // Update labels and trigger amount recalculation
      destinationCurrencyLabels.forEach(label => {
          if (label) label.textContent = `Monto a recibir en ${currencyName}:`;
      });
      clpInputs.forEach((input, index) => updateDestinationAmount(input, destinationAmountDisplays[index]));
  };

  /**
   * Centralized function to control the admin section's visibility using only CSS classes.
   * @param {'login' | 'panel' | 'hidden'} state The desired state.
   */
  const renderAdminViewState = (state) => {
    // Control the main admin container
    adminInterface.classList.toggle('hidden', state === 'hidden');

    // Control the children (login form vs. admin panel)
    adminLogin.classList.toggle('hidden', state !== 'login');
    adminPanel.classList.toggle('hidden', state !== 'panel');
  };

  /** Shows or hides the user form and closed message based on store status. */
  const updateStoreStatusView = () => {
      // Update the admin toggle switch UI
      if (storeStatusIndicator) {
          storeStatusIndicator.textContent = isStoreOpen ? 'Abierta' : 'Cerrada';
          storeStatusIndicator.classList.toggle('bg-green-200', isStoreOpen);
          storeStatusIndicator.classList.toggle('text-green-800', isStoreOpen);
          storeStatusIndicator.classList.toggle('bg-red-200', !isStoreOpen);
          storeStatusIndicator.classList.toggle('text-red-800', !isStoreOpen);
          
          openStoreBtn.classList.toggle('hidden', isStoreOpen);
          closeStoreBtn.classList.toggle('hidden', !isStoreOpen);
      }

      // Update the user view
      const isUserLoggedIn = currentUser && !isAdmin;

      if (isStoreOpen) {
          storeClosedMessage.classList.add('hidden');
          mainActionBtn.disabled = false;
          mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          userInterface.classList.toggle('hidden', !isUserLoggedIn);
      } else {
          storeClosedMessage.classList.remove('hidden');
          mainActionBtn.disabled = true;
          mainActionBtn.classList.add('opacity-50', 'cursor-not-allowed');
          userInterface.classList.add('hidden');
      }
  };

  /** Manages the visibility of the main application interfaces (User vs Admin). */
  const switchMainView = (view) => {
      const isUserView = view === 'user';

      // Show user interface if a user (any user, admin or not) is logged in.
      userInterface.classList.toggle('hidden', !currentUser);
      if (isUserView) {
          renderAdminViewState('hidden');
      } else {
          renderAdminViewState(isAdmin ? 'panel' : 'login'); // Si es vista admin, mostrar panel o login según el estado.
      }

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
   * Renders a single order card for the logged-in user's view.
   * @param {object} order - The order data, including its ID.
   * @returns {string} The HTML string for the user's order card.
   */
  const renderUserOrder = (order) => {
      const orderId = order.id;
      const createdAt = order.createdAt ? formatInChileanTime(order.createdAt.toDate(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
      const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
      const destinationAmount = (order.destinationAmount || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const destinationCurrency = order.destinationCurrency || 'VES';
      const orderIdTag = orderId.slice(-5);

      let statusBadge = '';
      let proofLink = '';

      switch (order.status) {
          case 'Pendiente de pago':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-amber-600 bg-amber-200">Pendiente</span>`;
              break;
          case 'Pagado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">Pagado</span>`;
              if (order.proofUrl) {
                  proofLink = `<a href="${order.proofUrl}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:underline font-semibold">Ver Comprobante</a>`;
              }
              break;
          case 'Cancelado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-red-600 bg-red-200">Cancelado</span>`;
              break;
          default:
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-gray-600 bg-gray-200">${order.status}</span>`;
      }

      return `
          <div class="p-4 rounded-lg shadow-sm bg-white border border-gray-200">
              <div class="flex justify-between items-start mb-2">
                  <div>
                      <p class="font-bold text-gray-700">Pedido #${orderIdTag}</p>
                      <p class="text-xs text-gray-500">${createdAt}</p>
                  </div>
                  ${statusBadge}
              </div>
              <div class="flex justify-between items-center mt-2">
                  <div>
                      <p class="font-semibold text-blue-600">${clpAmount}</p>
                      <p class="font-semibold text-green-600">${destinationAmount} ${destinationCurrency}</p>
                  </div>
                  ${proofLink}
              </div>
          </div>
      `;
  };

  /**
   * Renders a single order card into an HTML string.
   * @param {firebase.firestore.DocumentSnapshot} doc - The order document snapshot.
   * @returns {string} The HTML string for the order card.
   */
  const renderOrder = (doc) => {
      const order = doc.data();
      const orderId = doc.id;
      const orderIdTag = orderId.slice(-5);      
      const createdAt = order.createdAt ? formatInChileanTime(order.createdAt.toDate(), { hour: '2-digit', minute: '2-digit' }) : 'N/A';
      const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
      const destinationAmount = (order.destinationAmount || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const destinationCurrency = order.destinationCurrency || 'VES';

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
                    <span class="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">ID: ${orderIdTag}</span>
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
                      <p class="font-semibold text-green-600">${destinationAmount} ${destinationCurrency}</p>
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
      // This function correctly determines the start of "today" in Chile's timezone
      // and returns a Date object in UTC, which is what Firebase queries need.
      const getStartOfTodayInChileForQuery = () => {
        const todayInChileStr = new Date().toLocaleDateString('en-CA', { timeZone: chileTimeZone }); // Format: YYYY-MM-DD
        // Creating a new Date from a 'YYYY-MM-DD' string results in a Date object
        // representing midnight UTC for that day. This is a reliable way to query
        // for a specific day regardless of the user's local timezone.
        return new Date(todayInChileStr);
      };

      const ordersQuery = db.collection('orders')
          .where('country', '==', adminSelectedCountry)
          .where('createdAt', '>=', getStartOfTodayInChileForQuery())
          .orderBy('createdAt', 'desc');

      ordersListener = ordersQuery.onSnapshot(snapshot => {          
          // --- Sound Notification Logic ---
          snapshot.docChanges().forEach(change => {
              if (change.type === 'added' && !isInitialOrdersLoad) {
                  const order = change.doc.data();
                  if (order.status === 'Pendiente de pago') {
                    // 1. Play sound
                    const notificationSound = document.getElementById('notification-sound');
                    if (notificationSound) {
                        notificationSound.play().catch(error => {
                            console.warn("No se pudo reproducir el sonido de notificación. El usuario debe interactuar con la página primero.", error);
                        });
                    }

                    // 2. Show prominent alert
                    const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
                    const alertMessage = `
                        <h3 class="text-2xl font-bold text-green-600 mb-2">¡Nuevo Pedido!</h3>
                        <p class="text-gray-700">Cliente: <span class="font-semibold">${order.clientName}</span></p>
                        <p class="text-gray-700">Monto: <span class="font-semibold">${clpAmount}</span></p>
                    `;
                    showCustomAlert(alertMessage);

                    // 3. Change document title to alert user
                    document.title = '(!) Nuevo Pedido - Cambios Manzano';
                  }
              }
          });
          isInitialOrdersLoad = false; // Set flag after first run

          ordersListPending.innerHTML = '';
          ordersListPaid.innerHTML = '';
          
          let pendingOrdersCount = 0;
          let pendingDestTotal = 0;
          let paidCount = 0;
          let paidDestTotal = 0;

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
                  paidDestTotal += order.destinationAmount || 0;
              } else { // 'Pendiente de pago' or 'Cancelado'
                  ordersListPending.innerHTML += orderHtml;
                  // Only count orders with "Pendiente de pago" status for the summary
                  if (order.status === 'Pendiente de pago') {
                      pendingOrdersCount++;
                      pendingDestTotal += order.destinationAmount || 0;
                  }
              }
          });

          // Update summary displays with formatted totals
          pendingSummaryDisplay.textContent = `${pendingOrdersCount} Pedidos / ${pendingDestTotal.toLocaleString('es-CL', { minimumFractionDigits: 2 })} ${adminSelectedCountry}`;
          paidSummaryDisplay.textContent = `${paidCount} Pedidos / ${paidDestTotal.toLocaleString('es-CL', { minimumFractionDigits: 2 })} ${adminSelectedCountry}`;

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

  /** Attaches a real-time listener for the logged-in user's orders. */
  const attachUserOrdersListener = (userId) => {
      if (userOrdersListener) userOrdersListener(); // Detach previous listener

      const query = db.collection('orders')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(10); // Limit to recent orders to avoid loading too much data

      userOrdersListener = query.onSnapshot(snapshot => {
          userOrdersList.innerHTML = '';
          userOwnOrders = []; // Clear the list before populating
          if (snapshot.empty) {
              noUserOrdersMessage.classList.remove('hidden');
          } else {
              noUserOrdersMessage.classList.add('hidden');
              snapshot.forEach(doc => {
                  const orderData = { id: doc.id, ...doc.data() };
                  userOwnOrders.push(orderData); // Populate the array for autocomplete
                  // Don't show the dummy client registration orders
                  if (orderData.status !== 'Cliente Registrado') {
                      userOrdersList.innerHTML += renderUserOrder(orderData);
                  }
              });
          }
      }, error => {
          console.error("Error fetching user orders:", error);
          userOrdersList.innerHTML = `<p class="text-red-500">Error al cargar tus pedidos.</p>`;
          noUserOrdersMessage.classList.add('hidden');
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
              mainActionBtn.textContent = 'Cerrar Sesión';
              showAdminLoginBtn.classList.add('hidden');

              if (isAdmin) {
                  renderAdminCountrySelector();
                  switchMainView('admin');
                  notificationsSection.classList.remove('hidden');
                  setupPushNotifications();
                  if (!ordersListener) {
                      attachOrdersListener(); // Attach listener if admin
                      fetchAndRenderClients(); // Fetch clients when admin logs in
                      // Attach listener and provide a callback to run after the first data load
                      attachAccountsListener(() => {
                          // Load today's data by default for both history sections
                          // by simulating a click on the "Today" buttons.
                          balanceHistoryTodayBtn.click();
                          historicalDateTodayBtn.click();
                      });
                  }
              } else {
                  notificationsSection.classList.add('hidden');
                  if (ordersListener) {
                      ordersListener(); // Detach listener if not admin
                      ordersListener = null;
                  }
                  isInitialOrdersLoad = true; // Reset flag
                  if (accountsListener) {
                      accountsListener();
                      accountsListener = null;
                  }
                  userOrdersSection.classList.remove('hidden'); // Show the section
                  attachUserOrdersListener(user.uid); // Attach the listener
                  switchMainView('user');
              }
          });
      } else { // No user logged in
          isAdmin = false;
          currentUser = null;
          userIdDisplay.textContent = '';
          notificationsSection.classList.add('hidden');
          mainActionBtn.textContent = 'Hacer Pedido';
          showAdminLoginBtn.classList.remove('hidden');
          if (ordersListener) {
              ordersListener(); // Detach listener on logout
              ordersListener = null;
          }
          if (userOrdersListener) {
              userOrdersListener(); // Detach user listener
              userOrdersListener = null;
              userOrdersSection.classList.add('hidden'); // Hide the section
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
          updateStoreStatusView(); // Re-evaluate store status on logout
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
      const date = history.timestamp ? formatInChileanTime(history.timestamp.toDate(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';      const formattedAmount = history.amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      } else if (history.type === 'admin_commission') {
          debit = formattedAmount;
          if (!description) {
              // The note will be more specific, but this is a fallback.
              description = `Comisión Admin`;
          }
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
    
    // Filter to show only accounts with a balance > 0 in this view.
    const accountsWithBalance = accountsData.filter(acc => acc.balance > 0);

    if (accountsWithBalance.length === 0) {
        accountsListEl.innerHTML = '<p class="text-gray-500">No hay cuentas con saldo registradas.</p>';
        return;
    }

    accountsListEl.innerHTML = '';
    // Sort by holder name
    const sortedAccounts = accountsWithBalance.sort((a, b) => a.holder.localeCompare(b.holder));

    sortedAccounts.forEach(account => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center p-2 bg-blue-50 rounded-lg';
        el.innerHTML = `
            <p class="font-medium text-gray-700">${account.holder} - ${account.bank}</p>
            <p class="font-semibold text-blue-700">${(account.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</p>
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
          // Use destinationAmount, with a fallback to vesAmount for migrated data
          const totalDebit = (orderData.destinationAmount || orderData.vesAmount || 0) + fee;
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
      const rate = exchangeRates[userSelectedCountry] || 0;
      if (rate <= 0) {
          showMessage(messageElId, `La tasa de cambio para ${userSelectedCountry} no está disponible. No se puede crear el pedido.`, false);
          return;
      }

      let orderData = {
          type: type,
          status: 'Pendiente de pago',
          userId: currentUser.uid, // Add the user's ID to the order
          country: userSelectedCountry,
          // createdAt will be added on final confirmation
          clientName: form.querySelector('input[id^="name-"]').value,
          cedula: form.querySelector('input[id^="cedula-"]').value.replace(/[^0-9]/g, ''),
          clpAmount: parseFloat(form.querySelector('input[id^="clp-amount-"]').value),
          // New generalized fields
          destinationCurrency: userSelectedCountry,
          destinationAmount: 0,
      };
      
      if (isNaN(orderData.clpAmount) || orderData.clpAmount <= 0) {
          showMessage(messageElId, 'El monto en CLP debe ser un número válido y mayor a cero.', false);
          return;
      }

      orderData.destinationAmount = orderData.clpAmount * rate;

      let detailsHtml = `
        <p><span class="font-semibold">Nombre:</span> ${orderData.clientName}</p>
        <p><span class="font-semibold">Cédula:</span> ${orderData.cedula}</p>
      `;

      // Add type-specific fields
      if (type === 'transferencia') {
          const isVenezuela = userSelectedCountry === 'VES';
          const isColombia = userSelectedCountry === 'COP';
          const isPeru = userSelectedCountry === 'PEN';

          if (isColombia || isPeru) {
              orderData.docType = form.querySelector('#doc-type-transferencia').value;
          }
          orderData.bank = (isVenezuela || isColombia || isPeru) ? form.querySelector('#bank-transferencia').value : '';
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
            <p><span class="font-semibold">Monto a Recibir (${orderData.destinationCurrency}):</span> ${orderData.destinationAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      `;

      // Store data and show modal
      orderDataToConfirm = { data: orderData, form: form };
      orderConfirmDetails.innerHTML = detailsHtml;
      orderConfirmModal.classList.remove('hidden');
      orderConfirmModal.classList.add('flex');
  };

  /** Sets up the logic for enabling push notifications. */
  const setupPushNotifications = () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !firebase.messaging.isSupported()) {
        showMessage('notifications-message', 'Las notificaciones de escritorio no son compatibles con este navegador.', false);
        enableNotificationsBtn.disabled = true;
        return;
    }

    const messaging = firebase.messaging();

    // Check current permission status and update button
    if (Notification.permission === 'granted') {
        enableNotificationsBtn.textContent = 'Notificaciones Activadas';
        enableNotificationsBtn.disabled = true;
        showMessage('notifications-message', 'Ya tienes las notificaciones activadas en este navegador.', true);
    } else if (Notification.permission === 'denied') {
        enableNotificationsBtn.textContent = 'Permiso Bloqueado';
        enableNotificationsBtn.disabled = true;
        showMessage('notifications-message', 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.', false);
    }

    enableNotificationsBtn.addEventListener('click', async () => {
        if (!currentUser) return showMessage('notifications-message', 'Debes iniciar sesión.', false);

        try {
            showMessage('notifications-message', 'Solicitando permiso...', true);
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                showMessage('notifications-message', 'Permiso concedido. Obteniendo token...', true);
                
                // ------------------- ACCIÓN REQUERIDA -------------------
                // Reemplaza la siguiente línea con tu clave VAPID de Firebase.
                const vapidKey = 'BEju_FPmIxL_aiCOSspYuyoi4iLOJwMyHCrXCkGuXfUGRdOT9HGqPyFXnGb_Vc1tCGRzIzlragLH7j3N12c00E8';
                
                const fcmToken = await messaging.getToken({ vapidKey });

                if (fcmToken) {
                    const userTokensRef = db.collection('fcm_tokens').doc(currentUser.uid);
                    await userTokensRef.set({
                        tokens: firebase.firestore.FieldValue.arrayUnion(fcmToken)
                    }, { merge: true });

                    showMessage('notifications-message', '¡Notificaciones activadas para este dispositivo!', true);
                    enableNotificationsBtn.textContent = 'Notificaciones Activadas';
                    enableNotificationsBtn.disabled = true;
                }
            }
        } catch (error) {
            console.error('Error al activar notificaciones:', error);
            showMessage('notifications-message', `Error: ${error.message}. Revisa la consola.`, false);
        }
    });
  };

  // Reset document title on user interaction
  const resetTitle = () => {
    if (document.title.startsWith('(!)')) {
        document.title = 'Cambios Manzano';
    }
  };
  window.addEventListener('focus', resetTitle);
  window.addEventListener('click', resetTitle);

  // Register the service worker for Firebase Messaging
  if ('serviceWorker' in navigator && firebase.messaging.isSupported()) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
          .then((registration) => {
              console.log('Service Worker para notificaciones registrado con éxito:', registration);
          }).catch((error) => {
              console.error('Error al registrar el Service Worker de notificaciones:', error);
          });
  }

  // --- Event Listeners ---

  // Main Action Button (Login/Logout/Open Modal)
  mainActionBtn.addEventListener('click', () => {
      if (currentUser) {
          // If a user is logged in, this button is for logout
          auth.signOut();
      } else {
          // If no user, open the login/register modal
          customerAuthModal.classList.remove('hidden');
          customerAuthModal.classList.add('flex');
          document.getElementById('customer-auth-message').textContent = '';
      }
  });

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
  rateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newRateInput = document.getElementById('new-rate');
      const currencyToUpdate = rateCurrencySelect.value;
      const newRate = parseFloat(newRateInput.value);

      if (!currencyToUpdate) {
          showMessage('rate-message', 'Por favor, selecciona una moneda.', false);
          return;
      }
      if (isNaN(newRate) || newRate <= 0) {
          showMessage('rate-message', 'Por favor, ingresa un número válido.', false);
          return;
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');

      try {
          await db.runTransaction(async (transaction) => {
              const rateDoc = await transaction.get(rateRef);
              
              // Start with an empty map for values
              let currentValues = {};

              if (rateDoc.exists) {
                  const data = rateDoc.data();
                  // If the new 'values' map exists, use it.
                  if (data.values && typeof data.values === 'object') {
                      currentValues = data.values;
                  } 
                  // Else, if the old 'value' field exists, use it to start the map (migration).
                  else if (data.value) {
                      currentValues.VES = data.value;
                  }
              }
              
              // Update the map with the new rate
              currentValues[currencyToUpdate] = newRate;

              // Prepare the data to be written back. This structure ensures the old 'value' field is removed.
              const newData = {
                  values: currentValues,
                  lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
              };

              // Use set to overwrite the document with the new, clean structure.
              transaction.set(rateRef, newData);
          });

          showMessage('rate-message', `¡Tasa para ${currencyToUpdate} actualizada con éxito!`, true);
          newRateInput.value = '';

      } catch (error) {
          console.error("Error al actualizar la tasa en transacción: ", error);
          showMessage('rate-message', `Error: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
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
  switchTab(tabs[0]); // Set default tab
  renderUserCountrySelector();
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
      if (input) input.addEventListener('input', () => updateDestinationAmount(input, destinationAmountDisplays[index]));
  });

  // Listen for order filter changes
  orderFilter.addEventListener('change', applyOrderFilter);

  // Use event delegation for order action buttons
  ordersListPending.addEventListener('click', async (e) => {
      const target = e.target;
      const orderId = target.dataset.id;

      if (!orderId || !target.closest('button')) return;

      if (target.classList.contains('mark-paid-btn')) {
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');
          try {
              const orderDoc = await db.collection('orders').doc(orderId).get();
              if (!orderDoc.exists) throw new Error("El pedido no existe.");
              const orderData = orderDoc.data();

              // If currency is VES, use the full flow with account selection
              if (orderData.destinationCurrency === 'VES') {
                  openPaymentSourceModal(orderId, orderData);
              } else {
                  // For other currencies, bypass account selection and go straight to upload
                  paymentData = { orderId, orderData }; // Store data
                  
                  // Open the upload modal directly
                  showMessage('admin-upload-message', '', true);
                  adminScreenshotInput.value = ''; // Clear previous file selection
                  adminUploadModal.classList.remove('hidden');
                  adminUploadModal.classList.add('flex');
              }
          } catch (error) {
              console.error("Error al procesar el pago:", error);
              showCustomAlert(`Error: ${error.message}`);
          } finally {
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
          }

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
      const amount = order.destinationAmount;
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

  /** Opens the modal to select the payment source account with pre-fetched data. */
  const openPaymentSourceModal = (orderId, orderData) => {
      try {
          paymentData = { orderId, orderData }; // Store initial data

          // Display order details in the modal
          paymentSourceOrderDetails.innerHTML = `<p><b>Cliente:</b> ${orderData.clientName}</p><p><b>Monto a Pagar:</b> ${orderData.destinationAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${orderData.destinationCurrency}</p>`;

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

              paymentFeeDetails.innerHTML = `Comisión calculada: <b>${fee.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</b>. Total a descontar: <b>${(paymentData.orderData.destinationAmount + fee).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</b>.`;
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
      if (!paymentData.orderId) {
          return showMessage('admin-upload-message', 'Error: No se ha seleccionado ningún pedido.', false);
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
          // 1. Upload file to Storage
          const filePath = `proofs/${orderId}/${file.name}`;
          const fileRef = storage.ref(filePath);
          const uploadTask = await fileRef.put(file);
          const proofUrl = await uploadTask.ref.getDownloadURL();

          // 2. Prepare batch write
          const orderRef = db.collection('orders').doc(orderId);
          const batch = db.batch();

          // Update order
          batch.update(orderRef, { status: 'Pagado', proofUrl: proofUrl });

          // Conditional logic for VES payments (which have an account and fee)
          if (orderData.destinationCurrency === 'VES') {
              if (!selectedAccountId) {
                  throw new Error("No se ha seleccionado una cuenta de origen para el pago en VES.");
              }
              const selectedAccount = accountsData.find(acc => acc.id === selectedAccountId);
              if (!selectedAccount) {
                  throw new Error("La cuenta de origen seleccionada ya no es válida.");
              }

              // Calculate 1% admin commission for VES orders
              const adminCommission = orderData.destinationAmount * 0.01;
              const totalDebit = orderData.destinationAmount + fee + adminCommission;

              const accountRef = db.collection('accounts').doc(selectedAccountId);
              const paymentHistoryRef = db.collection('balance_history').doc();
              const feeHistoryRef = db.collection('balance_history').doc();

              // Decrement account balance
              batch.set(accountRef, { 
                  balance: firebase.firestore.FieldValue.increment(-totalDebit) 
              }, { merge: true });
              
              // Create history for payment
              batch.set(paymentHistoryRef, { 
                  amount: orderData.destinationAmount, 
                  type: 'subtract', 
                  note: `Pago pedido ${orderId.substring(0, 5)} (${orderData.destinationCurrency})`, 
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

              // Create history for admin commission
              if (adminCommission > 0) {
                  const adminCommissionHistoryRef = db.collection('balance_history').doc();
                  batch.set(adminCommissionHistoryRef, {
                      amount: adminCommission,
                      type: 'admin_commission',
                      note: `Comisión Admin pedido ${orderId.substring(0, 5)}`,
                      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                      holder: selectedAccount.holder,
                      bank: selectedAccount.bank,
                  });
              }
          }
          // For non-VES payments, we just update the status and don't touch balances.

          await batch.commit();

          showMessage('rate-message', 'Pedido pagado y marcado como completado.', true);
          
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
      const defaultRates = { VES: 0, COP: 0, PEN: 0, ARS: 0, USD: 0, EUR: 0 };
      const rateData = doc.exists ? doc.data() : {};

      // Get store status from the same document
      isStoreOpen = rateData.isTakingOrders !== false; // Default to true if undefined
      updateStoreStatusView();

      const firestoreValues = rateData.values;
      // Check for the new 'values' structure, with fallback to the old one
      if (firestoreValues && typeof firestoreValues === 'object') {
          // Combine the defaults with the fetched values to ensure all keys are present
          exchangeRates = { ...defaultRates, ...firestoreValues };
      } else if (rateData.value) { // Fallback for old structure (migration)
          exchangeRates = { ...defaultRates, VES: rateData.value };
      } else {
          console.log("No se encontró el documento de la tasa de cambio!");
          exchangeRates = defaultRates;
      }

      renderUserCountrySelector(); // Re-render user country selector based on available rates
      updateUserFormsForCountry(); // Update forms based on the new rates and country
      renderExchangeRateTicker(); // Render the ticker with the final, complete rates object

      // This is important: after fetching all rates, update the user forms if needed
      clpInputs.forEach((input, index) => {
          if (input && input.value) {
              updateDestinationAmount(input, destinationAmountDisplays[index]);
          }
      });
  }, (error) => {
      console.error("Error al obtener la tasa de cambio:", error);
      exchangeRates = {};
      renderExchangeRateTicker(); // Render empty state
      isStoreOpen = false; // Fail-safe: close store if config can't be read
      updateStoreStatusView();
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
      const today = getChileanDateForPicker(new Date());
      setDateRangeAndSearch(today, today);
  });

  historicalDateYesterdayBtn.addEventListener('click', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const chileYesterday = getChileanDateForPicker(yesterday);
      setDateRangeAndSearch(chileYesterday, chileYesterday);
  });

  historicalDate7DaysBtn.addEventListener('click', () => {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const chileStart = getChileanDateForPicker(start);
      const chileEnd = getChileanDateForPicker(new Date());
      setDateRangeAndSearch(chileStart, chileEnd);
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

      // valueAsDate is already UTC midnight, which is perfect for querying.
      const start = startDateVal;
      const end = new Date(endDateVal);
      end.setHours(23, 59, 59, 999);

      const activeStatusBtn = historicalStatusFilters.querySelector('button.active');
      const statusFilter = activeStatusBtn ? activeStatusBtn.dataset.status : 'Todos';

      try {
          // Firestore limitation: Cannot have inequality filters on multiple fields.
          // So, we fetch by date range first, then filter by status on the client-side.
          const query = db.collection('orders')
              .where('country', '==', adminSelectedCountry)
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

              filteredOrders.forEach(orderData => {
                  // We need to simulate a doc snapshot for renderOrder
                  const mockDoc = { id: orderData.id, data: () => orderData };
                  historicalOrdersList.innerHTML += renderOrder(mockDoc);
                  historicalOrdersData.push(orderData);
                  if (orderData.status === 'Pagado') {
                      totalCLP += orderData.clpAmount || 0;
                  }
              });
              historicalSearchSummary.textContent = `Se encontraron ${filteredOrders.length} pedidos. Total Pagado (CLP): ${totalCLP.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'})}.`;
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
          'Fecha': order.createdAt ? formatInChileanTime(order.createdAt.toDate(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
          'País': order.country || 'VE',
          'Cliente': order.clientName,
          'Cédula': order.cedula,
          'Tipo': order.type,
          'Monto CLP': order.clpAmount,
          'Monto Destino': order.destinationAmount,
          'Moneda Destino': order.destinationCurrency,
          'Estado': order.status,
          'Tipo Documento': order.docType || '',
          'Banco': order.bank || '',
          'Teléfono': order.phone || '',
          'Nro. Cuenta': order.accountNumber || '',
          'Tipo Cuenta': order.accountType || '',
          'Deudor': order.isDebtor ? 'Sí' : 'No'
      }));
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialPedidos');
      const startDate = historicalDateStart.value;
      const endDate = historicalDateEnd.value;
      XLSX.writeFile(workbook, `Historial_Pedidos_${startDate}_a_${endDate}.xlsx`);
  };

  exportExcelBtn.addEventListener('click', exportHistoricalOrdersToExcel);

  const fetchAndRenderBalanceHistory = async (start, end) => {
      if (!start || !end) {
          balanceHistoryList.innerHTML = '';
          noBalanceHistoryMessage.textContent = 'Selecciona un rango de fechas para ver los movimientos.';
          noBalanceHistoryMessage.classList.remove('hidden');
          balanceHistoryHeader.classList.add('hidden');
          exportBalanceExcelBtn.disabled = true;
          balanceHistoryData = [];
          return;
          updateStoreStatusView(); // Re-evaluate store status on login
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      balanceHistoryList.innerHTML = '';
      noBalanceHistoryMessage.classList.add('hidden');
      balanceHistoryHeader.classList.add('hidden');

      try {
          // The date picker gives us a UTC midnight date, which is correct for starting the query.
          const queryStart = start;
          const queryEnd = new Date(end);
          queryEnd.setUTCHours(23, 59, 59, 999);
          // 1. Get the total current balance from all accounts to calculate running balance
          const totalCurrentBalance = accountsData.reduce((sum, acc) => sum + (acc.balance || 0), 0);

          const query = db.collection('balance_history')
              .where('timestamp', '>=', queryStart)
              .where('timestamp', '<=', queryEnd)
              .orderBy('timestamp', 'desc');
          
          const snapshot = await query.get();

          if (snapshot.empty) {
              noBalanceHistoryMessage.textContent = 'No se encontraron movimientos en el rango de fechas seleccionado.';
              noBalanceHistoryMessage.classList.remove('hidden');
              balanceHistoryData = [];
              exportBalanceExcelBtn.disabled = true;
              document.getElementById('admin-commission-summary').innerHTML = '';
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

              // Calculate and display admin commission for the period
              const adminCommissionSummaryEl = document.getElementById('admin-commission-summary');
              const adminCommissions = movementsWithBalance.filter((m) => m.type === 'admin_commission');
              const totalAdminCommission = adminCommissions.reduce((sum, item) => sum + item.amount, 0);

              if (totalAdminCommission > 0) {
                  adminCommissionSummaryEl.innerHTML = `
                      <div class="flex justify-between items-center p-2 bg-purple-100 rounded-lg">
                          <p class="font-medium text-purple-800">Comisión Admin (Período)</p>
                          <p class="font-semibold text-purple-800">${totalAdminCommission.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</p>
                      </div>
                  `;
              } else {
                  adminCommissionSummaryEl.innerHTML = '';
              }
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
      const today = getChileanDateForPicker(new Date());
      balanceHistoryStartInput.valueAsDate = today;
      balanceHistoryEndInput.valueAsDate = today;
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistoryYesterdayBtn.addEventListener('click', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const chileYesterday = getChileanDateForPicker(yesterday);
      balanceHistoryStartInput.valueAsDate = chileYesterday;
      balanceHistoryEndInput.valueAsDate = chileYesterday;
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistory7DaysBtn.addEventListener('click', () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      balanceHistoryStartInput.valueAsDate = getChileanDateForPicker(start);
      balanceHistoryEndInput.valueAsDate = getChileanDateForPicker(end);
      balanceHistorySearchBtn.click(); // Automatically search
  });

  balanceHistorySearchBtn.addEventListener('click', () => {
      const startDateVal = balanceHistoryStartInput.valueAsDate;
      const endDateVal = balanceHistoryEndInput.valueAsDate;

      if (!startDateVal || !endDateVal) {
          showCustomAlert('Por favor, selecciona un rango de fechas para buscar.');
          return;
      }

      // The valueAsDate property already provides a Date object set to midnight UTC for the selected day.
      // This is exactly what we need for the query, so we can use them directly.
      const start = startDateVal;
      const end = endDateVal;

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
          } else { // subtract, fee, or admin_commission
              debit = item.amount;
              if (!description) {
                  if (item.type === 'fee') description = 'Comisión Bancaria';
                  else if (item.type === 'admin_commission') description = 'Comisión Admin';
                  else description = 'Pago de Pedido';
              }
          }

          return {
              'Fecha': item.timestamp ? formatInChileanTime(item.timestamp.toDate(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
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
          // This correctly resets the amounts and labels for the current country.
          updateUserFormsForCountry();
          
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
              
              // Determine which list to use for autocomplete
              const sourceList = isAdmin ? fullClientList : userOwnOrders;

              if (!cedulaValue || sourceList.length === 0) return;

              // Find the most recent order for that cedula in the relevant list.
              // Since both lists are sorted by date descending, the first match is the latest.
              const clientLastOrder = sourceList.find(c => c.cedula === cedulaValue);
              
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
          country: adminSelectedCountry, // Save client under the admin's currently selected country
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

  // Listener for the admin country selector
  adminCountrySelector.addEventListener('click', (e) => {
      const target = e.target.closest('.country-tab-btn');
      if (!target) return;

      const countryCode = target.dataset.country;
      if (countryCode !== adminSelectedCountry) {
          adminSelectedCountry = countryCode;
          renderAdminCountrySelector(); // Re-render tabs to show active state
          
          // Re-trigger data fetches for the new country
          if (ordersListener) {
              ordersListener(); // Detach old listener
              attachOrdersListener(); // Attach new one for the selected country
          }
          fetchAndRenderClients();
          
          // Instead of just clearing or partially reloading,
          // simulate clicks on the "Today" buttons for both history sections.
          // This ensures a consistent state and reloads data for the new country.
          if (balanceHistoryTodayBtn) {
              balanceHistoryTodayBtn.click();
          }
          if (historicalDateTodayBtn) {
              historicalDateTodayBtn.click();
          }
      }
  });

  // Listener for the USER country selector
  userCountrySelector.addEventListener('click', (e) => {
      const target = e.target.closest('.country-tab-btn');
      if (!target) return;

      const countryCode = target.dataset.country;
      if (countryCode !== userSelectedCountry) {
          userSelectedCountry = countryCode;
          renderUserCountrySelector(); // Re-render tabs to show active state
          
          // Update forms for the new country
          updateUserFormsForCountry();
      }
  });

  // Store Status Button Listeners
  const handleStoreStatusChange = async (newStatus) => {
      showMessage('store-status-message', 'Actualizando estado...', true);
      try {
          await db.collection('config').doc('rate').update({
              isTakingOrders: newStatus
          });
          // The onSnapshot listener will handle the UI update.
          showMessage('store-status-message', '¡Estado de la tienda actualizado!', true);
      } catch (error) {
          console.error("Error updating store status:", error);
          showMessage('store-status-message', `Error: ${error.message}`, false);
      }
  };

  if (openStoreBtn) {
      openStoreBtn.addEventListener('click', () => handleStoreStatusChange(true));
  }
  if (closeStoreBtn) {
      closeStoreBtn.addEventListener('click', () => handleStoreStatusChange(false));
  }

  // --- Transfer Funds Modal Logic ---
  const transferFromAccountSelect = document.getElementById('transfer-from-account');
  const transferToAccountSelect = document.getElementById('transfer-to-account');
  const transferAmountInput = document.getElementById('transfer-amount');
  const transferFeeDetails = document.getElementById('transfer-fee-details');
  const transferFundsMessage = document.getElementById('transfer-funds-message');

  const populateTransferAccountSelects = () => {
      const optionsHtml = accountsData.map(acc =>
          `<option value="${acc.id}">${acc.holder} - ${acc.bank} (${(acc.balance || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} VES)</option>`
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

  // --- Customer Authentication Modal Logic ---
  customerAuthCloseBtn.addEventListener('click', () => {
      customerAuthModal.classList.add('hidden');
      customerAuthModal.classList.remove('flex');
  });

  customerAuthTabs.forEach(tab => {
      tab.addEventListener('click', () => {
          const formType = tab.dataset.form;
          
          customerAuthTabs.forEach(t => {
              const isSelected = t === tab;
              t.classList.toggle('bg-white', isSelected);
              t.classList.toggle('text-blue-600', isSelected);
              t.classList.toggle('text-gray-700', !isSelected);
          });

          customerLoginForm.classList.toggle('hidden', formType !== 'login');
          customerRegisterForm.classList.toggle('hidden', formType !== 'register');
          document.getElementById('customer-auth-message').textContent = '';
      });
  });

  customerLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('customer-login-email').value;
      const password = document.getElementById('customer-login-password').value;
      auth.signInWithEmailAndPassword(email, password)
          .then(userCredential => {
              // onAuthStateChanged will handle the UI update
              customerAuthModal.classList.add('hidden');
              customerAuthModal.classList.remove('flex');
          })
          .catch(error => {
              showMessage('customer-auth-message', `Error: ${error.message}`, false);
          });
  });

  customerRegisterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('customer-register-email').value;
      const password = document.getElementById('customer-register-password').value;
      const confirmPassword = document.getElementById('customer-register-confirm-password').value;

      if (password !== confirmPassword) {
          showMessage('customer-auth-message', 'Las contraseñas no coinciden.', false);
          return;
      }

      auth.createUserWithEmailAndPassword(email, password)
          .then(userCredential => {
              // onAuthStateChanged will handle the UI update
              showMessage('customer-auth-message', '¡Cuenta creada! Ingresando...', true);
              setTimeout(() => {
                  customerAuthModal.classList.add('hidden');
                  customerAuthModal.classList.remove('flex');
              }, 1500);
          })
          .catch(error => {
              showMessage('customer-auth-message', `Error: ${error.message}`, false);
          });
  });

  forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      const email = document.getElementById('customer-login-email').value;
      if (!email) {
          showMessage('customer-auth-message', 'Por favor, ingresa tu correo electrónico en el campo de arriba para restablecer la contraseña.', false);
          return;
      }
      auth.sendPasswordResetEmail(email)
          .then(() => {
              showMessage('customer-auth-message', 'Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.', true);
          })
          .catch(error => {
              showMessage('customer-auth-message', `Error: ${error.message}`, false);
          });
  });
});
