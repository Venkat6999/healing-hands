/* ============================================================
   Healing Hands — shared site data layer (API version)
   ------------------------------------------------------------
   All data is fetched from the Node.js backend via REST API.
   Falls back to localStorage when API is unavailable.
   ============================================================ */
(function (window, document) {
  'use strict';

  var API_BASE = window.location.origin + '/api';
  var POLL_INTERVAL = 2000; // poll every 2 seconds for changes

  /* ---------- Defaults (used as fallback) ---------- */

  var DEFAULT_DOCTORS = [
    {
      id: 'doc-prakash', name: 'Dr. A. Prakash', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Evenings', credentials: 'BPT, PIAP, CMT',
      bio: 'Dr. Prakash is specialised in Dry Needling, Advanced pain management and pelvic floor rehabilitation therapies.',
      bioAbout: 'Dr. Prakash is specialised in Dry Needling, Advanced pain management and pelvic floor rehabilitation therapies.',
      photo: 'images/doctor-prakash.jpeg', visible: true
    },
    {
      id: 'doc-kalyani', name: 'Dr. U. Kalyani', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Morning & afternoon', credentials: 'BPT, MIAP',
      bio: 'Dr. Kalyani sees patients through the day, focusing on musculoskeletal pain, post-injury rehab and personalised exercise plans.',
      bioAbout: 'Dr. Kalyani works with patients on musculoskeletal pain, joint conditions and rehabilitation after injury, combining manual assessment with structured home exercise guidance.',
      photo: 'images/doctor-kalyani.jpeg', visible: true
    }
  ];

  var DEFAULT_SPECIALTIES = [
    { id: 'sp-neuro', title: 'Neuro Physiotherapy — Rehab', photo: 'images/doctor-prakash.jpeg', alt: 'Physiotherapist providing attentive care', visible: true },
    { id: 'sp-sports', title: 'Sports Physiotherapy', photo: 'images/treatment-room-1.jpeg', alt: 'Prepared physiotherapy treatment room', visible: true },
    { id: 'sp-paed', title: 'Paediatric Physiotherapy', photo: 'images/gym-room.jpeg', alt: 'Rehabilitation gym with walking bars', visible: true },
    { id: 'sp-geri', title: 'Geriatric Physiotherapy', photo: 'images/doctor-kalyani.jpeg', alt: 'Healing Hands physiotherapist', visible: true },
    { id: 'sp-home', title: 'Home Care Physiotherapy', photo: 'images/treatment-room-2.jpeg', alt: 'Clinic treatment area', visible: true },
    { id: 'sp-chiro', title: 'Chiropractor Treatment', photo: 'images/treatment-room-3.jpeg', alt: 'Quiet physiotherapy consultation room', visible: true }
  ];

  var ICONS = {
    plus:     '<path d="M12 4v16M4 12h16" stroke="#1c7fc4" stroke-width="1.6" stroke-linecap="round"/>',
    activity: '<path d="M3 12h4l2-7 4 14 2-7h6" stroke="#1c7fc4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    pulse:    '<path d="M6 12h3l2-6 4 12 2-6h3" stroke="#1c7fc4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    clock:    '<circle cx="12" cy="12" r="9" stroke="#1c7fc4" stroke-width="1.6"/><path d="M12 7v5l3 3" stroke="#1c7fc4" stroke-width="1.6" stroke-linecap="round"/>',
    home:     '<path d="M12 3v18M5 8l7-5 7 5M5 8v9a3 3 0 003 3h8a3 3 0 003-3V8" stroke="#1c7fc4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    tools:    '<path d="M4 20l6-6M14 4l6 6-8 8-6-6 8-8Z" stroke="#1c7fc4" stroke-width="1.6" stroke-linejoin="round"/>'
  };

  var DEFAULT_SERVICES = [
    { id: 'sv-basic', title: 'Basic treatment (any two electrotherapy modalities)', icon: 'plus', visible: true, description: 'Includes IFT, Ultrasound, TENS, Stimulator, Hydrocollator packs, Traction, Infrared radiation and Taping — any two modalities per session.', price: '400' },
    { id: 'sv-manual', title: 'Manual therapy', icon: 'tools', visible: true, description: 'Hands-on techniques including joint mobilisation, manipulation and soft tissue work to restore movement and reduce pain.', price: '500' },
    { id: 'sv-cupping', title: 'Cupping therapy', icon: 'clock', visible: true, description: 'An ancient healing practice with a strong place in modern physiotherapy — used for pain relief, muscle recovery and improving blood flow.', price: '600' },
    { id: 'sv-dryneedle', title: 'Dry needle therapy', icon: 'pulse', visible: true, description: 'Also known as Trigger Point Dry Needling — a procedure using thin needles to release myofascial trigger points and relieve muscle pain.', price: '800' }
  ];

  var DEFAULT_SECTION_COPY = {
    specialties: { tag: 'Care for every stage of life', heading: 'Find the right physiotherapy for you', intro: 'Focused treatment plans for pain, mobility, rehabilitation and recovery, delivered in our clinic or at home.' },
    doctors: { tag: 'Meet the team', heading: 'The physiotherapists behind your care', intro: 'Every session at Healing Hands is led directly by one of our qualified physiotherapists — never handed off.' },
    services: { tag: 'Our treatments', heading: 'Treatment', intro: 'Better movement. Better recovery. Better life. Personalized, hands-on physiotherapy for pain management, better movement and lasting recovery.' }
  };

  var DEFAULT_CLINIC_INFO = {
    phone: '+918523841691', whatsapp: '918523841691',
    address: "H.No: 1-7-1204, Advocate's Colony Main Road, Opposite: Canara Bank, Beside: Blue Star A/C Showroom, Balasamudram, Hanamkonda, Telangana 506001",
    addressLine1: "H.No: 1-7-1204, Advocate's Colony Main Road", addressCity: 'Hanamkonda, Warangal, Telangana 506001',
    hoursDays: 'Mon-Sun', hoursOpen: '10:00 AM', hoursClose: '8:30 PM',
    hoursFull: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM', hoursShort: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM'
  };

  var STATUSES = ['New', 'Confirmed', 'Completed', 'Cancelled'];

  /* ---------- In-memory cache ---------- */
  var cache = {
    doctors: null,
    specialties: null,
    services: null,
    sectionCopy: null,
    clinicInfo: null,
    appointments: null,
    conditions: null,
    therapies: null,
    directory: null,
    blogposts: null,
    bookingoptions: null
  };

  var serverVersion = 0;
  var apiAvailable = true;

  /* ---------- API helpers ---------- */
  function apiGet(endpoint) {
    return fetch(API_BASE + endpoint, { headers: adminHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error('API error');
        return res.json();
      });
  }

  function apiPost(endpoint, data) {
    return fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: adminHeaders(true),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  function getAdminToken() {
    try { return window.sessionStorage.getItem('hh_admin_session') || ''; }
    catch (err) { return ''; }
  }

  function adminHeaders(json) {
    var token = getAdminToken();
    var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function apiPut(endpoint, data) {
    return fetch(API_BASE + endpoint, {
      method: 'PUT',
      headers: adminHeaders(true),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error('API error');
      return res.json();
    });
  }

  function apiDelete(endpoint) {
    return fetch(API_BASE + endpoint, { method: 'DELETE', headers: adminHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error('API error');
        return res.json();
      });
  }

  /* ---------- Public API ---------- */

  var HH = {
    KEY: {
      doctors: 'hh_doctors', specialties: 'hh_specialties', services: 'hh_services',
      sectionCopy: 'hh_section_copy', appointments: 'hh_appointments',
      clinicInfo: 'hh_clinic_info', session: 'hh_admin_session', passcode: 'hh_admin_passcode'
    },
    ICONS: ICONS,
    STATUSES: STATUSES,
    storageWorks: true,
    esc: function (value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    uid: function (prefix) {
      return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2, 7);
    },
    clone: function (value) { return JSON.parse(JSON.stringify(value)); },
    defaults: { doctors: DEFAULT_DOCTORS, specialties: DEFAULT_SPECIALTIES, services: DEFAULT_SERVICES, sectionCopy: DEFAULT_SECTION_COPY },

    /* ----- Data getters (from cache, fallback to API, fallback to defaults) ----- */

    getDoctors: function () {
      return cache.doctors || DEFAULT_DOCTORS;
    },

    getSpecialties: function () {
      return cache.specialties || DEFAULT_SPECIALTIES;
    },

    getServices: function () {
      return cache.services || DEFAULT_SERVICES;
    },

    getSectionCopy: function () {
      return cache.sectionCopy || DEFAULT_SECTION_COPY;
    },

    getClinicInfo: function () {
      return cache.clinicInfo || DEFAULT_CLINIC_INFO;
    },

    getAppointments: function () {
      return cache.appointments || [];
    },

    /* ----- Editable list resources (managed from the admin panel) ----- */

    getConditions: function () {
      if (Array.isArray(cache.conditions)) return cache.conditions;
      if (Array.isArray(window.CONDITIONS_DATA)) {
        return window.CONDITIONS_DATA.map(function (c, i) {
          return { id: 'cond-' + (i + 1), name: c.name, img: c.img, symptoms: c.symptoms || [], visible: true };
        });
      }
      return [];
    },

    getTherapies: function () {
      return cache.therapies || { groups: [] };
    },

    getDirectory: function () {
      return cache.directory || { symptoms: [], therapies: [], services: [] };
    },

    getBlogPosts: function () {
      return cache.blogposts || [];
    },

    getBookingOptions: function () {
      return cache.bookingoptions || { cities: [], treatments: [], services: [], slots: [] };
    },

    isVisible: function (item) {
      return Boolean(item) && item.visible !== false;
    },

    /* ----- Data savers (POST to API) ----- */

    saveDoctors: function (list) {
      cache.doctors = list;
      return apiPost('/doctors', list);
    },

    saveSpecialties: function (list) {
      cache.specialties = list;
      return apiPost('/specialties', list);
    },

    saveServices: function (list) {
      cache.services = list;
      return apiPost('/services', list);
    },

    saveSectionCopy: function (copy) {
      cache.sectionCopy = copy;
      return apiPost('/section-copy', copy);
    },

    saveClinicInfo: function (info) {
      cache.clinicInfo = info;
      return apiPost('/clinic-info', info);
    },

    saveAppointments: function (list) {
      cache.appointments = list;
      return apiPost('/appointments', list);
    },

    addAppointment: function (data) {
      return apiPost('/appointments/add', data).then(function (result) {
        if (cache.appointments) cache.appointments.unshift(result.record);
        return result.record;
      });
    },

    updateAppointment: function (id, patch) {
      var list = HH.getAppointments();
      var found = null;
      list.forEach(function (item) {
        if (item.id === id) { Object.keys(patch).forEach(function (k) { item[k] = patch[k]; }); found = item; }
      });
      if (found) {
        cache.appointments = list;
        apiPut('/appointments/' + id, patch).catch(function () {});
      }
      return found;
    },

    deleteAppointment: function (id) {
      var list = HH.getAppointments().filter(function (item) { return item.id !== id; });
      cache.appointments = list;
      apiDelete('/appointments/' + id).catch(function () {});
      return list;
    },

    /* ----- Backup / Restore ----- */

    exportAll: function () {
      return apiGet('/backup').catch(function () {
        return {
          doctors: HH.getDoctors(), specialties: HH.getSpecialties(),
          services: HH.getServices(), sectionCopy: HH.getSectionCopy(),
          clinicInfo: HH.getClinicInfo(), appointments: HH.getAppointments()
        };
      });
    },

    importAll: function (payload) {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid backup file.');
      if (Array.isArray(payload.doctors)) HH.saveDoctors(payload.doctors);
      if (Array.isArray(payload.specialties)) HH.saveSpecialties(payload.specialties);
      if (Array.isArray(payload.services)) HH.saveServices(payload.services);
      if (payload.sectionCopy) HH.saveSectionCopy(payload.sectionCopy);
      if (payload.clinicInfo) HH.saveClinicInfo(payload.clinicInfo);
      if (Array.isArray(payload.appointments)) HH.saveAppointments(payload.appointments);
      return apiPost('/backup/import', payload);
    },

    resetContent: function () {
      HH.saveDoctors(HH.clone(DEFAULT_DOCTORS));
      HH.saveSpecialties(HH.clone(DEFAULT_SPECIALTIES));
      HH.saveServices(HH.clone(DEFAULT_SERVICES));
      HH.saveSectionCopy(HH.clone(DEFAULT_SECTION_COPY));
      HH.saveClinicInfo(HH.clone(DEFAULT_CLINIC_INFO));
      return apiPost('/reset');
    },

    /* ---------- Renderers for the public pages ---------- */

    renderSectionCopy: function (root) {
      var copy = HH.getSectionCopy();
      (root || document).querySelectorAll('[data-hh-copy]').forEach(function (el) {
        var path = el.getAttribute('data-hh-copy').split('.');
        var block = copy[path[0]];
        if (block && block[path[1]]) el.textContent = block[path[1]];
      });
    },

    renderSpecialties: function (root) {
      var track = (root || document).querySelector('[data-hh-specialties]');
      if (!track) return;
      var items = HH.getSpecialties().filter(function (s) { return s.visible !== false; });
      if (!items.length) return;

      var card = function (item, index, isClone) {
        return '<article class="specialty-card ' + (index % 2 ? 'card-high' : 'card-low') + '"' +
          (isClone ? ' aria-hidden="true"' : '') + '>' +
          '<img src="' + HH.esc(item.photo) + '" alt="' + (isClone ? '' : HH.esc(item.alt || item.title)) + '"' +
          (isClone ? '' : ' loading="lazy"') + '>' +
          '<h3>' + HH.esc(item.title) + '</h3></article>';
      };

      var html = items.map(function (item, i) { return card(item, i, false); }).join('') +
                 items.map(function (item, i) { return card(item, i, true); }).join('');
      track.innerHTML = html;
    },

    renderDoctors: function (root) {
      (root || document).querySelectorAll('[data-hh-doctors]').forEach(function (grid) {
        var variant = grid.getAttribute('data-hh-doctors');
        var items = HH.getDoctors().filter(function (d) { return d.visible !== false; });
        if (!items.length) return;
        if (variant === 'about') items = items.slice().reverse();

        grid.innerHTML = items.map(function (doc, idx) {
          var role = variant === 'about' ? (doc.roleAbout || doc.role) : doc.role;
          return '<div class="doctor-card" data-doctor-idx="' + idx + '" role="button" tabindex="0" aria-label="' +
              HH.esc('View the full profile of ' + doc.name) + '">' +
            '<div class="doctor-photo">' +
              '<span class="doctor-photo-ring">' +
                '<img src="' + HH.esc(doc.photo) + '" alt="' +
                  HH.esc(doc.name + ', ' + (doc.role || 'Physiotherapist') + ' at Healing Hands') +
                  '" loading="lazy">' +
              '</span>' +
            '</div>' +
            '<div class="doctor-body">' +
              '<h3>' + HH.esc(doc.name) + '</h3>' +
              '<span class="doctor-role">' + HH.esc(role) + '</span>' +
              (doc.credentials
                ? '<span class="doctor-card-meta" title="' + HH.esc(doc.credentials) + '">' + HH.esc(doc.credentials) + '</span>'
                : '') +
              '<span class="doctor-card-cta">View profile <span aria-hidden="true">→</span></span>' +
            '</div></div>';
        }).join('');
        grid.classList.add('is-visible');
      });
    },

    renderServices: function (root) {
      var grid = (root || document).querySelector('[data-hh-services]');
      if (!grid) return;
      var items = HH.getServices().filter(function (s) { return s.visible !== false; });
      if (!items.length) return;

      grid.innerHTML = items.map(function (item) {
        var shape = ICONS[item.icon] || ICONS.plus;
        return '<div class="service-card">' +
          '<div class="icon-badge"><svg width="24" height="24" viewBox="0 0 24 24" fill="none">' + shape + '</svg></div>' +
          '<h3>' + HH.esc(item.title) + '</h3>' +
          '<p>' + HH.esc(item.description) + '</p>' +
        '</div>';
      }).join('');
      grid.classList.add('is-visible');
    },

    renderClinicInfo: function (root) {
      var info = HH.getClinicInfo();
      var doc = root || document;

      doc.querySelectorAll('[data-hh-phone]').forEach(function (el) { el.textContent = info.phone; });
      doc.querySelectorAll('[data-hh-phone-href]').forEach(function (el) { el.setAttribute('href', 'tel:' + info.phone); });
      doc.querySelectorAll('[data-hh-wa-href]').forEach(function (el) { el.setAttribute('href', 'https://wa.me/' + info.whatsapp); });
      doc.querySelectorAll('[data-hh-address]').forEach(function (el) { el.innerHTML = info.addressLine1 + '<br>' + info.addressCity; });
      doc.querySelectorAll('[data-hh-hours]').forEach(function (el) { el.textContent = info.hoursFull; });
      doc.querySelectorAll('[data-hh-hours-short]').forEach(function (el) { el.textContent = info.hoursShort; });

      var schemaScript = doc.querySelector('script[type="application/ld+json"]');
      if (schemaScript) {
        try {
          var schema = JSON.parse(schemaScript.textContent);
          schema.telephone = info.phone;
          if (schema.address) {
            schema.address.streetAddress = info.addressLine1;
            schema.address.addressLocality = info.addressCity.split(',')[0].trim();
            schema.address.addressRegion = info.addressCity.split(',')[1] ? info.addressCity.split(',')[1].trim() : '';
          }
          if (schema.openingHoursSpecification) {
            schema.openingHoursSpecification.opens = info.hoursOpen;
            schema.openingHoursSpecification.closes = info.hoursClose;
          }
          schemaScript.textContent = JSON.stringify(schema, null, 2);
        } catch (e) { /* ignore */ }
      }
    },

    renderAll: function (root) {
      HH.renderSectionCopy(root);
      HH.renderSpecialties(root);
      HH.renderDoctors(root);
      HH.renderServices(root);
      HH.renderClinicInfo(root);
      HH.renderTherapies(root);
      HH.renderDirectory(root);
      HH.renderBlogPosts(root);
      HH.renderBookingOptions(root);
    },

    /* ----- Therapies: renders the grouped therapy cards on the services page ----- */
    renderTherapies: function (root) {
      var doc = root || document;
      var data = HH.getTherapies();
      var groups = (data && Array.isArray(data.groups) ? data.groups : [])
        .filter(function (g) { return g.visible !== false; });

      doc.querySelectorAll('[data-hh-therapies]').forEach(function (host) {
        if (!groups.length) { host.innerHTML = ''; return; }

        var html = groups.map(function (g) {
          var items = (Array.isArray(g.items) ? g.items : []).filter(function (i) { return i.visible !== false; });
          if (!items.length) return '';

          var list = items.map(function (item) {
            return '<li class="therapy-group-item">' +
              '<h3>' + HH.esc(item.name) + '</h3>' +
              '<p>' + HH.esc(item.description || '') + '</p>' +
              '</li>';
          }).join('');

          return '<section class="section-bordered therapies-section">' +
            '<div class="container">' +
              '<div class="section-head">' +
                '<span class="section-tag">' + HH.esc(g.tag || '') + '</span>' +
                '<h2>' + HH.esc(g.title) + '</h2>' +
                '<p>' + HH.esc(g.intro || '') + '</p>' +
              '</div>' +
              '<article class="therapy-group therapy-group--' + HH.esc(g.id) + '">' +
                '<header class="therapy-group-head">' +
                  '<span class="therapy-group-count">' + items.length + ' therapies</span>' +
                '</header>' +
                '<ul class="therapy-group-list">' + list + '</ul>' +
              '</article>' +
            '</div>' +
          '</section>';
        }).join('');

        host.innerHTML = html;
        var first = host.querySelector('.therapies-section');
        if (first) first.classList.add('therapies-section--first');
      });
    },

    /* ----- What-we-treat directory lists ----- */
    renderDirectory: function (root) {
      var doc = root || document;
      var data = HH.getDirectory();

      function fill(id, items) {
        doc.querySelectorAll('#' + id).forEach(function (el) {
          var list = (Array.isArray(items) ? items : []).filter(function (i) {
            return i.visible !== false;
          }).map(function (i) {
            var name = typeof i === 'string' ? i : i.name;
            return '<div class="treat-list-item"><span class="treat-list-icon" aria-hidden="true">&rarr;</span><span>' +
              HH.esc(name) + '</span></div>';
          }).join('');
          el.innerHTML = list;
        });
      }

      // conditions come from the main conditions resource
      fill('treat-conditions', HH.getConditions());
      fill('treat-symptoms', data.symptoms);
      fill('treat-therapies', data.therapies);
      fill('treat-services', data.services);
    },

    /* ----- Blog posts ----- */
    renderBlogPosts: function (root) {
      var doc = root || document;
      var posts = HH.getBlogPosts().filter(function (p) { return p.visible !== false; });

      doc.querySelectorAll('[data-hh-blogposts]').forEach(function (host) {
        if (!posts.length) { host.innerHTML = ''; return; }
        host.innerHTML = posts.map(function (p) {
          var thumb = p.image
            ? '<div class="blog-img"><img src="' + HH.esc(p.image) + '" alt="' + HH.esc(p.title) + '" loading="lazy"></div>'
            : '';
          var meta = p.date
            ? '<span class="blog-date">' + HH.esc(p.date) + '</span>'
            : (p.tag ? '<span class="blog-tag">' + HH.esc(p.tag) + '</span>' : '');
          return '<article class="blog-card" data-blog-body="id:' + HH.esc(p.id) + '" role="button" tabindex="0">' +
            thumb +
            '<div class="blog-body">' +
              meta +
              '<h3>' + HH.esc(p.title) + '</h3>' +
              '<p>' + HH.esc(p.summary || '') + '</p>' +
              '<button type="button" class="read-more">Read More &rarr;</button>' +
            '</div>' +
          '</article>';
        }).join('');
      });
    },

    /* ----- Booking form dropdown options ----- */
    renderBookingOptions: function (root) {
      var doc = root || document;
      var opts = HH.getBookingOptions();

      function fillSelect(selector, values) {
        doc.querySelectorAll(selector).forEach(function (sel) {
          if (!Array.isArray(values) || !values.length) return;
          var current = sel.value;
          sel.innerHTML = '<option value="">Select</option>' + values.map(function (v) {
            return '<option>' + HH.esc(v) + '</option>';
          }).join('');
          if (current && values.indexOf(current) !== -1) sel.value = current;
        });
      }

      fillSelect('#appt-city', opts.cities);
      fillSelect('#appt-treatment', opts.treatments);
      fillSelect('#appt-service', opts.services);
      fillSelect('#appt-slot', opts.slots);
    }
  };

  window.HH = HH;
  // Expose cache so admin panel can write to it directly
  HH.cache = cache;

  /* ---------- Initial data fetch from API ---------- */
  function fetchAllData() {
    return Promise.all([
      apiGet('/doctors').then(function (d) { cache.doctors = d; }).catch(function () {}),
      apiGet('/specialties').then(function (d) { cache.specialties = d; }).catch(function () {}),
      apiGet('/services').then(function (d) { cache.services = d; }).catch(function () {}),
      apiGet('/section-copy').then(function (d) { cache.sectionCopy = d; }).catch(function () {}),
      apiGet('/clinic-info').then(function (d) { cache.clinicInfo = d; }).catch(function () {}),
      apiGet('/conditions').then(function (d) { cache.conditions = d; }).catch(function () {}),
      apiGet('/therapies').then(function (d) { cache.therapies = d; }).catch(function () {}),
      apiGet('/directory').then(function (d) { cache.directory = d; }).catch(function () {}),
      apiGet('/blogposts').then(function (d) { cache.blogposts = d; }).catch(function () {}),
      apiGet('/bookingoptions').then(function (d) { cache.bookingoptions = d; }).catch(function () {}),
      getAdminToken() ? apiGet('/appointments').then(function (d) { cache.appointments = d; }).catch(function () {}) : Promise.resolve()
    ]);
  }

  /* ---------- Polling for real-time sync ---------- */
  var lastKnownVersion = 0;

  function pollForChanges() {
    apiGet('/version').then(function (data) {
      if (data.version > lastKnownVersion) {
        lastKnownVersion = data.version;
        fetchAllData().then(function () {
          HH.renderAll();
          window.dispatchEvent(new CustomEvent('hh-content-updated'));
        });
      }
    }).catch(function () {});
  }

  /* ---------- Boot ---------- */
  function boot() {
    fetchAllData().then(function () {
      HH.renderAll();

      // Start polling after initial render
      setInterval(pollForChanges, POLL_INTERVAL);

      // Also poll on visibility change (when user switches back to tab)
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) pollForChanges();
      });
    }).catch(function () {
      // Even if API fails, still render with defaults
      HH.renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
