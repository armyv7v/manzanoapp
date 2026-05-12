/**
 * Displays a message in a specific element, with optional success/error styling.
 * @param {string} elementId The ID of the message element.
 * @param {string} message The text to display.
 * @param {boolean} isSuccess True for green text, false for red text.
 */
export function showMessage(elementId, message, isSuccess) {
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
export function showCustomAlert(message) {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const closeBtn = document.getElementById('custom-alert-btn');

    if (!modal || !messageEl || !closeBtn) {
        // Fallback if modal elements aren't found (e.g. before DOM load or if structure changed)
        alert(message);
        return;
    }

    messageEl.innerHTML = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    closeBtn.onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
}

/**
 * Shows a toast notification at the bottom-right of the screen.
 * @param {string} message The message to display in the toast.
 */
export function showToastNotification(message) {
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

/**
 * Configura validación automática para campos de email
 * - Convierte automáticamente a minúsculas
 * - Valida formato con @ obligatorio
 * @param {HTMLInputElement} emailInput - El elemento input de email
 */
export function setupEmailValidation(emailInput) {
    if (!emailInput) return;

    // Asegurar que el input sea de tipo email
    emailInput.type = 'email';
    emailInput.required = true;

    // Convertir a minúsculas y limpiar errores mientras se escribe
    emailInput.addEventListener('input', function () {
        this.value = this.value.toLowerCase().trim();
        this.setCustomValidity('');
    });

    // Validación adicional al perder el foco
    emailInput.addEventListener('blur', function () {
        const value = this.value.trim();
        if (value && !value.includes('@')) {
            this.setCustomValidity('El correo debe contener el símbolo @');
            this.reportValidity();
        } else if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            this.setCustomValidity('Por favor ingresa un correo electrónico válido');
            this.reportValidity();
        } else {
            this.setCustomValidity('');
        }
    });

    // Validación al enviar el formulario
    const form = emailInput.closest('form');
    if (form) {
        form.addEventListener('submit', function (e) {
            const value = emailInput.value.trim();
            if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                emailInput.setCustomValidity('Por favor ingresa un correo electrónico válido');
                emailInput.reportValidity();
                e.preventDefault();
            }
        }, { capture: true });
    }
}
