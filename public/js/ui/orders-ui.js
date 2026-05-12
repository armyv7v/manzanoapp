// public/js/ui/orders-ui.js
import { isNativePlatform, formatInChileanTime, formatDateForTable } from '../utils/formatters.js';

/**
 * Renders a single order card for the logged-in user's view (Compact/Exchange Style).
 * @param {object} order - The order data, including its ID.
 * @param {boolean} isSeller - Whether the current viewing user is a seller.
 * @returns {string} The HTML string for the user's order card.
 */
export const renderUserOrder = (order, isSeller = false) => {
    const orderId = order.id;
    // Format date specifically for compact row (e.g. "12 Oct • 14:30")
    const dateObj = order.createdAt ? order.createdAt.toDate() : null;
    let dateStr = 'N/A';
    if (dateObj) {
        const dayMonth = dateObj.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
        const time = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
        dateStr = `${dayMonth} • ${time}`;
    }

    const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
    const destinationAmount = (order.destinationAmount || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const destinationCurrency = order.destinationCurrency || 'VES';
    const orderIdTag = orderId.slice(-5);

    let statusColor = 'text-gray-500 bg-gray-100'; // Default
    let statusDot = 'bg-gray-400';
    let statusText = order.status;

    let proofLink = '';

    switch (order.status) {
        case 'Pendiente de pago':
            statusColor = 'text-amber-600';
            statusDot = 'bg-amber-500';
            statusText = 'PENDIENTE';
            if (order.clientProofUrl) {
                proofLink = `<a href="${order.clientProofUrl}" target="_blank" rel="noopener noreferrer" class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold hover:bg-blue-100">VER COMPROBANTE</a>`;
            }
            break;
        case 'Pagado':
            statusColor = 'text-green-600';
            statusDot = 'bg-green-500';
            statusText = 'COMPLETADO';
            if (order.proofUrl) {
                // Seller sharing logic remains, but simplified for compact view
                if (isSeller) {
                    // For seller in compact view, maybe just an icon or smaller button.
                    // We will stick to the previous button logic but made compact.
                    if (isNativePlatform() || (navigator.share && navigator.canShare)) {
                        proofLink = `
                        <button data-proof-url="${order.proofUrl}" data-client-name="${order.clientName}" class="share-proof-btn flex items-center gap-1 bg-green-50 text-green-600 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-green-100">
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"></path></svg>
                            COMPARTIR
                        </button>`;
                    } else {
                        const shareText = encodeURIComponent(`Comprobante de pago para ${order.clientName}`);
                        const shareUrl = encodeURIComponent(order.proofUrl);
                        proofLink = `
                        <a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-blue-100">
                             <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.068-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                            ENLACE
                        </a>`;
                    }
                } else {
                    // Regular client view proof link
                    proofLink = `<a href="${order.proofUrl}" target="_blank" rel="noopener noreferrer" class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold hover:bg-blue-100">VER COMPROBANTE</a>`;
                }
            }
            break;
        case 'Cancelado':
            statusColor = 'text-red-600';
            statusDot = 'bg-red-500';
            statusText = 'CANCELADO';
            break;
    }

    // Type Badge
    let typeLabel = 'OTRO';
    let typeClass = 'bg-gray-100 text-gray-600';
    if (order.type === 'transferencia') { typeLabel = 'TRANSF'; typeClass = 'bg-purple-50 text-purple-600'; }
    if (order.type === 'pago-movil') { typeLabel = 'P.MÓVIL'; typeClass = 'bg-blue-50 text-blue-600'; }
    if (order.type === 'recarga-saldo') { typeLabel = 'RECARGA'; typeClass = 'bg-teal-50 text-teal-600'; }

    return `
      <div class="p-3 bg-white border-b border-gray-100 flex justify-between items-center group active:bg-gray-50 transition-colors">
          <!-- Left Column: Identifier & Context -->
          <div class="flex flex-col gap-0.5 max-w-[55%]">
              <div class="flex items-center gap-2">
                  <span class="font-bold text-gray-800 text-sm tracking-tight">#${orderIdTag}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${typeClass} uppercase tracking-wider">${typeLabel}</span>
              </div>
              <div class="text-[11px] text-gray-400 font-medium">${dateStr}</div>
              <!-- Optional: Add Bank/Phone info here if space permits, truncated -->
          </div>

          <!-- Right Column: Financials & Status -->
          <div class="flex flex-col items-end gap-0.5 text-right flex-grow">
              <div class="font-bold text-gray-900 text-sm tracking-tight">${destinationAmount} ${destinationCurrency}</div>
              <div class="text-[11px] text-gray-400 font-medium">${clpAmount}</div>
              <!-- Status Indicator & Proof Link -->
              <div class="flex items-center gap-2 mt-0.5">
                  ${proofLink}
                  <div class="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded-full border border-gray-100">
                    <div class="w-1.5 h-1.5 rounded-full ${statusDot}"></div>
                    <span class="text-[9px] font-bold ${statusColor} uppercase tracking-wide">${statusText}</span>
                  </div>
              </div>
          </div>
      </div>
  `;
};

/**
 * Renders a single order card into an HTML string (Admin Compact/Exchange Style).
 * @param {object} order - The order data.
 * @param {string} orderId - The order ID.
 * @returns {string} The HTML string for the order card.
 */
export const renderOrder = (order, orderId) => {
    const orderIdTag = orderId.slice(-5);
    const dateObj = order.createdAt ? order.createdAt.toDate() : null;
    let dateStr = 'N/A';
    if (dateObj) {
        // Shorter date for admin
        const dayMonth = dateObj.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
        const time = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
        dateStr = `${dayMonth} ${time}`;
    }

    const clpAmount = (order.clpAmount || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
    const destinationAmount = (order.destinationAmount || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const destinationCurrency = order.destinationCurrency || 'VES';

    let typeLabel = 'OTRO';
    let typeClass = 'bg-gray-100 text-gray-600';
    let detailText = '';

    switch (order.type) {
        case 'transferencia':
            typeLabel = 'TRANSF'; typeClass = 'bg-blue-50 text-blue-600';
            detailText = `${order.bank || ''} • ${order.accountNumber ? '...' + order.accountNumber.slice(-4) : ''}`;
            break;
        case 'pago-movil':
            typeLabel = 'P.MÓVIL'; typeClass = 'bg-purple-50 text-purple-600';
            detailText = `${order.bank || ''} • ${order.phone || ''}`;
            break;
        case 'recarga-saldo':
            typeLabel = 'RECARGA'; typeClass = 'bg-teal-50 text-teal-600';
            detailText = `${order.phone || ''}`;
            break;
    }

    let statusDot = 'bg-gray-400';
    let statusText = order.status;
    let actionButtons = '';
    let debtorButton = '';

    const isDebtor = !!order.isDebtor;
    const debtorClass = isDebtor ? 'border-orange-400 bg-orange-50' : 'border-gray-100 bg-white';

    switch (order.status) {
        case 'Pendiente de pago':
            statusDot = 'bg-amber-500'; statusText = 'PEND';
            const clientProofBtn = order.clientProofUrl
                ? `<a href="${order.clientProofUrl}" target="_blank" class="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Ver Pago</a>`
                : '';

            // Compact Action Buttons
            actionButtons = `
              ${clientProofBtn}
              <button data-id="${orderId}" class="copy-order-btn text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200" title="Copiar">📋</button>
              <button data-id="${orderId}" class="mark-paid-btn text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 font-bold">PAGAR</button>
              <button data-id="${orderId}" class="cancel-order-btn text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">✕</button>
            `;
            break;
        case 'Pagado':
            statusDot = 'bg-green-500'; statusText = 'OK';
            if (order.proofUrl) {
                // Share button (Icon only for compactness)
                const shareIcon = isNativePlatform() ?
                    `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>` :
                    `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;

                const cssClass = "share-proof-btn text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100 flex items-center justify-center gap-1";

                if (isNativePlatform() || (navigator.share && navigator.canShare)) {
                    actionButtons = `<button data-proof-url="${order.proofUrl}" data-client-name="${order.clientName}" class="${cssClass}">${shareIcon}</button>`;
                } else {
                    const shareText = encodeURIComponent(`Comprobante ${order.clientName}`);
                    actionButtons = `<a href="https://wa.me/?text=${shareText}%20${encodeURIComponent(order.proofUrl)}" target="_blank" class="${cssClass}">${shareIcon}</a>`;
                }
            } else {
                actionButtons = ''; // No proof, no share
            }

            // Debtor Toggle (Small Icon)
            debtorButton = `
              <button data-id="${orderId}" data-is-debtor="${isDebtor}" class="debtor-toggle-btn text-xs px-2 py-1 rounded ml-1 ${isDebtor ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}" title="Deudor">
                  ⚠️
              </button>
           `;
            break;
        case 'Cancelado':
            statusDot = 'bg-red-500'; statusText = 'CANCEL';
            break;
    }

    const createdBy = order.createdByTag ? `<span class="text-[9px] bg-gray-100 text-gray-500 px-1 rounded">C:${order.createdByTag}</span>` : '';
    const paidBy = order.paidByTag ? `<span class="text-[9px] bg-gray-100 text-gray-500 px-1 rounded">P:${order.paidByTag}</span>` : '';

    return `
      <div class="p-2 border-b border-gray-100 ${debtorClass} group" data-status="${order.status}" data-order-id="${orderId}">
          <div class="flex justify-between items-start">
               <!-- Left: Client, ID, Type -->
               <div class="flex flex-col gap-0.5 max-w-[60%]">
                   <div class="flex items-center gap-1.5 flex-wrap">
                        ${order.status === 'Pendiente de pago' ? `<input type="checkbox" class="batch-pay-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-order-id="${orderId}">` : ''}
                        <span class="font-bold text-gray-800 text-sm truncate">${order.clientName}</span>
                        <span class="text-[10px] text-gray-400">#${orderIdTag}</span>
                   </div>
                   <div class="flex items-center gap-1">
                        <span class="text-[9px] font-mono px-1 py-0.5 rounded-sm ${typeClass} uppercase tracking-wide">${typeLabel}</span>
                        <span class="text-[10px] text-gray-500 truncate max-w-[120px]">${detailText}</span>
                   </div>
                   <div class="flex items-center gap-1 mt-0.5">
                       <span class="text-[10px] text-gray-400">${dateStr}</span>
                       ${createdBy}
                       ${paidBy}
                   </div>
               </div>

               <!-- Right: Amounts, Payment Status, Actions -->
               <div class="flex flex-col items-end gap-0.5">
                    <div class="font-bold text-gray-900 text-sm">${destinationAmount} <span class="text-[10px] text-gray-500 font-normal">${destinationCurrency}</span></div>
                    <div class="text-[11px] text-gray-400">${clpAmount}</div>
                    
                    <div class="flex items-center gap-1 mt-1 justify-end">
                         ${actionButtons}
                         ${debtorButton}
                         <div class="flex items-center justify-center w-5 h-5 rounded-full ${statusDot}" title="${statusText}">
                            <span class="text-white text-[8px] font-bold">✔</span>
                         </div>
                    </div>
               </div>
          </div>
      </div>
  `;
};
