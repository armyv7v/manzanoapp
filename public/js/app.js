// Demo/hosting detection
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
let isSeller = false;
let sellerRequiresProof = false; // NEW: To check if a seller must upload proof
let commissionRate = 0;
let exchangeRates = {}; // Replaces currentExchangeRate
let ordersListener = null; // To hold the unsubscribe function for the orders listener.
let userOrdersListener = null; // To hold the listener for the user's own orders.
let userOwnOrders = []; // To hold the user's own orders for autocomplete.
let userSavedBeneficiaries = []; // To hold unique beneficiaries for the logged-in user.
let accountsListener = null; // To hold the listener for the accounts collection.
let sellerCommissionListener = null; // Listener for the seller's own commission.
let adminSellerCommissionsListener = null; // Listener for the admin to see all seller commissions.
let adminCommissionListener = null; // NEW: Listener for today's admin commission.
let bankFeeListener = null; // NEW: Listener for today's bank fee commission.
let commissionCheckInterval = null; // To reset commission listener at midnight.
let clpBalanceHistoryData = []; // To store CLP balance history for export
let sellerCommissionHistoryData = []; // To store data for Excel export
let commissionListenerDate = null; // To track the day for the commission listener.
let paymentData = {}; // To store all data related to a payment process
let isInitialOrdersLoad = true; // To prevent notification sound on first load
let batchProcessData = {}; // NEW: To store data for the batch process
let userSelectedCountry = 'VES'; // Default country for the user forms
let adminSelectedCountry = 'VE'; // Default country for the admin panel.
let isStoreOpen = true; // Default to open, will be updated from DB.
let todaysAdminCommissionTotal = 0;
let todaysTilloCommissionTotal = 0;
let todaysBankFeeTotal = 0;
let tilloCommissionListener = null; // Listener for today's Tillo commission portion

const ADMIN_BASE_COMMISSION_RATE = 0.01;
const TILLO_COMMISSION_RATE = 0.0015;
const TOTAL_ADMIN_COMMISSION_RATE = ADMIN_BASE_COMMISSION_RATE + TILLO_COMMISSION_RATE;

// Client list state
let hasClientSearchBeenPerformed = false;
let clientListPage = 1;
const CLIENTS_PER_PAGE = 20; // Increased for infinite scroll
let clientListSortBy = 'name'; // 'name' or 'cedula'
let filteredClientList = [];
let batchClientListPage = 1;
const CLIENTS_PER_PAGE_BATCH = 30;
const LETTER_NAV_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

const currencyFlags = {
    VES: '🇻🇪',
    COP: '🇨🇴',
    PEN: '🇵🇪',
    ARS: '🇦🇷',
    USD: '🇺🇸',
    EUR: '🇪🇺'
};

const userTags = {
    // Administradores
    'enderjpinar@gmail.com': 'A1',
    'namv2210@gmail.com': 'A2',
    'emmaquintero511@gmail.com': 'A3',
    'yvettepierina@gmail.com': 'A4',
    'loistoda@gmail.com': 'A5',
    // Vendedores
    'stalinread117@gmail.com': 'V1',
    'beaguiar2405@gmail.com': 'V2',
    'myanirethsg@gmail.com': 'V3'
};

// --- Constants ---
const venezuelanBanks = [
    "100% Banco", "Activo", "Agrícola de Venezuela", "Bancamiga", "Bancaribe", "Bancrecer", "Banesco", "Bangente", "Banplus", "BFC (Banco Fondo Común)", "Banco Digital de Los Trabajadores", "BNC (Banco Nacional de Crédito)", "Caroní", "DelSur", "Exterior", "Internacional de Desarrollo", "Mercantil", "Mi Banco", "N58 Banco Digital", "Plaza", "Provincial", "Sofitasa", "Tesoro", "Venezolano de Crédito", "Venezuela", "BANFANB"
].sort();

const venezuelanBankPrefixes = {
    '0102': 'Venezuela',
    '0104': 'Venezolano de Crédito',
    '0105': 'Mercantil',
    '0108': 'Provincial',
    '0114': 'Bancaribe',
    '0115': 'Exterior',
    '0116': 'BNC (Banco Nacional de Crédito)', // BOD is now BNC
    '0128': 'Caroní',
    '0134': 'Banesco',
    '0137': 'Sofitasa',
    '0138': 'Plaza',
    '0146': 'Bangente',
    '0151': 'BFC (Banco Fondo Común)',
    '0156': '100% Banco',
    '0157': 'DelSur',
    '0163': 'Tesoro',
    '0166': 'Agrícola de Venezuela',
    '0168': 'Bancrecer',
    '0169': 'Mi Banco',
    '0171': 'Activo',
    '0172': 'Bancamiga',
    '0174': 'Banplus',
    '0175': 'Banco Digital de Los Trabajadores',
    '0177': 'BANFANB',
    '0178': 'N58 Banco Digital',
    '0191': 'BNC (Banco Nacional de Crédito)'
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
 * Rounds a number up to the nearest two decimal places.
 * @param {number} num The number to round.
 * @returns {number} The rounded number.
 */
function roundUpToTwoDecimals(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return 0;
    }
    return Math.ceil(num * 100) / 100;
}
/**
 * Returns the uppercase initial for letter navigation; non A-Z characters map to '#'. 
 * @param {string} name The client name.
 * @returns {string}
 */
function getClientInitial(name = '') {
    const trimmed = (name || '').trim();
    if (!trimmed) return '#';
    const firstChar = trimmed.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(firstChar) ? firstChar : '#';
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
  // Add version number for debugging cache issues
  const appVersionSpan = document.getElementById('app-version');
  if (appVersionSpan) {
      appVersionSpan.textContent = 'v6.9';
  }

  const showUserFormBtn = document.getElementById('show-user-form-btn');
  const showAdminLoginBtn = document.getElementById('show-admin-login-btn');
  const userInterface = document.getElementById('user-interface');
  const adminInterface = document.getElementById('admin-interface');
  const adminLogin = document.getElementById('admin-login');
  const adminPanel = document.getElementById('admin-panel');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  const rateForm = document.getElementById('rate-form');
  const rateCurrencySelect = document.getElementById('rate-currency-select'); // NEW
  const userIdDisplay = document.getElementById('user-id-display');
  const tickerContent = document.getElementById('ticker-content'); // NEW
  const mainActionBtn = document.getElementById('main-action-btn');
  const mainActionBtnContainer = document.getElementById('main-action-btn-container');
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
  
  // Admin Create Order Toggle
  const adminCreateOrderSection = document.getElementById('admin-create-order-section');
  const adminCreateOrderToggleBtn = document.getElementById('admin-create-order-toggle-btn');

  // Batch Processing Elements
  const startBatchProcessBtn = document.getElementById('start-batch-process-btn');
  const dailyOrdersHeader = document.getElementById('daily-orders-header');
  const dailyOrdersContainer = document.getElementById('daily-orders-container');
  const batchSelectionView = document.getElementById('batch-selection-view');
  const batchViewClientSearch = document.getElementById('batch-view-client-search');
  const batchViewLetterNav = document.getElementById('batch-view-letter-nav');
  const batchViewClientList = document.getElementById('batch-view-client-list');
  const batchActionBar = document.getElementById('batch-action-bar');
  const batchViewSelectedCount = document.getElementById('batch-view-selected-count');
  const cancelBatchProcessBtn = document.getElementById('cancel-batch-process-btn');
  const continueBatchProcessBtn = document.getElementById('continue-batch-process-btn');
  const batchClientSelectionModal = document.getElementById('batch-client-selection-modal');
  const batchClientSearchInput = document.getElementById('batch-client-search');
  const batchClientList = document.getElementById('batch-client-list');
  const batchSelectedCount = document.getElementById('batch-selected-count');
  const batchClientSelectionNextBtn = document.getElementById('batch-client-selection-next-btn');
  const batchClientSelectionCancelBtn = document.getElementById('batch-client-selection-cancel-btn');
  const batchAmountEntryModal = document.getElementById('batch-amount-entry-modal');
  const batchAmountList = document.getElementById('batch-amount-list');
  const batchAmountEntryBackBtn = document.getElementById('batch-amount-entry-back-btn');
  const batchAmountEntryConfirmBtn = document.getElementById('batch-amount-entry-confirm-btn');
  const batchPaymentModal = document.getElementById('batch-payment-modal');

  // NEW: Batch Success Modal Elements
  const batchSuccessModal = document.getElementById('batch-success-modal');
  const batchSuccessOrderList = document.getElementById('batch-success-order-list');
  const batchSuccessShareAllBtn = document.getElementById('batch-success-share-all-btn');
  const batchSuccessCloseBtn = document.getElementById('batch-success-close-btn');

  const buildBatchLetterNav = () => {
      if (!batchViewLetterNav) return;
      batchViewLetterNav.innerHTML = LETTER_NAV_KEYS.map(letter => {
          const label = letter === '#' ? '#' : letter;
          return `
              <button type="button"
                  data-letter="${letter}"
                  class="letter-nav-btn w-8 h-8 rounded-md flex items-center justify-center bg-gray-200 text-gray-500 hover:bg-gray-300 transition disabled:opacity-30 disabled:cursor-not-allowed">
                  ${label}
              </button>
          `;
      }).join('');
  };

  const updateBatchLetterNavState = (availableLetters = new Set()) => {
      if (!batchViewLetterNav) return;
      const buttons = batchViewLetterNav.querySelectorAll('.letter-nav-btn');
      buttons.forEach(btn => {
          const letter = btn.dataset.letter;
          const isAvailable = availableLetters.has(letter);
          btn.disabled = !isAvailable;
          btn.classList.toggle('bg-purple-200', isAvailable);
          btn.classList.toggle('text-purple-700', isAvailable);
          btn.classList.toggle('bg-gray-200', !isAvailable);
          btn.classList.toggle('text-gray-500', !isAvailable);
      });
  };

  buildBatchLetterNav();

  // NEW: Edit Client Modal Elements
  const editClientModal = document.getElementById('edit-client-modal');
  const editClientForm = document.getElementById('edit-client-form');
  const editClientCloseBtn = document.getElementById('edit-client-close-btn');

  // Historical Payment Modal Elements
  const historicalPaymentDateModal = document.getElementById('historical-payment-date-modal');
  const historicalPaymentOrderDetails = document.getElementById('historical-payment-order-details');
  const historicalPaymentDateInput = document.getElementById('historical-payment-date');
  const historicalPaymentDateNextBtn = document.getElementById('historical-payment-date-next-btn');
  const historicalPaymentDateCancelBtn = document.getElementById('historical-payment-date-cancel-btn');

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

  // Saved Beneficiaries Elements
  const toggleSavedAccountsTransferencia = document.getElementById('toggle-saved-accounts-transferencia');
  const savedAccountsListTransferencia = document.getElementById('saved-accounts-list-transferencia');
  const toggleSavedAccountsPagoMovil = document.getElementById('toggle-saved-accounts-pago-movil');
  const savedAccountsListPagoMovil = document.getElementById('saved-accounts-list-pago-movil');
  const toggleSavedAccountsRecargaSaldo = document.getElementById('toggle-saved-accounts-recarga-saldo');
  const savedAccountsListRecargaSaldo = document.getElementById('saved-accounts-list-recarga-saldo');


  // Admin Upload Modal Elements
  const adminUploadModal = document.getElementById('admin-upload-modal');
  const adminScreenshotInput = document.getElementById('admin-screenshot-input');
  const adminUploadBtn = document.getElementById('admin-upload-btn');
  const adminCancelUploadBtn = document.getElementById('admin-cancel-upload-btn');

  // Client Upload Modal Elements
  const clientUploadModal = document.getElementById('client-upload-modal');
  const clientScreenshotInput = document.getElementById('client-screenshot-input');
  const clientUploadConfirmBtn = document.getElementById('client-upload-confirm-btn');
  const clientUploadCancelBtn = document.getElementById('client-upload-cancel-btn');
  const clientUploadMessage = document.getElementById('client-upload-message');

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
  const balanceHistoryPrevDayBtn = document.getElementById('balance-history-prev-day-btn');
  const balanceHistoryNextDayBtn = document.getElementById('balance-history-next-day-btn');
  // Account Balance Display Elements (New for "Saldos por Cuenta" section)
  const accountsBalanceDisplayPrevBtn = document.getElementById('accounts-balance-display-prev-btn');
  const accountsBalanceDisplayDatePicker = document.getElementById('accounts-balance-display-date-picker');
  const accountsBalanceDisplayNextBtn = document.getElementById('accounts-balance-display-next-btn');
  const accountsBalanceDisplayDateInfo = document.getElementById('accounts-balance-display-date-info');
  const adminCommissionSummaryEl = document.getElementById('admin-commission-summary');

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
  const balanceOpClpSection = document.getElementById('balance-op-clp-section');
  const balanceOpClpRateInput = document.getElementById('balance-op-clp-rate');
  const balanceOpClpEquivalent = document.getElementById('balance-op-clp-equivalent');

  // CLP Balance History Elements
  const clpBalanceHistorySection = document.getElementById('clp-balance-history-section');
  const clpBalanceHistorySearchBtn = document.getElementById('clp-balance-history-search-btn');
  const clpBalanceHistoryList = document.getElementById('clp-balance-history-list');
  const noClpBalanceHistoryMessage = document.getElementById('no-clp-balance-history-message');
  const exportClpBalanceExcelBtn = document.getElementById('export-clp-balance-excel-btn');
  const clpBalanceHistoryStartInput = document.getElementById('clp-balance-history-start');
  const clpBalanceHistoryEndInput = document.getElementById('clp-balance-history-end');
  const clpBalanceHistoryTodayBtn = document.getElementById('clp-balance-history-today');
  const clpBalanceHistoryYesterdayBtn = document.getElementById('clp-balance-history-yesterday');
  const clpBalanceHistory7DaysBtn = document.getElementById('clp-balance-history-7days');

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
  const historicalDateStart = document.getElementById('historical-date-start');
  const historicalDateEnd = document.getElementById('historical-date-end');
  const historicalDateTodayBtn = document.getElementById('historical-date-today');
  const historicalDateYesterdayBtn = document.getElementById('historical-date-yesterday');
  const historicalDate7DaysBtn = document.getElementById('historical-date-7days');
  const historicalSearchBtn = document.getElementById('historical-search-btn');
  const historicalStatusFilters = document.getElementById('historical-status-filters');
  const exportExcelBtn = document.getElementById('export-excel-btn');
  const historicalSearchSummary = document.getElementById('historical-search-summary');
  const historicalOrdersList = document.getElementById('historical-orders-list');
  const noHistoricalOrdersMessage = document.getElementById('no-historical-orders-message');
  const historicalIdSearchInput = document.getElementById('historical-id-search');
  const historicalIdSearchBtn = document.getElementById('historical-id-search-btn');

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

  // Seller Commission History Elements
  const sellerCommissionHistorySelect = document.getElementById('seller-commission-history-select');
  const sellerCommissionHistoryStart = document.getElementById('seller-commission-history-start');
  const sellerCommissionHistoryEnd = document.getElementById('seller-commission-history-end');
  const sellerCommissionHistoryTodayBtn = document.getElementById('seller-commission-history-today');
  const sellerCommissionHistoryYesterdayBtn = document.getElementById('seller-commission-history-yesterday');
  const sellerCommissionHistory7DaysBtn = document.getElementById('seller-commission-history-7days');
  const sellerCommissionHistorySearchBtn = document.getElementById('seller-commission-history-search-btn');
  const exportSellerCommissionExcelBtn = document.getElementById('export-seller-commission-excel-btn');
  const sellerCommissionHistorySummary = document.getElementById('seller-commission-history-summary');
  const sellerCommissionHistoryList = document.getElementById('seller-commission-history-list');
  const noSellerCommissionHistoryMessage = document.getElementById('no-seller-commission-history-message');

  const historicalStatusButtons = historicalStatusFilters ? Array.from(historicalStatusFilters.querySelectorAll('button')) : [];
  const historicalRangeButtons = [historicalDateTodayBtn, historicalDateYesterdayBtn, historicalDate7DaysBtn].filter(Boolean);
  const balanceHistoryRangeButtons = [balanceHistoryTodayBtn, balanceHistoryYesterdayBtn, balanceHistory7DaysBtn].filter(Boolean);
  const clpBalanceHistoryRangeButtons = [clpBalanceHistoryTodayBtn, clpBalanceHistoryYesterdayBtn, clpBalanceHistory7DaysBtn].filter(Boolean);
  const sellerCommissionRangeButtons = [sellerCommissionHistoryTodayBtn, sellerCommissionHistoryYesterdayBtn, sellerCommissionHistory7DaysBtn].filter(Boolean);

  const setActiveChip = (buttons, activeButton = null) => {
      buttons.forEach(btn => {
          if (!btn) return;
          if (btn === activeButton) {
              btn.classList.add('is-active');
          } else {
              btn.classList.remove('is-active');
          }
      });
  };

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
  let clpBalanceHistoryData = []; // To store data for CLP balance history export
  let fullClientList = []; // Holds the raw client data

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

  /** Gets the current timezone offset between UTC and Chilean time in milliseconds. */
  const getChileanTimezoneOffset = () => {
      const now = new Date();
      const chileDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      // getTimezoneOffset returns the difference in minutes between the browser's local time and UTC.
      // We need to calculate it manually for a specific timezone.
      const browserDate = new Date(now.toLocaleString('en-US'));
      // This is a trick: the difference in getTime() between a date object created for a timezone
      // and one for the browser's locale gives us the offset we need to adjust UTC times.
      // This is not perfectly robust, but better than a fixed offset.
      // A more robust way:
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      return utcDate.getTime() - chileDate.getTime();
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
      // For infinite scroll, we clear the list only on a new search/sort
      if (clientListPage === 1) {
          clientsList.innerHTML = '';
      }

      if (filteredClientList.length === 0) {
          clientPaginationControls.classList.add('hidden'); // Hide pagination if no results
          const searchTerm = clientsSearchInput.value;
          if (!hasClientSearchBeenPerformed && !searchTerm) {
              clientsList.innerHTML = `<p class="text-gray-500">Realice una búsqueda por nombre/cédula o utilice los filtros de orden para ver la lista.</p>`;
          } else if (searchTerm) {
              clientsList.innerHTML = `<p class="text-gray-500">No se encontraron clientes para "${searchTerm}".</p>`;
          } else {
              clientsList.innerHTML = `<p class="text-gray-500">No se encontraron clientes.</p>`;
          }
          clientsCountDisplay.textContent = 0;
          return;
      }

      const totalPages = Math.ceil(filteredClientList.length / CLIENTS_PER_PAGE);

      const start = (clientListPage - 1) * CLIENTS_PER_PAGE;
      const end = start + CLIENTS_PER_PAGE;
      const clientsToRender = filteredClientList.slice(start, end);

      clientsToRender.forEach(client => {
          const latestOrder = client.latestOverall || null;
          const clientEl = document.createElement('div');
          clientEl.className = 'p-3 hover:bg-gray-100 rounded-lg flex justify-between items-center border border-gray-200';
          clientEl.innerHTML = `
              <div>
                  <p class="font-semibold text-gray-800">${client.clientName}</p>
                  <p class="text-sm text-gray-600 font-mono">${client.cedula}</p>
              </div>
              <div class="flex items-center gap-2">
                <button data-client-id="${latestOrder ? latestOrder.id : ''}" data-cedula="${client.cedula}" class="edit-client-btn bg-yellow-100 text-yellow-800 px-3 py-1 rounded-md text-xs font-semibold hover:bg-yellow-200">Editar</button>
                <button data-cedula="${client.cedula}" data-name="${client.clientName}" class="copy-client-btn bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-semibold hover:bg-blue-200">Copiar</button>
              </div>
          `;
          clientsList.appendChild(clientEl);
      });

      // Update pagination UI for infinite scroll
      const hasMorePages = clientListPage < totalPages;
      clientPaginationControls.classList.toggle('hidden', !hasMorePages);
      clientPaginationControls.classList.toggle('flex', hasMorePages);
      if (hasMorePages) {
        clientPaginationInfo.textContent = `Mostrando ${end > filteredClientList.length ? filteredClientList.length : end} de ${filteredClientList.length}. Desplaza para ver más.`;
      }
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
      // Reset to the first page whenever the view is updated by a search or sort
      clientListPage = 1;
      // Detach any existing scroll listener to prevent multiple triggers
      clientsList.removeEventListener('scroll', handleClientListScroll);

      const searchTerm = clientsSearchInput.value.toLowerCase();

      // If no search has been performed, show an empty list with instructions.
      if (!hasClientSearchBeenPerformed && !searchTerm) {
          filteredClientList = [];
          renderClientListPage();
          return;
      }

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
      // Re-attach the scroll listener for infinite scrolling
      clientsList.addEventListener('scroll', handleClientListScroll);
  };

  /** Fetches all orders to build a unique client list with their latest data. */
  const fetchAndRenderClients = async () => {
      clientsList.innerHTML = `<p class="text-gray-500">Cargando lista de clientes en segundo plano...</p>`;
      clientsCountDisplay.textContent = '...';

      try {
          const snapshot = await db.collection('orders')
              .orderBy('createdAt', 'desc')
              .get();
          
          const clientsMap = new Map(); // This will now store client profiles.
          const docs = snapshot.docs;

          const processChunk = (startIndex, chunkSize) => {
              return new Promise(resolve => {
                  setTimeout(() => {
                      const endIndex = Math.min(startIndex + chunkSize, docs.length);
                      for (let i = startIndex; i < endIndex; i++) {
                          const doc = docs[i];
                          const order = doc.data();
                          if (order.cedula && order.clientName) {
                              let clientProfile = clientsMap.get(order.cedula) || {
                                  cedula: order.cedula,
                                  clientName: order.clientName,
                                  email: order.email || '',
                                  lastOrders: {},
                                  latestOverall: null
                              };

                              clientProfile.clientName = order.clientName;
                              clientProfile.email = order.email || clientProfile.email;

                              if (order.type && !clientProfile.lastOrders[order.type]) {
                                  clientProfile.lastOrders[order.type] = { ...order, id: doc.id };
                              }
                              
                              if (!clientProfile.latestOverall) {
                                  clientProfile.latestOverall = { ...order, id: doc.id };
                                  clientProfile.id = doc.id;
                              }

                              clientsMap.set(order.cedula, clientProfile);
                          }
                      }
                      resolve();
                  }, 0); // setTimeout with 0ms yields to the browser's event loop.
              });
          };

          const CHUNK_SIZE = 500;
          for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
              await processChunk(i, CHUNK_SIZE);
          }

          fullClientList = Array.from(clientsMap.values());
          updateClientView(); 

      } catch (error) {
          console.error("Error fetching clients:", error);
          clientsList.innerHTML = `<p class="text-red-500">Error al cargar la lista de clientes.</p>`;
          clientsCountDisplay.textContent = 'Error';
          if (error.code === 'failed-precondition') {
              showCustomAlert('Error: La base de datos requiere un índice para la lista de clientes. Por favor, abre la consola (F12) y crea el índice que solicita Firebase.');
          }
      }
  };

  /** Handles infinite scrolling for the client list. */
  const handleClientListScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = clientsList;
      const totalPages = Math.ceil(filteredClientList.length / CLIENTS_PER_PAGE);

      // Check if we are near the bottom of the scroll and there are more pages to load
      if (scrollTop + clientHeight >= scrollHeight - 100 && clientListPage < totalPages) {
          clientListPage++;
          // Temporarily remove the listener to prevent multiple loads while rendering
          clientsList.removeEventListener('scroll', handleClientListScroll);
          renderClientListPage(); // This will append the next page
          clientsList.addEventListener('scroll', handleClientListScroll); // Re-attach after rendering
      }
  };

  /**
   * Abre el modal de edición de cliente y lo puebla con los datos existentes.
   * @param {string} clientId - El ID del cliente a editar.
   */
  const openEditClientModal = (cedula) => {
    const clientProfile = fullClientList.find(c => c.cedula === cedula);
    if (!clientProfile || !clientProfile.latestOverall) {
      console.error("No se pudo encontrar el cliente para editar.");
      showCustomAlert("No se pudo encontrar el cliente para editar.");
      return;
    }
    const client = clientProfile.latestOverall;

    editClientForm.reset();
    document.getElementById('edit-client-message').textContent = '';
    document.getElementById('edit-client-id').value = client.id;
    document.getElementById('edit-client-type').value = client.type;
    document.getElementById('edit-client-name').value = client.clientName;
    document.getElementById('edit-client-cedula').value = client.cedula;
    document.getElementById('edit-client-email').value = client.email || '';
    document.getElementById('edit-client-fields-transferencia').style.display = 'none';
    document.getElementById('edit-client-fields-pago-movil').style.display = 'none';
    document.getElementById('edit-client-fields-recarga').style.display = 'none';
    if (client.type === 'transferencia') {
      document.getElementById('edit-client-fields-transferencia').style.display = 'contents';
      document.getElementById('edit-client-bank-transferencia').value = client.bank;
      document.getElementById('edit-client-account-number-transferencia').value = client.accountNumber;
    } else if (client.type === 'pago-movil') {
      document.getElementById('edit-client-fields-pago-movil').style.display = 'contents';
      document.getElementById('edit-client-phone-pm').value = client.phone;
      document.getElementById('edit-client-bank-pm').value = client.bank;
    } else if (client.type === 'recarga-saldo') {
      document.getElementById('edit-client-fields-recarga').style.display = 'contents';
      document.getElementById('edit-client-phone-recarga').value = client.phone;
    }

    editClientModal.classList.remove('hidden');
    editClientModal.classList.add('flex');
  };

  /**
   * Guarda los cambios realizados en el formulario de edición de cliente.
   * @param {Event} e - El evento de submit del formulario.
   */
  const handleSaveClientChanges = async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('edit-client-message');
    showMessage(messageEl, 'Guardando cambios...', true);

    const clientId = document.getElementById('edit-client-id').value;
    const clientType = document.getElementById('edit-client-type').value;

    const updatedData = {
      clientName: document.getElementById('edit-client-name').value,
      cedula: document.getElementById('edit-client-cedula').value,
      email: document.getElementById('edit-client-email').value || null,
    };

    if (clientType === 'transferencia') {
      updatedData.bank = document.getElementById('edit-client-bank-transferencia').value;
      updatedData.accountType = document.getElementById('edit-client-account-type-transferencia').value;
      updatedData.accountNumber = document.getElementById('edit-client-account-number-transferencia').value;
    } else if (clientType === 'pago-movil') {
      updatedData.phone = document.getElementById('edit-client-phone-pm').value;
      updatedData.bank = document.getElementById('edit-client-bank-pm').value;
    } else if (clientType === 'recarga-saldo') {
      updatedData.phone = document.getElementById('edit-client-phone-recarga').value;
    }

    try {
      // --- SOLUCIÓN DEFINITIVA ---
      // Usamos .set() con { merge: true } para crear el documento si no existe (upsert).
      // Esto soluciona el error "No document to update" porque el cliente
      // podría no tener una entrada en la colección 'clients' todavía.
      await db.collection('clients').doc(clientId).set(updatedData, { merge: true });

      // Actualizar la lista local para reflejar los cambios instantáneamente
      const clientIndex = fullClientList.findIndex(c => c.latestOverall && c.latestOverall.id === clientId);
      if (clientIndex !== -1) {
        const existingProfile = fullClientList[clientIndex];
        const updatedProfile = {
          ...existingProfile,
          ...updatedData,
          id: existingProfile.id || clientId,
          latestOverall: existingProfile.latestOverall
            ? { ...existingProfile.latestOverall, ...updatedData }
            : { ...updatedData, id: clientId }
        };
        fullClientList[clientIndex] = updatedProfile;
      }

      editClientModal.classList.add('hidden');
      editClientModal.classList.remove('flex');
      showToastNotification('¡Cliente actualizado con éxito!');
      
      // Re-renderizar la lista de clientes para mostrar los cambios
      updateClientView(); 
    } catch (error) {
      console.error("Error al actualizar el cliente:", error);
      showMessage(messageEl, 'Error al guardar los cambios. Inténtalo de nuevo.', false);
    }
  };

  // --- UI Control Logic (The Definitive Solution) ---

  /**
   * Renders the exchange rate ticker.
   */
  const renderExchangeRateTicker = () => {
      const tickerWrap = document.querySelector('.ticker-wrap');
      if (!tickerWrap) return;

      const availableRates = Object.entries(exchangeRates)
          .filter(([currency, rate]) => rate > 0 && ['VES', 'COP', 'PEN'].includes(currency));

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
      
      const birthdayMessage = '<span class="font-bold text-purple-700">Cambios Manzano, Tu Cambio a Tiempo!</span>';
      const tickerHtml = `<div class="ticker-content">${birthdayMessage}${ratesPartHtml}</div>`;
      // Duplicate the entire content div for a seamless loop
      tickerWrap.innerHTML = tickerHtml + tickerHtml; // Re-added the duplication for seamless loop
  };

  /**
   * Calculates and updates the VES amount display based on CLP input.
   * @param {HTMLInputElement} clpInput The input element for CLP amount.
   * @param {HTMLSpanElement} vesDisplay The span element to display the VES amount.
   */
  const updateDestinationAmount = (clpInput, display) => {
      const clpAmount = parseFloat(clpInput.value);
      const rate = exchangeRates['VES'] || 0; // Always use VES rate for calculation

      if (!isNaN(clpAmount) && rate > 0) {
          const destAmount = roundUpToTwoDecimals(clpAmount * rate);
          display.textContent = `${destAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`;
      } else {
          display.textContent = `0,00 VES`;
      }
  };

  /** Updates the user forms based on the selected country. */
  const updateUserFormsForCountry = () => {
      // This function is now simplified for Venezuela only.
      const currencyName = 'Bolívares';

      // Ensure VE-specific fields are visible
      bankDetailsTransferencia.style.display = 'contents';
      docTypeTransferencia.classList.add('hidden'); // No doc type for VE
      docNumberLabelTransferencia.textContent = 'Cédula';
      const bankSelect = document.getElementById('bank-transferencia');
      bankSelect.required = true;

      const bankOptions = venezuelanBanks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
      bankSelect.innerHTML = `<option value="">Seleccione un banco...</option>${bankOptions}`;
      bankPmDiv.style.display = 'block';

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
      const isClientLoggedIn = currentUser && !isAdmin;

      // The user interface should only be visible if a non-admin user is logged in.
      userInterface.classList.toggle('hidden', !isClientLoggedIn);

      // Robust check: The backdate section should ONLY be managed by the admin toggle button.
      // For any other case (client login, logout), it must be hidden.
      // This prevents it from showing up in client/seller views.
      if (!isAdmin) {
          document.getElementById('admin-backdate-section').classList.add('hidden');
      }

      if (isUserView) {
          // This case is for non-admins, or when an admin logs out.
          renderAdminViewState('hidden');
      } else { // 'admin' view requested
          // This shows the admin login form or the full panel.
          renderAdminViewState(isAdmin ? 'panel' : 'login'); // Si es vista admin, mostrar panel o login según el estado.
      }

      if (!isUserView && isAdmin) { // If admin view is active
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

  /** Processes the user's order history to create a unique list of beneficiaries. */
  const processAndRenderBeneficiaries = () => {
      const beneficiariesMap = new Map();
      userOwnOrders.forEach(order => {
          if (order.status === 'Cliente Registrado' || !order.clientName || !order.cedula) return;

          let key;
      let beneficiaryData = {
          name: order.clientName,
          cedula: order.cedula,
          email: order.email || '',
          type: order.type
      };

          switch (order.type) {
              case 'transferencia':
                  if (!order.accountNumber) return;
                  key = `transferencia-${order.accountNumber}`;
              beneficiaryData = { ...beneficiaryData, bank: order.bank, accountType: order.accountType || '', accountNumber: order.accountNumber };
                  break;
              case 'pago-movil':
                  if (!order.phone) return;
                  key = `pago-movil-${order.phone}`;
                  beneficiaryData = { ...beneficiaryData, phone: order.phone, bank: order.bank };
                  break;
              case 'recarga-saldo':
                  if (!order.phone) return;
                  key = `recarga-saldo-${order.phone}`;
                  beneficiaryData = { ...beneficiaryData, phone: order.phone };
                  break;
              default:
                  return;
          }

          if (!beneficiariesMap.has(key)) {
              beneficiariesMap.set(key, beneficiaryData);
          }
      });

      userSavedBeneficiaries = Array.from(beneficiariesMap.values());
      renderSavedBeneficiaries();
  };

  /** Renders the list of saved beneficiaries for the user to select from. */
  const renderSavedBeneficiaries = () => {
      const lists = {
          transferencia: savedAccountsListTransferencia,
          'pago-movil': savedAccountsListPagoMovil,
          'recarga-saldo': savedAccountsListRecargaSaldo
      };
      const toggles = {
          transferencia: toggleSavedAccountsTransferencia,
          'pago-movil': toggleSavedAccountsPagoMovil,
          'recarga-saldo': toggleSavedAccountsRecargaSaldo
      };

      // Clear all lists and hide all toggles first
      Object.values(lists).forEach(list => { if (list) list.innerHTML = ''; });
      Object.values(toggles).forEach(toggle => { if (toggle) toggle.classList.add('hidden'); });

      userSavedBeneficiaries.forEach(beneficiary => {
          const listContainer = lists[beneficiary.type];
          const toggleButton = toggles[beneficiary.type];
          if (!listContainer || !toggleButton) return;

          toggleButton.classList.remove('hidden'); // Show the toggle button if there's at least one beneficiary of this type

          let details = '';
          if (beneficiary.type === 'transferencia') details = `<p class="text-xs text-gray-500">${beneficiary.bank} - Cta. ...${beneficiary.accountNumber.slice(-4)}</p>`;
          else if (beneficiary.type === 'pago-movil') details = `<p class="text-xs text-gray-500">${beneficiary.bank} - Tel. ${beneficiary.phone}</p>`;
          else if (beneficiary.type === 'recarga-saldo') details = `<p class="text-xs text-gray-500">Tel. ${beneficiary.phone}</p>`;

          const card = document.createElement('div');
          card.className = 'p-2 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors';
          card.dataset.beneficiary = JSON.stringify(beneficiary);
          card.innerHTML = `
              <p class="font-semibold text-sm">${beneficiary.name}</p>
              ${details}
          `;
          listContainer.appendChild(card);
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
              if (order.clientProofUrl) {
                  proofLink = `<a href="${order.clientProofUrl}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:underline font-semibold">Ver Comprobante</a>`;
              }
              break;
          case 'Pagado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">Pagado</span>`;
              if (order.proofUrl) {
                  // If the user is a seller, show a share button.
                  if (isSeller) {
                      // NEW: Check if file sharing is supported
                      if (navigator.share && navigator.canShare) {
                          // If yes, render the button to share the file directly
                          proofLink = `
                            <button data-proof-url="${order.proofUrl}" data-client-name="${order.clientName}" class="share-proof-btn flex items-center gap-1 bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-600">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"></path></svg>
                                <span>Compartir Archivo</span>
                            </button>`;
                      } else {
                          // If not, render a button to share the link via WhatsApp as a fallback
                          const shareText = encodeURIComponent(`Comprobante de pago para ${order.clientName}`);
                          const shareUrl = encodeURIComponent(order.proofUrl);
                          proofLink = `
                            <a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-600">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                                <span>Compartir Enlace</span>
                            </a>`;
                      }
                  } else {
                      // Otherwise, show the standard "View Proof" link for regular clients.
                      proofLink = `<a href="${order.proofUrl}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:underline font-semibold">Ver Comprobante</a>`;
                  }
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

      let details = `
          <p class="text-sm"><span class="font-semibold">Correo:</span> ${order.email || 'N/A'}</p>
      `;
      switch (order.type) {
          case 'transferencia':
              details += `
                  <p class="text-sm"><span class="font-semibold">Banco:</span> ${order.bank || 'N/A'}</p>
                  ${order.accountType ? `<p class="text-sm"><span class="font-semibold">Tipo:</span> ${order.accountType}</p>` : ''}
                  <p class="text-sm truncate"><span class="font-semibold">Cuenta:</span> ${order.accountNumber || 'N/A'}</p>
              `;
              break;
          case 'pago-movil':
              details += `
                  <p class="text-sm"><span class="font-semibold">Teléfono:</span> ${order.phone || 'N/A'}</p>
                  <p class="text-sm"><span class="font-semibold">Banco:</span> ${order.bank || 'N/A'}</p>
              `;
              break;
          case 'recarga-saldo':
              details += `<p class="text-sm"><span class="font-semibold">Teléfono:</span> ${order.phone || 'N/A'}</p>`;
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
              
              const clientProofButton = order.clientProofUrl 
                  ? `<a href="${order.clientProofUrl}" target="_blank" rel="noopener noreferrer" class="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-600">Ver Comprobante CLP</a>`
                  : '';

              actionButtons = `
                  ${clientProofButton}
                  <button data-id="${orderId}" class="copy-order-btn bg-blue-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-600">Copiar</button>
                  <button data-id="${orderId}" class="mark-paid-btn bg-green-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-600">Pagar</button>
                  <button data-id="${orderId}" class="cancel-order-btn bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600">Cancelar</button>
              `;
              break;
          case 'Pagado':
              statusBadge = `<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">${order.status}</span>`;
              if (order.proofUrl) {
                  if (navigator.share && navigator.canShare) {
                      actionButtons = `
                        <button data-proof-url="${order.proofUrl}" data-client-name="${order.clientName}" class="share-proof-btn flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"></path></svg>
                            <span>Compartir Archivo</span>
                        </button>`;
                  } else {
                      const shareText = encodeURIComponent(`Comprobante de pago para ${order.clientName}`);
                      const shareUrl = encodeURIComponent(order.proofUrl);
                      actionButtons = `
                        <a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                            <span>Compartir Enlace</span>
                        </a>`;
                  }
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

      const createdByTagHtml = order.createdByTag ? `<span class="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded" title="Creado por">C:${order.createdByTag}</span>` : '';
      const paidByTagHtml = order.paidByTag ? `<span class="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded" title="Pagado por">P:${order.paidByTag}</span>` : '';

      return `
          <div class="p-4 rounded-lg shadow-md bg-white border-2 ${order.isDuplicate ? 'border-red-400 bg-red-50' : (order.isDebtor ? 'border-orange-400' : 'border-transparent')}" data-status="${order.status}">
              <div class="flex justify-between items-start mb-2">
                  <div>
                      <p class="font-bold text-gray-800">${order.clientName}</p>
                      <p class="text-sm text-gray-500">CI: ${order.cedula}</p>
                  </div>
                  <div class="flex flex-col items-end gap-2 text-right">
                    <div class="flex items-center gap-1">${createdByTagHtml}<span class="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">ID: ${orderIdTag}</span></div>
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
                    <div class="flex items-center gap-1">
                        ${paidByTagHtml}
                    </div>
                    ${debtorButton}
                    ${actionButtons}
                </div>
              ` : `
                <div class="flex justify-end items-center space-x-2 mt-3">
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

  /**
   * Handles sharing a proof file using the Web Share API with a fallback.
   * @param {string} proofUrl The URL of the file to share.
   * @param {string} clientName The name of the client for the share text.
   */
  const handleShareProof = async (proofUrl, clientName) => {
      const shareText = `Comprobante de pago para ${clientName}`;

      // Check if Web Share API and canShare({ files: ... }) are supported
      if (navigator.share && navigator.canShare) {
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');
          try {
              // Fetch the file from the URL
              const response = await fetch(proofUrl);
              if (!response.ok) {
                  throw new Error(`No se pudo descargar el archivo: ${response.statusText}`);
              }
              const blob = await response.blob();
              const fileName = proofUrl.split('/').pop().split('#')[0].split('?')[0];
              const file = new File([blob], fileName, { type: blob.type });

              // Check if the browser can share this file type
              if (navigator.canShare({ files: [file] })) {
                  await navigator.share({
                      files: [file],
                      title: 'Comprobante de Pago',
                      text: shareText,
                  });
              } else {
                  throw new Error('El navegador no puede compartir este tipo de archivo.');
              }
          } catch (error) {
              console.error('Error al compartir archivo, usando fallback:', error);
              // Fallback to sharing the link if file sharing fails
              const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}%20${encodeURIComponent(proofUrl)}`;
              window.open(fallbackUrl, '_blank');
          } finally {
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
          }
      } else {
          // Fallback for browsers that don't support Web Share API at all
          const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}%20${encodeURIComponent(proofUrl)}`;
          window.open(fallbackUrl, '_blank');
      }
  };

  /** Attaches a real-time listener for today's orders. */
  const attachOrdersListener = () => {
      // CORRECCIÓN GLOBAL DE ZONA HORARIA: Usar lógica robusta para el día actual en Chile.
      // Esto evita problemas con el cambio de horario de verano (UTC-3 vs UTC-4).
      const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
      const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

      const createdTodayQuery = db.collection('orders')
          .where('createdAt', '>=', startOfDay)
          .where('createdAt', '<=', endOfDay)
          .orderBy('createdAt', 'desc');

      ordersListener = createdTodayQuery.onSnapshot(snapshot => {
          isInitialOrdersLoad = false; // Set flag after first run

          let pendingOrdersCount = 0;
          let pendingDestTotal = 0;
          let paidCount = 0;
          let paidDestTotal = 0;

          // Clear only the pending list. The paid list will be managed to avoid flicker.
          ordersListPending.innerHTML = '';

          if (snapshot.empty) {
              noOrdersPendingMessage.classList.remove('hidden');
          } else {
              noOrdersPendingMessage.classList.add('hidden');
          }

          snapshot.forEach(doc => {
              const order = doc.data();
              // Do not render dummy client registration orders in the list
              if (order.status === 'Cliente Registrado') {
                  return;
              }

              const existingCard = document.querySelector(`[data-order-id="${doc.id}"]`);
              if (existingCard) existingCard.remove(); // Remove old card to re-render

              const mockDoc = { id: doc.id, data: () => order };
              const orderHtml = renderOrder(mockDoc);
              if (order.status === 'Pagado') {
                  ordersListPaid.innerHTML += orderHtml;
                  paidCount++;
                  paidDestTotal += order.destinationAmount || 0;
              } else { // 'Pendiente de pago' or 'Cancelado' (for orders created today)
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

  /** Attaches a real-time listener for the accounts collection. */
  const attachAccountsListener = (onFirstLoad = null) => {
      if (accountsListener) accountsListener(); // Detach previous listener

      // This listener now rebuilds the accountsData array on every snapshot
      // to ensure data consistency and prevent duplicates from race conditions.
      accountsListener = db.collection('accounts').onSnapshot(snapshot => {
          const uniqueHolders = new Set();
          accountsData = []; // Clear the array to rebuild it

          snapshot.forEach(doc => {
              accountsData.push({ id: doc.id, ...doc.data() });
          });

          // After applying all changes, recalculate totals and update relevant UI
          let totalBalance = 0;
          accountsData.forEach(account => {
              totalBalance += account.balance || 0;
              uniqueHolders.add(account.holder);
          });

          // Update total balance display
          if (vesBalanceDisplay) {
              vesBalanceDisplay.textContent = totalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' VES';
          }

          // NEW: Update total balance display for sellers
          const sellerVesBalanceDisplay = document.getElementById('seller-global-ves-balance');
          if (sellerVesBalanceDisplay) {
              sellerVesBalanceDisplay.textContent = totalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' VES';
          }

          // Update the main list of balances on the admin dashboard
          renderAccountsBalanceList();

          // Populate holder select for balance operations
          if (balanceOpHolderSelect) {
              const sortedHolders = Array.from(uniqueHolders).sort();
              balanceOpHolderSelect.innerHTML = sortedHolders.map(holder => `<option value="${holder}">${holder}</option>`).join('');
          }

          // Execute callback on first load (for initial history loading)
          if (typeof onFirstLoad === 'function') {
              onFirstLoad();
              onFirstLoad = null; // Ensure it only runs once
          }
      }, error => {
          console.error("Error fetching accounts:", error);
          if (vesBalanceDisplay) {
              vesBalanceDisplay.textContent = 'Error al cargar';
          }
      });
  };

  const updateCommissionSummary = () => {
      const adminLine = roundUpToTwoDecimals(todaysAdminCommissionTotal);
      const tilloLine = roundUpToTwoDecimals(todaysTilloCommissionTotal);
      const bankLine = roundUpToTwoDecimals(todaysBankFeeTotal);
      const totalLine = roundUpToTwoDecimals(adminLine + tilloLine + bankLine);

      const breakdownEl = document.getElementById('commission-breakdown');
      const markup = `
          <div class="flex justify-between items-center p-2 rounded-lg ${adminLine > 0 ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'}">
              <span class="font-medium">Comisión Admin 1%</span>
              <span class="font-semibold">${adminLine.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
          </div>
          <div class="flex justify-between items-center p-2 rounded-lg ${tilloLine > 0 ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-600'}">
              <span class="font-medium">Mano Tillo 0.15%</span>
              <span class="font-semibold">${tilloLine.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
          </div>
          <div class="flex justify-between items-center p-2 rounded-lg ${bankLine > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
              <span class="font-medium">Comisiones Banco</span>
              <span class="font-semibold">${bankLine.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
          </div>
          <div class="flex justify-between items-center p-2 rounded-lg bg-blue-100 text-blue-800 border-t border-blue-200">
              <span class="font-bold">Total Comisiones</span>
              <span class="font-bold">${totalLine.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
          </div>
      `;

      if (breakdownEl) {
          breakdownEl.innerHTML = markup;
          return;
      }

      const summaryContainer = document.getElementById('admin-commission-summary');
      if (!summaryContainer) return;

      summaryContainer.innerHTML = `
          <div class="space-y-2 text-sm">
              <div id="commission-breakdown">
                  ${markup}
              </div>
          </div>
      `;
  };

  updateCommissionSummary();

  /** Attaches a real-time listener for today's admin commission total. */
  const attachAdminCommissionListener = () => {
      if (adminCommissionListener) adminCommissionListener(); // Detach old one
      if (tilloCommissionListener) tilloCommissionListener();

      // CORRECCIÓN GLOBAL DE ZONA HORARIA: Usar lógica robusta para el día actual en Chile.
      const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const todayStart = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
      const todayEnd = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));
      const todayString = nowInChile.toLocaleDateString('en-CA'); // Para el commissionListenerDate

      // Store the full date string (YYYY-MM-DD) to check for midnight crossing.
      commissionListenerDate = todayString;
      console.log(`[Commission Listener] Attached for date: ${commissionListenerDate}`);

      const query = db.collection('balance_history')
          .where('type', '==', 'admin_commission')
          .where('timestamp', '>=', todayStart)
          .where('timestamp', '<=', todayEnd)
          .orderBy('timestamp', 'desc');

      todaysAdminCommissionTotal = 0;
      todaysTilloCommissionTotal = 0;
      updateCommissionSummary();

      adminCommissionListener = query.onSnapshot(snapshot => {
          let totalAdminCommissionToday = 0;
          snapshot.forEach(doc => {
              totalAdminCommissionToday += doc.data().amount;
          });
          todaysAdminCommissionTotal = roundUpToTwoDecimals(totalAdminCommissionToday);
          updateCommissionSummary();
      }, error => {
          console.error("Error fetching today's admin commission:", error);
          todaysAdminCommissionTotal = 0;
          todaysTilloCommissionTotal = 0;
          updateCommissionSummary();
      });

      const tilloQuery = db.collection('balance_history')
          .where('type', '==', 'tillo_commission')
          .where('timestamp', '>=', todayStart)
          .where('timestamp', '<=', todayEnd)
          .orderBy('timestamp', 'desc');

      tilloCommissionListener = tilloQuery.onSnapshot(snapshot => {
          let totalTillo = 0;
          snapshot.forEach(doc => {
              totalTillo += doc.data().amount;
          });
          todaysTilloCommissionTotal = roundUpToTwoDecimals(totalTillo);
          updateCommissionSummary();
      }, error => {
          console.error("Error fetching today's Tillo commission:", error);
          todaysTilloCommissionTotal = 0;
          updateCommissionSummary();
      });
  };

  /** Attaches a real-time listener for today's bank fee total. */
  const attachBankFeeListener = () => {
      if (bankFeeListener) bankFeeListener(); // Detach old one

      // CORRECCIÓN GLOBAL DE ZONA HORARIA: Usar lógica robusta para el día actual en Chile.
      const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const todayStart = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
      const todayEnd = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

      const query = db.collection('balance_history')
          .where('type', '==', 'fee')
          .where('timestamp', '>=', todayStart)
          .where('timestamp', '<=', todayEnd);

      todaysBankFeeTotal = 0;
      updateCommissionSummary();

      bankFeeListener = query.onSnapshot(snapshot => {
          let totalBankFeeToday = 0;
          snapshot.forEach(doc => {
              totalBankFeeToday += doc.data().amount;
          });
          todaysBankFeeTotal = roundUpToTwoDecimals(totalBankFeeToday);
          updateCommissionSummary();
      }, error => {
          console.error("Error fetching today's bank fees:", error);
          todaysBankFeeTotal = 0;
          updateCommissionSummary();
      });
  };

  /** Attaches a real-time listener for the logged-in seller's commission. */
  const attachSellerCommissionListener = (userId) => {
      if (sellerCommissionListener) sellerCommissionListener();

      // CORRECCIÓN GLOBAL DE ZONA HORARIA: Usar lógica robusta para el día actual en Chile.
      const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
      const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));
      const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfDay);
      const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfDay);

      const query = db.collection('seller_commissions')
          .where('sellerId', '==', userId)
          .where('timestamp', '>=', startTimestamp)
          .where('timestamp', '<=', endTimestamp)
          .orderBy('timestamp', 'desc');

      sellerCommissionListener = query.onSnapshot(snapshot => {
          let totalCommission = 0;
          let orderCount = 0;
          snapshot.forEach(doc => {
              totalCommission += doc.data().commissionAmountCLP || 0;
              orderCount++;
          });

          const totalEl = document.getElementById('seller-commission-total');
          const detailsEl = document.getElementById('seller-commission-details');

          if (totalEl) {
              totalEl.textContent = totalCommission.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
          }
          if (detailsEl) {
              if (orderCount === 0) {
                  detailsEl.textContent = 'Aún no has generado comisiones hoy.';
              } else {
                  detailsEl.textContent = `Basado en ${orderCount} pedido(s) de hoy. Tasa: ${(commissionRate * 100).toFixed(2)}%`;
              }
          }
      }, error => {
          console.error("Error fetching seller commissions:", error);
          const totalEl = document.getElementById('seller-commission-total');
          const detailsEl = document.getElementById('seller-commission-details');
          if (totalEl) totalEl.textContent = 'Error';
          
          if (error.code === 'failed-precondition') {
              if (detailsEl) detailsEl.textContent = 'Error de configuración. Contacta al administrador.';
              showCustomAlert('Error de configuración en la vista de comisiones. El administrador debe crear un índice en la base de datos (revisar la consola para el enlace).');
          } else {
              if (detailsEl) detailsEl.textContent = 'No se pudieron cargar las comisiones.';
          }
      });
  };

  /** Attaches a listener for the admin to see all seller commissions for the day. */
  const attachAdminSellerCommissionsListener = () => {
      if (adminSellerCommissionsListener) adminSellerCommissionsListener();

      // CORRECCIÓN: Se elimina el offset UTC fijo (-04:00) para que la consulta
      // sea robusta ante los cambios de horario de verano en Chile (UTC-3 / UTC-4).
      // Se obtienen el inicio y fin del día en la zona horaria de Santiago. (Ya aplicado en el commit anterior, se mantiene)
      const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
      const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));
      const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfDay);
      const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfDay);

      const query = db.collection('seller_commissions')
          .where('timestamp', '>=', startTimestamp)
          .where('timestamp', '<=', endTimestamp)
          .orderBy('timestamp', 'desc'); // Se añade un orden para consistencia.

      adminSellerCommissionsListener = query.onSnapshot(snapshot => {
          const commissionsBySeller = {};

          snapshot.forEach(doc => {
              const commission = doc.data();
              if (!commissionsBySeller[commission.sellerEmail]) {
                  commissionsBySeller[commission.sellerEmail] = { totalCLP: 0, orderCount: 0 };
              }
              commissionsBySeller[commission.sellerEmail].totalCLP += commission.commissionAmountCLP || 0;
              commissionsBySeller[commission.sellerEmail].orderCount++;
          });

          const listEl = document.getElementById('admin-seller-commissions-list');
          if (!listEl) return;

          if (Object.keys(commissionsBySeller).length === 0) {
              listEl.innerHTML = '<p class="text-gray-500">No hay comisiones de vendedores para hoy.</p>';
              return;
          }

          listEl.innerHTML = Object.entries(commissionsBySeller).map(([email, data]) => `
              <div class="flex justify-between items-center p-2 bg-purple-50 rounded-lg">
                  <p class="font-medium text-gray-700">${email}</p>
                  <p class="font-semibold text-purple-700">${data.totalCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })} (${data.orderCount} pedidos)</p>
              </div>`).join('');
      }, error => console.error("Error fetching admin seller commissions:", error));
  };

  /** Populates the seller dropdown for the commission history search. */
  const populateSellerSelect = async () => {
      if (!sellerCommissionHistorySelect) return;

      const sellerEmails = new Set(
          Object.entries(userTags)
              .filter(([, tag]) => typeof tag === 'string' && tag.startsWith('V'))
              .map(([email]) => email)
      );

      try {
          const snapshot = await db.collection('seller_commissions').get();
          snapshot.forEach(doc => {
              const email = (doc.data().sellerEmail || '').trim();
              if (email) sellerEmails.add(email);
          });
      } catch (error) {
          console.error("Error fetching sellers for commission history:", error);
      }

      const sortedEmails = Array.from(sellerEmails).sort((a, b) => a.localeCompare(b));
      sellerCommissionHistorySelect.innerHTML = '<option value="">-- Elige un vendedor --</option>';
      sortedEmails.forEach(email => {
          const option = document.createElement('option');
          option.value = email;
          option.textContent = email;
          sellerCommissionHistorySelect.appendChild(option);
      });

      if (!sellerCommissionHistorySelect.dataset.initialized && sortedEmails.length > 0) {
          sellerCommissionHistorySelect.value = sortedEmails[0];
          const today = getChileanDateForPicker(new Date());
          setSellerCommissionDateRangeAndSearch(today, today);
          sellerCommissionHistorySelect.dataset.initialized = 'true';
      }
  };

  const setSellerCommissionDateRangeAndSearch = (start, end) => {
      sellerCommissionHistoryStart.valueAsDate = start;
      sellerCommissionHistoryEnd.valueAsDate = end;
      handleSellerCommissionSearch();
  };

  /**
   * Checks for a specific order ID in the URL and opens the payment modal if found.
   * This is used to handle clicks from push notifications.
   */
  const handleDirectPaymentFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const orderIdToPay = urlParams.get('pay_order_id');

      if (orderIdToPay && isAdmin) { // Double-check admin status
          console.log(`[URL Handler] Detected order ID to pay: ${orderIdToPay}`);
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');
          try {
              const orderDoc = await db.collection('orders').doc(orderIdToPay).get();
              if (orderDoc.exists) {
                  const orderData = orderDoc.data();
                  if (orderData.status === 'Pendiente de pago') {
                      // Open the correct payment flow based on currency
                      if (orderData.destinationCurrency === 'VES') {
                          openPaymentSourceModal(orderIdToPay, orderData);
                      } else {
                          paymentData = { orderId: orderIdToPay, orderData };
                          showMessage('admin-upload-message', '', true);
                          adminScreenshotInput.value = '';
                          adminUploadModal.classList.remove('hidden');
                          adminUploadModal.classList.add('flex');
                      }
                  } else {
                      showCustomAlert(`El pedido #${orderIdToPay.slice(-5)} ya no está pendiente de pago (estado: ${orderData.status}).`);
                  }
              } else {
                  showCustomAlert(`No se encontró el pedido con ID: ${orderIdToPay}`);
              }
          } catch (error) {
              console.error('Error handling direct payment from URL:', error);
              showCustomAlert(`Error al procesar el pedido desde la notificación: ${error.message}`);
          } finally {
              // Clean the URL to prevent re-triggering on refresh
              history.replaceState({}, document.title, window.location.pathname);
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
          }
      }
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

              // After populating all orders, process them to find unique beneficiaries
              processAndRenderBeneficiaries();
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
              isSeller = !!idTokenResult.claims.seller;
              sellerRequiresProof = !!idTokenResult.claims.requiresProof; // NEW: Read the special claim
              commissionRate = idTokenResult.claims.commissionRate || 0;

              // Get a reference to the backdate section to control its visibility.
              const adminBackdateSection = document.getElementById('admin-backdate-section');

              // --- DEFINITIVE FIX: Show notification button for ALL logged-in users ---
              notificationsSection.classList.remove('hidden');
              setupPushNotifications();

              userIdDisplay.textContent = `Conectado como: ${user.email}`;
              mainActionBtn.textContent = 'Cerrar Sesión';
              showAdminLoginBtn.classList.add('hidden');

              if (isAdmin) {
                  mainActionBtnContainer.classList.add('hidden');
                  switchMainView('admin');
                  adminCreateOrderToggleBtn.classList.remove('hidden'); // RESTORED: Show the button for admins
                  if (!ordersListener) {
                      attachOrdersListener(); // Attach listener if admin
                      fetchAndRenderClients(); // Fetch clients when admin logs in
                      attachAdminSellerCommissionsListener();
                      populateSellerSelect();

                      // Set up an interval to re-attach the listener if the day changes.
                      if (!commissionCheckInterval) {
                          commissionCheckInterval = setInterval(() => {
                              const todayDateString = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
                              if (commissionListenerDate !== null && todayDateString !== commissionListenerDate) {
                                  console.log("Midnight (Chile time) has passed. Re-attaching admin commission listener for the new day.");
                                  attachAdminCommissionListener();
                                  attachBankFeeListener();
                              }
                          }, 60 * 1000); // Check every minute
                      }
                      // Attach listener and provide a callback to run after the first data load
                      const onFirstLoad = () => {
                          console.log("Initial data load for histories...");
                          const today = getChileanDateForPicker(new Date());
                          // For balance history
                          balanceHistoryStartInput.valueAsDate = today;
                          balanceHistoryEndInput.valueAsDate = today;
                          fetchAndRenderBalanceHistory(today, today);
                          
                          // For historical orders
                          setDateRangeAndSearch(today, today);

                          // For CLP balance history
                          const adminTag = userTags[user.email];
                          if (adminTag === 'A1' || adminTag === 'A2') {
                              clpBalanceHistorySection.classList.remove('hidden');
                              document.getElementById('clp-balance-history-start').valueAsDate = today;
                              document.getElementById('clp-balance-history-end').valueAsDate = today;
                              handleClpBalanceHistorySearch(today, today);
                          }

                          handleDirectPaymentFromUrl();
                      };
                      attachAccountsListener(onFirstLoad);
                      attachAdminCommissionListener(); // Attach these listeners after accounts listener is set up
                      attachBankFeeListener(); 
                  }
              } else { // This block is for non-admins (clients AND sellers)
                  // Ensure the main user-level controls are visible
                  mainActionBtnContainer.classList.remove('hidden');

                  adminCreateOrderToggleBtn.classList.add('hidden'); // Ensure toggle is hidden for non-admins
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

                  if (isSeller) {
                      document.getElementById('seller-commission-section').classList.remove('hidden');
                      attachSellerCommissionListener(user.uid);
                      // NEW: Show global balance for sellers
                      document.getElementById('seller-global-balance-section').classList.remove('hidden');
                      attachAccountsListener(); // Attach the listener to get balance data

                      fetchAndRenderClients(); // Sellers get access to the full client list
                  }

                  switchMainView('user');
              }
          });
      } else { // No user logged in
          isAdmin = false;
          currentUser = null;
          isSeller = false;
          sellerRequiresProof = false; // NEW: Reset on logout
          document.getElementById('admin-backdate-section').classList.add('hidden'); // Hide on logout
          
          mainActionBtnContainer.classList.remove('hidden');

          userIdDisplay.textContent = '';
          adminCreateOrderToggleBtn.classList.add('hidden');
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
          userSavedBeneficiaries = [];
          if (sellerCommissionListener) {
              sellerCommissionListener();
              sellerCommissionListener = null;
          }
          if (adminSellerCommissionsListener) {
              adminSellerCommissionsListener();
              adminSellerCommissionsListener = null;
          }
          document.getElementById('seller-commission-section').classList.add('hidden');
          document.getElementById('seller-global-balance-section').classList.add('hidden'); // NEW: Hide on logout
          renderSavedBeneficiaries(); // This will clear lists and hide toggles
          isInitialOrdersLoad = true; // Reset flag on logout
          if (accountsListener) {
              accountsListener();
              accountsListener = null;
          }
          if (adminCommissionListener) { // NEW
              adminCommissionListener();
              adminCommissionListener = null;
          }
          if (tilloCommissionListener) { // NEW
              tilloCommissionListener();
              tilloCommissionListener = null;
          }
          if (bankFeeListener) { // NEW
              bankFeeListener();
              bankFeeListener = null;
          }
          todaysAdminCommissionTotal = 0;
          todaysTilloCommissionTotal = 0;
          todaysBankFeeTotal = 0;
          updateCommissionSummary();
          if (clpBalanceHistorySection) {
              clpBalanceHistorySection.classList.add('hidden');
          }
          if (commissionCheckInterval) { // NEW
              clearInterval(commissionCheckInterval);
              commissionCheckInterval = null;
              commissionListenerDate = null;
          }
          fullClientList = [];
          clientsSearchInput.value = '';
          hasClientSearchBeenPerformed = false;
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
      } else if (history.type === 'tillo_commission') {
          debit = formattedAmount;
          if (!description) description = `Mano Tillo`;
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
    const adminCommissionSummaryEl = document.getElementById('admin-commission-summary');
    if (!accountsListEl) return;
    
    // Filter to show only accounts with a balance > 0 in this view.
    const accountsWithBalance = accountsData.filter(acc => acc.balance > 0);
    const totalVesBalance = accountsData.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    if (accountsWithBalance.length === 0) {
        accountsListEl.innerHTML = '<p class="text-gray-500">No hay cuentas con saldo registradas.</p>';
        if (adminCommissionSummaryEl) adminCommissionSummaryEl.innerHTML = ''; // Clear summary if no balance
        return;
    }

    accountsListEl.innerHTML = '';
    // Sort by holder name
    const sortedAccounts = accountsWithBalance.sort((a, b) => a.holder.localeCompare(b.holder));

    // --- DEFINITIVE FIX: Calculate totalClpBalance dynamically from totalVesBalance and current purchase rate ---
    const currentPurchaseRateVES = exchangeRates.purchaseRateVES || 0;
    const displayedClpBalance = currentPurchaseRateVES > 0 ? roundUpToTwoDecimals(totalVesBalance / currentPurchaseRateVES) : 0;

    sortedAccounts.forEach(account => {
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center p-2 bg-blue-50 rounded-lg';
        el.innerHTML = `
            <p class="font-medium text-gray-700">${account.holder} - ${account.bank}</p>
            <p class="font-semibold text-blue-700">${(account.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</p>
        `;
        accountsListEl.appendChild(el);
    });

    // Update Admin Commission Summary with CLP details
    if (adminCommissionSummaryEl) {
        adminCommissionSummaryEl.innerHTML = `
          <div class="space-y-2 text-sm">
              <div id="commission-breakdown"></div>
              <div class="flex justify-between border-t border-gray-300 pt-2 mt-2"><span class="font-bold text-gray-800">Saldo Bruto (CLP):</span> <span class="font-bold text-blue-600">${displayedClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</span></div>
          </div>
      `;
        updateCommissionSummary();
    }
  };

  /** Renders or refreshes the list of accounts in the payment source modal. */
  const renderPaymentSourceList = () => {
      if (!paymentData.orderData) return; // Don't render if no payment is active
      const { orderData } = paymentData;

      paymentSourceList.innerHTML = '';

      // --- NEW: Filter to show only accounts with a positive balance ---
      const accountsWithBalance = accountsData.filter(acc => acc.balance > 0);

      if (accountsWithBalance.length === 0) return;

      // Sort accounts: those with enough balance first, then by balance descending.
      const sortedAccounts = [...accountsWithBalance].sort((a, b) => {
          const feeA = calculateFee(orderData, a);
          const totalDebitA = (orderData.destinationAmount || 0) + feeA;
          const hasEnoughA = a.balance >= totalDebitA;

          const feeB = calculateFee(orderData, b);
          const totalDebitB = (orderData.destinationAmount || 0) + feeB;
          const hasEnoughB = b.balance >= totalDebitB;

          if (hasEnoughA && !hasEnoughB) return -1; // a comes first
          if (!hasEnoughA && hasEnoughB) return 1;  // b comes first
          
          // If both have enough, or neither has enough, sort by balance descending
          return b.balance - a.balance;
      });

      sortedAccounts.forEach(account => {
          const fee = calculateFee(orderData, account);
          // Use destinationAmount, with a fallback to vesAmount for migrated data
          const totalDebit = (orderData.destinationAmount || orderData.vesAmount || 0) + fee;
          const hasEnoughBalance = account.balance >= totalDebit;
          const radioId = `account-${account.id}`;
          const accountEl = document.createElement('div');
          accountEl.innerHTML = `
              <label for="${radioId}" class="flex items-center p-3 rounded-lg border transition-all ${hasEnoughBalance ? 'cursor-pointer hover:bg-gray-100 border-gray-200' : 'opacity-50 bg-red-50 border-red-200'}">
                  <input type="radio" name="payment-source" id="${radioId}" value="${account.id}" class="h-5 w-5 text-blue-600 focus:ring-blue-500 mr-3" ${!hasEnoughBalance ? 'disabled' : ''}>
                  <div class="flex-grow">
                      <p class="font-semibold">${account.holder} - ${account.bank}</p>
                      <p class="text-sm text-gray-600">Disponible: ${account.balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</p>
                  </div>
              </label>
          `;
          paymentSourceList.appendChild(accountEl);
      });
  };

  // --- Saved Beneficiaries Logic ---
  toggleSavedAccountsTransferencia.addEventListener('click', () => savedAccountsListTransferencia.classList.toggle('hidden'));
  toggleSavedAccountsPagoMovil.addEventListener('click', () => savedAccountsListPagoMovil.classList.toggle('hidden'));
  toggleSavedAccountsRecargaSaldo.addEventListener('click', () => savedAccountsListRecargaSaldo.classList.toggle('hidden'));

  const handleBeneficiarySelect = (e) => {
      const card = e.target.closest('[data-beneficiary]');
      if (!card) return;

      const beneficiary = JSON.parse(card.dataset.beneficiary);
      const formId = `remittance-form-${beneficiary.type}`;
      const form = document.getElementById(formId);
      if (!form) return;

      // Fill common fields
      form.querySelector('input[id^="name-"]').value = beneficiary.name;
      form.querySelector('input[id^="cedula-"]').value = beneficiary.cedula;
      const emailField = form.querySelector('input[id^="email-"]');
      if (emailField) emailField.value = beneficiary.email || '';

      // Fill specific fields
      switch (beneficiary.type) {
          case 'transferencia':
              form.querySelector('#bank-transferencia').value = beneficiary.bank;
              const accountTypeField = form.querySelector('#account-type-transferencia');
              if (accountTypeField) accountTypeField.value = beneficiary.accountType || '';
              form.querySelector('#account-number-transferencia').value = beneficiary.accountNumber;
              break;
          case 'pago-movil':
              form.querySelector('#phone-pm').value = beneficiary.phone;
              form.querySelector('#bank-pm').value = beneficiary.bank;
              break;
          case 'recarga-saldo':
              form.querySelector('#phone-rs').value = beneficiary.phone;
              break;
      }

      card.parentElement.classList.add('hidden');
      const messageElId = form.querySelector('p[id^="user-message-"]').id;
      showMessage(messageElId, `Datos de ${beneficiary.name} seleccionados.`, true);
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
      const defaultMessageIds = {
          transferencia: 'user-message-transferencia',
          'pago-movil': 'user-message-pm',
          'recarga-saldo': 'user-message-rs',
      };
      const fallbackMessageId = defaultMessageIds[type] ?? `user-message-${type}`;

      let messageEl = form.querySelector('p[id^="user-message-"]') || document.getElementById(fallbackMessageId);
      if (!messageEl) {
          messageEl = document.createElement('p');
          messageEl.id = fallbackMessageId;
          messageEl.className = 'mt-4 text-center font-medium';
          form.appendChild(messageEl);
      }
      const messageElId = messageEl.id;

      const fieldMap = {
          transferencia: {
              name: 'name-transferencia',
              cedula: 'cedula-transferencia',
              clp: 'clp-amount-transferencia',
              email: 'email-transferencia',
              bank: 'bank-transferencia',
              accountType: 'account-type-transferencia',
              accountNumber: 'account-number-transferencia',
          },
          'pago-movil': {
              name: 'name-pm',
              cedula: 'cedula-pm',
              clp: 'clp-amount-pm',
              email: 'email-pm',
              bank: 'bank-pm',
              phone: 'phone-pm',
          },
          'recarga-saldo': {
              name: 'name-rs',
              cedula: 'cedula-rs',
              clp: 'clp-amount-rs',
              email: 'email-rs',
              phone: 'phone-rs',
          },
      };

      const getField = (fieldId) => {
          const el = form.querySelector(`#${fieldId}`) || document.getElementById(fieldId);
          if (!el) {
              console.warn(`No se encontró el campo ${fieldId} dentro del formulario ${form.id}`);
          }
          return el;
      };

      if (!currentUser || !currentUser.uid) {
          showMessage(messageElId, 'Error de autenticación. Por favor, recarga la página e inicia sesión de nuevo.', false);
          return;
      }

      const rate = exchangeRates[userSelectedCountry] || 0;
      if (rate <= 0) {
          showMessage(messageElId, `La tasa de cambio para ${userSelectedCountry} no está disponible. No se puede crear el pedido.`, false);
          return;
      }

      const currentUserTag = userTags[currentUser.email] || 'CLIENTE';
      const typeFields = fieldMap[type] || {};
      const nameInput = getField(typeFields.name);
      const cedulaInput = getField(typeFields.cedula);
      const clpAmountInput = getField(typeFields.clp);
      const emailInput = getField(typeFields.email);

      if (!nameInput || !cedulaInput || !clpAmountInput || !emailInput) {
          showMessage(messageElId, 'El formulario no está completo. Por favor, recarga la página e inténtalo nuevamente.', false);
          return;
      }

      let orderData = {
          type: type,
          status: 'Pendiente de pago',
          userId: currentUser.uid,
          createdByTag: currentUserTag,
          country: userSelectedCountry,
          // createdAt will be added on final confirmation
          clientName: nameInput.value,
          email: emailInput.value,
          cedula: cedulaInput.value.replace(/[^0-9]/g, ''),
          clpAmount: parseFloat(clpAmountInput.value),
          // New generalized fields
          destinationCurrency: userSelectedCountry,
          destinationAmount: 0,
      };
      
      if (isNaN(orderData.clpAmount) || orderData.clpAmount <= 0) {
          showMessage(messageElId, 'El monto en CLP debe ser un número válido y mayor a cero.', false);
          return;
      }

      orderData.destinationAmount = orderData.clpAmount * rate;

      if (isSeller) {
          orderData.sellerId = currentUser.uid;
          orderData.sellerEmail = currentUser.email || '';
          orderData.sellerCommissionRate = typeof commissionRate === 'number' ? commissionRate : 0;
      }

      let detailsHtml = `
        <p><span class="font-semibold">Nombre:</span> ${orderData.clientName}</p>
        <p><span class="font-semibold">Cédula:</span> ${orderData.cedula}</p>
        <p><span class="font-semibold">Correo electrónico:</span> ${orderData.email}</p>
      `;

      // Add type-specific fields
      if (type === 'transferencia') {
          // Simplified for Venezuela
          const bankInput = getField(typeFields.bank);
          const accountTypeInput = typeFields.accountType ? getField(typeFields.accountType) : null;
          const accountNumberInput = getField(typeFields.accountNumber);

          if (!bankInput || !accountNumberInput) {
              showMessage(messageElId, 'Faltan campos necesarios para crear el pedido de transferencia.', false);
              return;
          }

          orderData.bank = bankInput.value;
          orderData.accountType = accountTypeInput ? accountTypeInput.value : '';
          orderData.accountNumber = accountNumberInput.value.replace(/[^0-9]/g, '');

          if (orderData.accountNumber.length !== 20) {
              showMessage(messageElId, 'El número de cuenta debe tener exactamente 20 dígitos.', false);
              return;
          }

          detailsHtml += `
            <p><span class="font-semibold">Banco:</span> ${orderData.bank}</p>
            ${orderData.accountType ? `<p><span class="font-semibold">Tipo Cuenta:</span> ${orderData.accountType}</p>` : ''}
            <p><span class="font-semibold">Nro. Cuenta:</span> ${orderData.accountNumber}</p>
          `;
      } else if (type === 'pago-movil') {
          const phoneInput = getField(typeFields.phone);
          const bankInput = getField(typeFields.bank);

          if (!phoneInput || !bankInput) {
              showMessage(messageElId, 'Faltan campos necesarios para crear el pedido de Pago Móvil.', false);
              return;
          }

          orderData.phone = phoneInput.value.replace(/[^0-9]/g, '');
          orderData.bank = bankInput.value;

          if (orderData.phone.length !== 11) {
              showMessage(messageElId, 'El número de teléfono para Pago Móvil debe tener exactamente 11 dígitos (Ej: 04141234567).', false);
              return;
          }

          detailsHtml += `
            <p><span class="font-semibold">Teléfono:</span> ${orderData.phone}</p>
            <p><span class="font-semibold">Banco:</span> ${orderData.bank}</p>
          `;
      } else if (type === 'recarga-saldo') {
          const phoneInput = getField(typeFields.phone);
          if (!phoneInput) {
              showMessage(messageElId, 'Faltan campos necesarios para crear el pedido de Recarga.', false);
              return;
          }

          orderData.phone = phoneInput.value.replace(/[^0-9]/g, '');
          if (orderData.phone.length !== 11) {
              showMessage(messageElId, 'El número de teléfono para Recarga debe tener exactamente 11 dígitos (Ej: 04121234567).', false);
              return;
          }
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

    // --- NEW: Handle foreground notifications ---
    messaging.onMessage((payload) => {
        console.log('Mensaje recibido en primer plano: ', payload);
        
        // 1. Play sound
        const notificationSound = document.getElementById('notification-sound');
        if (notificationSound) {
            notificationSound.play().catch(error => {
                console.warn("No se pudo reproducir el sonido de notificación.", error);
            });
        }

        // Robustly get body from either `data` or `notification` object.
        const notificationBody = payload.data?.body || payload.notification?.body || 'Ha llegado un nuevo pedido.';

        // 2. Show a non-intrusive toast notification with the order details.
        showToastNotification(notificationBody);

        // 3. Change document title to alert the user if the tab is not active.
        document.title = '(!) Nuevo Pedido - Cambios Manzano';
    });

    // Check current permission status and update button
    if (Notification.permission === 'granted') {
        enableNotificationsBtn.disabled = true;
        enableNotificationsBtn.title = 'Las notificaciones ya están activadas en este navegador.';
        document.getElementById('notification-bell-icon').classList.remove('text-gray-500', 'text-red-500');
        document.getElementById('notification-bell-icon').classList.add('text-green-500');
        showMessage('notifications-message', 'Ya tienes las notificaciones activadas en este navegador.', true);
    } else if (Notification.permission === 'denied') {
        enableNotificationsBtn.disabled = true;
        enableNotificationsBtn.title = 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.';
        document.getElementById('notification-bell-icon').classList.remove('text-gray-500', 'text-green-500');
        document.getElementById('notification-bell-icon').classList.add('text-red-500');
        showMessage('notifications-message', 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.', false);
    } else {
        // Default state: ready to be enabled
        enableNotificationsBtn.disabled = false;
        enableNotificationsBtn.title = 'Activar notificaciones de escritorio';
        document.getElementById('notification-bell-icon').classList.remove('text-green-500', 'text-red-500');
        document.getElementById('notification-bell-icon').classList.add('text-gray-500');
    }

    enableNotificationsBtn.addEventListener('click', async () => {
        if (!currentUser) return showMessage('notifications-message', 'Debes iniciar sesión.', false);

        try {
            showMessage('notifications-message', 'Solicitando permiso...', true);
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                showMessage('notifications-message', 'Permiso concedido. Obteniendo token...', true);
                
                const fcmToken = await messaging.getToken();

                if (fcmToken) {
                    const userTokensRef = db.collection('fcm_tokens').doc(currentUser.uid);
                    await userTokensRef.set({
                        tokens: firebase.firestore.FieldValue.arrayUnion(fcmToken)
                    }, { merge: true });

                    showMessage('notifications-message', '¡Notificaciones activadas para este dispositivo!', true);
                    enableNotificationsBtn.disabled = true;
                    enableNotificationsBtn.title = 'Las notificaciones ya están activadas en este navegador.';
                    document.getElementById('notification-bell-icon').classList.remove('text-gray-500');
                    document.getElementById('notification-bell-icon').classList.add('text-green-500');
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
  window.addEventListener('focus', () => {
      resetTitle();
      // Also check if the commission listener needs to be reset when the tab regains focus.
      // This is more reliable than just setInterval for tabs that go to sleep.
      if (isAdmin && commissionListenerDate !== null) {
          const todayDateString = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
          if (todayDateString !== commissionListenerDate) {
              console.log("[Focus] Window refocused and day has changed. Re-attaching admin commission listener.");
              attachAdminCommissionListener();
          }
      }
  });
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
  const adminLoginForm = document.getElementById('admin-login-form');
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

      // Reset CLP fields in the second modal
      balanceOpClpRateInput.value = '';
      balanceOpClpEquivalent.textContent = 'Equivalente: 0,00 CLP';
      
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
      balanceConfirmModal.classList.remove('hidden');
      balanceConfirmModal.classList.add('flex');
      balanceOperationModal.classList.add('hidden');
      balanceOperationModal.classList.remove('flex');
  });

  // --- NEW: Real-time update for CLP equivalent in balance operation modal ---
  balanceOpClpRateInput.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      const vesAmount = balanceOperationData.amount || 0;
      if (!isNaN(rate) && rate > 0 && vesAmount > 0) {
          const clpEquivalent = vesAmount / rate;
          balanceOpClpEquivalent.textContent = `Equivalente: ${clpEquivalent.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}`;
      } else {
          balanceOpClpEquivalent.textContent = 'Equivalente: 0,00 CLP';
      }
  });
  // --- END NEW ---

  // Listener for the final confirmation button
  balanceFinalConfirmBtn.addEventListener('click', async () => {
      const { type, amount, bank, holder, note } = balanceOperationData;
      const clpRate = parseFloat(balanceOpClpRateInput.value);

      if (isNaN(clpRate) || clpRate <= 0) {
          showCustomAlert('Por favor, ingresa una tasa de compra válida en CLP.');
          return;
      }

      const clpAmount = clpRate > 0 ? roundUpToTwoDecimals(amount / clpRate) : 0;
      balanceOperationData.clpAmount = clpAmount; // Store for history

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
      const clpBalanceHistoryRef = db.collection('clp_balance_history').doc(); // NEW: Reference for CLP history
      const configRateRef = db.collection('config').doc('rate'); // Reference to update totalClpBalance
      const batch = db.batch();

      const historyData = {
          amount: amount, // This is the VES amount
          type: type,
          holder: holder,
          bank: bank, // Always include bank and holder to identify the account
          note: note,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      const increment = type === 'add' ? amount : -amount; // VES increment
      batch.set(balanceHistoryRef, historyData);
      
      // Increment the specific account's balance
      batch.set(accountRef, { 
          holder: holder,
          bank: bank,
          balance: firebase.firestore.FieldValue.increment(increment) 
      }, { merge: true });

      // --- NEW: Update the persistent totalClpBalance ---
      const clpIncrement = type === 'add' ? clpAmount : -clpAmount;
      batch.update(configRateRef, { 
          totalClpBalance: firebase.firestore.FieldValue.increment(clpIncrement),
          purchaseRateVES: clpRate // NEW: Save the purchase rate
      });

      // --- NEW: Create a record in the CLP balance history ---
      if (type === 'add') {
        batch.set(clpBalanceHistoryRef, {
            amount: clpAmount,
            type: 'add',
            note: `Carga de saldo (Equivalente a ${amount.toLocaleString('es-VE')} VES)`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            adminTag: userTags[currentUser.email] || 'ADMIN'
        });
      }
      // --- END NEW ---

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

  // --- Tabbed History Logic ---
  const historyTabButtons = document.querySelectorAll('.history-tab-btn');
  const historySections = document.querySelectorAll('.history-section');

  historyTabButtons.forEach(button => {
      button.addEventListener('click', () => {
          const targetId = button.dataset.target;

          // Hide all sections
          historySections.forEach(section => {
              section.classList.add('hidden');
          });

          // Show the target section
          const targetSection = document.getElementById(targetId);
          if (targetSection) {
              targetSection.classList.remove('hidden');
          }

          // Update button styles
          historyTabButtons.forEach(btn => {
              if (btn === button) {
                  btn.classList.add('text-blue-600', 'bg-white', 'border-b-2', 'border-blue-600');
                  btn.classList.remove('text-gray-500', 'hover:text-blue-600', 'hover:bg-gray-100');
              } else {
                  btn.classList.remove('text-blue-600', 'bg-white', 'border-b-2', 'border-blue-600');
                  btn.classList.add('text-gray-500', 'hover:text-blue-600', 'hover:bg-gray-100');
              }
          });
      });
  });

  // --- Initial App Setup ---
  // onAuthStateChanged handles the initial view, but we can set a default
  switchTab(tabs[0]); // Set default tab
  populateBankSelects(); // Populate all bank dropdowns

  // Attach paste event listeners
  pasteBtnTransferencia.addEventListener('click', () => handlePasteData(transferenciaFields, 'user-message-transferencia'));
  pasteBtnPagoMovil.addEventListener('click', () => handlePasteData(pagoMovilFields, 'user-message-pm'));
  pasteBtnRecargaSaldo.addEventListener('click', () => handlePasteData(recargaSaldoFields, 'user-message-rs'));

  savedAccountsListTransferencia.addEventListener('click', handleBeneficiarySelect);
  savedAccountsListPagoMovil.addEventListener('click', handleBeneficiarySelect);
  savedAccountsListRecargaSaldo.addEventListener('click', handleBeneficiarySelect);

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
      } else if (target.classList.contains('copy-order-btn')) {
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.classList.add('flex');
          try {
              const orderDoc = await db.collection('orders').doc(orderId).get();
              if (!orderDoc.exists) throw new Error("El pedido no existe.");
              
              const orderData = orderDoc.data();
              
              let dataToCopy = [];
              let formTypeMessage = '';

              switch (orderData.type) {
                  case 'transferencia':
                      dataToCopy = [
                          orderData.clientName || '',
                          orderData.cedula || '',
                          orderData.bank || '',
                          orderData.accountType || '',
                          orderData.accountNumber || '',
                      ];
                      formTypeMessage = 'Transferencia';
                      break;
                  case 'pago-movil':
                      dataToCopy = [
                          orderData.clientName || '',
                          orderData.cedula || '',
                          orderData.phone || '',
                          orderData.bank || '',
                      ];
                      formTypeMessage = 'Pago Móvil';
                      break;
                  case 'recarga-saldo':
                      dataToCopy = [
                          orderData.clientName || '',
                          orderData.cedula || '',
                          orderData.phone || '',
                      ];
                      formTypeMessage = 'Recarga de Saldo';
                      break;
              }
              
              const textToCopy = dataToCopy.join('\n');
              await navigator.clipboard.writeText(textToCopy);
              showCustomAlert(`Datos de "${orderData.clientName}" copiados. Pégalos en el formulario de tipo "${formTypeMessage}".`);

          } catch (error) {
              console.error("Error al copiar datos del pedido:", error);
              showCustomAlert(`No se pudo copiar la información: ${error.message}`);
          } finally {
              loadingSpinner.classList.add('hidden');
              loadingSpinner.classList.remove('flex');
          }
      }
  });

  // --- NEW: Historical Payment Flow ---
  const openHistoricalPaymentDateModal = (orderId, orderData) => {
      historicalPaymentOrderDetails.innerHTML = `
          <p><b>Pedido ID:</b> #${orderId.slice(-5)}</p>
          <p><b>Cliente:</b> ${orderData.clientName}</p>
          <p><b>Monto:</b> ${orderData.clpAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</p>
      `;
      historicalPaymentDateInput.valueAsDate = getChileanDateForPicker(new Date()); // Default to today
      historicalPaymentDateModal.classList.remove('hidden');
      historicalPaymentDateModal.classList.add('flex');
  };

  historicalPaymentDateNextBtn.addEventListener('click', () => {
      const paymentDate = historicalPaymentDateInput.value;
      if (!paymentDate) {
          showCustomAlert('Por favor, selecciona una fecha de pago.');
          return;
      }
      paymentData.historicalPaymentDate = paymentDate; // Store the selected date

      historicalPaymentDateModal.classList.add('hidden');
      historicalPaymentDateModal.classList.remove('flex');

      // Continue to the standard payment flow
      const { orderId, orderData } = paymentData;
      if (orderData.destinationCurrency === 'VES') {
          openPaymentSourceModal(orderId, orderData);
      } else {
          // Handle other currencies if necessary
          showMessage('admin-upload-message', '', true);
          adminScreenshotInput.value = '';
          adminUploadModal.classList.remove('hidden');
          adminUploadModal.classList.add('flex');
      }
  });

  historicalPaymentDateCancelBtn.addEventListener('click', () => {
      historicalPaymentDateModal.classList.add('hidden');
      historicalPaymentDateModal.classList.remove('flex');
      paymentData = {}; // Clear state
  });

  /**
   * Calculates the fee for a given order and source account.
   * @param {object} order - The order data.
   * @param {object} sourceAccount - The source account data.
   * @returns {number} The calculated fee.
   */
  const computeInterbankFee = (amount) => {
      if (typeof amount !== 'number' || amount <= 0) return 0;
      return roundUpToTwoDecimals(amount < 700 ? 2 : amount * 0.003);
  };

  const normalizeBankName = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

  const calculateFee = (order, sourceAccount) => {
      const amount = order.destinationAmount || 0;
      if (amount <= 0 || !order) return 0;

      switch (order.type) {
          case 'pago-movil':
              return computeInterbankFee(amount);
          case 'transferencia': {
              const sourceBankName = normalizeBankName(sourceAccount?.bank || sourceAccount?.bankName || '');
              const destinationBankName = normalizeBankName(order.bank || '');
              if (sourceBankName !== destinationBankName) {
                  return computeInterbankFee(amount);
              }
              return 0;
          }
          case 'recarga-saldo':
          default:
              return 0;
      }
  };

  /** Opens the modal to select the payment source account with pre-fetched data. */
  const openPaymentSourceModal = (orderId, orderData) => {
    try {
        // CRITICAL FIX: Preserve the last used account ID before resetting paymentData
        const lastUsedAccountId = paymentData.selectedAccountId;

        // Reset payment data for the new order
        paymentData = { orderId, orderData, isHistorical: paymentData.isHistorical, historicalPaymentDate: paymentData.historicalPaymentDate };

        // Display order details in the modal
        paymentSourceOrderDetails.innerHTML = `<p><b>Cliente:</b> ${orderData.clientName}</p><p><b>Monto a Pagar:</b> ${orderData.destinationAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${orderData.destinationCurrency}</p>`;

        // Render account options
        renderPaymentSourceList();

        // Reset modal state before attempting pre-selection
        paymentFeeDetails.classList.add('hidden');
        paymentSourceNextBtn.disabled = true;

        // Attempt to pre-select the last used account
        if (lastUsedAccountId) {
            const radioToSelect = document.getElementById(`account-${lastUsedAccountId}`);
            // Check if the radio button exists and is not disabled (i.e., has enough balance)
            if (radioToSelect && !radioToSelect.disabled) {
                radioToSelect.checked = true;
                // Manually trigger the change event to update UI (fee details, next button)
                radioToSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Finally, show the modal
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
      const adminTag = userTags[currentUser.email] || 'ADMIN';
      let totalDebit = 0; // Declare totalDebit here to be available in the whole scope
      let adminCommissionVes = 0; // Initialize commission to 0
      let tilloCommissionVes = 0;
      let totalCommissionVes = 0;

      // CORRECCIÓN: Definir baseAmount fuera del if para que siempre exista.
      const baseAmount = orderData.destinationAmount || 0;

      try {
          // --- HISTORICAL PAYMENT LOGIC ---
          let paymentTimestamp = firebase.firestore.FieldValue.serverTimestamp();
          if (paymentData.isHistorical && paymentData.historicalPaymentDate) {
              const paymentDate = paymentData.historicalPaymentDate; // YYYY-MM-DD
              const queryStart = new Date(`${paymentDate}T00:00:00-04:00`);
              const queryEnd = new Date(`${paymentDate}T23:59:59-04:00`);

              // Find the last payment of that day to set the new payment's time
              const lastPaymentSnapshot = await db.collection('balance_history')
                  .where('timestamp', '>=', queryStart)
                  .where('timestamp', '<=', queryEnd)
                  .orderBy('timestamp', 'desc')
                  .limit(1)
                  .get();

              const lastPaymentTime = lastPaymentSnapshot.empty 
                  ? queryEnd // If no payments that day, set it to the end of the day
                  : new Date(lastPaymentSnapshot.docs[0].data().timestamp.toDate().getTime() + 1000); // 1 second after the last payment
              paymentTimestamp = lastPaymentTime;
          }
          // 1. Upload file to Storage
          const filePath = `proofs/${orderId}/${file.name}`;
          const fileRef = storage.ref(filePath);
          const uploadTask = await fileRef.put(file);
          const proofUrl = await uploadTask.ref.getDownloadURL();

          // 2. Prepare batch write
          const orderRef = db.collection('orders').doc(orderId);
          const batch = db.batch();

          // Update order
          batch.update(orderRef, { status: 'Pagado', proofUrl: proofUrl, paidByTag: adminTag, paidAt: paymentTimestamp });

          // Conditional logic for VES payments (which have an account and fee)
          if (orderData.destinationCurrency === 'VES') {
              if (!selectedAccountId) {
                  throw new Error("No se ha seleccionado una cuenta de origen para el pago en VES.");
              }
              const selectedAccount = accountsData.find(acc => acc.id === selectedAccountId);
              if (!selectedAccount) {
                  throw new Error("La cuenta de origen seleccionada ya no es válida.");
              }
              const sourceHolderRaw = typeof selectedAccount.holder === 'string' ? selectedAccount.holder.trim() : '';
              const sourceHolder = sourceHolderRaw || 'Sin titular';
              const destinationBankRaw = typeof orderData.bank === 'string' ? orderData.bank.trim() : '';
              const destinationBank = destinationBankRaw || 'Sin banco';

              adminCommissionVes = roundUpToTwoDecimals(baseAmount * ADMIN_BASE_COMMISSION_RATE);
              tilloCommissionVes = roundUpToTwoDecimals(baseAmount * TILLO_COMMISSION_RATE);
              totalCommissionVes = adminCommissionVes + tilloCommissionVes;
              totalDebit = baseAmount + fee + totalCommissionVes; // Assign value here

              // --- NEW: Calculate CLP equivalent for the payment ---
              const accountRef = db.collection('accounts').doc(selectedAccountId);
              const paymentHistoryRef = db.collection('balance_history').doc();
              const feeHistoryRef = db.collection('balance_history').doc();

              // Decrement account balance
              batch.set(accountRef, {
                  balance: firebase.firestore.FieldValue.increment(-totalDebit) 
              }, { merge: true });
              
              // Create history for payment
              batch.set(paymentHistoryRef, { 
                  amount: baseAmount, 
                  type: 'subtract', 
                  note: `Pago pedido ${orderId.slice(-5)} (${orderData.destinationCurrency})`, 
                  timestamp: paymentTimestamp,
                  holder: sourceHolder, // Origen del pago
                  bank: destinationBank // CRITICAL: Banco de DESTINO del pedido
              });
              
              // Create history for fee if it exists
              if (fee > 0) {
                  batch.set(feeHistoryRef, { 
                      amount: fee, 
                      type: 'fee', 
                       note: `Comisión pedido ${orderId.slice(-5)}`, 
                       timestamp: paymentTimestamp,
                       holder: sourceHolder, // Origen del pago
                       bank: destinationBank // CRITICAL: Banco de DESTINO del pedido
                  });
              }

              // Create history for admin commission
              if (adminCommissionVes > 0) {
                  const adminCommissionHistoryRef = db.collection('balance_history').doc();
                  batch.set(adminCommissionHistoryRef, {
                      amount: adminCommissionVes,
                       type: 'admin_commission',
                       note: `Comisión Admin pedido ${orderId.slice(-5)}`,
                       timestamp: paymentTimestamp,
                       holder: sourceHolder, // Origen del pago
                       bank: destinationBank, // CRITICAL: Banco de DESTINO del pedido
                  });
              }
              if (tilloCommissionVes > 0) {
                  const tilloCommissionHistoryRef = db.collection('balance_history').doc();
                  batch.set(tilloCommissionHistoryRef, {
                      amount: tilloCommissionVes,
                      type: 'tillo_commission',
                       note: `Mano Tillo pedido ${orderId.slice(-5)}`,
                       timestamp: paymentTimestamp,
                       holder: sourceHolder,
                       bank: destinationBank,
                  });
              }

              // --- DEFINITIVE CORRECTION for CLP Balance ---
              // The total debit in VES (payment + fee + commissions) is calculated once
              // and then converted to CLP to be decremented from the persistent balance.
              const purchaseRate = exchangeRates['purchaseRateVES'] || 0;
              if (purchaseRate > 0) {
                  const totalDebitClp = roundUpToTwoDecimals((baseAmount + fee + totalCommissionVes) / purchaseRate);
                  batch.update(db.collection('config').doc('rate'), { 
                      totalClpBalance: firebase.firestore.FieldValue.increment(-totalDebitClp)
                  });
              }
          }
          // For non-VES payments, we just update the status and don't touch balances.

          await batch.commit();

          // --- NEW: Manually add historical paid order to today's view ---
          if (paymentData.isHistorical) {
              const mockDoc = { id: orderId, data: () => ({ ...orderData, status: 'Pagado', proofUrl, paidByTag: adminTag }) };
              const orderHtml = renderOrder(mockDoc);
              ordersListPaid.innerHTML += orderHtml;
              // Manually update the paid summary
              const currentPaidCount = parseInt(paidSummaryDisplay.textContent.split(' ')[0]) || 0;
              paidSummaryDisplay.textContent = `${currentPaidCount + 1} Pedidos / ...`; // Simplified update
          }

          showToastNotification(`Pedido #${orderId.slice(-5)} pagado y completado.`);
          
          // --- NEW: Continuous Payment Flow ---
          // 1. Manually update local state for immediate UI feedback, avoiding race conditions.
          if (orderData.destinationCurrency === 'VES' && selectedAccountId) {
              const accountIndex = accountsData.findIndex(acc => acc.id === selectedAccountId);
              if (accountIndex > -1) {
                  accountsData[accountIndex].balance -= totalDebit;
              }
              const purchaseRate = exchangeRates['purchaseRateVES'] || 0;
              if (purchaseRate > 0) {
                  const totalDebitClp = roundUpToTwoDecimals((baseAmount + fee + totalCommissionVes) / purchaseRate);
                  exchangeRates.totalClpBalance -= totalDebitClp;
              }
              // Re-render the main balance lists with the new local data
              renderAccountsBalanceList();
          }

          // 2. Close the current upload modal.
          adminUploadModal.classList.add('hidden');
          adminUploadModal.classList.remove('flex');
          paymentData = {}; // Clear state

          // 3. Find the next pending order and automatically open its payment modal.
          // CORRECTED: Find the LAST button, which corresponds to the OLDEST pending order.
          const allPendingButtons = ordersListPending.querySelectorAll('.mark-paid-btn');
          const oldestPendingOrderBtn = allPendingButtons.length > 0 ? allPendingButtons[allPendingButtons.length - 1] : null;

          if (oldestPendingOrderBtn) {
              showToastNotification('Cargando siguiente pedido...');
              // Simulate a click to start the next payment flow with updated balances.
              oldestPendingOrderBtn.click();
          } else {
              showCustomAlert('¡Excelente! No quedan más pedidos pendientes por pagar.');
          }
      } catch (error) {
          console.error("Error al confirmar el pago:", error);
          showMessage('admin-upload-message', `Error: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  });

  // Toast Notification (bottom-right corner)
  const toast = document.getElementById('toast-notification');
  if (toast) {
      toast.addEventListener('click', () => {
          toast.classList.remove('translate-y-0', 'opacity-100');
          toast.classList.add('translate-y-20', 'opacity-0');
      });
  }

  // Add listener for debtor toggle button on the paid list
  ordersListPaid.addEventListener('click', async (e) => {
      // ... (existing code)
  });

  // Listen for real-time updates to the exchange rate
  const rateRef = db.collection('config').doc('rate');
  rateRef.onSnapshot((doc) => {      
      // Initialize with defaults to prevent errors if fields are missing
      const defaultRates = { VES: 0, COP: 0, PEN: 0, ARS: 0, USD: 0, EUR: 0 };
      const rateData = doc.exists ? doc.data() : {};

      // Get store status from the same document
      isStoreOpen = rateData.isTakingOrders !== false; // Default to true if undefined
      updateStoreStatusView();

      const firestoreValues = rateData.values || {};
      // Check for the new 'values' structure, with fallback to the old one
      if (firestoreValues && typeof firestoreValues === 'object') {
          // Combine the defaults with the fetched values to ensure all keys are present
          exchangeRates = { ...defaultRates, ...firestoreValues };
      } else if (rateData.value) { // Fallback for old structure (migration)
          exchangeRates = { ...defaultRates, VES: rateData.value };
      } else {
          console.log("No se encontró el documento de la tasa de cambio!");
          exchangeRates = { ...defaultRates }; // Restore default rates if doc is missing
      }

      // --- NEW: Get the persistent CLP balance ---
      exchangeRates.totalClpBalance = rateData.totalClpBalance || 0;
      exchangeRates.purchaseRateVES = rateData.purchaseRateVES || 0; // NEW: Get the purchase rate

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
      handleHistoricalSearch(start, end);
  };

  // Event listeners for "Saldos por Cuenta" date navigation
  if (accountsBalanceDisplayPrevBtn) {
      accountsBalanceDisplayPrevBtn.addEventListener('click', () => {
          const currentDate = accountsBalanceDisplayDatePicker.valueAsDate || getChileanDateForPicker(new Date());
          currentDate.setDate(currentDate.getDate() - 1);
          accountsBalanceDisplayDatePicker.valueAsDate = getChileanDateForPicker(currentDate);
          accountsBalanceDisplayDateInfo.textContent = `Saldos disponibles en tiempo real en cada cuenta (Fecha de referencia: ${accountsBalanceDisplayDatePicker.value}).`;
      });
  }

  if (accountsBalanceDisplayNextBtn) {
      accountsBalanceDisplayNextBtn.addEventListener('click', () => {
          const currentDate = accountsBalanceDisplayDatePicker.valueAsDate || getChileanDateForPicker(new Date());
          currentDate.setDate(currentDate.getDate() + 1);
          accountsBalanceDisplayDatePicker.valueAsDate = getChileanDateForPicker(currentDate);
          accountsBalanceDisplayDateInfo.textContent = `Saldos disponibles en tiempo real en cada cuenta (Fecha de referencia: ${accountsBalanceDisplayDatePicker.value}).`;
      });
  }

  if (accountsBalanceDisplayDatePicker) {
      accountsBalanceDisplayDatePicker.addEventListener('change', () => {
          accountsBalanceDisplayDateInfo.textContent = `Saldos disponibles en tiempo real en cada cuenta (Fecha de referencia: ${accountsBalanceDisplayDatePicker.value}).`;
      });
  }

  // Defensive event listeners for historical search buttons (Historial Pedidos section)
  if (historicalDateTodayBtn) {
    historicalDateTodayBtn.addEventListener('click', () => {
        const today = getChileanDateForPicker(new Date());
        setDateRangeAndSearch(today, today);
        setActiveChip(historicalRangeButtons, historicalDateTodayBtn);
    });
  } else {
      console.error("Button with ID 'historical-date-today' was not found.");
  }

  if (historicalDateYesterdayBtn) {
    historicalDateYesterdayBtn.addEventListener('click', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const chileYesterday = getChileanDateForPicker(yesterday);
        setDateRangeAndSearch(chileYesterday, chileYesterday);
        setActiveChip(historicalRangeButtons, historicalDateYesterdayBtn);
    });
  } else {
      console.error("Button with ID 'historical-date-yesterday' was not found.");
  }

  if (historicalDate7DaysBtn) {
    historicalDate7DaysBtn.addEventListener('click', () => {
        const start = new Date();
        start.setDate(start.getDate() - 6);
        const chileStart = getChileanDateForPicker(start);
        const chileEnd = getChileanDateForPicker(new Date());
        setDateRangeAndSearch(chileStart, chileEnd);
        setActiveChip(historicalRangeButtons, historicalDate7DaysBtn);
    });
  } else {
      console.error("Button with ID 'historical-date-7days' was not found.");
  }

  // Event delegation for the dynamically added refresh button
  adminPanel.addEventListener('click', (e) => {
      if (e.target.closest('#refresh-commission-btn')) {
          attachAdminCommissionListener();
      }
  });

  // Use event delegation for the share buttons in both admin and seller views
  document.body.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('.share-proof-btn');
      if (shareBtn) {
          const proofUrl = shareBtn.dataset.proofUrl;
          const clientName = shareBtn.dataset.clientName;
          handleShareProof(proofUrl, clientName);
      }
  });

  // Admin: Toggle order creation form
  adminCreateOrderToggleBtn.addEventListener('click', () => {
      const isHidden = userInterface.classList.toggle('hidden');
      adminCreateOrderToggleBtn.textContent = isHidden ? 'Ingresar Pedido' : 'Ocultar Formulario';

      // Show/hide backdate section for admin
      const adminBackdateSection = document.getElementById('admin-backdate-section');
      if (isAdmin && !isHidden) {
          adminBackdateSection.classList.remove('hidden');
      } else {
          adminBackdateSection.classList.add('hidden');
      }

      if (!isHidden) {
          userInterface.scrollIntoView({ behavior: 'smooth' });
      }
  });

  /** Fetches and displays historical orders based on a date range and filters. */
  const handleHistoricalSearch = async (start, end) => {
      console.log('[Debug] handleHistoricalSearch triggered with:', { start, end });
      if (!start || !end) {
          return; // Don't search if dates are not set
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      historicalOrdersList.innerHTML = '';
      historicalIdSearchInput.value = ''; // Clear ID search when doing a date search
      noHistoricalOrdersMessage.classList.add('hidden');
      exportExcelBtn.disabled = true;

      const startDateString = start.toISOString().slice(0, 10);
      const endDateString = end.toISOString().slice(0, 10);
      const queryStart = new Date(`${startDateString}T00:00:00-04:00`);
      const queryEnd = new Date(`${endDateString}T23:59:59-04:00`);

      const activeStatusBtn = historicalStatusFilters.querySelector('button.active');
      const statusFilter = activeStatusBtn ? activeStatusBtn.dataset.status : 'Todos';

      try {
          // Firestore limitation: Cannot have inequality filters on multiple fields.
          // So, we fetch by date range first, then filter by status on the client-side.
          const query = db.collection('orders')
              .where('createdAt', '>=', queryStart)
              .where('createdAt', '<=', queryEnd)
              .orderBy('createdAt', 'desc');
          
          const snapshot = await query.get();

          let allOrders = [];
          snapshot.forEach(doc => {
              allOrders.push({ id: doc.id, ...doc.data() });
          });

          // --- NEW: Duplicate Detection Logic ---
          const seenOrders = new Map();
          const duplicateIds = new Set();

          allOrders.forEach(order => {
              if (!order.cedula || !order.clpAmount) return; // Skip orders without key info

              let key;
              switch (order.type) {
                  case 'transferencia':
                      if (!order.accountNumber) return;
                      key = `${order.cedula}-${order.type}-${order.accountNumber}-${order.clpAmount}`;
                      break;
                  case 'pago-movil':
                  case 'recarga-saldo':
                      if (!order.phone) return;
                      key = `${order.cedula}-${order.type}-${order.phone}-${order.clpAmount}`;
                      break;
                  default:
                      return;
              }

              if (seenOrders.has(key)) {
                  duplicateIds.add(order.id); // Mark current order as duplicate
                  duplicateIds.add(seenOrders.get(key)); // Also mark the first one we saw
              } else {
                  seenOrders.set(key, order.id);
              }
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
              let historicalOrdersHtml = '';

              filteredOrders.forEach(orderData => {
                  // Add the isDuplicate flag for rendering
                  if (duplicateIds.has(orderData.id)) {
                      orderData.isDuplicate = true;
                  }
                  // We need to simulate a doc snapshot for renderOrder
                  const mockDoc = { id: orderData.id, data: () => orderData };
                  historicalOrdersHtml += renderOrder(mockDoc);
                  historicalOrdersData.push(orderData);
                  if (orderData.status === 'Pagado') {
                      totalCLP += orderData.clpAmount || 0;
                  }
              });
              historicalOrdersList.innerHTML = historicalOrdersHtml;
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

  historicalSearchBtn.addEventListener('click', () => {
      const startDateVal = historicalDateStart.valueAsDate;
      const endDateVal = historicalDateEnd.valueAsDate;
      if (!startDateVal || !endDateVal) {
          showCustomAlert('Por favor, selecciona un rango de fechas para buscar.');
          return;
      }
      handleHistoricalSearch(startDateVal, endDateVal);
      setActiveChip(historicalRangeButtons, null);
  });

  historicalIdSearchBtn.addEventListener('click', async () => {
      const lastDigits = historicalIdSearchInput.value.trim();
      if (!lastDigits) {
          showCustomAlert('Por favor, ingresa los últimos 5 dígitos del ID del pedido.');
          return;
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      historicalOrdersList.innerHTML = '';
      noHistoricalOrdersMessage.classList.add('hidden');
      historicalSearchSummary.textContent = `Buscando pedidos que terminen en "${lastDigits}"...`;
      exportExcelBtn.disabled = true;
      historicalOrdersData = [];

      try {
          // To avoid scanning the entire collection, we'll limit the search to the last 90 days.
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

          const query = db.collection('orders')
              .where('createdAt', '>=', ninetyDaysAgo)
              .orderBy('createdAt', 'desc');

          const snapshot = await query.get();
          const matchingOrders = [];
          snapshot.forEach(doc => {
              if (doc.id.endsWith(lastDigits)) {
                  matchingOrders.push({ id: doc.id, ...doc.data() });
              }
          });

          if (matchingOrders.length > 0) {
              let historicalOrdersHtml = '';
              matchingOrders.forEach(orderData => {
                  const mockDoc = { id: orderData.id, data: () => orderData };
                  historicalOrdersHtml += renderOrder(mockDoc);
              });
              historicalOrdersList.innerHTML = historicalOrdersHtml;
              historicalSearchSummary.textContent = `Se encontraron ${matchingOrders.length} pedido(s) en los últimos 90 días.`;
          } else {
              noHistoricalOrdersMessage.classList.remove('hidden');
              noHistoricalOrdersMessage.textContent = `No se encontró ningún pedido que termine en "${lastDigits}" en los últimos 90 días. Considera usar la búsqueda por fecha.`;
              historicalSearchSummary.textContent = 'No se encontraron resultados.';
          }
      } catch (error) {
          console.error("Error searching by last digits:", error);
          historicalSearchSummary.textContent = 'Error al buscar por ID.';
          if (error.code === 'failed-precondition') {
              const detailedMessage = 'Error: La base de datos requiere un índice para esta consulta. Por favor, abre la consola del navegador (F12), busca el error de Firebase y haz clic en el enlace que proporciona para crear el índice automáticamente.';
              showCustomAlert(detailedMessage);
          }
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  });

  if (historicalStatusFilters) {
      historicalStatusFilters.addEventListener('click', (e) => {
          const targetButton = e.target.closest('button');
          if (!targetButton) return;
          setActiveChip(historicalStatusButtons, targetButton);
          const startDateVal = historicalDateStart.valueAsDate;
          const endDateVal = historicalDateEnd.valueAsDate;
          if (startDateVal && endDateVal) {
              handleHistoricalSearch(startDateVal, endDateVal);
          }
      });
  }

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
          'Deudor': order.isDebtor ? 'Sí' : 'No',
          'Creado Por': order.createdByTag || '',
          'Pagado Por': order.paidByTag || ''
      }));
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialPedidos');
      const startDate = historicalDateStart.value;
      const endDate = historicalDateEnd.value;
      XLSX.writeFile(workbook, `Historial_Pedidos_${startDate}_a_${endDate}.xlsx`);
  };

  /** Fetches and displays the commission history for a selected seller and date range. */
  const handleSellerCommissionSearch = async () => {
      const sellerEmail = sellerCommissionHistorySelect.value;
      const startDate = sellerCommissionHistoryStart.valueAsDate;
      const endDate = sellerCommissionHistoryEnd.valueAsDate;

      if (!sellerEmail) {
          showCustomAlert('Por favor, selecciona un vendedor.');
          return;
      }
      if (!startDate || !endDate) {
          showCustomAlert('Por favor, selecciona un rango de fechas.');
          return;
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      sellerCommissionHistoryList.innerHTML = '';
      noSellerCommissionHistoryMessage.classList.add('hidden');
      exportSellerCommissionExcelBtn.disabled = true;

      const startDateString = startDate.toISOString().slice(0, 10);
      const endDateString = endDate.toISOString().slice(0, 10);
      const queryStart = new Date(`${startDateString}T00:00:00-04:00`);
      const queryEnd = new Date(`${endDateString}T23:59:59-04:00`);

      try {
          const query = db.collection('seller_commissions')
              .where('sellerEmail', '==', sellerEmail)
              .where('timestamp', '>=', queryStart)
              .where('timestamp', '<=', queryEnd)
              .orderBy('timestamp', 'desc');

          const snapshot = await query.get();

          if (snapshot.empty) {
              noSellerCommissionHistoryMessage.classList.remove('hidden');
              sellerCommissionHistorySummary.textContent = 'No se encontraron comisiones para los filtros seleccionados.';
              sellerCommissionHistoryData = [];
          } else {
              let totalSalesCLP = 0;
              let totalCommissionCLP = 0;
              sellerCommissionHistoryData = [];

              snapshot.forEach(doc => {
                  const commission = doc.data();
                  sellerCommissionHistoryData.push(commission);
                  totalSalesCLP += commission.orderCLPAmount || 0;
                  totalCommissionCLP += commission.commissionAmountCLP || 0;

                  const row = document.createElement('tr');
                  row.className = 'border-b border-gray-200 hover:bg-gray-50';
                  row.innerHTML = `
                      <td class="p-2 text-gray-600 whitespace-nowrap">${formatInChileanTime(commission.timestamp.toDate(), { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td class="p-2 font-mono text-gray-500">${commission.orderId.slice(-5)}</td>
                      <td class="p-2 font-mono text-right text-blue-600">${(commission.orderCLPAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</td>
                      <td class="p-2 font-mono text-right text-green-600 font-semibold">+ ${(commission.commissionAmountCLP || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</td>
                  `;
                  sellerCommissionHistoryList.appendChild(row);
              });

              const netAmountCLP = totalSalesCLP - totalCommissionCLP;
              sellerCommissionHistorySummary.innerHTML = `Se encontraron <strong>${snapshot.size}</strong> comisiones. <br> Total Ventas: <strong>${totalSalesCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</strong> | Total Comisión: <strong class="text-green-600">${totalCommissionCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</strong> <br> Monto Neto (CLP): <strong class="text-blue-600">${netAmountCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</strong>`;

              exportSellerCommissionExcelBtn.disabled = false;
          }
      } catch (error) {
          console.error("Error en búsqueda de comisiones de vendedor:", error);
          sellerCommissionHistorySummary.textContent = 'Error al realizar la búsqueda.';
          if (error.code === 'failed-precondition') {
              const detailedMessage = 'Error: La base de datos requiere un índice para esta consulta. Por favor, abre la consola del navegador (F12), busca el error de Firebase y haz clic en el enlace que proporciona para crear el índice automáticamente.';
              showCustomAlert(detailedMessage);
          }
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  const exportSellerCommissionHistoryToExcel = () => {
      if (sellerCommissionHistoryData.length === 0) {
          showCustomAlert('No hay datos para exportar.');
          return;
      }
      const dataToExport = sellerCommissionHistoryData.map(item => ({
          'Fecha': item.timestamp ? formatInChileanTime(item.timestamp.toDate(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
          'Vendedor': item.sellerEmail,
          'ID Pedido': item.orderId,
          'Monto Venta (CLP)': item.orderCLPAmount,
          'Tasa Comisión (%)': (item.commissionRate * 100).toFixed(2),
          'Comisión Ganada (CLP)': item.commissionAmountCLP
      }));
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialComisiones');
      const seller = sellerCommissionHistorySelect.value.split('@')[0];
      XLSX.writeFile(workbook, `Comisiones_${seller}_${sellerCommissionHistoryStart.value}_a_${sellerCommissionHistoryEnd.value}.xlsx`);
  };

  /** Fetches and displays the CLP balance history. */
  const handleClpBalanceHistorySearch = async (start, end) => {
      console.log('[Debug] handleClpBalanceHistorySearch triggered with:', { start, end });
      if (!start || !end) return;

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      clpBalanceHistoryList.innerHTML = '';
      if (noClpBalanceHistoryMessage) noClpBalanceHistoryMessage.classList.add('hidden');
      exportClpBalanceExcelBtn.disabled = true;

      const startDateString = start.toISOString().slice(0, 10);
      const endDateString = end.toISOString().slice(0, 10);
      const queryStart = new Date(`${startDateString}T00:00:00-04:00`);
      const queryEnd = new Date(`${endDateString}T23:59:59-04:00`);

      try {
          const totalCurrentClpBalance = exchangeRates.totalClpBalance || 0;
          const query = db.collection('clp_balance_history')
              .where('timestamp', '>=', queryStart)
              .where('timestamp', '<=', queryEnd)
              .orderBy('timestamp', 'desc');

          const snapshot = await query.get();

          if (snapshot.empty) {
              if (noClpBalanceHistoryMessage) noClpBalanceHistoryMessage.classList.remove('hidden');
              document.getElementById('clp-balance-history-summary').textContent = 'No se encontraron movimientos en CLP para este período.';
              clpBalanceHistoryData = [];
          } else {
              let runningBalance = totalCurrentClpBalance;
              const movementsWithBalance = [];

              snapshot.forEach(doc => {
                  const movement = doc.data();
                  movementsWithBalance.push({ ...movement, runningBalance });

                  if (movement.type === 'add') {
                      runningBalance -= movement.amount;
                  } else { // subtract
                      runningBalance += movement.amount;
                  }
              });

              clpBalanceHistoryData = movementsWithBalance; // Store for export

              clpBalanceHistoryData.forEach(item => {
                  const row = document.createElement('tr');
                  row.className = 'border-b border-gray-200 hover:bg-gray-50';
                  const credit = item.type === 'add' ? item.amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }) : '';
                  const debit = item.type === 'subtract' ? item.amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }) : '';

                  row.innerHTML = `
                      <td class="p-2 text-gray-600 whitespace-nowrap">${formatInChileanTime(item.timestamp.toDate(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td class="p-2 text-gray-800 truncate" title="${item.note || ''}">${item.note || 'N/A'}</td>
                      <td class="p-2 font-mono text-right text-red-600">${debit}</td>
                      <td class="p-2 font-mono text-right text-green-600">${credit}</td>
                      <td class="p-2 font-mono font-semibold text-right text-blue-700">${item.runningBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</td>
                  `;
                  clpBalanceHistoryList.appendChild(row);
              });

              document.getElementById('clp-balance-history-header').classList.remove('hidden');
              
              // Clear the summary as the running balance makes it redundant
              document.getElementById('clp-balance-history-summary').innerHTML = '';

              exportClpBalanceExcelBtn.disabled = false;
          }
      } catch (error) {
          console.error("Error en búsqueda de historial CLP:", error);
          document.getElementById('clp-balance-history-summary').textContent = 'Error al realizar la búsqueda.';
          if (error.code === 'failed-precondition') {
              const detailedMessage = 'Error: La base de datos requiere un índice para esta consulta. Por favor, abre la consola del navegador (F12), busca el error de Firebase y haz clic en el enlace que proporciona para crear el índice automáticamente.';
              showCustomAlert(detailedMessage);
          }
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  const exportClpBalanceHistoryToExcel = () => {
      if (clpBalanceHistoryData.length === 0) {
          showCustomAlert('No hay datos para exportar.');
          return;
      }
      const dataToExport = clpBalanceHistoryData.map(item => ({
          'Fecha': item.timestamp ? formatInChileanTime(item.timestamp.toDate(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
          'Descripción': item.note,
          'Cargo (CLP)': item.type === 'subtract' ? item.amount : '',
          'Abono (CLP)': item.type === 'add' ? item.amount : '',
          'Saldo (CLP)': item.runningBalance,
          'Admin Tag': item.adminTag || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialSaldosCLP');
      XLSX.writeFile(workbook, `Historial_Saldos_CLP.xlsx`);
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
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      balanceHistoryList.innerHTML = '';
      noBalanceHistoryMessage.classList.add('hidden');
      balanceHistoryHeader.classList.add('hidden');

      try {
          const startDateString = start.toISOString().slice(0, 10);
          const endDateString = end.toISOString().slice(0, 10);
          const queryStart = new Date(`${startDateString}T00:00:00-04:00`);
          const queryEnd = new Date(`${endDateString}T23:59:59-04:00`);

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

  if (balanceHistoryTodayBtn) {
    balanceHistoryTodayBtn.addEventListener('click', () => {
        const today = getChileanDateForPicker(new Date());
        balanceHistoryStartInput.valueAsDate = today;
        balanceHistoryEndInput.valueAsDate = today;
        fetchAndRenderBalanceHistory(today, today);
        setActiveChip(balanceHistoryRangeButtons, balanceHistoryTodayBtn);
    });
  }

  if (balanceHistoryYesterdayBtn) {
    balanceHistoryYesterdayBtn.addEventListener('click', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const chileYesterday = getChileanDateForPicker(yesterday);
        balanceHistoryStartInput.valueAsDate = chileYesterday;
        balanceHistoryEndInput.valueAsDate = chileYesterday;
        fetchAndRenderBalanceHistory(chileYesterday, chileYesterday);
        setActiveChip(balanceHistoryRangeButtons, balanceHistoryYesterdayBtn);
    });
  }

  if (balanceHistory7DaysBtn) {
    balanceHistory7DaysBtn.addEventListener('click', () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        const chileStart = getChileanDateForPicker(start);
        const chileEnd = getChileanDateForPicker(end);
        balanceHistoryStartInput.valueAsDate = chileStart;
        balanceHistoryEndInput.valueAsDate = chileEnd;
        fetchAndRenderBalanceHistory(chileStart, chileEnd);
        setActiveChip(balanceHistoryRangeButtons, balanceHistory7DaysBtn);
    });
  }

  // NEW: Event listeners for balance history day navigation
  if (balanceHistoryPrevDayBtn) {
    balanceHistoryPrevDayBtn.addEventListener('click', () => {
        changeBalanceHistoryDate(-1);
    });
  } else {
      console.error("Button with ID 'balance-history-prev-day-btn' was not found.");
  }

  if (balanceHistoryNextDayBtn) {
    balanceHistoryNextDayBtn.addEventListener('click', () => {
        changeBalanceHistoryDate(1);
    });
  } else {
      console.error("Button with ID 'balance-history-next-day-btn' was not found.");
  }

  if (balanceHistorySearchBtn) {
    balanceHistorySearchBtn.addEventListener('click', () => {
        const startDateVal = balanceHistoryStartInput.valueAsDate;
        const endDateVal = balanceHistoryEndInput.valueAsDate;

        if (!startDateVal || !endDateVal) {
            showCustomAlert('Por favor, selecciona un rango de fechas para buscar.');
            return;
        }

        const start = startDateVal;
        const end = endDateVal;

        fetchAndRenderBalanceHistory(start, end);
        setActiveChip(balanceHistoryRangeButtons, null);
    });
  }

  // NEW: Helper function for balance history day navigation
  const changeBalanceHistoryDate = (offset) => {
      const currentStartDate = balanceHistoryStartInput.valueAsDate || getChileanDateForPicker(new Date());
      const newDate = new Date(currentStartDate);
      newDate.setDate(newDate.getDate() + offset);
      const chileNewDate = getChileanDateForPicker(newDate);

      balanceHistoryStartInput.valueAsDate = chileNewDate;
      balanceHistoryEndInput.valueAsDate = chileNewDate;
      fetchAndRenderBalanceHistory(chileNewDate, chileNewDate);
      setActiveChip(balanceHistoryRangeButtons, null); // Clear active chip when navigating day by day
  };


  // Legacy prev/next day buttons removed; use the range chips instead.

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
          } else { // subtract, fee, admin_commission, or tillo_commission
              debit = item.amount;
              if (!description) {
                  if (item.type === 'fee') description = 'Comisión Bancaria';
                  else if (item.type === 'admin_commission') description = 'Comisión Admin';
                  else if (item.type === 'tillo_commission') description = 'Mano Tillo';
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
      hasClientSearchBeenPerformed = true;
      clientListPage = 1;
      updateClientView();
  });

  clientSortNameBtn.addEventListener('click', () => {
      clientListSortBy = 'name';
      hasClientSearchBeenPerformed = true;
      clientListPage = 1;
      updateClientView();
  });

  clientSortCedulaBtn.addEventListener('click', () => {
      clientListSortBy = 'cedula';
      clientListPage = 1;
      hasClientSearchBeenPerformed = true;
      updateClientView();
  });

  // NEW: Event delegation for historical orders list
  historicalOrdersList.addEventListener('click', async (e) => {
      const target = e.target.closest('.mark-paid-btn');
      const debtorTarget = e.target.closest('.debtor-toggle-btn');
      if (!target) return;

      const orderId = target.dataset.id;
      if (!orderId) return;

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      try {
          const orderDoc = await db.collection('orders').doc(orderId).get();
          if (!orderDoc.exists) throw new Error("El pedido no existe.");
          const orderData = orderDoc.data();

          // Set up payment data for a historical payment
          paymentData = { orderId, orderData, isHistorical: true };

          // Open the new modal to ask for the payment date
          openHistoricalPaymentDateModal(orderId, orderData);

      } catch (error) {
          console.error("Error al iniciar pago histórico:", error);
          showCustomAlert(`Error: ${error.message}`);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  });

  /**
   * Finalizes an order creation, handling both client (with screenshot) and admin (without screenshot/with backdating) cases.
   * @param {boolean} withScreenshot - True if a screenshot upload is required.
   */
  const finalizeOrder = async (withScreenshot) => {
      if (!orderDataToConfirm.data) {
          const messageElId = withScreenshot ? 'client-upload-message' : orderDataToConfirm.form.querySelector('p[id^="user-message-"]').id;
          return showMessage(messageElId, 'Error: No hay datos de pedido para procesar.', false);
      }

      let file = null;
      if (withScreenshot) {
          file = clientScreenshotInput.files[0];
          if (!file) {
              return showMessage('client-upload-message', 'Por favor, selecciona el archivo del comprobante.', false);
          }
      }

      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      const messageElId = withScreenshot ? 'client-upload-message' : orderDataToConfirm.form.querySelector('p[id^="user-message-"]').id;
      showMessage(messageElId, 'Procesando pedido...', true);

      const { data, form } = orderDataToConfirm;

      try {
          const newOrderRef = db.collection('orders').doc();
          const orderId = newOrderRef.id;

          if (withScreenshot && file) {
              const filePath = `client_proofs/${orderId}/${file.name}`;
              const fileRef = storage.ref(filePath);
              const uploadTask = await fileRef.put(file);
              data.clientProofUrl = await uploadTask.ref.getDownloadURL();
          } else {
              data.clientProofUrl = ''; // Admin doesn't need to upload client proof
          }

          // --- BACKDATING LOGIC ---
          const backdateInput = document.getElementById('admin-order-date-input');
          if (isAdmin && backdateInput && backdateInput.value) {
              const dateValue = backdateInput.value; // YYYY-MM-DD
              const timestamp = new Date(`${dateValue}T12:00:00-04:00`); // Noon Chile time with fixed offset
              data.createdAt = timestamp;
          } else {
              data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          }
          // --- END BACKDATING LOGIC ---

          await newOrderRef.set(data);
          
          form.reset();
          updateUserFormsForCountry();
          if (backdateInput) backdateInput.value = ''; // Also reset the backdate input
          showMessage(messageElId, '¡Pedido enviado con éxito!', true);
          
      } catch (error) {
          console.error("Error al crear el pedido:", error);
          showMessage(messageElId, `Error al crear el pedido: ${error.message}`, false);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
          if (withScreenshot) {
              clientUploadModal.classList.add('hidden');
              clientUploadModal.classList.remove('flex');
          }
          orderDataToConfirm = {}; // Clear state
      }
  };

  // Add event listeners for order form submissions
  formTransferencia.addEventListener('submit', (e) => handleOrderSubmit(e, 'transferencia'));
  formPagoMovil.addEventListener('submit', (e) => handleOrderSubmit(e, 'pago-movil'));
  formRecargaSaldo.addEventListener('submit', (e) => handleOrderSubmit(e, 'recarga-saldo'));

  // Listeners for the new order confirmation modal
  orderFinalConfirmBtn.addEventListener('click', () => {
      orderConfirmModal.classList.add('hidden');
      orderConfirmModal.classList.remove('flex');

      // If it's an admin or a standard seller, they can skip the screenshot.
      if ((isAdmin || isSeller) && !sellerRequiresProof) {
          finalizeOrder(false); // Finalize without screenshot
      } else {
          // For regular clients, ask for the payment proof.
          clientUploadModal.classList.remove('hidden');
          clientUploadModal.classList.add('flex');
          clientUploadMessage.textContent = '';
          clientScreenshotInput.value = '';
      }
  });

  clientUploadConfirmBtn.addEventListener('click', () => finalizeOrder(true));

  orderFinalCancelBtn.addEventListener('click', () => {
      orderConfirmModal.classList.add('hidden');
      orderConfirmModal.classList.remove('flex');
      orderDataToConfirm = {}; // Clear state
  });
  clientUploadCancelBtn.addEventListener('click', () => {
      clientUploadModal.classList.add('hidden');
      clientUploadModal.classList.remove('flex');
      orderDataToConfirm = {}; // Clear the state, the user cancelled the whole process.
  });
  // Autocomplete for Cedula
  cedulaInputs.forEach(input => {
      if (input) {
          input.addEventListener('blur', (e) => {
              const cedulaValue = e.target.value.replace(/[^0-9]/g, '');
            const form = e.target.closest('form');
            if (!form || !cedulaValue) return;

            let formType;
            if (form.id.includes('transferencia')) formType = 'transferencia';
            else if (form.id.includes('pago-movil')) formType = 'pago-movil';
            else if (form.id.includes('recarga-saldo')) formType = 'recarga-saldo';
            else return;

            const messageElId = form.querySelector('p[id^="user-message-"]').id;
            let dataToFill = null;
            let clientName = '';
            let clientEmail = '';

            if (isAdmin || isSeller) {
                const clientProfile = fullClientList.find(c => c.cedula === cedulaValue);
                if (!clientProfile) return;
                dataToFill = clientProfile.lastOrders[formType] || clientProfile.latestOverall;
                clientName = clientProfile.clientName;
                clientEmail = clientProfile.email;
            } else {
                const userClientOrders = userOwnOrders.filter(o => o.cedula === cedulaValue);
                if (userClientOrders.length === 0) return;
                const lastOrderForType = userClientOrders.find(o => o.type === formType);
                dataToFill = lastOrderForType || userClientOrders[0];
                clientName = userClientOrders[0].clientName;
                clientEmail = userClientOrders[0].email || '';
            }

            if (!dataToFill) return;

            form.querySelector(`input[id^="name-"]`).value = clientName;
            const emailField = form.querySelector(`input[id^="email-"]`);
            if (emailField) emailField.value = clientEmail;

            if (dataToFill.type === formType) {
                if (formType === 'transferencia') {
                    form.querySelector('#bank-transferencia').value = dataToFill.bank || '';
                    const accountTypeField = form.querySelector('#account-type-transferencia');
                    if (accountTypeField) accountTypeField.value = dataToFill.accountType || 'ahorro';
                    form.querySelector('#account-number-transferencia').value = dataToFill.accountNumber || '';
                } else if (formType === 'pago-movil') {
                    form.querySelector('#phone-pm').value = dataToFill.phone || '';
                    form.querySelector('#bank-pm').value = dataToFill.bank || '';
                } else if (formType === 'recarga-saldo') {
                    form.querySelector('#phone-rs').value = dataToFill.phone || '';
                }
                showMessage(messageElId, `Datos de ${clientName} autocompletados.`, true);
            } else {
                showMessage(messageElId, `Nombre de ${clientName} autocompletado. Ingrese los nuevos datos de pago.`, true);
            }
          });
      }
  });

  // Copy individual client data from the client list
  clientsList.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-client-btn');
      if (editBtn) {
        const cedula = editBtn.dataset.cedula;
        openEditClientModal(cedula);
        return; // Stop further execution
      }

      const copyBtn = e.target.closest('.copy-client-btn');
      if (!copyBtn) return;

      const cedula = copyBtn.dataset.cedula;
      const clientProfile = fullClientList.find(c => c.cedula === cedula);

      if (!clientProfile || !clientProfile.latestOverall) {
          showCustomAlert('Error: No se encontraron los datos completos del cliente.');
          return;
      }
      const clientData = clientProfile.latestOverall;
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

  // Autocomplete bank based on account number prefix (for VE only)
  const accountNumberInput = document.getElementById('account-number-transferencia');
  accountNumberInput.addEventListener('input', (e) => {
      if (userSelectedCountry !== 'VES') return; // Only for Venezuela

      const accountNumber = e.target.value.replace(/[^0-9]/g, '');
      if (accountNumber.length >= 4) {
          const prefix = accountNumber.substring(0, 4);
          const bankName = venezuelanBankPrefixes[prefix];
          if (bankName) {
              const bankSelect = document.getElementById('bank-transferencia');
              // The option should exist because we populate it from venezuelanBanks array
              bankSelect.value = bankName;
          }
      }
  });

  // CLP Balance History Listeners
  if (clpBalanceHistorySearchBtn) {
      clpBalanceHistorySearchBtn.addEventListener('click', () => {
          const start = clpBalanceHistoryStartInput ? clpBalanceHistoryStartInput.valueAsDate : null;
          const end = clpBalanceHistoryEndInput ? clpBalanceHistoryEndInput.valueAsDate : null;
          if (!start || !end) {
              showCustomAlert('Por favor, selecciona un rango de fechas para buscar en CLP.');
              return;
          }
          handleClpBalanceHistorySearch(start, end);
          setActiveChip(clpBalanceHistoryRangeButtons, null);
      });
  }
  if (exportClpBalanceExcelBtn) {
      exportClpBalanceExcelBtn.addEventListener('click', exportClpBalanceHistoryToExcel);
  }

  if (clpBalanceHistoryTodayBtn) {
      clpBalanceHistoryTodayBtn.addEventListener('click', () => {
          const today = getChileanDateForPicker(new Date());
          if (clpBalanceHistoryStartInput) clpBalanceHistoryStartInput.valueAsDate = today;
          if (clpBalanceHistoryEndInput) clpBalanceHistoryEndInput.valueAsDate = today;
          handleClpBalanceHistorySearch(today, today);
          setActiveChip(clpBalanceHistoryRangeButtons, clpBalanceHistoryTodayBtn);
      });
  }
  if (clpBalanceHistoryYesterdayBtn) {
      clpBalanceHistoryYesterdayBtn.addEventListener('click', () => {
          const yesterday = getChileanDateForPicker(new Date(Date.now() - 86400000));
          if (clpBalanceHistoryStartInput) clpBalanceHistoryStartInput.valueAsDate = yesterday;
          if (clpBalanceHistoryEndInput) clpBalanceHistoryEndInput.valueAsDate = yesterday;
          handleClpBalanceHistorySearch(yesterday, yesterday);
          setActiveChip(clpBalanceHistoryRangeButtons, clpBalanceHistoryYesterdayBtn);
      });
  }
  if (clpBalanceHistory7DaysBtn) {
      clpBalanceHistory7DaysBtn.addEventListener('click', () => {
          const end = getChileanDateForPicker(new Date());
          const start = getChileanDateForPicker(new Date(Date.now() - 6 * 86400000));
          if (clpBalanceHistoryStartInput) clpBalanceHistoryStartInput.valueAsDate = start;
          if (clpBalanceHistoryEndInput) clpBalanceHistoryEndInput.valueAsDate = end;
          handleClpBalanceHistorySearch(start, end);
          setActiveChip(clpBalanceHistoryRangeButtons, clpBalanceHistory7DaysBtn);
      });
  }

  // Seller Commission History Listeners
  if (sellerCommissionHistorySearchBtn) {
      sellerCommissionHistorySearchBtn.addEventListener('click', () => {
          handleSellerCommissionSearch();
          setActiveChip(sellerCommissionRangeButtons, null);
      });
  }
  if (exportSellerCommissionExcelBtn) {
      exportSellerCommissionExcelBtn.addEventListener('click', exportSellerCommissionHistoryToExcel);
  }

  if (sellerCommissionHistoryTodayBtn) {
      sellerCommissionHistoryTodayBtn.addEventListener('click', () => {
          const today = getChileanDateForPicker(new Date());
          setSellerCommissionDateRangeAndSearch(today, today);
          setActiveChip(sellerCommissionRangeButtons, sellerCommissionHistoryTodayBtn);
      });
  }

  if (sellerCommissionHistoryYesterdayBtn) {
      sellerCommissionHistoryYesterdayBtn.addEventListener('click', () => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const chileYesterday = getChileanDateForPicker(yesterday);
          setSellerCommissionDateRangeAndSearch(chileYesterday, chileYesterday);
          setActiveChip(sellerCommissionRangeButtons, sellerCommissionHistoryYesterdayBtn);
      });
  }

  if (sellerCommissionHistory7DaysBtn) {
      sellerCommissionHistory7DaysBtn.addEventListener('click', () => {
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - 6);
          const chileStart = getChileanDateForPicker(start);
          const chileEnd = getChileanDateForPicker(end);
          setSellerCommissionDateRangeAndSearch(chileStart, chileEnd);
          setActiveChip(sellerCommissionRangeButtons, sellerCommissionHistory7DaysBtn);
      });
  }

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
          country: 'VE', // Always Venezuela
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
              const fromBankName = normalizeBankName(fromAccount.bank || fromAccount.bankName || '');
              const toBankName = normalizeBankName(toAccount.bank || toAccount.bankName || '');
              const fee = fromBankName !== toBankName ? computeInterbankFee(amount) : 0;
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
      if (!fromAccount || !toAccount) {
          showMessage('transfer-funds-message', 'No se encontraron las cuentas seleccionadas. Intenta recargar la página.', false);
          loadingSpinner.classList.add('hidden'); return;
      }
      const fromBank = (typeof fromAccount.bank === 'string' ? fromAccount.bank.trim() : (typeof fromAccount.bankName === 'string' ? fromAccount.bankName.trim() : '')) || 'Sin banco';
      const toBank = (typeof toAccount.bank === 'string' ? toAccount.bank.trim() : (typeof toAccount.bankName === 'string' ? toAccount.bankName.trim() : '')) || 'Sin banco';
      const fromHolder = (typeof fromAccount.holder === 'string' ? fromAccount.holder.trim() : '') || 'Sin titular';
      const toHolder = (typeof toAccount.holder === 'string' ? toAccount.holder.trim() : '') || 'Sin titular';
      const fee = normalizeBankName(fromBank) !== normalizeBankName(toBank) ? computeInterbankFee(amount) : 0;
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
          batch.set(db.collection('balance_history').doc(), { amount, type: 'subtract', note: `Transferencia a ${toHolder}`, timestamp: serverTimestamp, holder: fromHolder, bank: fromBank });
          if (fee > 0) batch.set(db.collection('balance_history').doc(), { amount: fee, type: 'fee', note: `Comisión por transferencia interna`, timestamp: serverTimestamp, holder: fromHolder, bank: fromBank });
          batch.set(db.collection('balance_history').doc(), { amount, type: 'add', note: `Transferencia desde ${fromHolder}`, timestamp: serverTimestamp, holder: toHolder, bank: toBank });

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

  // --- Batch Processing Logic ---

  const renderBatchClientList = (isNewRender = false) => {
      if (isNewRender) {
          batchClientList.innerHTML = '';
          batchClientListPage = 1;
      }

      // Remove existing "load more" button before adding new content
      const existingLoadMoreBtn = document.getElementById('batch-load-more-btn');
      if (existingLoadMoreBtn) {
          existingLoadMoreBtn.remove();
      }

      const searchTerm = batchClientSearchInput.value.toLowerCase();
      const filteredClients = fullClientList.filter(client =>
          client.clientName.toLowerCase().includes(searchTerm) ||
          client.cedula.includes(searchTerm)
      ).sort((a, b) => a.clientName.localeCompare(b.clientName));

      const start = (batchClientListPage - 1) * CLIENTS_PER_PAGE_BATCH;
      const end = start + CLIENTS_PER_PAGE_BATCH;
      const clientsToRender = filteredClients.slice(start, end);

      if (isNewRender && clientsToRender.length === 0) {
          batchClientList.innerHTML = `<p class="text-gray-500 p-4 text-center">No se encontraron clientes.</p>`;
          return;
      }

      const clientsHtml = clientsToRender.map(client => {
          const isSelected = batchProcessData.selectedClients.has(client.id);
          let paymentMethodInfo = '';
          switch (client.type) {
              case 'transferencia': paymentMethodInfo = `Transferencia: ...${client.accountNumber.slice(-4)}`; break;
              case 'pago-movil': paymentMethodInfo = `Pago Móvil: ...${client.phone.slice(-4)}`; break;
              case 'recarga-saldo': paymentMethodInfo = `Recarga: ...${client.phone.slice(-4)}`; break;
          }
          return `
              <label for="batch-client-${client.id}" class="flex items-center p-3 rounded-lg border cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}">
                  <input type="checkbox" id="batch-client-${client.id}" data-client-id="${client.id}" class="h-5 w-5 text-blue-600 focus:ring-blue-500 mr-3" ${isSelected ? 'checked' : ''}>
                  <div>
                      <p class="font-semibold">${client.clientName}</p>
                      <p class="text-sm text-gray-600">${client.cedula} - <span class="text-purple-700">${paymentMethodInfo}</span></p>
                  </div>
              </label>
          `;
      }).join('');

      batchClientList.innerHTML += clientsHtml;

      // Add "Load More" button if there are more clients
      if (filteredClients.length > end) {
          const loadMoreBtn = document.createElement('button');
          loadMoreBtn.id = 'batch-load-more-btn';
          loadMoreBtn.className = 'w-full text-center py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300';
          loadMoreBtn.textContent = 'Cargar más clientes...';
          loadMoreBtn.onclick = () => {
              batchClientListPage++;
              renderBatchClientList(false); // Append next page
          };
          batchClientList.appendChild(loadMoreBtn);
      }
  };

  const updateBatchSelectionCount = () => {
      const count = batchProcessData.selectedClients.size;
      batchSelectedCount.textContent = `${count} cliente(s) seleccionado(s)`;
      batchClientSelectionNextBtn.disabled = count === 0;
  };

  const openBatchAmountEntry = () => {
      batchAmountList.innerHTML = '';
      batchProcessData.selectedClients.forEach(client => {
          const vesRate = exchangeRates['VES'] || 0;
          const row = document.createElement('tr');
          row.className = 'border-b border-gray-200';
          row.dataset.clientId = client.id;
          let paymentMethodInfo = '';
          switch (client.type) {
              case 'transferencia': paymentMethodInfo = `Transferencia: ...${client.accountNumber.slice(-4)}`; break;
              case 'pago-movil': paymentMethodInfo = `Pago Móvil: ...${client.phone.slice(-4)}`; break;
              case 'recarga-saldo': paymentMethodInfo = `Recarga: ...${client.phone.slice(-4)}`; break;
          }
          row.innerHTML = `
              <td class="p-2">
                  <p class="font-semibold">${client.clientName}</p>
                  <p class="text-xs text-gray-500">${client.cedula}</p>
              </td>
              <td class="p-2 text-xs text-purple-700">${paymentMethodInfo}</td>
              <td class="p-2"><input type="number" class="form-control batch-clp-amount" placeholder="CLP" step="0.01"></td>
              <td class="p-2 font-mono text-green-600 batch-ves-amount" data-rate="${vesRate}">0.00 VES</td>
          `;
          batchAmountList.appendChild(row);
      });
      // Hide the new batch selection view, not the old modal
      batchSelectionView.classList.add('hidden');
      batchActionBar.classList.add('hidden');
      batchActionBar.classList.remove('flex');
      batchAmountEntryModal.classList.remove('hidden');
      batchAmountEntryModal.classList.add('flex');
      updateBatchAmountConfirmButton();
  };

  const updateBatchAmountConfirmButton = () => {
      const inputs = batchAmountList.querySelectorAll('.batch-clp-amount');
      const allFilled = Array.from(inputs).every(input => input.value && parseFloat(input.value) > 0);
      batchAmountEntryConfirmBtn.disabled = !allFilled;
  };

  const createBatchOrders = async () => {
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      
      const adminTag = userTags[currentUser.email] || 'ADMIN';
      const firestoreBatch = db.batch();
      const ordersToCreate = [];

      batchAmountList.querySelectorAll('tr[data-client-id]').forEach(row => {
          const clientIdFromRow = (row.dataset.clientId || '').trim();
          const clientData = batchProcessData.selectedClients.get(clientIdFromRow) || {};
          const clientDetails = { ...clientData };
          const derivedClientId = typeof clientDetails.id === 'string' && clientDetails.id.trim()
              ? clientDetails.id.trim()
              : (typeof clientDetails.clientId === 'string' && clientDetails.clientId.trim()
                  ? clientDetails.clientId.trim()
                  : clientIdFromRow);
          delete clientDetails.id;
          delete clientDetails.clientId;

          const clpAmount = parseFloat(row.querySelector('.batch-clp-amount').value);
          const vesRate = parseFloat(row.querySelector('.batch-ves-amount').dataset.rate);
          const destinationAmount = roundUpToTwoDecimals(clpAmount * vesRate);

          const newOrderRef = db.collection('orders').doc();
          const orderPayload = {
              ...clientDetails, // This includes name, cedula, type, bank, etc.
              id: newOrderRef.id, // We need the ID later
              ...(derivedClientId ? { clientId: derivedClientId } : {}),
              clpAmount,
              destinationAmount,
              destinationCurrency: 'VES',
              status: 'Pendiente de pago',
              userId: currentUser.uid,
              createdByTag: adminTag,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          };
          if (isSeller) {
              orderPayload.sellerId = currentUser.uid;
              orderPayload.sellerEmail = currentUser.email || '';
              orderPayload.sellerCommissionRate = typeof commissionRate === 'number' ? commissionRate : 0;
          }
          ordersToCreate.push(orderPayload);
          firestoreBatch.set(newOrderRef, orderPayload);
      });

      try {
          await firestoreBatch.commit();
          batchProcessData.createdOrders = ordersToCreate;
          openBatchPaymentModal();
      } catch (error) {
          console.error("Error creating batch orders:", error);
          showCustomAlert(`Error al crear los pedidos en lote: ${error.message}`);
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  const openBatchPaymentModal = () => {
      const totalVes = batchProcessData.createdOrders.reduce((sum, order) => sum + order.destinationAmount, 0);
      const totalOrders = batchProcessData.createdOrders.length;

      document.getElementById('batch-payment-summary').innerHTML = `
          <p>Total de Pedidos: <strong>${totalOrders}</strong></p>
          <p>Monto Total a Pagar: <strong class="text-green-600">${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</strong></p>
      `;

      const sourceSelect = document.getElementById('batch-payment-source-select');
      sourceSelect.innerHTML = accountsData
          .filter(acc => acc.balance >= totalVes)
          .map(acc => `<option value="${acc.id}">${acc.holder} - ${acc.bank} (${acc.balance.toLocaleString('es-VE', {minimumFractionDigits: 2})} VES)</option>`)
          .join('');
      
      document.getElementById('batch-proof-upload-input').value = '';
      document.getElementById('batch-payment-message').textContent = '';
      document.getElementById('batch-payment-confirm-btn').disabled = true;

      batchAmountEntryModal.classList.add('hidden');
      batchPaymentModal.classList.remove('hidden');
      batchPaymentModal.classList.add('flex');
  };

  const confirmBatchPayment = async () => {
      const confirmBtn = document.getElementById('batch-payment-confirm-btn');
      const sourceAccountId = document.getElementById('batch-payment-source-select').value;
      const files = document.getElementById('batch-proof-upload-input').files;

      if (!sourceAccountId) {
          return showMessage('batch-payment-message', 'Selecciona una cuenta de origen.', false);
      }
      if (files.length !== batchProcessData.createdOrders.length) {
          return showMessage('batch-payment-message', `Debes seleccionar exactamente ${batchProcessData.createdOrders.length} archivos (uno por pedido).`, false);
      }

      confirmBtn.disabled = true; // Disable button to prevent double-clicks
      loadingSpinner.classList.remove('hidden');
      loadingSpinner.classList.add('flex');
      showMessage('batch-payment-message', 'Subiendo comprobantes y procesando pagos...', true);

      try {
          const adminTag = userTags[currentUser.email] || 'ADMIN';
          const firestoreBatch = db.batch();
          const proofUrls = [];
          const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp(); // Use a single timestamp

          // 1. Upload all files in parallel
          const uploadPromises = Array.from(files).map((file, index) => {
              const order = batchProcessData.createdOrders[index];
              const filePath = `proofs/${order.id}/${file.name}`;
              return storage.ref(filePath).put(file).then(task => task.ref.getDownloadURL());
          });

          const uploadedUrls = await Promise.all(uploadPromises);

          let totalDebitVes = 0;
          const sourceAccount = accountsData.find(acc => acc.id === sourceAccountId);
          if (!sourceAccount) {
              throw new Error('No se encontro la cuenta de origen seleccionada.');
          }
          const historyHolderRaw = typeof sourceAccount.holder === 'string' ? sourceAccount.holder.trim() : '';
          const historyBankRaw = typeof sourceAccount.bank === 'string' ? sourceAccount.bank.trim() : (typeof sourceAccount.bankName === 'string' ? sourceAccount.bankName.trim() : '');
          const historyHolder = historyHolderRaw || 'Sin titular';
          const historyBank = historyBankRaw || 'Sin banco';

          // 2. Prepare batch updates for Firestore
          batchProcessData.createdOrders.forEach((order, index) => {
              const orderRef = db.collection('orders').doc(order.id);
              const proofUrl = uploadedUrls[index];
              proofUrls.push({ name: order.clientName, url: proofUrl });

              firestoreBatch.update(orderRef, { status: 'Pagado', proofUrl, paidByTag: adminTag, paidAt: serverTimestamp });

              const fee = calculateFee(order, sourceAccount);
              const adminCommission = roundUpToTwoDecimals(order.destinationAmount * ADMIN_BASE_COMMISSION_RATE);
              const tilloCommission = roundUpToTwoDecimals(order.destinationAmount * TILLO_COMMISSION_RATE);
              const totalCommission = adminCommission + tilloCommission;
              const debit = order.destinationAmount + fee + totalCommission;
              totalDebitVes += debit;

              // History records for each order
              firestoreBatch.set(db.collection('balance_history').doc(), { amount: order.destinationAmount, type: 'subtract', note: `Pago lote ${order.id.slice(-5)}`, timestamp: serverTimestamp, holder: historyHolder, bank: historyBank });
              if (fee > 0) firestoreBatch.set(db.collection('balance_history').doc(), { amount: fee, type: 'fee', note: `Comisión lote ${order.id.slice(-5)}`, timestamp: serverTimestamp, holder: historyHolder, bank: historyBank });
              if (adminCommission > 0) firestoreBatch.set(db.collection('balance_history').doc(), { amount: adminCommission, type: 'admin_commission', note: `Comisión Admin lote ${order.id.slice(-5)}`, timestamp: serverTimestamp, holder: historyHolder, bank: historyBank });
              if (tilloCommission > 0) firestoreBatch.set(db.collection('balance_history').doc(), { amount: tilloCommission, type: 'tillo_commission', note: `Mano Tillo lote ${order.id.slice(-5)}`, timestamp: serverTimestamp, holder: historyHolder, bank: historyBank });
          });

          // 3. Decrement main account balance
          firestoreBatch.update(db.collection('accounts').doc(sourceAccountId), {
              balance: firebase.firestore.FieldValue.increment(-totalDebitVes)
          });
          // 4. Commit all changes
          await firestoreBatch.commit();
          
          // 5. Show the new success modal with sharing options
          openBatchSuccessModal(uploadedUrls);

      } catch (error) {
          console.error("Error confirming batch payment:", error);
          showMessage('batch-payment-message', `Error: ${error.message}`, false);
          confirmBtn.disabled = false; // Re-enable button on error
      } finally {
          loadingSpinner.classList.add('hidden');
          loadingSpinner.classList.remove('flex');
      }
  };

  /** Opens the success modal with options to share proofs. */
  const openBatchSuccessModal = (proofUrls) => {
      batchPaymentModal.classList.add('hidden'); // Hide the payment modal
      batchSuccessModal.classList.remove('hidden');
      batchSuccessModal.classList.add('flex');

      // Store urls for the "share all" button
      batchProcessData.proofUrls = proofUrls;

      batchSuccessOrderList.innerHTML = batchProcessData.createdOrders.map((order, index) => {
          const proofUrl = proofUrls[index];
          return `
              <div class="flex justify-between items-center p-3 border-b border-gray-200">
                  <div>
                      <p class="font-semibold">${order.clientName}</p>
                      <p class="text-sm text-gray-500">${order.destinationAmount.toLocaleString('es-VE', {minimumFractionDigits: 2})} VES</p>
                  </div>
                  <button 
                      data-proof-url="${proofUrl}" 
                      data-client-name="${order.clientName}" 
                      class="share-proof-btn bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-600">
                      Compartir
                  </button>
              </div>
          `;
      }).join('');

      // The main `share-proof-btn` listener in the body will handle individual clicks.
  };

  // --- NEW BATCH PROCESSING FLOW ---

  const toggleBatchMode = (enable) => {
      if (enable) {
          dailyOrdersHeader.classList.add('hidden');
          dailyOrdersContainer.classList.add('hidden');
          batchSelectionView.classList.remove('hidden');
          batchActionBar.classList.remove('hidden');
          batchActionBar.classList.add('flex');

          batchProcessData = { selectedClients: new Map(), createdOrders: [], proofUrls: [] };
          if (batchViewClientSearch) batchViewClientSearch.value = '';
          renderBatchViewClientList();
          updateBatchViewSelectionCount();
      } else {
          dailyOrdersHeader.classList.remove('hidden');
          dailyOrdersContainer.classList.remove('hidden');
          batchSelectionView.classList.add('hidden');
          batchActionBar.classList.add('hidden');
          batchActionBar.classList.remove('flex');
      }
  };

  const renderBatchViewClientList = () => {
      if (!batchViewClientList) return;
      batchViewClientList.innerHTML = '';

      const searchTerm = batchViewClientSearch ? batchViewClientSearch.value.toLowerCase() : '';
      const filteredClients = fullClientList
          .filter(client =>
              client.clientName.toLowerCase().includes(searchTerm) ||
              client.cedula.includes(searchTerm)
          )
          .sort((a, b) => a.clientName.localeCompare(b.clientName));

      if (filteredClients.length === 0) {
          batchViewClientList.innerHTML = `<p class="text-gray-500 p-4 text-center">No se encontraron clientes.</p>`;
          updateBatchLetterNavState(new Set());
          return;
      }

      const letterAnchors = new Set();
      const availableLetters = new Set();

      const clientsHtml = filteredClients.map(client => {
          const letter = getClientInitial(client.clientName);
          availableLetters.add(letter);
          const isSelected = batchProcessData.selectedClients.has(client.id);
          let paymentMethodInfo = '';
          switch (client.type) {
              case 'transferencia':
                  paymentMethodInfo = client.accountNumber ? `Transferencia: ...${client.accountNumber.slice(-4)}` : 'Transferencia';
                  break;
              case 'pago-movil':
                  paymentMethodInfo = client.phone ? `Pago Móvil: ...${client.phone.slice(-4)}` : 'Pago Móvil';
                  break;
              case 'recarga-saldo':
                  paymentMethodInfo = client.phone ? `Recarga: ...${client.phone.slice(-4)}` : 'Recarga de Saldo';
                  break;
              default:
                  paymentMethodInfo = client.type || 'Sin tipo';
                  break;
          }
          const isAnchor = !letterAnchors.has(letter);
          if (isAnchor) letterAnchors.add(letter);
          const anchorAttr = isAnchor ? `data-letter-anchor="${letter}"` : '';
          const anchorId = isAnchor ? `id="letter-anchor-${letter === '#' ? 'otros' : letter}"` : '';
          return `
              <label ${anchorAttr} ${anchorId} data-letter="${letter}" for="batch-view-client-${client.id}" class="flex items-center p-3 rounded-lg border cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}">
                  <input type="checkbox" id="batch-view-client-${client.id}" data-client-id="${client.id}" class="h-5 w-5 text-blue-600 focus:ring-blue-500 mr-3" ${isSelected ? 'checked' : ''}>
                  <div>
                      <p class="font-semibold">${client.clientName}</p>
                      <p class="text-sm text-gray-600">${client.cedula} - <span class="text-purple-700">${paymentMethodInfo}</span></p>
                  </div>
              </label>
          `;
      }).join('');

      batchViewClientList.innerHTML = clientsHtml;
      updateBatchLetterNavState(availableLetters);
  };

  const updateBatchViewSelectionCount = () => {
      const count = batchProcessData.selectedClients.size;
      batchViewSelectedCount.textContent = `${count} cliente(s) seleccionado(s)`;
      continueBatchProcessBtn.disabled = count === 0;
  };

  if (startBatchProcessBtn) {
    startBatchProcessBtn.addEventListener('click', () => toggleBatchMode(true));
  }
  if (cancelBatchProcessBtn) {
    cancelBatchProcessBtn.addEventListener('click', () => toggleBatchMode(false));
  }
  if (batchViewClientSearch) {
    batchViewClientSearch.addEventListener('input', () => renderBatchViewClientList());
  }
  if (batchViewLetterNav) {
    batchViewLetterNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.letter-nav-btn');
        if (!btn || btn.disabled) return;
        const letter = btn.dataset.letter;
        const anchor = batchViewClientList ? batchViewClientList.querySelector(`[data-letter-anchor="${letter}"]`) : null;
        if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
  }
  batchViewClientList.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
          const clientId = e.target.dataset.clientId;
          const clientData = fullClientList.find(c => c.id === clientId);
          if (e.target.checked) {
              batchProcessData.selectedClients.set(clientId, clientData);
          } else {
              batchProcessData.selectedClients.delete(clientId);
          }
          updateBatchViewSelectionCount();
      }
  });

  if (continueBatchProcessBtn) {
    continueBatchProcessBtn.addEventListener('click', () => {
        // This now opens the amount entry modal.
        // The logic inside openBatchAmountEntry is the same as before.
        openBatchAmountEntry();
    });
  }

  // The rest of the batch logic (amount entry, payment) remains the same,
  // but we need to re-add the listeners for the modals.

  // Re-add listeners for the second modal (Amount Entry)
  // ... (The code for openBatchAmountEntry, updateBatchAmountConfirmButton, createBatchOrders, etc., is the same as before)
  // ... (The code for openBatchPaymentModal, confirmBatchPayment is also the same)

  // We just need to ensure the event listeners for the modals are active.
  // These were in the old code and are still valid.
  if (batchAmountEntryBackBtn) {
    batchAmountEntryBackBtn.addEventListener('click', () => {
        // Hide the current modal
        batchAmountEntryModal.classList.add('hidden');
        batchAmountEntryModal.classList.remove('flex');

        // Show the previous view (the client selection part)
        batchSelectionView.classList.remove('hidden');
        batchActionBar.classList.remove('hidden');
        batchActionBar.classList.add('flex');
    });
  }

  if (batchAmountEntryConfirmBtn) batchAmountEntryConfirmBtn.addEventListener('click', createBatchOrders);

  document.getElementById('batch-payment-confirm-btn').addEventListener('click', confirmBatchPayment);
  document.getElementById('batch-payment-cancel-btn').addEventListener('click', () => batchPaymentModal.classList.add('hidden'));

  // NEW: Listeners for the Batch Success Modal
  if (batchSuccessShareAllBtn) {
      batchSuccessShareAllBtn.addEventListener('click', async () => {
          const header = `*Comprobantes de Pago - Lote* 🍏\n\n`;
          const linksText = batchProcessData.createdOrders.map((order, index) => {
              return `*${order.clientName}:* ${batchProcessData.proofUrls[index]}`;
          }).join('\n');
          const fullMessage = header + linksText;
          await navigator.clipboard.writeText(fullMessage);
          showToastNotification('¡Mensaje con todos los comprobantes copiado!');
      });
  }

  if (batchSuccessCloseBtn) {
      batchSuccessCloseBtn.addEventListener('click', () => {
          batchSuccessModal.classList.add('hidden');
          batchSuccessModal.classList.remove('flex');
          // Clear state and exit batch mode completely
          batchProcessData = {};
          toggleBatchMode(false);
      });
  }
  if (batchAmountList) {
      batchAmountList.addEventListener('input', (e) => {
          if (e.target.classList.contains('batch-clp-amount')) {
              const row = e.target.closest('tr');
              const clpAmount = parseFloat(e.target.value) || 0;
              const vesDisplay = row.querySelector('.batch-ves-amount');
              const rate = parseFloat(vesDisplay.dataset.rate);
              const vesAmount = roundUpToTwoDecimals(clpAmount * rate);
              vesDisplay.textContent = `${vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
              updateBatchAmountConfirmButton();
          }
      });
  }

  // Listeners para el modal de edición
  if (editClientModal) {
    editClientCloseBtn.addEventListener('click', () => {
      editClientModal.classList.add('hidden');
      editClientModal.classList.remove('flex');
    });
    editClientForm.addEventListener('submit', handleSaveClientChanges);
  }

});
