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
      id: 'doc-prakash', name: 'Dr. A. Prakash (PT)', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Evenings', credentials: 'BPT, FNMT, CMT',
      bio: 'Specialist in Dry Needling and Cupping Therapy. Ex-Physiotherapist at Singareni Hospitals for 7 years. 15 years of clinic experience. Advanced Pain Management and Rehabilitation Therapist.',
      bioAbout: 'Dr. Prakash is a specialist in Dry Needling and Cupping Therapy with 15 years of clinic experience, including 7 years as Physiotherapist at Singareni Hospitals. He is an Advanced Pain Management and Rehabilitation Therapist.',
      photo: 'images/doctor-prakash.jpeg', visible: true
    },
    {
      id: 'doc-kalyani', name: 'Dr. U. Kalyani (PT)', role: 'Physiotherapist',
      roleAbout: 'Physiotherapist · Morning & afternoon', credentials: 'BPT, CDNT, CMT',
      bio: 'Dr. Kalyani has 12 years of experience, focusing on musculoskeletal pain, post-injury rehab and personalised exercise plans.',
      bioAbout: 'Dr. Kalyani has 12 years of experience working with patients on musculoskeletal pain, joint conditions and rehabilitation after injury, combining manual assessment with structured home exercise guidance.',
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
    { id: 'sv-neuro', title: 'Neuro Physiotherapy — Rehab', icon: 'plus', visible: true, description: 'Stroke recovery, spinal cord injury rehab, cerebral palsy management and neurological condition support.' },
    { id: 'sv-sports', title: 'Sports Physiotherapy', icon: 'tools', visible: true, description: 'Sports injury treatment, ligament rehab, return-to-play programmes and athletic performance support.' },
    { id: 'sv-paed', title: 'Paediatric Physiotherapy', icon: 'clock', visible: true, description: 'Developmental delays, cerebral palsy, torticollis, clubfoot and childhood musculoskeletal conditions.' },
    { id: 'sv-geri', title: 'Geriatric Physiotherapy', icon: 'activity', visible: true, description: 'Balance training, fall prevention, joint pain management and mobility support for older adults.' },
    { id: 'sv-home', title: 'Home Care Physiotherapy', icon: 'home', visible: true, description: 'In-home physiotherapy sessions for patients who are unable to travel to the clinic.' },
    { id: 'sv-chiro', title: 'Chiropractor Treatment', icon: 'pulse', visible: true, description: 'Spinal manipulation, joint mobilisation and musculoskeletal alignment for pain relief.' }
  ];

  var DEFAULT_SECTION_COPY = {
    specialties: { tag: 'Care for every stage of life', heading: 'Find the right physiotherapy for you', intro: 'Focused treatment plans for pain, mobility, rehabilitation and recovery, delivered in our clinic or at home.' },
    doctors: { tag: 'Meet the team', heading: 'The physiotherapists behind your care', intro: 'Every session at Healing Hands is led directly by one of our qualified physiotherapists — never handed off.' },
    services: { tag: 'Our services', heading: 'Services offered', intro: 'Specialised physiotherapy services delivered by qualified, experienced physiotherapists.' }
  };

  var DEFAULT_CLINIC_INFO = {
    phone: '+918523841691', whatsapp: '918523841691',
    address: 'CANARA BANK, H, No. 1 Opp:, 7-1204, Advocates Colony, Nakkala Gutta, Hanamkonda, Telangana 506001',
    addressLine1: 'CANARA BANK, H, No. 1 Opp:, 7-1204, Advocates Colony, Nakkala Gutta', addressCity: 'Hanamkonda, Telangana 506001',
    hoursDays: 'Mon–Sat', hoursOpen: '10:00 AM', hoursClose: '8:30 PM',
    hoursFull: 'Mon–Sat, 10:00 AM – 8:30 PM', hoursShort: 'Mon–Sat: 10:00 AM – 8:30 PM'
  };

  var STATUSES = ['New', 'Confirmed', 'Completed', 'Cancelled'];

  /* ---------- In-memory cache ---------- */
  var cache = {
    doctors: null,
    specialties: null,
    services: null,
    sectionCopy: null,
    clinicInfo: null,
    appointments: null
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
          var bio = variant === 'about' ? (doc.bioAbout || doc.bio) : doc.bio;
          return '<div class="doctor-card" data-doctor-idx="' + idx + '">' +
            '<div class="doctor-photo"><img src="' + HH.esc(doc.photo) + '" alt="' +
              HH.esc(doc.name + ', ' + (doc.role || 'Physiotherapist') + ' at Healing Hands') +
              '" loading="lazy"></div>' +
            '<div class="doctor-body">' +
              '<span class="doctor-role">' + HH.esc(role) + '</span>' +
              '<h3>' + HH.esc(doc.name) + '</h3>' +
              '<p class="credentials">' + HH.esc(doc.credentials) + '</p>' +
              '<p class="bio">' + HH.esc(bio) + '</p>' +
              '<button class="btn btn-outline doctor-read-more" data-doctor-idx="' + idx + '">Read More →</button>' +
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
