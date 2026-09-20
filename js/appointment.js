document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('appointment-form');
  if (!form) return;

  const dateInput = document.getElementById('appt-date');
  const success = document.getElementById('appt-success');

  // Default the date to today and block past dates.
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  if (dateInput) {
    dateInput.min = iso;
    if (!dateInput.value) dateInput.value = iso;
  }

  const setError = (field, message) => {
    const holder = form.querySelector('[data-error-for="' + field.id + '"]');
    if (holder) holder.textContent = message || '';
    field.classList.toggle('has-error', Boolean(message));
  };

  const validateField = (field) => {
    const value = (field.value || '').trim();

    if (field.type === 'checkbox') {
      if (!field.checked) { setError(field, 'Please accept the privacy policy.'); return false; }
      setError(field, ''); return true;
    }
    if (!value) { setError(field, 'This field is required.'); return false; }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError(field, 'Enter a valid email address.'); return false;
    }
    if (field.type === 'tel' && !/^[+]?[0-9\s]{10,15}$/.test(value)) {
      setError(field, 'Enter a valid mobile number.'); return false;
    }
    setError(field, '');
    return true;
  };

  form.querySelectorAll('input, select').forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('change', () => validateField(field));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = Array.from(form.querySelectorAll('input[required], select[required]'));
    let firstInvalid = null;

    fields.forEach((field) => {
      if (!validateField(field) && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) {
      if (success) success.hidden = true;
      firstInvalid.focus();
      return;
    }

    const get = (id) => (document.getElementById(id) || {}).value || '';

    // Record the request so it shows up in the admin panel.
    const appointment = {
        name: get('appt-name'),
        mobile: get('appt-mobile'),
        email: get('appt-email'),
        city: get('appt-city'),
        treatment: get('appt-treatment'),
        service: get('appt-service'),
        complaint: get('appt-complaint'),
        date: get('appt-date'),
        slot: get('appt-slot')
      };

    const message =
      'New appointment request%0A' +
      'Name: ' + get('appt-name') + '%0A' +
      'Mobile: ' + get('appt-mobile') + '%0A' +
      'Email: ' + get('appt-email') + '%0A' +
      'City: ' + get('appt-city') + '%0A' +
      'Treatment: ' + get('appt-treatment') + '%0A' +
      'Service: ' + get('appt-service') + '%0A' +
      'Concern: ' + get('appt-complaint') + '%0A' +
      'Date: ' + get('appt-date') + ' (' + get('appt-slot') + ')';

    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (!window.HH || typeof window.HH.addAppointment !== 'function') throw new Error('Booking service unavailable');
      await window.HH.addAppointment(appointment);
      if (success) {
        success.textContent = 'Your appointment request was saved. Continue in WhatsApp to contact the clinic.';
        success.hidden = false;
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      form.reset();
      if (dateInput) dateInput.value = iso;

      const clinicInfo = typeof window.HH.getClinicInfo === 'function' ? window.HH.getClinicInfo() : null;
      const whatsapp = clinicInfo && clinicInfo.whatsapp ? clinicInfo.whatsapp.replace(/\D/g, '') : '910000000000';
      window.open('https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(decodeURIComponent(message)), '_blank', 'noopener');
    } catch (error) {
      if (success) {
        success.textContent = 'We could not save your request. Please check your connection and try again.';
        success.hidden = false;
        success.focus();
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
