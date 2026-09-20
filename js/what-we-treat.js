document.addEventListener('DOMContentLoaded', () => {
  const symptoms = [
    'Muscle Stiffness', 'Muscle Spasm', 'Crepitus – Cracking Joints',
    'Numbness and Tingling', 'Neck Pain', 'Back Pain', 'Knee Pain',
    'Shoulder Pain', 'Joint Pain', 'Foot Pain', 'Loss of Balance',
    'Tremors', 'Headache', 'Inflammation', 'Sprains and Strains'
  ];
  const therapies = [
    'Interferential Therapy (IFT)', 'Chiropractic Therapy', 'Ultrasound Therapy',
    'Laser Therapy', 'Cupping Therapy', 'Dry Needling', 'Manual Therapy',
    'Exercise Therapy', 'Kinesiology Taping', 'Joint Mobilisation',
    'Muscle Energy Technique', 'Balance Training'
  ];
  const services = [
    'Chiropractor Treatment', 'Neuro Physiotherapy – Rehab', 'Sports Physiotherapy',
    'Paediatric Physiotherapy', 'Geriatric Physiotherapy', 'Home Care Physiotherapy',
    'Post-Surgical Rehabilitation', 'Pain Management', 'Mobility Rehabilitation',
    'Injury Prevention Programmes'
  ];
  const conditions = Array.isArray(window.CONDITIONS_DATA)
    ? window.CONDITIONS_DATA.map(item => item.name)
    : [];

  const render = (id, items) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.innerHTML = items.map(item =>
      `<div class="treat-list-item"><span class="treat-list-icon" aria-hidden="true">→</span><span>${item}</span></div>`
    ).join('');
  };

  render('treat-conditions', conditions);
  render('treat-symptoms', symptoms);
  render('treat-therapies', therapies);
  render('treat-services', services);
});
