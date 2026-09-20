/* ============================================================
   Healing Hands — admin panel logic (API version)
   Depends on js/site-data.js (window.HH)
   ============================================================ */
(function (window, document) {
  'use strict';

  var HH = window.HH;
  var esc = HH.esc;
  var API_BASE = window.location.origin + '/api';

  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(message) {
    var el = $('admin-toast');
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove('is-visible'); }, 2400);
  }

  /* ---------- API helpers ---------- */
  function apiGet(endpoint) {
    return fetch(API_BASE + endpoint, { headers: authHeaders() }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  function apiPost(endpoint, data) {
    return fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  function apiPut(endpoint, data) {
    return fetch(API_BASE + endpoint, {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  function apiDelete(endpoint) {
    return fetch(API_BASE + endpoint, { method: 'DELETE', headers: authHeaders() }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  /* ---------- Auth ---------- */
  function authHeaders(json) {
    var token = '';
    try { token = window.sessionStorage.getItem(HH.KEY.session) || ''; } catch (err) { /* ignore */ }
    var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function isSignedIn() {
    try { return Boolean(window.sessionStorage.getItem(HH.KEY.session)); }
    catch (err) { return false; }
  }

  function signIn(token) {
    try { window.sessionStorage.setItem(HH.KEY.session, token); } catch (err) { /* ignore */ }
    $('admin-gate').classList.add('is-hidden');
    $('admin-shell').classList.add('is-active');
    boot();
  }

  function signOut() {
    try { window.sessionStorage.removeItem(HH.KEY.session); } catch (err) { /* ignore */ }
    window.location.reload();
  }

  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = $('login-pass').value;
    apiPost('/auth/login', { passcode: value }).then(function (result) {
      $('login-error').textContent = '';
      signIn(result.token);
    }).catch(function () {
      $('login-error').textContent = 'Incorrect passcode. Please try again.';
      $('login-pass').select();
    });
  });

  $('logout-btn').addEventListener('click', signOut);

  /* ---------- Tabs ---------- */
  qa('.admin-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      qa('.admin-tab').forEach(function (t) { t.classList.remove('is-active'); });
      qa('.admin-panel').forEach(function (p) { p.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var panel = $('panel-' + tab.getAttribute('data-panel'));
      if (panel) panel.classList.add('is-active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* ============================================================
     APPOINTMENTS
     ============================================================ */

  function formatDate(value) {
    if (!value) return '—';
    var parts = String(value).split('-');
    if (parts.length !== 3) return value;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatReceived(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function todayISO() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var appointments = [];

  function filteredAppointments() {
    var term = ($('appt-search').value || '').trim().toLowerCase();
    var status = $('appt-status-filter').value;
    var range = $('appt-range-filter').value;
    var today = todayISO();

    return appointments.filter(function (item) {
      if (status && item.status !== status) return false;
      if (range === 'today' && item.date !== today) return false;
      if (range === 'upcoming' && !(item.date > today)) return false;
      if (range === 'past' && !(item.date < today)) return false;
      if (term) {
        var haystack = [item.name, item.mobile, item.email, item.complaint, item.treatment, item.city]
          .join(' ').toLowerCase();
        if (haystack.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function renderStats() {
    var today = todayISO();
    var counts = {
      total: appointments.length,
      newCount: appointments.filter(function (i) { return i.status === 'New'; }).length,
      today: appointments.filter(function (i) { return i.date === today; }).length,
      upcoming: appointments.filter(function (i) { return i.date > today && i.status !== 'Cancelled'; }).length
    };

    $('appt-stats').innerHTML =
      stat(counts.total, 'Total requests') +
      stat(counts.newCount, 'Awaiting action') +
      stat(counts.today, 'Scheduled today') +
      stat(counts.upcoming, 'Upcoming');

    $('tab-count-appts').textContent = counts.newCount;

    function stat(value, label) {
      return '<div class="admin-stat"><div class="value">' + value + '</div>' +
        '<div class="label">' + label + '</div></div>';
    }
  }

  function renderAppointments() {
    renderStats();
    var rows = filteredAppointments();
    var tbody = $('appt-tbody');
    var empty = $('appt-empty');

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      empty.textContent = appointments.length
        ? 'No requests match these filters.'
        : 'No appointment requests yet. New bookings from the website will appear here.';
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = rows.map(function (item) {
      var options = HH.STATUSES.map(function (s) {
        return '<option' + (s === item.status ? ' selected' : '') + '>' + s + '</option>';
      }).join('');

      return '<tr data-id="' + esc(item.id) + '">' +
        '<td class="cell-name">' + esc(item.name) + '<span class="cell-sub">' + esc(item.city) + '</span></td>' +
        '<td>' + esc(item.mobile) + '<span class="cell-sub">' + esc(item.email) + '</span></td>' +
        '<td>' + formatDate(item.date) + '<span class="cell-sub">' + esc(item.slot) + '</span></td>' +
        '<td>' + esc(item.treatment || item.service) + '</td>' +
        '<td>' + esc(item.complaint) + '</td>' +
        '<td><select class="status-select status-' + esc(item.status) + '" data-id="' + esc(item.id) + '">' + options + '</select></td>' +
        '<td><input type="text" class="adm-input" data-field="notes" value="' + esc(item.notes || '') + '" placeholder="Add a note…" style="min-width:140px;"></td>' +
        '<td class="cell-actions">' +
          '<button class="adm-btn adm-btn-sm" type="button" data-action="appt-detail" data-id="' + esc(item.id) + '">Details</button> ' +
          '<button class="adm-btn adm-btn-sm adm-btn-danger" type="button" data-action="appt-delete" data-id="' + esc(item.id) + '">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  // Appointment status change
  $('appt-tbody').addEventListener('change', function (event) {
    var select = event.target;
    if (!select.classList.contains('status-select')) return;
    var id = select.getAttribute('data-id');
    var newStatus = select.value;
    var item = appointments.find(function (a) { return a.id === id; });
    if (item) {
      item.status = newStatus;
      apiPut('/appointments/' + id, { status: newStatus }).then(function () {
        renderStats();
        toast('Status updated.');
      });
    }
  });

  // Notes update
  $('appt-tbody').addEventListener('input', function (event) {
    if (event.target.getAttribute('data-field') !== 'notes') return;
    var id = event.target.closest('tr').getAttribute('data-id');
    var item = appointments.find(function (a) { return a.id === id; });
    if (item) item.notes = event.target.value;
  });

  $('appt-tbody').addEventListener('blur', function (event) {
    if (event.target.getAttribute('data-field') !== 'notes') return;
    var id = event.target.closest('tr').getAttribute('data-id');
    var item = appointments.find(function (a) { return a.id === id; });
    if (item) {
      apiPut('/appointments/' + id, { notes: item.notes }).catch(function () {});
    }
  }, true);

  // Delete / Detail buttons
  $('appt-tbody').addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');

    if (action === 'appt-delete') {
      if (!window.confirm('Delete this appointment request?')) return;
      appointments = appointments.filter(function (a) { return a.id !== id; });
      apiDelete('/appointments/' + id).then(function () {
        renderAppointments();
        toast('Appointment deleted.');
      });
    }
  });

  // Search / filter
  $('appt-search').addEventListener('input', renderAppointments);
  $('appt-status-filter').addEventListener('change', renderAppointments);
  $('appt-range-filter').addEventListener('change', renderAppointments);

  // Export CSV
  $('appt-export').addEventListener('click', function () {
    var rows = filteredAppointments();
    if (!rows.length) { toast('No rows to export.'); return; }
    var headers = ['Name', 'Mobile', 'Email', 'City', 'Date', 'Slot', 'Treatment', 'Concern', 'Status', 'Notes'];
    var csv = rows.map(function (r) {
      return [r.name, r.mobile, r.email, r.city, r.date, r.slot, r.treatment || r.service, r.complaint, r.status, r.notes]
        .map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(',');
    });
    csv.unshift(headers.join(','));
    var blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'appointments-' + todayISO() + '.csv';
    a.click();
    toast('CSV downloaded.');
  });

  // Print
  $('appt-print').addEventListener('click', function () { window.print(); });

  /* ============================================================
     DOCTORS
     ============================================================ */

  var doctors = [];

  function renderDoctors() {
    var wrap = $('doctor-list');
    if (!doctors.length) {
      wrap.innerHTML = '<div class="admin-empty">No doctors yet. Use "Add doctor" to create one.</div>';
      return;
    }

    wrap.innerHTML = doctors.map(function (doc, index) {
      return '<div class="admin-card" data-index="' + index + '">' +
        '<div class="admin-card-head">' +
          '<img class="admin-thumb" src="' + esc(doc.photo) + '" alt="">' +
          '<h3>' + esc(doc.name || 'New doctor') + '</h3>' +
          '<div class="head-actions">' +
            '<label class="toggle-row"><input type="checkbox" data-field="visible"' +
              (doc.visible !== false ? ' checked' : '') + '> Show on site</label>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="up" ' +
              (index === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="down" ' +
              (index === doctors.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button class="adm-btn adm-btn-sm adm-btn-danger" type="button" data-action="delete">Delete</button>' +
          '</div>' +
        '</div>' +

        '<div class="adm-grid-2">' +
          '<div class="adm-field"><label class="adm-label">Full name</label>' +
            '<input type="text" class="adm-input" data-field="name" value="' + esc(doc.name) + '"></div>' +
          '<div class="adm-field"><label class="adm-label">Qualifications</label>' +
            '<input type="text" class="adm-input" data-field="credentials" value="' + esc(doc.credentials) + '" ' +
            'placeholder="BPT, CDNT, CMT"></div>' +
          '<div class="adm-field"><label class="adm-label">Role — homepage</label>' +
            '<input type="text" class="adm-input" data-field="role" value="' + esc(doc.role) + '" ' +
            'placeholder="Physiotherapist"></div>' +
          '<div class="adm-field"><label class="adm-label">Role — About page</label>' +
            '<input type="text" class="adm-input" data-field="roleAbout" value="' + esc(doc.roleAbout || '') + '" ' +
            'placeholder="Physiotherapist · Evenings"></div>' +
        '</div>' +

        '<div class="adm-field"><label class="adm-label">Short bio — homepage</label>' +
          '<textarea class="adm-textarea" data-field="bio">' + esc(doc.bio) + '</textarea></div>' +
        '<div class="adm-field"><label class="adm-label">Longer bio — About page</label>' +
          '<textarea class="adm-textarea" data-field="bioAbout">' + esc(doc.bioAbout || '') + '</textarea></div>' +

        photoField(doc, 'doctor') +
      '</div>';
    }).join('');
  }

  function cardIndex(target) {
    var card = target.closest('.admin-card');
    return card ? Number(card.getAttribute('data-index')) : -1;
  }

  function wireEditor(listId, getList, setList, rerender) {
    var wrap = $(listId);

    wrap.addEventListener('input', function (event) {
      var field = event.target.getAttribute('data-field');
      var index = cardIndex(event.target);
      if (!field || index < 0) return;
      getList()[index][field] = event.target.value;
    });

    wrap.addEventListener('change', function (event) {
      var field = event.target.getAttribute('data-field');
      var index = cardIndex(event.target);
      if (index < 0) return;

      if (field === 'visible') {
        getList()[index].visible = event.target.checked;
        return;
      }
      if (event.target.type === 'file') {
        var file = event.target.files && event.target.files[0];
        uploadImage(file).then(function (url) {
          getList()[index].photo = url;
          rerender();
          toast('Photo uploaded — remember to save.');
        }).catch(function () { toast('Photo could not be uploaded.'); });
        event.target.value = '';
      }
      if (field === 'icon') {
        getList()[index].icon = event.target.value;
      }
    });

    wrap.addEventListener('click', function (event) {
      var action = event.target.getAttribute('data-action');
      var index = cardIndex(event.target);
      if (index < 0 || !action) return;

      var list = getList();
      if (action === 'upload') {
        var fileInput = event.target.closest('.admin-photo-row').querySelector('input[type="file"]');
        if (fileInput) fileInput.click();
      } else if (action === 'delete') {
        list.splice(index, 1);
        rerender();
      } else if (action === 'up' && index > 0) {
        var temp = list[index];
        list[index] = list[index - 1];
        list[index - 1] = temp;
        rerender();
      } else if (action === 'down' && index < list.length - 1) {
        var temp2 = list[index];
        list[index] = list[index + 1];
        list[index + 1] = temp2;
        rerender();
      }
    });
  }

  function uploadImage(file) {
    if (!file) return Promise.reject(new Error('No file selected'));
    var data = new FormData();
    data.append('photo', file);
    return fetch(API_BASE + '/upload', {
      method: 'POST',
      headers: authHeaders(false),
      body: data
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (body) { throw new Error(body.error || 'Upload failed'); });
      return res.json();
    }).then(function (result) { return result.url; });
  }

  function photoField(item, idPrefix) {
    return '<div class="admin-photo-row">' +
      '<img class="admin-thumb" src="' + esc(item.photo) + '" alt="">' +
      '<div class="photo-fields">' +
        '<label class="adm-label">Photo</label>' +
        '<input type="text" class="adm-input" data-field="photo" value="' + esc(item.photo) + '" ' +
          'placeholder="images/doctor-name.jpeg">' +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="adm-btn adm-btn-sm" type="button" data-action="upload">Upload photo</button>' +
          '<input type="file" accept="image/*" hidden data-role="' + idPrefix + '-file">' +
        '</div>' +
      '</div></div>';
  }

  wireEditor('doctor-list', function () { return doctors; },
    function (l) { doctors = l; }, renderDoctors);

  $('doctor-add').addEventListener('click', function () {
    doctors.push({
      id: HH.uid('doc'), name: '', role: 'Physiotherapist', roleAbout: '',
      credentials: '', bio: '', bioAbout: '', photo: 'images/doctor-prakash.jpeg',
      visible: true
    });
    renderDoctors();
    var last = $('doctor-list').lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('doctor-save').addEventListener('click', function () {
    var invalid = doctors.some(function (d) { return !String(d.name || '').trim(); });
    if (invalid) { toast('Every doctor needs a name.'); return; }
    HH.saveDoctors(doctors).then(function () {
      renderDoctors(); toast('Doctor details saved to server.');
    }).catch(function () { toast('Doctor details could not be saved.'); });
  });

  /* ============================================================
     HOMEPAGE SPECIALTIES
     ============================================================ */

  var specialties = [];

  function renderSpecialties() {
    var wrap = $('specialty-list');
    if (!specialties.length) {
      wrap.innerHTML = '<div class="admin-empty">No cards yet. Use "Add card" to create one.</div>';
      return;
    }

    wrap.innerHTML = specialties.map(function (item, index) {
      return '<div class="admin-card" data-index="' + index + '">' +
        '<div class="admin-card-head">' +
          '<img class="admin-thumb" src="' + esc(item.photo) + '" alt="">' +
          '<h3>' + esc(item.title || 'New card') + '</h3>' +
          '<div class="head-actions">' +
            '<label class="toggle-row"><input type="checkbox" data-field="visible"' +
              (item.visible !== false ? ' checked' : '') + '> Show</label>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="up" ' +
              (index === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="down" ' +
              (index === specialties.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button class="adm-btn adm-btn-sm adm-btn-danger" type="button" data-action="delete">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-grid-2">' +
          '<div class="adm-field"><label class="adm-label">Card title</label>' +
            '<input type="text" class="adm-input" data-field="title" value="' + esc(item.title) + '"></div>' +
          '<div class="adm-field"><label class="adm-label">Alt text</label>' +
            '<input type="text" class="adm-input" data-field="alt" value="' + esc(item.alt || '') + '" ' +
            'placeholder="Describe the image"></div>' +
        '</div>' +
        photoField(item, 'specialty') +
      '</div>';
    }).join('');
  }

  wireEditor('specialty-list', function () { return specialties; },
    function (l) { specialties = l; }, renderSpecialties);

  $('specialty-add').addEventListener('click', function () {
    specialties.push({
      id: HH.uid('sp'), title: 'New specialty card', photo: 'images/gym-room.jpeg',
      alt: 'Physiotherapy session', visible: true
    });
    renderSpecialties();
  });

  $('specialty-save').addEventListener('click', function () {
    var saveCards = HH.saveSpecialties(specialties);
    // Also save section copy text
    var copy = HH.getSectionCopy();
    copy.specialties.tag = $('sp-tag').value.trim();
    copy.specialties.heading = $('sp-heading').value.trim();
    copy.specialties.intro = $('sp-intro').value.trim();
    Promise.all([saveCards, HH.saveSectionCopy(copy)]).then(function () {
      renderSpecialties(); toast('Homepage section saved to server.');
    }).catch(function () { toast('Homepage section could not be saved.'); });
  });

  // Section copy inputs — live update cache
  $('sp-tag').addEventListener('input', function () {
    var copy = HH.getSectionCopy();
    copy.specialties.tag = this.value;
  });
  $('sp-heading').addEventListener('input', function () {
    var copy = HH.getSectionCopy();
    copy.specialties.heading = this.value;
  });
  $('sp-intro').addEventListener('input', function () {
    var copy = HH.getSectionCopy();
    copy.specialties.intro = this.value;
  });

  /* ============================================================
     SERVICES
     ============================================================ */

  var services = [];

  function renderServices() {
    var wrap = $('service-list');
    if (!services.length) {
      wrap.innerHTML = '<div class="admin-empty">No services yet. Use "Add service" to create one.</div>';
      return;
    }

    wrap.innerHTML = services.map(function (item, index) {
      return '<div class="admin-card" data-index="' + index + '">' +
        '<div class="admin-card-head">' +
          '<h3>' + esc(item.title || 'New service') + '</h3>' +
          '<div class="head-actions">' +
            '<label class="toggle-row"><input type="checkbox" data-field="visible"' +
              (item.visible !== false ? ' checked' : '') + '> Show</label>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="up" ' +
              (index === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button class="adm-btn adm-btn-sm" type="button" data-action="down" ' +
              (index === services.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button class="adm-btn adm-btn-sm adm-btn-danger" type="button" data-action="delete">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="adm-grid-2">' +
          '<div class="adm-field"><label class="adm-label">Service title</label>' +
            '<input type="text" class="adm-input" data-field="title" value="' + esc(item.title) + '"></div>' +
          '<div class="adm-field"><label class="adm-label">Icon</label>' +
            '<select class="adm-select" data-field="icon">' +
              Object.keys(HH.ICONS).map(function (key) {
                return '<option value="' + key + '"' + (item.icon === key ? ' selected' : '') + '>' + key + '</option>';
              }).join('') +
            '</select></div>' +
        '</div>' +
        '<div class="adm-field"><label class="adm-label">Description</label>' +
          '<textarea class="adm-textarea" data-field="description">' + esc(item.description) + '</textarea></div>' +
      '</div>';
    }).join('');
  }

  wireEditor('service-list', function () { return services; },
    function (l) { services = l; }, renderServices);

  $('service-add').addEventListener('click', function () {
    services.push({
      id: HH.uid('sv'), title: 'New service', icon: 'plus',
      visible: true, description: ''
    });
    renderServices();
  });

  $('service-save').addEventListener('click', function () {
    var saveCards = HH.saveServices(services);
    // Also save section copy text
    var copy = HH.getSectionCopy();
    copy.services.tag = $('sv-tag').value.trim();
    copy.services.heading = $('sv-heading').value.trim();
    copy.services.intro = $('sv-intro').value.trim();
    Promise.all([saveCards, HH.saveSectionCopy(copy)]).then(function () {
      renderServices(); toast('Services saved to server.');
    }).catch(function () { toast('Services could not be saved.'); });
  });

  /* ============================================================
     CLINIC INFO
     ============================================================ */

  function loadClinicInfo() {
    var info = HH.getClinicInfo();
    $('ci-phone').value = info.phone || '';
    $('ci-whatsapp').value = info.whatsapp || '';
    $('ci-address-line1').value = info.addressLine1 || '';
    $('ci-address-city').value = info.addressCity || '';
    $('ci-hours-days').value = info.hoursDays || '';
    $('ci-hours-open').value = info.hoursOpen || '';
    $('ci-hours-close').value = info.hoursClose || '';
  }

  $('clinicinfo-save').addEventListener('click', function () {
    var info = {
      phone: $('ci-phone').value.trim(),
      whatsapp: $('ci-whatsapp').value.trim(),
      addressLine1: $('ci-address-line1').value.trim(),
      addressCity: $('ci-address-city').value.trim(),
      address: ($('ci-address-line1').value.trim() + ', ' + $('ci-address-city').value.trim()).replace(/, ,/g, ','),
      hoursDays: $('ci-hours-days').value.trim(),
      hoursOpen: $('ci-hours-open').value.trim(),
      hoursClose: $('ci-hours-close').value.trim(),
      hoursFull: ($('ci-hours-days').value.trim() || 'Mon–Sat') + ', ' + ($('ci-hours-open').value.trim() || '10:00 AM') + ' – ' + ($('ci-hours-close').value.trim() || '8:30 PM'),
      hoursShort: ($('ci-hours-days').value.trim() || 'Mon–Sat') + ': ' + ($('ci-hours-open').value.trim() || '10:00 AM') + ' – ' + ($('ci-hours-close').value.trim() || '8:30 PM')
    };
    HH.saveClinicInfo(info).then(function () { toast('Clinic info saved to server.'); })
      .catch(function () { toast('Clinic info could not be saved.'); });
  });

  /* ============================================================
     SETTINGS
     ============================================================ */

  $('set-pass-save').addEventListener('click', function () {
    var newPass = $('set-pass-new').value;
    var confirm = $('set-pass-confirm').value;
    var current = $('set-pass-current').value;
    var errEl = $('set-pass-error');

    if (!current) { errEl.textContent = 'Please enter the current passcode.'; return; }
    if (newPass.length < 8) { errEl.textContent = 'Use at least 8 characters.'; return; }
    if (newPass !== confirm) { errEl.textContent = 'The two passcodes do not match.'; return; }

    errEl.textContent = '';
    apiPost('/auth/change-passcode', { current: current, newPass: newPass }).then(function () {
      $('set-pass-current').value = '';
      $('set-pass-new').value = '';
      $('set-pass-confirm').value = '';
      toast('Passcode updated.');
    }).catch(function () {
      errEl.textContent = 'Could not update passcode.';
    });
  });

  // Backup export
  $('backup-export').addEventListener('click', function () {
    HH.exportAll().then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'healing-hands-backup-' + todayISO() + '.json';
      a.click();
      toast('Backup downloaded.');
    });
  });

  // Backup import
  $('backup-import-btn').addEventListener('click', function () {
    $('backup-import').click();
  });

  $('backup-import').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        HH.importAll(JSON.parse(reader.result));
        loadContent();
        renderAppointments();
        toast('Backup restored from server.');
      } catch (err) {
        toast('That file could not be read as a backup.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  $('reset-content').addEventListener('click', function () {
    if (!window.confirm('Reset doctors, homepage cards and services to the original content?')) return;
    HH.resetContent();
    loadContent();
    toast('Content reset to defaults on server.');
  });

  $('clear-appts').addEventListener('click', function () {
    if (!window.confirm('Delete every appointment request? This cannot be undone.')) return;
    apiDelete('/appointments').then(function () {
      appointments = [];
      renderAppointments();
      toast('All appointments deleted.');
    });
  });

  /* ============================================================
     BOOT
     ============================================================ */

  function loadContent() {
    doctors = HH.getDoctors();
    specialties = HH.getSpecialties();
    services = HH.getServices();

    var copy = HH.getSectionCopy();
    $('sp-tag').value = copy.specialties.tag;
    $('sp-heading').value = copy.specialties.heading;
    $('sp-intro').value = copy.specialties.intro;
    $('sv-tag').value = copy.services.tag;
    $('sv-heading').value = copy.services.heading;
    $('sv-intro').value = copy.services.intro;

    loadClinicInfo();

    renderDoctors();
    renderSpecialties();
    renderServices();
  }

  function boot() {
    // Fetch all data from API first, then render.
    // Always renders even if API is down (uses defaults).
    var fetches = [
      apiGet('/doctors').then(function (d) { cachePut('doctors', d); }).catch(function (e) { console.warn('Doctors fetch failed:', e.message); }),
      apiGet('/specialties').then(function (d) { cachePut('specialties', d); }).catch(function (e) { console.warn('Specialties fetch failed:', e.message); }),
      apiGet('/services').then(function (d) { cachePut('services', d); }).catch(function (e) { console.warn('Services fetch failed:', e.message); }),
      apiGet('/section-copy').then(function (d) { cachePut('sectionCopy', d); }).catch(function (e) { console.warn('Section copy fetch failed:', e.message); }),
      apiGet('/clinic-info').then(function (d) { cachePut('clinicInfo', d); }).catch(function (e) { console.warn('Clinic info fetch failed:', e.message); }),
      apiGet('/appointments').then(function (d) { cachePut('appointments', d); }).catch(function (e) { console.warn('Appointments fetch failed:', e.message); })
    ];

    // Always render — even if API calls fail, use HH defaults
    Promise.all(fetches).then(function () {
      console.log('Admin boot: data loaded, rendering panels...');
      loadContent();
      renderAppointments();
      console.log('Admin boot: panels rendered.');
    });
  }

  // Direct cache helpers for admin panel
  function cachePut(key, value) {
    HH.cache[key] = value;
  }

  if (isSignedIn()) {
    apiGet('/auth/check').then(function () {
      $('admin-gate').classList.add('is-hidden');
      $('admin-shell').classList.add('is-active');
      boot();
    }).catch(function () {
      try { window.sessionStorage.removeItem(HH.KEY.session); } catch (err) { /* ignore */ }
      $('login-pass').focus();
    });
  } else {
    $('login-pass').focus();
  }

})(window, document);
