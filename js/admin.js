/* ============================================================
   Healing Hands — Site Editor (admin panel)
   ------------------------------------------------------------
   Edits every component of the public website:
     • every text, image, background image and button link,
       page by page (driven by data/content-schema.json)
     • doctors, specialties, treatments & pricing
     • section headings / intros
     • clinic contact details
     • appointments
     • passcode, backup, restore and reset
   ============================================================ */
(function (window, document) {
  'use strict';

  var API = window.location.origin + '/api';
  var SESSION_KEY = 'hh_admin_session';
  var STATUSES = ['New', 'Confirmed', 'Completed', 'Cancelled'];
  var ICON_CHOICES = ['plus', 'activity', 'pulse', 'clock', 'home', 'tools'];

  var state = {
    token: '',
    schema: [],
    content: {},
    doctors: [],
    specialties: [],
    services: [],
    sectionCopy: {},
    clinicInfo: {},
    appointments: [],
    conditions: [],
    therapies: { groups: [] },
    directory: { symptoms: [], therapies: [], services: [] },
    blogposts: [],
    bookingoptions: { cities: [], treatments: [], services: [], slots: [] },
    view: null,
    dirty: false,
    search: ''
  };

  /* ---------------- helpers ---------------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  var toastTimer;
  function toast(message, isError) {
    var el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function headers(json) {
    var h = state.token ? { Authorization: 'Bearer ' + state.token } : {};
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /* The backend is a single Function at /api, so the logical route travels
     in the X-HH-Route header instead of the URL. A header is used because
     the image upload is multipart and has no body to carry metadata. */
  function routeHeaders(endpoint, json) {
    var h = headers(json);
    h['X-HH-Route'] = endpoint;
    return h;
  }

  function apiDownMessage() {
    return 'Cannot reach the site editor server. In the project folder run "npm start" ' +
      'and open http://localhost:3000/admin.html (do not open admin.html as a file).';
  }

  function request(method, endpoint, body) {
    if (window.location.protocol === 'file:') {
      return Promise.reject(new Error(apiDownMessage()));
    }
    return fetch(API, {
      method: method,
      headers: routeHeaders(endpoint, body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (err) { data = {}; }
        if (res.ok) return data;
        if (res.status === 401 && endpoint !== '/auth/login') {
          signOut();
          throw new Error('Session expired — please sign in again.');
        }
        if (data.error) throw new Error(data.error);
        if (res.status === 404 || res.status === 405 || res.status === 501) throw new Error(apiDownMessage());
        if (res.status >= 500) throw new Error('Server error (HTTP ' + res.status + '). Check the terminal running "npm start".');
        throw new Error('Request failed (HTTP ' + res.status + ').');
      });
    }, function () {
      throw new Error(apiDownMessage());
    });
  }

  var get = function (e) { return request('GET', e); };
  var post = function (e, b) { return request('POST', e, b === undefined ? {} : b); };

  /* ---------------- auth ---------------- */
  function signOut() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
    state.token = '';
    $('#admin-app').hidden = true;
    $('#login-screen').hidden = false;
  }

  function startSession(token) {
    state.token = token;
    try { sessionStorage.setItem(SESSION_KEY, token); } catch (err) { /* ignore */ }
    $('#login-screen').hidden = true;
    $('#admin-app').hidden = false;
    loadAll();
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var error = $('#login-error');
    error.hidden = true;
    post('/auth/login', { passcode: $('#passcode').value })
      .then(function (data) { $('#passcode').value = ''; startSession(data.token); })
      .catch(function (err) { error.textContent = err.message; error.hidden = false; });
  });

  $('#logout-btn').addEventListener('click', function () {
    if (state.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    signOut();
  });

  /* ---------------- data ---------------- */
  function loadAll() {
    Promise.all([
      get('/content-schema').catch(function () { return []; }),
      get('/content').catch(function () { return {}; }),
      get('/doctors').catch(function () { return []; }),
      get('/specialties').catch(function () { return []; }),
      get('/services').catch(function () { return []; }),
      get('/section-copy').catch(function () { return {}; }),
      get('/clinic-info').catch(function () { return {}; }),
      get('/appointments').catch(function () { return []; }),
      get('/conditions').catch(function () { return []; }),
      get('/therapies').catch(function () { return { groups: [] }; }),
      get('/directory').catch(function () { return { symptoms: [], therapies: [], services: [] }; }),
      get('/blogposts').catch(function () { return []; }),
      get('/bookingoptions').catch(function () { return { cities: [], treatments: [], services: [], slots: [] }; })
    ]).then(function (r) {
      state.schema = r[0] || [];
      state.content = r[1] || {};
      state.doctors = r[2] || [];
      state.specialties = r[3] || [];
      state.services = r[4] || [];
      state.sectionCopy = r[5] || {};
      state.clinicInfo = r[6] || {};
      state.appointments = r[7] || [];
      state.conditions = r[8] || [];
      state.therapies = r[9] || { groups: [] };
      state.directory = r[10] || { symptoms: [], therapies: [], services: [] };
      state.blogposts = r[11] || [];
      state.bookingoptions = r[12] || { cities: [], treatments: [], services: [], slots: [] };
      buildNav();
      setView(state.view || 'appointments');
    }).catch(function (err) { toast(err.message, true); });
  }

  /* ---------------- navigation ---------------- */
  var SECTIONS = [
    { id: 'appointments', label: 'Appointments', sub: 'Booking requests sent from the website.' },
    { id: 'doctors', label: 'Doctors', sub: 'Photos, names and descriptions of your physiotherapists.' },
    { id: 'specialties', label: 'Specialties carousel', sub: 'The scrolling cards of physiotherapy specialties.' },
    { id: 'services', label: 'Treatments & pricing', sub: 'Treatment cards and their prices.' },
    { id: 'therapies', label: 'Therapies', sub: 'Basic and Advanced therapy lists shown on the Services page.' },
    { id: 'conditions', label: 'Conditions we treat', sub: 'The condition images, names and symptoms.' },
    { id: 'blogposts', label: 'Blog posts', sub: 'Add, edit, reorder or hide articles.' },
    { id: 'directory', label: 'What We Treat lists', sub: 'Symptoms, therapies and services listed on the What We Treat page.' },
    { id: 'bookingoptions', label: 'Booking form options', sub: 'Cities, treatment types, service types and time slots.' },
    { id: 'clinic', label: 'Contact & hours', sub: 'Phone, WhatsApp, address and opening hours used across the site.' },
    { id: 'settings', label: 'Settings & backup', sub: 'Passcode, backups and resetting content.' }
  ];

  function buildNav() {
    var nav = $('#sidebar-nav');
    var html = '<div class="nav-group-label">Bookings</div>' +
      '<button class="nav-item" data-view="appointments">Appointments</button>';
    html += '<div class="nav-group-label">Website pages</div>';
    state.schema.forEach(function (page) {
      html += '<button class="nav-item" data-view="page:' + esc(page.page) + '">' + esc(page.label) + '</button>';
    });
    html += '<div class="nav-group-label">Content blocks</div>';
    SECTIONS.forEach(function (section) {
      if (section.id === 'appointments') return;
      html += '<button class="nav-item" data-view="' + section.id + '">' + esc(section.label) + '</button>';
    });
    nav.innerHTML = html;
    $$('.nav-item', nav).forEach(function (btn) {
      btn.addEventListener('click', function () {
        setView(btn.getAttribute('data-view'));
        $('#admin-sidebar').classList.remove('is-open');
      });
    });
  }

  function setView(view) {
    state.view = view;
    state.search = '';
    $('#field-search').value = '';
    $$('.nav-item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-view') === view);
    });
    render();
  }

  /* ---------------- render ---------------- */
  function render() {
    var view = state.view;
    var isPage = view && view.indexOf('page:') === 0;
    $('#field-search').hidden = !isPage;
    $('#preview-toggle').hidden = !isPage;

    if (isPage) return renderPage(view.slice(5));

    var section = SECTIONS.filter(function (s) { return s.id === view; })[0] || SECTIONS[0];
    $('#view-title').textContent = section.label;
    $('#view-sub').textContent = section.sub;

    if (view === 'doctors') return renderDoctors();
    if (view === 'specialties') return renderSpecialties();
    if (view === 'services') return renderServices();
    if (RESOURCES[view]) return renderResource(view);
    if (view === 'clinic') return renderClinic();
    if (view === 'appointments') return renderAppointments();
    return renderSettings();
  }

  /* ----- page editor (every component) ----- */
  function renderPage(slug) {
    var page = state.schema.filter(function (p) { return p.page === slug; })[0];
    if (!page) { $('#admin-content').innerHTML = '<p class="empty">Page not found.</p>'; return; }

    $('#view-title').textContent = page.label + ' page';
    $('#view-sub').textContent = 'Edit every text, image, background and button on ' + page.file + '.';
    setPreview(page.file);

    var term = state.search.trim().toLowerCase();
    var html = '';
    var shown = 0;

    page.groups.forEach(function (group, gi) {
      var fields = group.fields.filter(function (f) {
        if (!term) return true;
        return (f.label || '').toLowerCase().indexOf(term) > -1 ||
          String(state.content[f.key] || '').toLowerCase().indexOf(term) > -1;
      });
      if (!fields.length) return;
      shown += fields.length;
      var open = term || gi === 0;
      html += '<section class="card' + (open ? ' is-open' : '') + '" data-card>' +
        '<div class="card-head" data-card-toggle>' +
          '<h2>' + esc(group.label) + '</h2>' +
          '<span class="count">' + fields.length + ' item' + (fields.length === 1 ? '' : 's') + ' <span class="chev">▾</span></span>' +
        '</div><div class="card-body">' +
          fields.map(fieldHtml).join('') +
        '</div></section>';
    });

    if (!shown) html = '<p class="empty">Nothing matches “' + esc(state.search) + '”.</p>';
    $('#admin-content').innerHTML = html;
    bindCards();
    bindContentFields();
  }

  function fieldHtml(field) {
    var value = state.content[field.key] !== undefined ? state.content[field.key] : '';
    if (field.type === 'image') {
      return '<div class="field">' +
        '<label>' + esc(field.label) + '</label>' +
        '<div class="image-field">' +
          '<img class="thumb" src="' + esc(value) + '" alt="" data-thumb-for="' + esc(field.key) + '" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="image-controls">' +
            '<input type="text" data-content-key="' + esc(field.key) + '" value="' + esc(value) + '">' +
            '<div class="image-buttons">' +
              '<button type="button" class="btn btn-ghost btn-sm" data-pick-image="' + esc(field.key) + '">Choose / upload image</button>' +
            '</div>' +
          '</div>' +
        '</div></div>';
    }
    if (field.type === 'textarea') {
      return '<div class="field"><label>' + esc(field.label) + '</label>' +
        '<textarea data-content-key="' + esc(field.key) + '">' + esc(value) + '</textarea></div>';
    }
    return '<div class="field"><label>' + esc(field.label) + '</label>' +
      '<input type="text" data-content-key="' + esc(field.key) + '" value="' + esc(value) + '"></div>';
  }

  function bindContentFields() {
    $$('[data-content-key]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.getAttribute('data-content-key');
        state.content[key] = input.value;
        var thumb = $('[data-thumb-for="' + key.replace(/"/g, '') + '"]');
        if (thumb) { thumb.src = input.value; thumb.style.visibility = 'visible'; }
        markDirty();
      });
    });
    $$('[data-pick-image]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openImagePicker(function (url) {
          var key = btn.getAttribute('data-pick-image');
          state.content[key] = url;
          var input = $('[data-content-key="' + key + '"]');
          if (input) input.value = url;
          var thumb = $('[data-thumb-for="' + key + '"]');
          if (thumb) { thumb.src = url; thumb.style.visibility = 'visible'; }
          markDirty();
        });
      });
    });
  }

  function bindCards() {
    $$('[data-card-toggle]').forEach(function (head) {
      head.addEventListener('click', function () { head.parentNode.classList.toggle('is-open'); });
    });
  }

  /* ----- doctors ----- */
  function renderDoctors() {
    var copy = state.sectionCopy.doctors || {};
    var html = '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Section heading on the website</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
      textField('Small label above the heading', 'copy:doctors.tag', copy.tag) +
      textField('Heading', 'copy:doctors.heading', copy.heading) +
      areaField('Intro paragraph', 'copy:doctors.intro', copy.intro) +
      '</div></section>';

    html += '<div class="toolbar"><button class="btn btn-primary" id="add-doctor">+ Add a doctor</button></div>';
    state.doctors.forEach(function (doc, i) {
      html += '<div class="row-card">' +
        '<div class="row-head"><strong>' + esc(doc.name || 'Doctor') + '</strong>' +
          '<div class="row-actions">' +
            '<label class="switch"><input type="checkbox" data-list="doctors" data-index="' + i + '" data-key="visible"' + (doc.visible !== false ? ' checked' : '') + '> Show on site</label>' +
            '<button class="btn btn-ghost btn-sm" data-move="doctors" data-index="' + i + '" data-dir="-1">↑</button>' +
            '<button class="btn btn-ghost btn-sm" data-move="doctors" data-index="' + i + '" data-dir="1">↓</button>' +
            '<button class="btn btn-danger btn-sm" data-remove="doctors" data-index="' + i + '">Delete</button>' +
          '</div></div>' +
        imageField('Photo', 'doctors', i, 'photo', doc.photo) +
        '<div class="grid-2">' +
          listText('Name', 'doctors', i, 'name', doc.name) +
          listText('Credentials', 'doctors', i, 'credentials', doc.credentials) +
          listText('Role (home page)', 'doctors', i, 'role', doc.role) +
          listText('Role (about page)', 'doctors', i, 'roleAbout', doc.roleAbout) +
        '</div>' +
        listArea('Short bio (home page)', 'doctors', i, 'bio', doc.bio) +
        listArea('Longer bio (about page)', 'doctors', i, 'bioAbout', doc.bioAbout) +
        '</div>';
    });

    $('#admin-content').innerHTML = html;
    bindCards();
    bindCopyFields();
    bindListFields();
    $('#add-doctor').addEventListener('click', function () {
      state.doctors.push({ id: uid('doc'), name: 'New doctor', role: 'Physiotherapist', roleAbout: 'Physiotherapist', credentials: 'BPT', bio: '', bioAbout: '', photo: 'images/logo.png', visible: true });
      markDirty(); renderDoctors();
    });
  }

  /* ----- specialties ----- */
  function renderSpecialties() {
    var copy = state.sectionCopy.specialties || {};
    var html = '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Section heading on the website</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
      textField('Small label above the heading', 'copy:specialties.tag', copy.tag) +
      textField('Heading', 'copy:specialties.heading', copy.heading) +
      areaField('Intro paragraph', 'copy:specialties.intro', copy.intro) +
      '</div></section>';

    html += '<div class="toolbar"><button class="btn btn-primary" id="add-specialty">+ Add a specialty card</button></div>';
    state.specialties.forEach(function (item, i) {
      html += '<div class="row-card">' +
        '<div class="row-head"><strong>' + esc(item.title || 'Specialty') + '</strong>' +
          '<div class="row-actions">' +
            '<label class="switch"><input type="checkbox" data-list="specialties" data-index="' + i + '" data-key="visible"' + (item.visible !== false ? ' checked' : '') + '> Show on site</label>' +
            '<button class="btn btn-ghost btn-sm" data-move="specialties" data-index="' + i + '" data-dir="-1">↑</button>' +
            '<button class="btn btn-ghost btn-sm" data-move="specialties" data-index="' + i + '" data-dir="1">↓</button>' +
            '<button class="btn btn-danger btn-sm" data-remove="specialties" data-index="' + i + '">Delete</button>' +
          '</div></div>' +
        imageField('Card image', 'specialties', i, 'photo', item.photo) +
        listText('Title', 'specialties', i, 'title', item.title) +
        listText('Image description (alt text)', 'specialties', i, 'alt', item.alt) +
        '</div>';
    });

    $('#admin-content').innerHTML = html;
    bindCards(); bindCopyFields(); bindListFields();
    $('#add-specialty').addEventListener('click', function () {
      state.specialties.push({ id: uid('sp'), title: 'New specialty', photo: 'images/gym-room.jpeg', alt: '', visible: true });
      markDirty(); renderSpecialties();
    });
  }

  /* ----- services ----- */
  function renderServices() {
    var copy = state.sectionCopy.services || {};
    var html = '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Section heading on the website</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
      textField('Small label above the heading', 'copy:services.tag', copy.tag) +
      textField('Heading', 'copy:services.heading', copy.heading) +
      areaField('Intro paragraph', 'copy:services.intro', copy.intro) +
      '</div></section>';

    html += '<div class="toolbar"><button class="btn btn-primary" id="add-service">+ Add a treatment</button></div>';
    state.services.forEach(function (item, i) {
      html += '<div class="row-card">' +
        '<div class="row-head"><strong>' + esc(item.title || 'Treatment') + '</strong>' +
          '<div class="row-actions">' +
            '<label class="switch"><input type="checkbox" data-list="services" data-index="' + i + '" data-key="visible"' + (item.visible !== false ? ' checked' : '') + '> Show on site</label>' +
            '<button class="btn btn-ghost btn-sm" data-move="services" data-index="' + i + '" data-dir="-1">↑</button>' +
            '<button class="btn btn-ghost btn-sm" data-move="services" data-index="' + i + '" data-dir="1">↓</button>' +
            '<button class="btn btn-danger btn-sm" data-remove="services" data-index="' + i + '">Delete</button>' +
          '</div></div>' +
        listText('Title', 'services', i, 'title', item.title) +
        listArea('Description', 'services', i, 'description', item.description) +
        '<div class="grid-2">' +
          listText('Price (₹)', 'services', i, 'price', item.price) +
          '<div class="field"><label>Icon</label><select data-list="services" data-index="' + i + '" data-key="icon">' +
            ICON_CHOICES.map(function (icon) {
              return '<option value="' + icon + '"' + (item.icon === icon ? ' selected' : '') + '>' + icon + '</option>';
            }).join('') + '</select></div>' +
        '</div></div>';
    });

    $('#admin-content').innerHTML = html;
    bindCards(); bindCopyFields(); bindListFields();
    $('#add-service').addEventListener('click', function () {
      state.services.push({ id: uid('sv'), title: 'New treatment', icon: 'plus', description: '', price: '0', visible: true });
      markDirty(); renderServices();
    });
  }

  /* ----- clinic info ----- */
  function renderClinic() {
    var info = state.clinicInfo;
    $('#admin-content').innerHTML = '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Contact details &amp; opening hours</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body"><div class="grid-2">' +
      infoField('Phone number', 'phone', info.phone) +
      infoField('Second phone number', 'phone2', info.phone2) +
      infoField('WhatsApp number (digits only)', 'whatsapp', info.whatsapp) +
      infoField('Address line 1', 'addressLine1', info.addressLine1) +
      infoField('Address line 2 (city, state, pin)', 'addressCity', info.addressCity) +
      infoField('Opening days', 'hoursDays', info.hoursDays) +
      infoField('Opening time', 'hoursOpen', info.hoursOpen) +
      infoField('Closing time', 'hoursClose', info.hoursClose) +
      '</div>' +
      infoArea('Full address (used on maps and search listings)', 'address', info.address) +
      infoField('Opening hours — long version', 'hoursFull', info.hoursFull) +
      infoField('Opening hours — short version', 'hoursShort', info.hoursShort) +
      '</div></section>';
    bindCards();
    $$('[data-info-key]').forEach(function (input) {
      input.addEventListener('input', function () {
        state.clinicInfo[input.getAttribute('data-info-key')] = input.value;
        markDirty();
      });
    });
  }

  /* ----- appointments ----- */
  function renderAppointments() {
    var list = state.appointments;
    var html = '<div class="toolbar">' +
      '<button class="btn btn-ghost" id="refresh-appts">Refresh</button>' +
      '<button class="btn btn-ghost" id="export-appts">Download as CSV</button>' +
      '<button class="btn btn-danger" id="clear-appts">Delete all</button></div>';

    if (!list.length) {
      html += '<p class="empty">No appointment requests yet.</p>';
    } else {
      html += '<div class="card is-open"><div class="card-body"><div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Received</th><th>Patient</th><th>Treatment</th><th>When</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>';
      list.forEach(function (appt) {
        html += '<tr>' +
          '<td>' + esc(new Date(appt.createdAt).toLocaleString()) + '</td>' +
          '<td><strong>' + esc(appt.name) + '</strong>' +
            (appt.age ? ' <span class="muted">(' + esc(appt.age) + ' yrs)</span>' : '') +
            '<br>' + esc(appt.mobile) +
            (appt.address ? '<br>' + esc(appt.address) : '') +
            (appt.city ? '<br>' + esc(appt.city) : '') +
            (appt.complaint ? '<br><em>' + esc(appt.complaint) + '</em>' : '') + '</td>' +
          '<td>' + esc(appt.treatment || appt.service) +
            (appt.treatment && appt.service ? '<br>' + esc(appt.service) : '') + '</td>' +
          '<td>' + esc(appt.date) + (appt.slot ? '<br>' + esc(appt.slot) : '') + '</td>' +
          '<td><select data-appt-status="' + esc(appt.id) + '">' +
            STATUSES.map(function (s) { return '<option' + (appt.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
          '</select><br><span class="status-pill status-' + esc(appt.status) + '">' + esc(appt.status) + '</span></td>' +
          '<td><button class="btn btn-danger btn-sm" data-appt-delete="' + esc(appt.id) + '">Delete</button></td>' +
          '</tr>';
      });
      html += '</tbody></table></div></div></div>';
    }

    $('#admin-content').innerHTML = html;

    $('#refresh-appts').addEventListener('click', function () {
      get('/appointments').then(function (data) { state.appointments = data; renderAppointments(); toast('Updated'); });
    });
    $('#clear-appts').addEventListener('click', function () {
      if (!confirm('Delete every appointment request? This cannot be undone.')) return;
      request('DELETE', '/appointments').then(function () { state.appointments = []; renderAppointments(); toast('All requests deleted'); });
    });
    $('#export-appts').addEventListener('click', exportAppointmentsCsv);
    $$('[data-appt-status]').forEach(function (select) {
      select.addEventListener('change', function () {
        var id = select.getAttribute('data-appt-status');
        request('PUT', '/appointments/' + id, { status: select.value }).then(function () {
          state.appointments.forEach(function (a) { if (a.id === id) a.status = select.value; });
          renderAppointments(); toast('Status updated');
        }).catch(function (err) { toast(err.message, true); });
      });
    });
    $$('[data-appt-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-appt-delete');
        if (!confirm('Delete this request?')) return;
        request('DELETE', '/appointments/' + id).then(function () {
          state.appointments = state.appointments.filter(function (a) { return a.id !== id; });
          renderAppointments(); toast('Deleted');
        }).catch(function (err) { toast(err.message, true); });
      });
    });
  }

  function exportAppointmentsCsv() {
    var cols = ['createdAt', 'name', 'age', 'mobile', 'address', 'city', 'treatment', 'service', 'complaint', 'date', 'slot', 'status', 'notes'];
    var rows = [cols.join(',')].concat(state.appointments.map(function (a) {
      return cols.map(function (c) { return '"' + String(a[c] === undefined ? '' : a[c]).replace(/"/g, '""') + '"'; }).join(',');
    }));
    download('appointments.csv', rows.join('\n'), 'text/csv');
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  /* ----- settings ----- */
  function renderSettings() {
    $('#admin-content').innerHTML =
      '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Change passcode</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
        '<div class="grid-2">' +
          '<div class="field"><label>Current passcode</label><input type="password" id="pass-current"></div>' +
          '<div class="field"><label>New passcode (min 8 characters)</label><input type="password" id="pass-new"></div>' +
        '</div><button class="btn btn-primary" id="save-pass">Update passcode</button></div></section>' +
      '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Backup &amp; restore</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
        '<p class="field-note">Download a copy of all website content, or restore it from a previous backup file.</p>' +
        '<div class="toolbar"><button class="btn btn-primary" id="backup-btn">Download backup</button>' +
        '<label class="btn btn-ghost" for="restore-file">Restore from backup</label>' +
        '<input type="file" id="restore-file" accept="application/json" hidden></div></div></section>' +
      '<section class="card is-open"><div class="card-head" data-card-toggle><h2>Reset content</h2><span class="count"><span class="chev">▾</span></span></div><div class="card-body">' +
        '<p class="field-note">Restores all website text, images and backgrounds to how they were originally. Appointment requests are kept.</p>' +
        '<div class="toolbar"><button class="btn btn-danger" id="reset-page-content">Reset page text &amp; images</button>' +
        '<button class="btn btn-danger" id="reset-all">Reset everything</button></div></div></section>';

    bindCards();
    $('#save-pass').addEventListener('click', function () {
      post('/auth/change-passcode', { current: $('#pass-current').value, newPass: $('#pass-new').value })
        .then(function () { $('#pass-current').value = ''; $('#pass-new').value = ''; toast('Passcode updated'); })
        .catch(function (err) { toast(err.message, true); });
    });
    $('#backup-btn').addEventListener('click', function () {
      get('/backup').then(function (data) {
        download('healing-hands-backup.json', JSON.stringify(data, null, 2));
      }).catch(function (err) { toast(err.message, true); });
    });
    $('#restore-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          post('/backup/import', payload).then(function () { toast('Backup restored'); loadAll(); });
        } catch (err) { toast('That file is not a valid backup.', true); }
      };
      reader.readAsText(file);
    });
    $('#reset-page-content').addEventListener('click', function () {
      if (!confirm('Reset all page text, images and backgrounds to the original website?')) return;
      post('/content/reset').then(function () { toast('Page content reset'); loadAll(); }).catch(function (err) { toast(err.message, true); });
    });
    $('#reset-all').addEventListener('click', function () {
      if (!confirm('Reset doctors, treatments, contact details AND all page content?')) return;
      post('/reset').then(function () { toast('Everything reset'); loadAll(); }).catch(function (err) { toast(err.message, true); });
    });
  }

  /* ---------------- Editable list resources (conditions, therapies, directory, blog, booking) ---------------- */

  // A "resource" is a JSON file the client fully manages: conditions, therapies,
  // the what-we-treat lists, blog posts and the booking form dropdowns.
  var RESOURCES = {
    conditions: {
      label: 'Conditions we treat', file: 'services.html', shape: 'array',
      title: function (i) { return state.conditions[i].name || 'Condition ' + (i + 1); },
      add: function () { state.conditions.push({ id: uid('cond'), name: 'New condition', img: 'images/logo.png', symptoms: [], visible: true }); },
      fields: function (i) {
        var c = state.conditions[i];
        return imageField('Picture', 'conditions', i, 'img', c.img) +
          listText('Condition name', 'conditions', i, 'name', c.name) +
          listLines('Symptoms (one per line)', 'conditions', i, 'symptoms', (c.symptoms || []).join('\n'));
      }
    },
    therapies: {
      label: 'Therapies (grouped)', file: 'services.html', shape: 'object',
      groups: 'groups', add: null
    },
    directory: {
      label: 'What We Treat lists', file: 'what-we-treat.html', shape: 'object',
      lists: [
        { key: 'symptoms', label: 'Symptoms' },
        { key: 'therapies', label: 'Therapies offered' },
        { key: 'services', label: 'Services offered' }
      ]
    },
    blogposts: {
      label: 'Blog posts', file: 'blog.html', shape: 'array',
      title: function (i) { return state.blogposts[i].title || 'Post ' + (i + 1); },
      add: function () { state.blogposts.push({ id: uid('post'), title: 'New post', summary: '', body: '', tag: '', date: '', visible: true }); },
      fields: function (i) {
        var p = state.blogposts[i];
        return imageField('Cover image (optional)', 'blogposts', i, 'image', p.image || '') +
          '<div class="grid-2">' +
            listText('Title', 'blogposts', i, 'title', p.title) +
            listText('Category / tag', 'blogposts', i, 'tag', p.tag) +
          '</div>' +
          listText('Date shown (e.g. Sep 2026)', 'blogposts', i, 'date', p.date) +
          listArea('Short summary (shown on the card)', 'blogposts', i, 'summary', p.summary) +
          listArea('Full article (one paragraph per line)', 'blogposts', i, 'body', p.body);
      }
    },
    bookingoptions: {
      label: 'Booking form options', file: 'book-appointment.html', shape: 'object',
      lists: [
        { key: 'cities', label: 'Cities' },
        { key: 'treatments', label: 'Treatment types' },
        { key: 'services', label: 'Service types' },
        { key: 'slots', label: 'Time slots' }
      ]
    }
  };

  function renderResource(name) {
    var R = RESOURCES[name];
    var sub = 'Managed in data/' + name + '.json — changes appear on ' + R.file + ' straight away.';
    $('#view-sub').textContent = sub;
    setPreview(R.file);

    var html = '';
    if (R.shape === 'array') {
      html += '<div class="toolbar"><button class="btn btn-primary" id="res-add">+ Add a new ' + (name === 'blogposts' ? 'post' : 'condition') + '</button></div>';
      state[name].forEach(function (item, i) {
        html += '<div class="row-card">' +
          '<div class="row-head"><strong>' + esc(R.title(i)) + '</strong>' +
            '<div class="row-actions">' +
              '<label class="switch"><input type="checkbox" data-list="' + name + '" data-index="' + i + '" data-key="visible"' + (item.visible !== false ? ' checked' : '') + '> Show on site</label>' +
              '<button class="btn btn-ghost btn-sm" data-move="' + name + '" data-index="' + i + '" data-dir="-1">↑</button>' +
              '<button class="btn btn-ghost btn-sm" data-move="' + name + '" data-index="' + i + '" data-dir="1">↓</button>' +
              '<button class="btn btn-danger btn-sm" data-remove="' + name + '" data-index="' + i + '">Delete</button>' +
            '</div></div>' +
          R.fields(i) +
        '</div>';
      });
    } else if (name === 'therapies') {
      state.therapies.groups.forEach(function (g, gi) {
        html += '<section class="card is-open"><div class="card-head"><h2>' + esc(g.title) + '</h2>' +
          '<span class="count">' + (g.items || []).length + ' items</span></div><div class="card-body">' +
          '<div class="grid-2">' +
            listText('Heading', 'therapies-group', gi, 'title', g.title) +
            listText('Small label above heading', 'therapies-group', gi, 'tag', g.tag) +
          '</div>' +
          listArea('Intro paragraph', 'therapies-group', gi, 'intro', g.intro) +
          '<label class="switch"><input type="checkbox" data-therapies-visible="' + gi + '"' + (g.visible !== false ? ' checked' : '') + '> Show this group on the site</label>' +
        '</div></section>';

        (g.items || []).forEach(function (item, ii) {
          var path = gi + '.' + ii;
          html += '<div class="row-card">' +
            '<div class="row-head"><strong>' + esc(item.name) + '</strong>' +
              '<div class="row-actions">' +
                '<label class="switch"><input type="checkbox" data-therapies-item-visible="' + path + '"' + (item.visible !== false ? ' checked' : '') + '> Show</label>' +
                '<button class="btn btn-ghost btn-sm" data-move-therapy="' + path + '" data-dir="-1">↑</button>' +
                '<button class="btn btn-ghost btn-sm" data-move-therapy="' + path + '" data-dir="1">↓</button>' +
                '<button class="btn btn-danger btn-sm" data-remove-therapy="' + path + '">Delete</button>' +
              '</div></div>' +
            listText('Therapy name', 'therapies-item', path, 'name', item.name) +
            listArea('Description', 'therapies-item', path, 'description', item.description) +
          '</div>';
        });

        html += '<div class="toolbar"><button class="btn btn-ghost" data-add-therapy="' + gi + '">+ Add a therapy to ' + esc(g.title) + '</button></div>';
      });
    } else {
      // simple newline-separated lists
      R.lists.forEach(function (L) {
        html += '<section class="card is-open"><div class="card-head"><h2>' + esc(L.label) + '</h2>' +
          '<span class="count">' + (state[name][L.key] || []).length + ' items</span></div><div class="card-body">' +
          '<div class="field"><label>One item per line</label>' +
          '<textarea rows="10" data-csv-list="' + name + '" data-key="' + L.key + '">' +
          esc((state[name][L.key] || []).join('\n')) + '</textarea></div>' +
        '</div></section>';
      });
    }

    $('#admin-content').innerHTML = html;
    bindCards();
    bindListFields();
    bindResourceFields(name);

    if (R.shape === 'array' && R.add) {
      var addBtn = $('#res-add');
      if (addBtn) addBtn.addEventListener('click', function () {
        R.add(); markDirty(); renderResource(name);
      });
    }
  }

  // per-resource bindings (nested paths, csv lists, add/remove/move)
  function bindResourceFields(name) {
    // therapies: nested group + item fields keyed by "gi" / "gi.ii"
    $$('[data-list="therapies-group"]').forEach(function (input) {
      input.addEventListener('input', function () {
        var g = state.therapies.groups[Number(input.dataset.index)];
        if (g) { g[input.dataset.key] = input.value; markDirty(); }
      });
    });
    $$('[data-list="therapies-item"]').forEach(function (input) {
      input.addEventListener('input', function () {
        var parts = input.dataset.index.split('.');
        var item = state.therapies.groups[Number(parts[0])].items[Number(parts[1])];
        if (item) { item[input.dataset.key] = input.value; markDirty(); }
      });
    });
    $$('[data-therapies-visible]').forEach(function (el) {
      el.addEventListener('change', function () {
        state.therapies.groups[Number(el.dataset.therapiesVisible)].visible = el.checked; markDirty();
      });
    });
    $$('[data-therapies-item-visible]').forEach(function (el) {
      el.addEventListener('change', function () {
        var p = el.dataset.therapiesItemVisible.split('.');
        state.therapies.groups[Number(p[0])].items[Number(p[1])].visible = el.checked; markDirty();
      });
    });
    $$('[data-add-therapy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = state.therapies.groups[Number(btn.dataset.addTherapy)];
        g.items = g.items || [];
        g.items.push({ id: uid('th'), name: 'New therapy', description: '', visible: true });
        markDirty(); renderResource(name);
      });
    });
    $$('[data-remove-therapy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.dataset.removeTherapy.split('.');
        var g = state.therapies.groups[Number(p[0])];
        if (g.items.length <= 1) { toast('Keep at least one therapy', true); return; }
        g.items.splice(Number(p[1]), 1);
        markDirty(); renderResource(name);
      });
    });
    $$('[data-move-therapy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.dataset.moveTherapy.split('.');
        var gi = Number(p[0]), ii = Number(p[1]);
        var arr = state.therapies.groups[gi].items;
        var to = ii + Number(btn.dataset.dir);
        if (to < 0 || to >= arr.length) return;
        var tmp = arr[ii]; arr[ii] = arr[to]; arr[to] = tmp;
        markDirty(); renderResource(name);
      });
    });

    // newline-separated lists (directory + booking options)
    $$('[data-csv-list]').forEach(function (area) {
      area.addEventListener('input', function () {
        state[area.dataset.csvList][area.dataset.key] = area.value
          .split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        markDirty();
      });
    });
  }

  /* ---------------- field builders ---------------- */
  function textField(label, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><input type="text" data-copy-key="' + esc(key) + '" value="' + esc(value) + '"></div>';
  }
  function areaField(label, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><textarea data-copy-key="' + esc(key) + '">' + esc(value) + '</textarea></div>';
  }
  function infoField(label, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><input type="text" data-info-key="' + esc(key) + '" value="' + esc(value) + '"></div>';
  }
  function infoArea(label, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><textarea data-info-key="' + esc(key) + '">' + esc(value) + '</textarea></div>';
  }
  function listText(label, list, index, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><input type="text" data-list="' + list + '" data-index="' + index + '" data-key="' + key + '" value="' + esc(value) + '"></div>';
  }
  function listArea(label, list, index, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><textarea data-list="' + list + '" data-index="' + index + '" data-key="' + key + '">' + esc(value) + '</textarea></div>';
  }
  function listLines(label, list, index, key, value) {
    return '<div class="field"><label>' + esc(label) + '</label><textarea data-list="' + list + '" data-list-format="lines" data-index="' + index + '" data-key="' + key + '">' + esc(value) + '</textarea></div>';
  }
  function imageField(label, list, index, key, value) {
    var id = list + '-' + index + '-' + key;
    return '<div class="field"><label>' + esc(label) + '</label><div class="image-field">' +
      '<img class="thumb" src="' + esc(value) + '" alt="" data-thumb-for="' + id + '">' +
      '<div class="image-controls">' +
        '<input type="text" data-list="' + list + '" data-index="' + index + '" data-key="' + key + '" data-thumb-id="' + id + '" value="' + esc(value) + '">' +
        '<div class="image-buttons"><button type="button" class="btn btn-ghost btn-sm" data-pick-list="' + list + '" data-index="' + index + '" data-key="' + key + '" data-thumb-id="' + id + '">Choose / upload image</button></div>' +
      '</div></div></div>';
  }

  function bindCopyFields() {
    $$('[data-copy-key]').forEach(function (input) {
      input.addEventListener('input', function () {
        var parts = input.getAttribute('data-copy-key').slice(5).split('.');
        if (!state.sectionCopy[parts[0]]) state.sectionCopy[parts[0]] = {};
        state.sectionCopy[parts[0]][parts[1]] = input.value;
        markDirty();
      });
    });
  }

  function bindListFields() {
    $$('[data-list]').forEach(function (input) {
      var list = input.getAttribute('data-list');
      var index = parseInt(input.getAttribute('data-index'), 10);
      var key = input.getAttribute('data-key');
      var event = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(event, function () {
        // a few fields are newline-separated lists stored as arrays
        var isList = input.getAttribute('data-list-format') === 'lines';
        state[list][index][key] = input.type === 'checkbox'
          ? input.checked
          : (isList
            ? input.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
            : input.value);
        var thumbId = input.getAttribute('data-thumb-id');
        if (thumbId) { var t = $('[data-thumb-for="' + thumbId + '"]'); if (t) t.src = input.value; }
        markDirty();
      });
    });
    $$('[data-pick-list]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var list = btn.getAttribute('data-pick-list');
        var index = parseInt(btn.getAttribute('data-index'), 10);
        var key = btn.getAttribute('data-key');
        var thumbId = btn.getAttribute('data-thumb-id');
        openImagePicker(function (url) {
          state[list][index][key] = url;
          var input = $('[data-thumb-id="' + thumbId + '"]');
          if (input) input.value = url;
          var thumb = $('[data-thumb-for="' + thumbId + '"]');
          if (thumb) thumb.src = url;
          markDirty();
        });
      });
    });
    $$('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var list = btn.getAttribute('data-remove');
        if (!confirm('Delete this item?')) return;
        state[list].splice(parseInt(btn.getAttribute('data-index'), 10), 1);
        markDirty(); render();
      });
    });
    $$('[data-move]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var list = btn.getAttribute('data-move');
        var i = parseInt(btn.getAttribute('data-index'), 10);
        var j = i + parseInt(btn.getAttribute('data-dir'), 10);
        if (j < 0 || j >= state[list].length) return;
        var tmp = state[list][i]; state[list][i] = state[list][j]; state[list][j] = tmp;
        markDirty(); render();
      });
    });
  }

  /* ---------------- image picker ---------------- */
  var pickCallback = null;

  function openImagePicker(callback) {
    pickCallback = callback;
    $('#image-modal').hidden = false;
    $('#upload-status').textContent = '';
    var grid = $('#image-grid');
    grid.innerHTML = '<p class="empty">Loading images…</p>';
    get('/images').then(function (list) {
      grid.innerHTML = list.map(function (src) {
        return '<button type="button" data-src="' + esc(src) + '"><img src="' + esc(src) + '" alt="" loading="lazy"><span>' + esc(src.split('/').pop()) + '</span></button>';
      }).join('') || '<p class="empty">No images yet — upload one above.</p>';
      $$('button[data-src]', grid).forEach(function (btn) {
        btn.addEventListener('click', function () { choose(btn.getAttribute('data-src')); });
      });
    }).catch(function () { grid.innerHTML = '<p class="empty">Could not load the image list.</p>'; });
  }

  function choose(url) {
    if (pickCallback) pickCallback(url);
    pickCallback = null;
    $('#image-modal').hidden = true;
  }

  $('#image-modal-close').addEventListener('click', function () { pickCallback = null; $('#image-modal').hidden = true; });
  $('#image-modal').addEventListener('click', function (e) {
    if (e.target === $('#image-modal')) { pickCallback = null; $('#image-modal').hidden = true; }
  });

  $('#image-upload').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var form = new FormData();
    form.append('photo', file);
    $('#upload-status').textContent = 'Uploading…';
    fetch(API, { method: 'POST', headers: routeHeaders('/upload', false), body: form })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.url) throw new Error(data.error || 'Upload failed');
        $('#upload-status').textContent = 'Uploaded';
        choose(data.url);
        toast('Image uploaded');
      })
      .catch(function (err) { $('#upload-status').textContent = ''; toast(err.message, true); });
    e.target.value = '';
  });

  /* ---------------- saving ---------------- */
  function markDirty() {
    state.dirty = true;
    var btn = $('#save-btn');
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }

  function markClean() {
    state.dirty = false;
    var btn = $('#save-btn');
    btn.disabled = true;
    btn.textContent = 'Saved';
  }

  function saveAll() {
    var btn = $('#save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    Promise.all([
      post('/content', state.content),
      post('/doctors', state.doctors),
      post('/specialties', state.specialties),
      post('/services', state.services),
      post('/section-copy', state.sectionCopy),
      post('/clinic-info', state.clinicInfo),
      post('/conditions', state.conditions),
      post('/therapies', state.therapies),
      post('/directory', state.directory),
      post('/blogposts', state.blogposts),
      post('/bookingoptions', state.bookingoptions)
    ]).then(function () {
      markClean();
      toast('Saved — the website is updated');
      reloadPreview();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Save changes';
      toast(err.message, true);
    });
  }

  $('#save-btn').addEventListener('click', saveAll);

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (state.dirty) saveAll(); }
  });

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- preview ---------------- */
  var previewFile = 'index.html';
  function setPreview(file) {
    previewFile = file;
    var frame = $('#preview-frame');
    if (!$('#admin-preview').hidden && frame.getAttribute('data-file') !== file) {
      frame.setAttribute('data-file', file);
      frame.src = file;
    }
  }
  function reloadPreview() {
    var frame = $('#preview-frame');
    if (!$('#admin-preview').hidden) frame.src = previewFile + '?t=' + Date.now();
  }
  $('#preview-toggle').addEventListener('click', function () {
    var panel = $('#admin-preview');
    panel.hidden = !panel.hidden;
    this.textContent = panel.hidden ? 'Show preview' : 'Hide preview';
    if (!panel.hidden) { $('#preview-frame').setAttribute('data-file', previewFile); $('#preview-frame').src = previewFile; }
  });
  $('#preview-close').addEventListener('click', function () {
    $('#admin-preview').hidden = true;
    $('#preview-toggle').textContent = 'Show preview';
  });
  $('#preview-reload').addEventListener('click', reloadPreview);

  /* ---------------- misc ---------------- */
  $('#field-search').addEventListener('input', function () {
    state.search = this.value;
    if (state.view && state.view.indexOf('page:') === 0) renderPage(state.view.slice(5));
  });
  $('#menu-btn').addEventListener('click', function () { $('#admin-sidebar').classList.toggle('is-open'); });

  /* ---------------- boot ---------------- */
  (function boot() {
    var token = '';
    try { token = sessionStorage.getItem(SESSION_KEY) || ''; } catch (err) { /* ignore */ }
    if (!token) return;
    state.token = token;
    fetch(API, { headers: routeHeaders('/auth/check', false) }).then(function (res) {
      if (res.ok) startSession(token); else signOut();
    }).catch(function () { signOut(); });
  })();

})(window, document);
