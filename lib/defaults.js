/* ============================================================
   Default / static content
   ------------------------------------------------------------
   These values are the fallbacks used when a document is missing,
   mirroring DEFAULTS in the old server.js. The two large JSON
   reference files are bundled at build time (they are static —
   the admin panel never edits them).
   ============================================================ */

// static reference data, bundled with the function
const contentDefault = require('../data/content.default.json');
const contentSchema = require('../data/content-schema.json');

const DEFAULTS = {
  doctors: [
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
  ],
  specialties: [
    { id: 'sp-neuro', title: 'Neuro Physiotherapy — Rehab', photo: 'images/doctor-prakash.jpeg', alt: 'Physiotherapist providing attentive care', visible: true },
    { id: 'sp-sports', title: 'Sports Physiotherapy', photo: 'images/treatment-room-1.jpeg', alt: 'Prepared physiotherapy treatment room', visible: true },
    { id: 'sp-paed', title: 'Paediatric Physiotherapy', photo: 'images/gym-room.jpeg', alt: 'Rehabilitation gym with walking bars', visible: true },
    { id: 'sp-geri', title: 'Geriatric Physiotherapy', photo: 'images/doctor-kalyani.jpeg', alt: 'Healing Hands physiotherapist', visible: true },
    { id: 'sp-home', title: 'Home Care Physiotherapy', photo: 'images/treatment-room-2.jpeg', alt: 'Clinic treatment area', visible: true },
    { id: 'sp-chiro', title: 'Chiropractor Treatment', photo: 'images/treatment-room-3.jpeg', alt: 'Quiet physiotherapy consultation room', visible: true }
  ],
  services: [
    { id: 'sv-basic', title: 'Basic treatment (any two electrotherapy modalities)', icon: 'plus', visible: true, description: 'Includes IFT, Ultrasound, TENS, Stimulator, Hydrocollator packs, Traction, Infrared radiation and Taping — any two modalities per session.', price: '400' },
    { id: 'sv-manual', title: 'Manual therapy', icon: 'tools', visible: true, description: 'Hands-on techniques including joint mobilisation, manipulation and soft tissue work to restore movement and reduce pain.', price: '500' },
    { id: 'sv-cupping', title: 'Cupping therapy', icon: 'clock', visible: true, description: 'An ancient healing practice with a strong place in modern physiotherapy — used for pain relief, muscle recovery and improving blood flow.', price: '600' },
    { id: 'sv-dryneedle', title: 'Dry needle therapy', icon: 'pulse', visible: true, description: 'Also known as Trigger Point Dry Needling — a procedure using thin needles to release myofascial trigger points and relieve muscle pain.', price: '800' }
  ],
  sectionCopy: {
    specialties: { tag: 'Care for every stage of life', heading: 'Find the right physiotherapy for you', intro: 'Focused treatment plans for pain, mobility, rehabilitation and recovery, delivered in our clinic or at home.' },
    doctors: { tag: 'Meet the team', heading: 'The physiotherapists behind your care', intro: 'Every session at Healing Hands is led directly by one of our qualified physiotherapists — never handed off.' },
    services: { tag: 'Our treatments', heading: 'Treatment', intro: 'Better movement. Better recovery. Better life. Personalized, hands-on physiotherapy for pain management, better movement and lasting recovery.' }
  },
  clinicInfo: {
    phone: '+918523841691', whatsapp: '918523841691',
    address: "H.No: 1-7-1204, Advocate's Colony Main Road, Opposite: Canara Bank, Beside: Blue Star A/C Showroom, Balasamudram, Hanamkonda, Telangana 506001",
    addressLine1: "H.No: 1-7-1204, Advocate's Colony Main Road", addressCity: 'Hanamkonda, Warangal, Telangana 506001',
    hoursDays: 'Mon-Sun', hoursOpen: '10:00 AM', hoursClose: '8:30 PM',
    hoursFull: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM', hoursShort: 'Mon-Sat: 10:00 AM - 8:30 PM | Sun: 3:00 PM - 8:30 PM'
  },
  passcode: 'healinghands2026'
};

function defaultContent() {
  return contentDefault;
}

function contentSchemaJson() {
  return contentSchema;
}

/* ---------- Image library ----------
   The old /api/images endpoint walked the filesystem at request time.
   A serverless function has no writable filesystem, so the static
   images/ tree is enumerated at BUILD time into a manifest by
   `node scripts/build-image-manifest.js` and uploaded uploads are
   listed from Supabase Storage at request time. */
let imageManifest = [];
try {
  imageManifest = require('./image-manifest.json');
  if (!Array.isArray(imageManifest)) imageManifest = [];
} catch (e) {
  imageManifest = [];
}

module.exports = { DEFAULTS, defaultContent, contentSchemaJson, imageManifest };