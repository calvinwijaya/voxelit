// Voxelit dialogs: SweetAlert2 with the site's dark style. Falls back to the browser's confirm()
// if the library could not load (offline), so deleting never silently fails.
(function () {
    const base = {
        background: '#18181b', color: '#e4e4e7', reverseButtons: true, focusCancel: true,
        buttonsStyling: false,
        customClass: { popup: 'vx-swal', confirmButton: 'vx-swal-ok', cancelButton: 'vx-swal-cancel', input: 'vx-swal-input' },
        showClass: { popup: 'swal2-show' }, hideClass: { popup: 'swal2-hide' },
    };
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /** Promise<boolean>. danger: red confirm button */
    window.vxConfirm = async function ({ title, text = '', confirm = 'OK', cancel = 'Cancel', danger = false, imageUrl = null }) {
        if (!window.Swal) return window.confirm(`${title}${text ? '\n\n' + text : ''}`);
        if (document.pointerLockElement) document.exitPointerLock();
        const r = await Swal.fire({
            ...base, title: esc(title), html: text ? esc(text) : undefined, showCancelButton: true,
            confirmButtonText: esc(confirm), cancelButtonText: esc(cancel),
            icon: imageUrl ? undefined : danger ? 'warning' : 'question', iconColor: danger ? '#f87171' : '#fbbf24',
            imageUrl: imageUrl || undefined, imageWidth: imageUrl ? 120 : undefined, imageHeight: imageUrl ? 120 : undefined,
            customClass: { ...base.customClass, confirmButton: danger ? 'vx-swal-ok vx-swal-danger' : 'vx-swal-ok' },
        });
        return !!r.isConfirmed;
    };

    /** Promise<string|null> — a one-line text prompt */
    window.vxPrompt = async function ({ title, value = '', confirm = 'Save', placeholder = '' }) {
        if (!window.Swal) { const v = window.prompt(title, value); return v == null ? null : v.trim(); }
        if (document.pointerLockElement) document.exitPointerLock();
        const r = await Swal.fire({
            ...base, title: esc(title), input: 'text', inputValue: value, inputPlaceholder: placeholder,
            inputAttributes: { maxlength: 60 }, showCancelButton: true, confirmButtonText: esc(confirm), focusCancel: false,
            inputValidator: v => (!v || !v.trim()) ? 'Please type a name' : undefined,
        });
        return r.isConfirmed ? r.value.trim() : null;
    };

    /** small corner notification */
    window.vxToast = function (text, icon = 'success') {
        if (!window.Swal) return;
        const { focusCancel, reverseButtons, ...toastBase } = base;          // not valid for toasts
        Swal.fire({ ...toastBase, toast: true, position: 'bottom', timer: 2200, showConfirmButton: false, icon, title: esc(text),
                    customClass: { popup: 'vx-swal vx-swal-toast' } });
    };
})();
