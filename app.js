// ─── Analytics ────────────────────────────────────────────────────────────────
function track(event, params) {
  if (typeof gtag === 'function') gtag('event', event, params);
}

// ─── Resource Link Copy ──────────────────────────────────────────────────────
function copyResLink(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '&#x2713;';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '&#x1F4CB;'; }, 1500);
  });
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
window.onerror = (msg, src, line) => {
  console.error('Unhandled error:', msg, src, line);
  const t = document.getElementById('toast');
  if (t) { t.textContent = 'Something went wrong \u2014 try refreshing'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000); }
};

// ─── Auth Gate ────────────────────────────────────────────────────────────────
const AUTH_SESSION_KEY = 'playlab_auth_ok';
const AUTH_HASH = '19c64195eb8f22c39b4bad63078823ddd82e6d61847b25f1f5b969be6c891661';

async function checkPassphrase(input) {
  const encoded = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('') === AUTH_HASH;
}

function unlockApp() { document.getElementById('authGate').classList.add('hidden'); }

function initAuthGate() {
  if (sessionStorage.getItem(AUTH_SESSION_KEY)) { unlockApp(); return; }
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('authPassInput').value;
    if (await checkPassphrase(input)) {
      sessionStorage.setItem(AUTH_SESSION_KEY, '1');
      track('login', { method: 'passphrase' });
      unlockApp();
    } else {
      document.getElementById('authError').classList.add('show');
      document.getElementById('authPassInput').value = '';
      document.getElementById('authPassInput').focus();
    }
  });
  document.getElementById('authPassInput').focus();
}
initAuthGate();

// ─── Currency ──────────────────────────────────────────────────────────────────
const CURRENCIES = {
  USD: { symbol: '$', prefix: true, rate: 1 },
  EUR: { symbol: '\u20AC', prefix: true, rate: 0.92 },
  GBP: { symbol: '\u00A3', prefix: true, rate: 0.79 },
  CHF: { symbol: 'Fr\u00A0', prefix: true, rate: 0.88 },
  SEK: { symbol: '\u00A0kr', prefix: false, rate: 10.5 },
  NOK: { symbol: '\u00A0kr', prefix: false, rate: 10.8 },
  DKK: { symbol: '\u00A0kr', prefix: false, rate: 6.85 },
  GHS: { symbol: 'GH\u20B5', prefix: true, rate: 10.8 },
  INR: { symbol: '\u20B9', prefix: true, rate: 91.83 }
};
let selectedCurrency = 'USD';
let ratesLastUpdated = null;
function getCurrency() { return CURRENCIES[selectedCurrency] || CURRENCIES.USD; }
function convertAmount(usdAmount) { return Math.round(usdAmount * getCurrency().rate); }

function fetchLiveRates() {
  const cacheKey = 'playlab_fx_rates';
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (Date.now() - data.fetchedAt < 24 * 60 * 60 * 1000) { applyLiveRates(data.rates, data.date); return; }
    } catch {}
  }
  fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CHF,SEK,NOK,DKK,INR')
    .then(r => r.json())
    .then(data => {
      if (data.rates) {
        sessionStorage.setItem(cacheKey, JSON.stringify({ rates: data.rates, date: data.date, fetchedAt: Date.now() }));
        applyLiveRates(data.rates, data.date);
      }
    }).catch(() => {});

  const ghsCacheKey = 'playlab_fx_ghs';
  const ghsCached = sessionStorage.getItem(ghsCacheKey);
  if (ghsCached) {
    try {
      const d = JSON.parse(ghsCached);
      if (Date.now() - d.fetchedAt < 24 * 60 * 60 * 1000 && d.rate) { CURRENCIES.GHS.rate = d.rate; return; }
    } catch {}
  }
  fetch('https://open.er-api.com/v6/latest/USD')
    .then(r => r.json())
    .then(data => {
      if (data.rates?.GHS) {
        CURRENCIES.GHS.rate = data.rates.GHS;
        sessionStorage.setItem(ghsCacheKey, JSON.stringify({ rate: data.rates.GHS, fetchedAt: Date.now() }));
        if (selectedCurrency === 'GHS') renderAll();
      }
    }).catch(() => {});
}

function applyLiveRates(rates, date) {
  for (const k of ['EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'INR']) {
    if (rates[k]) CURRENCIES[k].rate = rates[k];
  }
  ratesLastUpdated = date;
  if (selectedCurrency !== 'USD') renderAll();
  const sel = document.getElementById('currencySelect');
  if (sel) sel.title = 'ECB rates as of ' + date;
}

// ─── Rates & Block Prices ──────────────────────────────────────────────────────
const DEFAULT_RATES = { lp: 250, dev: 200, travel: 125 };
let rates = { ...DEFAULT_RATES };

function roundPrice(n) {
  if (n >= 10000) return Math.round(n / 1000) * 1000;
  if (n >= 1000)  return Math.round(n / 100) * 100;
  if (n >= 500)   return Math.round(n / 50) * 50;
  return Math.round(n / 25) * 25;
}

function getBlockPrice(blockId) {
  const { lp, dev, travel: tr } = rates;
  switch (blockId) {
    case 'office-hours':      return roundPrice(lp * 1.0);
    case 'admin-meetings':    return roundPrice(lp * 1.2);
    case 'facilitation':      return roundPrice(lp * 2.4);
    case 'dev-hourly':        return roundPrice(dev * 1.0);
    case 'app-support-light': return roundPrice(dev * 5.0);
    case 'app-support-medium':return roundPrice(dev * 10.0);
    case 'app-support-full':  return roundPrice(dev * 20.0);
    case 'travel-local':      return roundPrice((tr + 99.5)   * 1.15 * 0.98);
    case 'travel-flight':     return roundPrice((tr * 8 + 600) * 1.25);
    case 'travel-addl-day':   return roundPrice((tr + 375)    * 1.15 * 1.04);
    case 'site-visit-half':   return roundPrice((lp * 3 + tr + lp * 2) * 1.09);
    case 'site-visit-full':   return roundPrice((lp * 6 + tr + lp * 2) * 1.16);
    case 'ideation-lp':       return roundPrice(lp * 10);
    case 'ideation-lp-le':    return roundPrice(lp * 14 * 1.15);
    case 'tool-build-initial':return roundPrice((lp + dev) * 10 * 1.1);
    case 'tool-build-addl':   return roundPrice(lp * 2 + dev * 10);
    case 'tool-pilot':        return roundPrice((lp * 16 + dev * 8) * 1.16);
    case 'tool-revision-light': return roundPrice(dev * 6 * 1.25);
    case 'tool-revision-medium':return roundPrice(dev * 14);
    case 'tool-revision-full':  return roundPrice(dev * 22 * 1.15 * 0.99);
    case 'knowledge-graph':     return 1500;
    case 'ai-usage-costs':      return 300;
    case 'coaching-retainer-essentials': return 500;
    case 'coaching-retainer-advisory': return 1000;
    case 'coaching-retainer-strategic': return 2500;
    case 'coaching-retainer-embedded': return 5000;
    case 'one-time-event':            return 500;
    default: return 0;
  }
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n) {
  const cur = getCurrency();
  const formatted = Math.round(convertAmount(n)).toLocaleString('en-US');
  return cur.prefix ? cur.symbol + formatted : formatted + cur.symbol;
}
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function unitShort(unit) {
  const map = { hr: 'hr', mo: 'mo', day: 'day', trip: 'trip', visit: 'visit', flat: '\u00D7' };
  return map[unit] || unit;
}

// ─── Software Tiers (Enterprise only) ───────────────────────────────────────
const SOFTWARE_TIERS = [
  { id: 'play', name: 'Play', tagline: '6-mo or 12-mo for any organization', pricePerUnit: 1500, unitLabel: 'org', unitLabelPlural: 'orgs', minCount: 1, defaultCount: 1, priceNote: '$1,500/6-mo or $3,000/12-mo per org', periodLabel: '/6-mo', educators: '100 educators', students: '1,000 students', color: '#ffc937', colorLight: '#fef9e7', colorText: '#8a6d00' },
  { id: 'impact', name: 'Impact', tagline: 'Best for small school deployments and non-school organizations', pricePerUnit: 200, unitLabel: 'user', unitLabelPlural: 'users', minCount: 1, defaultCount: 5, hasStudentInput: true, defaultStudents: 500, color: '#7ee4bb', colorLight: '#edfdf5', colorText: '#1a6b4a' },
  { id: 'schools-t1', name: 'Schools — Tier 1', tagline: '1,000–9,999 students', pricePerUnit: 3, unitLabel: 'student', unitLabelPlural: 'students', minCount: 1000, defaultCount: 5000, priceNote: '$3.00/student/year', enrollmentRange: '1,000–9,999', monthlyCredits: '2M Tokens', isSchool: true },
  { id: 'schools-t2', name: 'Schools — Tier 2', tagline: '10,000–24,999 students', pricePerUnit: 2.50, unitLabel: 'student', unitLabelPlural: 'students', minCount: 10000, defaultCount: 15000, priceNote: '$2.50/student/year', enrollmentRange: '10,000–24,999', monthlyCredits: '4M Tokens', isSchool: true },
  { id: 'schools-t3', name: 'Schools — Tier 3', tagline: '25,000–49,999 students', pricePerUnit: 2, unitLabel: 'student', unitLabelPlural: 'students', minCount: 25000, defaultCount: 35000, priceNote: '$2.00/student/year', enrollmentRange: '25,000–49,999', monthlyCredits: '6M Tokens', isSchool: true },
  { id: 'schools-t4', name: 'Schools — Tier 4', tagline: '50,000+ students', pricePerUnit: 0, unitLabel: 'student', unitLabelPlural: 'students', minCount: 50000, defaultCount: 50000, priceNote: 'Custom pricing', enrollmentRange: '50,000+', monthlyCredits: 'Custom', isCustom: true, isSchool: true }
];

function getSchoolTierForEnrollment(count) {
  if (count >= 50000) return SOFTWARE_TIERS.find(t => t.id === 'schools-t4');
  if (count >= 25000) return SOFTWARE_TIERS.find(t => t.id === 'schools-t3');
  if (count >= 10000) return SOFTWARE_TIERS.find(t => t.id === 'schools-t2');
  return SOFTWARE_TIERS.find(t => t.id === 'schools-t1');
}

// Software licenses in quote (multiple allowed)
let quoteLicenses = [];
let nextLicenseId = 1;

function calcLicenseCost(lic) {
  const tier = SOFTWARE_TIERS.find(t => t.id === lic.tierId);
  if (!tier) return 0;
  if (tier.isCustom) return 0; // Custom pricing — show as "Custom"
  return tier.pricePerUnit * lic.count;
}

function calcTotalSoftware() {
  return quoteLicenses.reduce((sum, lic) => sum + calcLicenseCost(lic), 0);
}

function addLicense(tierId, count, students) {
  const tier = SOFTWARE_TIERS.find(t => t.id === tierId);
  if (!tier) return;
  const c = count || tier.defaultCount;
  const lic = { licenseId: nextLicenseId++, tierId, count: c, customName: '' };
  if (tier.hasStudentInput) lic.students = students || tier.defaultStudents || 0;
  quoteLicenses.push(lic);
  track('add_license', { tier_name: tier.name, tier_id: tierId, count: c });
  renderSwCards();
  renderLicenseList();
  renderTotals();
  showToast(`Added: ${tier.name}`);
}

function removeLicense(licenseId) {
  quoteLicenses = quoteLicenses.filter(l => l.licenseId !== licenseId);
  renderSwCards();
  renderLicenseList();
  renderTotals();
}

function updateLicenseName(licenseId, name) {
  const lic = quoteLicenses.find(l => l.licenseId === licenseId);
  if (!lic) return;
  lic.customName = name;
  saveToUrl();
}

function updateLicenseCount(licenseId, input, clamp) {
  const lic = quoteLicenses.find(l => l.licenseId === licenseId);
  if (!lic) return;
  const tier = SOFTWARE_TIERS.find(t => t.id === lic.tierId);
  let val = parseFloat(input.value);
  if (clamp) {
    if (isNaN(val) || val < tier.minCount) val = tier.minCount;
    val = Math.round(val);
    input.value = val;
  }
  if (!isNaN(val) && val >= 1) lic.count = Math.round(val);
  renderLicenseList();
  renderTotals();
  saveToUrl();
}

// ─── Package Definitions ───────────────────────────────────────────────────────
const PATHWAYS = [
  { id: 'educators', name: 'AI Agency for Educators', color: '#0EA5E9', desc: 'From AI Curious to AI Creator' },
  { id: 'students', name: 'AI Agency for Students & Families', color: '#f97316', desc: 'Understand, build, and shape AI' },
  { id: 'impact', name: 'Solutions for AI Impact', color: '#8b5cf6', desc: 'Design and build AI solutions for real challenges' },
  { id: 'coaching', name: 'AI Leadership Coaching', color: '#10b981', desc: 'Strategic AI guidance for school-system leaders' }
];

const PACKAGES = [
  // Educators: Core Packages
  { id: 'edu-starter', pathway: 'educators', name: 'Starter Package', subtitle: '3 hrs + supports', badge: 'Recommended Start',
    desc: 'A foundational introduction where participants learn how AI works and build their first simple AI tool.',
    facilitationHours: 3,
    components: [
      { blockId: 'facilitation', qty: 3, label: 'Facilitation', scalable: true }
    ] },
  { id: 'edu-core', pathway: 'educators', name: 'Core Package', subtitle: '6 hrs + supports', badge: 'Most Popular',
    desc: 'A deeper learning experience for teams ready to move beyond basics to intentional design with advanced features.',
    facilitationHours: 6,
    components: [
      { blockId: 'facilitation', qty: 6, label: 'Facilitation', scalable: true }
    ] },
  { id: 'edu-full', pathway: 'educators', name: 'Full Agency Package', subtitle: '9 hrs + supports', badge: 'Gold Standard',
    desc: 'Our most comprehensive experience \u2014 from understanding AI to designing advanced tools, evaluating impact, and a final showcase.',
    facilitationHours: 9,
    components: [
      { blockId: 'facilitation', qty: 9, label: 'Facilitation', scalable: true }
    ] },
  // Educators: Smaller Options
  { id: 'edu-intro', pathway: 'educators', name: 'Intro Workshop', subtitle: '90 minutes', badge: 'Quick Start',
    desc: 'Educators learn how AI works and build a simple AI tool. Ideal to introduce key leaders to Playlab.',
    facilitationHours: 1.5,
    components: [
      { blockId: 'facilitation', qty: 1.5, label: 'Facilitation', scalable: true }
    ] },
  { id: 'edu-powerup', pathway: 'educators', name: 'Power-Up: New Features', subtitle: '3 hrs', badge: 'Renewal Add-On',
    desc: 'Educators explore new Playlab features (python, voice, knowledge graph, etc.) and incorporate them into their builds. 50% discount for renewal partners.',
    facilitationHours: 3,
    components: [
      { blockId: 'facilitation', qty: 3, label: 'Facilitation', scalable: true }
    ] },
  // Students
  { id: 'stu-starter', pathway: 'students', name: 'Starter Sprint', subtitle: '3 hrs', badge: 'Student Sprint',
    desc: 'A foundational introduction where students learn how AI works and build their first simple AI tool.',
    facilitationHours: 3,
    components: [
      { blockId: 'facilitation', qty: 3, label: 'Student Facilitation', scalable: true }
    ] },
  { id: 'stu-core', pathway: 'students', name: 'Core Sprint', subtitle: '6 hrs', badge: 'Most Popular',
    desc: 'A deeper experience where students intentionally design AI tools that address a real school or community challenge.',
    facilitationHours: 6,
    components: [
      { blockId: 'facilitation', qty: 6, label: 'Student Facilitation', scalable: true }
    ] },
  { id: 'stu-full', pathway: 'students', name: 'Full Sprint', subtitle: '9 hrs', badge: 'Full Experience',
    desc: 'Our most comprehensive student experience \u2014 from understanding AI to designing advanced tools, culminating in a showcase.',
    facilitationHours: 9,
    components: [
      { blockId: 'facilitation', qty: 9, label: 'Student Facilitation', scalable: true }
    ] },
  { id: 'stu-pd', pathway: 'students', name: 'Educator PD for Student AI', subtitle: '5\u20137 hrs + supports', badge: 'Educator Prep',
    desc: 'Prepare your educators to deliver student AI experiences. Playlab facilitates training using proven structure, tailored to your chosen curriculum.',
    facilitationHours: 6,
    components: [
      { blockId: 'facilitation', qty: 6, label: 'Facilitation', scalable: true }
    ] },
  // AI Impact
  { id: 'impact-ideation', pathway: 'impact', name: 'Ideation', subtitle: '~4 hr facilitated session', badge: 'Discovery',
    desc: 'Identify where AI can meaningfully improve teaching, learning, or operations. Teams generate ideas, evaluate feasibility, and select 2\u20133 high-priority use cases.',
    facilitationHours: null,
    components: [
      { blockId: 'ideation-lp-le', qty: 1, label: 'Ideation (LP + LE)', scalable: false }
    ] },
  { id: 'impact-build', pathway: 'impact', name: 'Tool Build \u2014 Initial', subtitle: '~8 hrs collab + ~16 hrs engineering', badge: 'Build',
    desc: 'Playlab partners with your team to design and build a custom AI tool \u2014 requirements, engineering, and multiple cycles of testing and refinement.',
    facilitationHours: null,
    components: [
      { blockId: 'tool-build-initial', qty: 1, label: 'Tool Build (Initial)', scalable: false }
    ] },
  { id: 'impact-build-addl', pathway: 'impact', name: 'Tool Build \u2014 Additional', subtitle: 'Streamlined build', badge: 'Build +',
    desc: 'Additional custom AI tool build, streamlined after initial.',
    facilitationHours: null,
    components: [
      { blockId: 'tool-build-addl', qty: 1, label: 'Tool Build (Additional)', scalable: false }
    ] },
  { id: 'impact-pilot', pathway: 'impact', name: 'Pilot Support', subtitle: '~8 hrs collaboration', badge: 'Pilot',
    desc: 'Design and launch a pilot to test AI tools in real contexts. Plan implementation, train early users, evaluate results, and refine.',
    facilitationHours: null,
    components: [
      { blockId: 'tool-pilot', qty: 1, label: 'Pilot Support', scalable: false }
    ] },
  { id: 'impact-full', pathway: 'impact', name: 'Full AI Impact Pathway', subtitle: 'Ideation \u2192 Build \u2192 Pilot', badge: 'Highest Value',
    desc: 'All blocks plus three tool builds at a 20% discount. Each block builds toward the next \u2014 from ideation to building solutions to implementing at scale.',
    facilitationHours: null,
    pathwayDiscount: 0.2,
    components: [
      { blockId: 'ideation-lp-le', qty: 1, label: 'Ideation', scalable: false },
      { blockId: 'tool-build-initial', qty: 1, label: 'Tool Build (Initial)', scalable: false },
      { blockId: 'tool-build-addl', qty: 2, label: 'Tool Build (Additional)', scalable: false },
      { blockId: 'tool-pilot', qty: 1, label: 'Pilot Support', scalable: false }
    ] },
  // AI Leadership Coaching
  { id: 'coaching-retainer-essentials', pathway: 'coaching', name: 'Essentials', subtitle: '$500/mo · 6-mo min', badge: 'Sounding Board',
    desc: 'A monthly check-in call with pre- and post-email follow-up. Ideal for leaders who need a sounding board as they navigate early AI decisions.',
    facilitationHours: null, isCoachingRetainer: true,
    components: [
      { blockId: 'coaching-retainer-essentials', qty: 6, label: 'Essentials Retainer', scalable: false }
    ] },
  { id: 'coaching-retainer-advisory', pathway: 'coaching', name: 'Advisory', subtitle: '$1,000/mo · 6-mo min', badge: 'Recommended',
    desc: 'Scheduled calls plus email support. Light-touch strategic check-ins to keep AI adoption on track.',
    facilitationHours: null, isCoachingRetainer: true,
    components: [
      { blockId: 'coaching-retainer-advisory', qty: 6, label: 'Advisory Retainer', scalable: false }
    ] },
  { id: 'coaching-retainer-strategic', pathway: 'coaching', name: 'Strategic', subtitle: '$2,500/mo · 6-mo min', badge: 'Deep Engagement',
    desc: 'Regular strategy sessions plus ongoing email and call access. Enough to actively shape an AI roadmap and drive decisions.',
    facilitationHours: null, isCoachingRetainer: true,
    components: [
      { blockId: 'coaching-retainer-strategic', qty: 6, label: 'Strategic Retainer', scalable: false }
    ] },
  { id: 'coaching-retainer-embedded', pathway: 'coaching', name: 'Embedded', subtitle: '$5,000/mo · 6-mo min', badge: 'Fractional Advisor',
    desc: 'Near-fractional advisor. Weekly touchpoints, strategy plus hands-on app guidance, and stakeholder prep.',
    facilitationHours: null, isCoachingRetainer: true,
    components: [
      { blockId: 'coaching-retainer-embedded', qty: 6, label: 'Embedded Retainer', scalable: false }
    ] }
];

// ─── Add-On Definitions ────────────────────────────────────────────────────────
const ADDONS = [
  { blockId: 'office-hours', label: 'Office Hours', unit: 'hr', defaultQty: 1, minQty: 0.5, step: 0.5, category: 'Learning Partner', desc: 'Drop-in support for educators between sessions' },
  { blockId: 'admin-meetings', label: 'Admin Meetings', unit: 'hr', defaultQty: 1, minQty: 0.5, step: 0.5, category: 'Learning Partner', desc: 'Strategic planning time with leadership' },
  { blockId: 'facilitation', label: 'Extra Facilitation', unit: 'hr', defaultQty: 1.5, minQty: 1.5, step: 0.5, category: 'Learning Partner', desc: 'Additional live facilitation hours (up to 40 participants)' },
  { blockId: 'app-support-light', label: 'App Support \u2014 Light', unit: 'mo', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '5 hrs/mo of ongoing app maintenance and updates' },
  { blockId: 'app-support-medium', label: 'App Support \u2014 Medium', unit: 'mo', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '10 hrs/mo of ongoing app maintenance and updates' },
  { blockId: 'app-support-full', label: 'App Support \u2014 Full', unit: 'mo', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '20 hrs/mo of dedicated app maintenance and iteration' },
  { blockId: 'tool-revision-light', label: 'Tool Revision \u2014 Light', unit: 'flat', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '6 hrs/mo of learning engineer time for app refinement' },
  { blockId: 'tool-revision-medium', label: 'Tool Revision \u2014 Medium', unit: 'flat', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '12 hrs/mo of learning engineer time for app refinement' },
  { blockId: 'tool-revision-full', label: 'Tool Revision \u2014 Full', unit: 'flat', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: '22 hrs/mo of dedicated learning engineer iteration' },
  { blockId: 'knowledge-graph', label: 'Knowledge Graph', unit: 'flat', defaultQty: 1, minQty: 1, step: 1, category: 'Developer', desc: 'Standards-aligned curriculum mapping for AI apps' },
  { blockId: 'travel-flight', label: 'Travel \u2014 Flight', unit: 'trip', defaultQty: 1, minQty: 1, step: 1, category: 'Travel', desc: 'Round-trip flight with ground transport and per diem' },
  { blockId: 'travel-local', label: 'Travel \u2014 Local', unit: 'day', defaultQty: 1, minQty: 1, step: 1, category: 'Travel', desc: 'Local driving with mileage and per diem' },
  { blockId: 'travel-addl-day', label: 'Travel \u2014 Addl Day', unit: 'day', defaultQty: 1, minQty: 1, step: 1, category: 'Travel', desc: 'Extra day on-site with hotel and per diem' },
  { blockId: 'site-visit-half', label: 'Site Visit \u2014 Half Day', unit: 'visit', defaultQty: 1, minQty: 1, step: 1, category: 'Travel', desc: '1\u20134 hour on-site observation or working session' },
  { blockId: 'site-visit-full', label: 'Site Visit \u2014 Full Day', unit: 'visit', defaultQty: 1, minQty: 1, step: 1, category: 'Travel', desc: '4\u20138 hour on-site observation or working session' },
  { blockId: 'ai-usage-costs', label: 'AI Usage Costs', unit: 'mo', defaultQty: 1, minQty: 1, step: 1, category: 'Other', desc: 'Monthly AI model usage for non-school partners' },
  { blockId: 'one-time-event', label: 'One-Time Event', unit: 'flat', defaultQty: 1, minQty: 1, step: 1, category: 'Other', desc: 'Up to 100 people \u2014 2 months of access' }
];

// ─── Session Helpers ──────────────────────────────────────────────────────────
function distributeHours(totalHours, numSessions) {
  // Distribute totalHours evenly, rounded to nearest 0.5
  const base = Math.round((totalHours / numSessions) * 2) / 2;
  const sessions = [];
  let remaining = totalHours;
  for (let i = 0; i < numSessions; i++) {
    if (i === numSessions - 1) {
      // Last session gets remainder (rounded to 0.5)
      sessions.push({ hours: Math.round(remaining * 2) / 2, delivery: 'virtual' });
    } else {
      const hrs = Math.min(base, remaining);
      sessions.push({ hours: hrs, delivery: 'virtual' });
      remaining -= hrs;
    }
  }
  return sessions;
}

function getMaxSessions(totalHours) {
  // Max sessions = totalHours / 0.5 (minimum 0.5 hr per session), capped at 12
  return Math.min(12, Math.floor(totalHours / 0.5));
}

// ─── Quote State ──────────────────────────────────────────────────────────────
let quotePackages = [];
let quoteAddons = [];
let nextPkgId = 1;
let nextAddonId = 1;
let expandedPkgId = null;

// Config state for inline add panel (per package card)
let activeConfigPkgId = null;
let configState = {};

// ─── Package Price Calculations ────────────────────────────────────────────────
function calcPkgComponentTotal(comp, facilitators) {
  const effQty = comp.scalable ? comp.qty * facilitators : comp.qty;
  return getBlockPrice(comp.blockId) * effQty;
}

function calcQuotePkgGross(qpkg) {
  let total = qpkg.components.reduce((sum, c) => sum + calcPkgComponentTotal(c, qpkg.facilitators), 0);
  // Add travel cost
  total += calcTravelCost(qpkg);
  // Add launch meeting
  total += qpkg.launchMeetingQty * getBlockPrice('admin-meetings');
  // Add office hours
  total += qpkg.officeHoursQty * getBlockPrice('office-hours');
  // Add check-ins (30 min each, at office-hours rate)
  total += (qpkg.checkInQty || 0) * 0.5 * getBlockPrice('office-hours');
  // Add reflection meeting (1 hr each, at office-hours rate)
  total += (qpkg.reflectionMeetingQty || 0) * getBlockPrice('office-hours');
  return total;
}

function calcQuotePkgNet(qpkg) {
  const gross = calcQuotePkgGross(qpkg);
  const disc = qpkg.discount || 0;
  return gross * (1 - disc / 100);
}

function getDefaultTravelCounts(sessions) {
  let localDays = 0, flightTrips = 0;
  for (const s of (sessions || [])) {
    if (s.delivery === 'local') localDays++;
    if (s.delivery === 'travel') flightTrips++;
  }
  return { localDays, flightTrips };
}

function calcTravelCost(qpkg) {
  const localDays = qpkg.travelLocalDays ?? getDefaultTravelCounts(qpkg.sessions).localDays;
  const flightTrips = qpkg.travelFlightTrips ?? getDefaultTravelCounts(qpkg.sessions).flightTrips;
  const fac = qpkg.facilitators || 1;
  return (localDays * getBlockPrice('travel-local') + flightTrips * getBlockPrice('travel-flight')) * fac;
}

function calcAddonTotal(addon) {
  return getBlockPrice(addon.blockId) * addon.qty;
}

function calcServicesTotal() {
  const pkgs = quotePackages.reduce((s, qp) => s + calcQuotePkgNet(qp), 0);
  const adds = quoteAddons.reduce((s, a) => s + calcAddonTotal(a), 0);
  return pkgs + adds;
}

function calcStandardTotal() {
  return calcServicesTotal() + calcTotalSoftware();
}

function calcDiscount(std) {
  const val = parseFloat(document.getElementById('discountVal').value) || 0;
  const type = document.getElementById('discountType').value;
  if (val <= 0) return 0;
  if (type === 'pct') return std * (Math.min(val, 100) / 100);
  return Math.min(val / getCurrency().rate, std);
}

function calcFunderSubsidy(partnerPrice) {
  const val = parseFloat(document.getElementById('funderVal').value) || 0;
  const type = document.getElementById('funderType').value;
  if (val <= 0) return 0;
  if (type === 'pct') return partnerPrice * (Math.min(val, 100) / 100);
  return Math.min(val / getCurrency().rate, partnerPrice);
}

function hasQuoteItems() {
  return quotePackages.length > 0 || quoteAddons.length > 0 || quoteLicenses.length > 0;
}

// ─── Render: Package Catalog ──────────────────────────────────────────────────
function getPathwayBadgeColors(pathwayId) {
  switch (pathwayId) {
    case 'educators': return { bg: '#e0f2fe', color: '#0369a1' };
    case 'students': return { bg: '#fff7ed', color: '#c2410c' };
    case 'impact': return { bg: '#ede9fe', color: '#6d28d9' };
    case 'coaching': return { bg: '#d1fae5', color: '#065f46' };
    default: return { bg: '#f1f5f9', color: '#475569' };
  }
}

function calcPackageBasePrice(pkg) {
  return pkg.components.reduce((sum, c) => sum + getBlockPrice(c.blockId) * c.qty, 0);
}

function isPkgInQuote(pkgId) {
  return quotePackages.some(qp => qp.packageId === pkgId);
}

function isAddonInQuote(blockId) {
  return quoteAddons.some(a => a.blockId === blockId);
}

let collapsedPathways = {};

function togglePathway(pathwayId) {
  collapsedPathways[pathwayId] = !collapsedPathways[pathwayId];
  const section = document.getElementById('pw-' + pathwayId);
  if (section) section.classList.toggle('collapsed', !!collapsedPathways[pathwayId]);
}

function renderCatalog() {
  const container = document.getElementById('catalogContainer');
  container.innerHTML = '';
  for (const pathway of PATHWAYS) {
    const pkgs = PACKAGES.filter(p => p.pathway === pathway.id);
    const isCollapsed = !!collapsedPathways[pathway.id];
    const section = document.createElement('div');
    section.className = 'pathway-section' + (isCollapsed ? ' collapsed' : '');
    section.id = 'pw-' + pathway.id;
    section.innerHTML = `<div class="pathway-header" onclick="togglePathway('${pathway.id}')">
      <span class="pathway-chevron">\u25BC</span>
      <div class="pathway-dot" style="background:${pathway.color}"></div>
      <h2>${pathway.name}</h2>
      <span class="pathway-desc">${pathway.desc}</span>
    </div><div class="pathway-body"><div class="pkg-grid" id="grid-${pathway.id}"></div></div>`;
    container.appendChild(section);
    const grid = section.querySelector('.pkg-grid');
    for (const pkg of pkgs) grid.appendChild(buildPkgCard(pkg, pathway));
  }
}

function buildPkgCard(pkg, pathway) {
  const inQuote = isPkgInQuote(pkg.id);
  const basePrice = calcPackageBasePrice(pkg);
  const netPrice = pkg.pathwayDiscount ? basePrice * (1 - pkg.pathwayDiscount) : basePrice;
  const bc = getPathwayBadgeColors(pathway.id);
  const card = document.createElement('div');
  card.className = 'pkg-card' + (inQuote ? ' in-quote' : '');
  card.id = 'pkgcard-' + pkg.id;

  const compSummary = pkg.components.map(c => {
    const price = getBlockPrice(c.blockId) * c.qty;
    return c.label + ' (' + fmt(price) + ')';
  }).join(' \u00B7 ');

  const isConfigOpen = activeConfigPkgId === pkg.id;

  let configHtml = '';
  if (isConfigOpen) {
    configHtml = buildInlineConfig(pkg);
  }

  const pkgName = pkg.name;
  const pkgDesc = pkg.desc;
  const pkgBadge = pkg.badge;
  card.innerHTML = `
    <div class="pkg-top">
      <div><div class="pkg-name">${pkgName}</div><div class="pkg-subtitle">${pkg.subtitle}</div></div>
      <span class="pkg-badge" style="background:${bc.bg};color:${bc.color}">${pkgBadge}</span>
    </div>
    <div class="pkg-desc">${pkgDesc}</div>
    <div class="pkg-price-row">
      <div class="pkg-price">${fmt(netPrice)}${pkg.pathwayDiscount ? ' <span style="font-size:10px;font-weight:500;color:var(--emerald-600)">(20% off)</span>' : ''}</div>
      <div class="pkg-price-note">${pkg.isCoachingRetainer ? '6-month minimum' : '1 facilitator \u00B7 40 participants'}</div>
    </div>
    <div class="pkg-components">${compSummary}</div>
    ${isConfigOpen ? '' : `<button class="pkg-add-btn" onclick="event.stopPropagation(); openConfig('${pkg.id}')">${inQuote ? '+ Add Another' : '+ Add'}</button>`}
    ${configHtml}`;
  return card;
}

function buildInlineConfig(pkg) {
  const cs = configState[pkg.id] || {};
  const hasFacilitation = pkg.facilitationHours && pkg.facilitationHours > 0;
  const isCoaching = pkg.pathway === 'coaching';

  // Coaching packages: simplified config
  if (isCoaching) {
    const months = cs.months || 6;
    let coachingHtml = `<div class="pkg-config-row">
      <span class="pkg-config-label">Months</span>
      <input class="config-participants" type="number" min="6" step="1" value="${months}"
             onchange="updateConfigCoachingMonths('${pkg.id}', this, true)"
             oninput="updateConfigCoachingMonths('${pkg.id}', this, false)">
      <span style="font-size:10px;color:var(--slate-400)">6-month minimum</span>
    </div>`;
    const previewCost = calcConfigPreview(pkg);
    return `<div class="pkg-config">
      ${coachingHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding-top:4px;border-top:1px solid var(--slate-200)">
        <span style="color:var(--slate-500);font-weight:500">Estimated total</span>
        <span style="font-weight:800;color:var(--sky-700)">${fmt(previewCost)}</span>
      </div>
      <button class="config-confirm-btn" onclick="confirmAddPackage('${pkg.id}')">Add to Builder</button>
      <button style="width:100%;padding:5px;background:none;border:none;font-family:'Lexend',sans-serif;font-size:10px;color:var(--slate-400);cursor:pointer" onclick="closeConfig()">Cancel</button>
    </div>`;
  }

  let sessionsHtml = '';
  if (hasFacilitation) {
    const numSessions = cs.numSessions || 1;
    const maxSessions = getMaxSessions(pkg.facilitationHours);
    const sessions = cs.sessions || distributeHours(pkg.facilitationHours, numSessions);
    const localCost = getBlockPrice('travel-local');
    const flightCost = getBlockPrice('travel-flight');

    sessionsHtml = `<div class="pkg-config-row">
      <span class="pkg-config-label">Sessions</span>
      <input class="num-sessions-input" type="number" step="any" value="${numSessions}"
             onchange="updateConfigNumSessions('${pkg.id}', this, true)"
             oninput="updateConfigNumSessions('${pkg.id}', this, false)">
      <span style="font-size:10px;color:var(--slate-400)">${`${pkg.facilitationHours} hrs total`}</span>
    </div>
    <div class="session-config-rows">
      ${sessions.map((s, i) => `<div class="session-config-row">
        <span class="session-config-label">Session ${i + 1}:</span>
        <input class="session-hours-input" type="number" step="any" value="${s.hours}"
               onchange="updateConfigSessionHours('${pkg.id}', ${i}, this, true)"
               oninput="updateConfigSessionHours('${pkg.id}', ${i}, this, false)">
        <span class="session-hours-unit">hrs</span>
        <select class="config-select" style="font-size:10px;padding:4px 6px;min-width:0" onchange="updateConfigSessionDelivery('${pkg.id}',${i},this.value)">
          <option value="virtual" ${s.delivery === 'virtual' ? 'selected' : ''}>\uD83D\uDCBB Virtual</option>
          <option value="local" ${s.delivery === 'local' ? 'selected' : ''}>\uD83D\uDE97 Local (+${fmt(localCost)})</option>
          <option value="travel" ${s.delivery === 'travel' ? 'selected' : ''}>\u2708\uFE0F Travel (+${fmt(flightCost)})</option>
        </select>
      </div>`).join('')}
    </div>`;
  } else {
    // Impact packages without facilitation: single delivery mode selector
    const delivery = (cs.sessions && cs.sessions[0]?.delivery) || 'virtual';
    const localCost = getBlockPrice('travel-local');
    const flightCost = getBlockPrice('travel-flight');
    sessionsHtml = `<div class="pkg-config-row">
      <span class="pkg-config-label">Delivery</span>
      <div class="delivery-pills">
        <button class="delivery-pill ${delivery === 'virtual' ? 'active' : ''}" onclick="updateConfigImpactDelivery('${pkg.id}','virtual')">\uD83D\uDCBB Virtual<span class="pill-cost">+$0</span></button>
        <button class="delivery-pill ${delivery === 'local' ? 'active' : ''}" onclick="updateConfigImpactDelivery('${pkg.id}','local')">\uD83D\uDE97 Local<span class="pill-cost">+${fmt(localCost)}</span></button>
        <button class="delivery-pill ${delivery === 'travel' ? 'active' : ''}" onclick="updateConfigImpactDelivery('${pkg.id}','travel')">\u2708\uFE0F Travel<span class="pill-cost">+${fmt(flightCost)}</span></button>
      </div>
    </div>`;
  }

  const participants = cs.participants || 40;
  const numFac = Math.max(1, Math.ceil(participants / 40));
  const participantsHtml = hasFacilitation ? `<div class="pkg-config-row">
    <span class="pkg-config-label">Participants</span>
    <input class="config-participants" type="number" step="any" value="${participants}" onchange="updateConfigParticipants('${pkg.id}', this, true)" oninput="updateConfigParticipants('${pkg.id}', this, false)">
    <span style="font-size:10px;color:var(--slate-400)">\u2192 ${numFac} ${numFac > 1 ? 'facilitators' : 'facilitator'}</span>
  </div>` : '';

  // Preview cost
  const previewCost = calcConfigPreview(pkg);

  return `<div class="pkg-config">
    ${sessionsHtml}
    ${participantsHtml}
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding-top:4px;border-top:1px solid var(--slate-200)">
      <span style="color:var(--slate-500);font-weight:500">Estimated total</span>
      <span style="font-weight:800;color:var(--sky-700)">${fmt(previewCost)}</span>
    </div>
    <button class="config-confirm-btn" onclick="confirmAddPackage('${pkg.id}')">Add to Builder</button>
    <button style="width:100%;padding:5px;background:none;border:none;font-family:'Lexend',sans-serif;font-size:10px;color:var(--slate-400);cursor:pointer" onclick="closeConfig()">Cancel</button>
  </div>`;
}

function calcConfigPreview(pkg) {
  const cs = configState[pkg.id] || {};

  // Coaching packages: simple price calculation
  if (pkg.pathway === 'coaching') {
    const months = cs.months || 6;
    return getBlockPrice(pkg.components[0].blockId) * months;
  }

  const hasFacilitation = pkg.facilitationHours && pkg.facilitationHours > 0;
  const participants = cs.participants || 40;
  const facilitators = Math.max(1, Math.ceil(participants / 40));
  const sessions = cs.sessions || [{ hours: pkg.facilitationHours || 0, delivery: 'virtual' }];

  // Base component cost
  let cost = pkg.components.reduce((sum, c) => {
    const effQty = c.scalable ? c.qty * facilitators : c.qty;
    return sum + getBlockPrice(c.blockId) * effQty;
  }, 0);

  // Apply pathway discount
  if (pkg.pathwayDiscount) cost *= (1 - pkg.pathwayDiscount);

  // Travel: per-session, per-facilitator
  for (const s of sessions) {
    if (s.delivery === 'local') cost += getBlockPrice('travel-local') * facilitators;
    if (s.delivery === 'travel') cost += getBlockPrice('travel-flight') * facilitators;
  }

  // Auto-included supports
  if (hasFacilitation) {
    cost += 1 * getBlockPrice('admin-meetings'); // launch meeting
    cost += Math.max(0, sessions.length - 1) * getBlockPrice('office-hours'); // office hours
    cost += Math.max(0, sessions.length - 1) * 0.5 * getBlockPrice('office-hours'); // check-ins (30 min each)
    cost += 1 * getBlockPrice('office-hours'); // reflection meeting
  }

  return cost;
}

function openConfig(pkgId) {
  activeConfigPkgId = pkgId;
  if (!configState[pkgId]) {
    const pkg = PACKAGES.find(p => p.id === pkgId);
    if (pkg && pkg.pathway === 'coaching') {
      configState[pkgId] = { months: 6 };
    } else {
      const hasFac = pkg && pkg.facilitationHours && pkg.facilitationHours > 0;
      configState[pkgId] = {
        numSessions: hasFac ? 1 : 1,
        sessions: hasFac
          ? distributeHours(pkg.facilitationHours, 1)
          : [{ hours: 0, delivery: 'virtual' }],
        participants: 40
      };
    }
  }
  renderCatalog();
  // Scroll to config
  setTimeout(() => {
    const card = document.getElementById('pkgcard-' + pkgId);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function closeConfig() {
  activeConfigPkgId = null;
  renderCatalog();
}

function ensureConfigState(pkgId) {
  if (!configState[pkgId]) {
    const pkg = PACKAGES.find(p => p.id === pkgId);
    if (pkg && pkg.pathway === 'coaching') {
      configState[pkgId] = { months: 6 };
    } else {
      const hasFac = pkg && pkg.facilitationHours && pkg.facilitationHours > 0;
      configState[pkgId] = {
        numSessions: 1,
        sessions: hasFac ? distributeHours(pkg.facilitationHours, 1) : [{ hours: 0, delivery: 'virtual' }],
        participants: 40
      };
    }
  }
  return configState[pkgId];
}

function rerenderConfigOnly(pkgId) {
  const pkg = PACKAGES.find(p => p.id === pkgId);
  if (!pkg) return;
  const card = document.getElementById('pkgcard-' + pkgId);
  if (!card) return;
  const oldConfig = card.querySelector('.pkg-config');
  if (!oldConfig) return;
  const newHtml = buildInlineConfig(pkg);
  const temp = document.createElement('div');
  temp.innerHTML = newHtml;
  oldConfig.replaceWith(temp.firstElementChild);
}

function updateConfigNumSessions(pkgId, input, commit) {
  const cs = ensureConfigState(pkgId);
  const pkg = PACKAGES.find(p => p.id === pkgId);
  const totalHours = pkg?.facilitationHours || 1;
  let val = Math.round(parseFloat(input.value));
  const maxS = getMaxSessions(totalHours);
  if (!commit) {
    // Live typing: update state silently, no re-render
    if (!isNaN(val) && val >= 1 && val <= maxS) {
      cs.numSessions = val;
      const oldSessions = cs.sessions || [];
      const newSessions = distributeHours(totalHours, val);
      for (let i = 0; i < newSessions.length; i++) {
        if (i < oldSessions.length) newSessions[i].delivery = oldSessions[i].delivery;
      }
      cs.sessions = newSessions;
    }
    return;
  }
  // Commit: clamp, re-render
  if (isNaN(val) || val < 1) val = 1;
  if (val > maxS) val = maxS;
  input.value = val;
  cs.numSessions = val;
  const oldSessions = cs.sessions || [];
  const newSessions = distributeHours(totalHours, val);
  for (let i = 0; i < newSessions.length; i++) {
    if (i < oldSessions.length) newSessions[i].delivery = oldSessions[i].delivery;
  }
  cs.sessions = newSessions;
  const hadFocus = document.activeElement === input;
  rerenderConfigOnly(pkgId);
  if (hadFocus) {
    const card = document.getElementById('pkgcard-' + pkgId);
    const newInput = card?.querySelector('.num-sessions-input');
    if (newInput) { newInput.focus(); newInput.select(); }
  }
}

function updateConfigSessionHours(pkgId, idx, input, commit) {
  const cs = ensureConfigState(pkgId);
  let val = parseFloat(input.value);
  if (commit) {
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
    cs.sessions[idx].hours = val;
    const hadFocus = document.activeElement === input;
    rerenderConfigOnly(pkgId);
    if (hadFocus) {
      const card = document.getElementById('pkgcard-' + pkgId);
      const inputs = card?.querySelectorAll('.session-hours-input');
      if (inputs && inputs[idx]) { inputs[idx].focus(); inputs[idx].select(); }
    }
  } else {
    if (!isNaN(val) && val >= 0) cs.sessions[idx].hours = val;
  }
}

function updateConfigSessionDelivery(pkgId, idx, mode) {
  const cs = ensureConfigState(pkgId);
  cs.sessions[idx].delivery = mode;
  rerenderConfigOnly(pkgId);
}

function updateConfigImpactDelivery(pkgId, mode) {
  const cs = ensureConfigState(pkgId);
  cs.sessions = [{ hours: 0, delivery: mode }];
  rerenderConfigOnly(pkgId);
}

function updateConfigParticipants(pkgId, input, commit) {
  const cs = ensureConfigState(pkgId);
  let val = Math.round(parseFloat(input.value));
  if (!commit) {
    // Live typing: update state silently, no re-render
    if (!isNaN(val) && val >= 1) cs.participants = val;
    return;
  }
  // Commit: clamp, re-render
  if (isNaN(val) || val < 1) val = 1;
  input.value = val;
  cs.participants = val;
  const hadFocus = document.activeElement === input;
  rerenderConfigOnly(pkgId);
  if (hadFocus) {
    const card = document.getElementById('pkgcard-' + pkgId);
    const newInput = card?.querySelector('.config-participants');
    if (newInput) { newInput.focus(); newInput.select(); }
  }
}

function updateConfigCoachingMonths(pkgId, input, commit) {
  const cs = ensureConfigState(pkgId);
  let val = Math.round(parseFloat(input.value));
  if (!commit) {
    if (!isNaN(val) && val >= 6) cs.months = val;
    return;
  }
  if (isNaN(val) || val < 6) val = 6;
  input.value = val;
  cs.months = val;
  rerenderConfigOnly(pkgId);
}

function getSupportDefaults(pkg, sessions) {
  const isIntro = pkg.id === 'edu-intro';
  const isPowerUp = pkg.id === 'edu-powerup';
  const isStudent = pkg.pathway === 'students';
  const isImpact = pkg.pathway === 'impact';
  const isCoaching = pkg.pathway === 'coaching';
  const isEduCore = pkg.pathway === 'educators' && !isIntro && !isPowerUp;

  if (isCoaching) {
    return { launchMeetingQty: 0, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 0 };
  }
  if (isImpact) {
    return { launchMeetingQty: 1, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 0 };
  }
  if (isIntro) {
    return { launchMeetingQty: 0, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 0 };
  }
  if (isPowerUp) {
    return { launchMeetingQty: 1, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 0 };
  }
  if (isStudent) {
    return { launchMeetingQty: 1, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 1 };
  }
  if (isEduCore) {
    return {
      launchMeetingQty: 1,
      officeHoursQty: Math.max(0, sessions.length - 1),
      checkInQty: Math.max(0, sessions.length - 1),
      reflectionMeetingQty: 1
    };
  }
  return { launchMeetingQty: 0, officeHoursQty: 0, checkInQty: 0, reflectionMeetingQty: 0 };
}

function confirmAddPackage(pkgId) {
  const pkg = PACKAGES.find(p => p.id === pkgId);
  if (!pkg) return;

  // Coaching packages: simplified add flow
  if (pkg.pathway === 'coaching') {
    const cs = configState[pkgId] || {};
    let compId = 1;
    const components = pkg.components.map(c => ({ ...c, id: 'c' + compId++ }));
    // Set qty from config (months)
    components[0].qty = cs.months || 6;
    const qpkg = {
      pkgId: nextPkgId++,
      packageId: pkgId,
      participants: 0,
      facilitators: 1,
      facilitatorsManual: false,
      sessions: [],
      travelLocalDays: 0,
      travelFlightTrips: 0,
      launchMeetingQty: 0,
      officeHoursQty: 0,
      checkInQty: 0,
      reflectionMeetingQty: 0,
      components
    };
    quotePackages.push(qpkg);
    expandedPkgId = qpkg.pkgId;
    activeConfigPkgId = null;
    track('add_package', { package_name: pkg.name, package_id: pkgId });
    renderCatalog();
    renderQuote();
    renderTotals();
    showToast(`Added: ${pkg.name}`);
    return;
  }

  const cs = configState[pkgId] || { numSessions: 1, sessions: [{ hours: pkg.facilitationHours || 0, delivery: 'virtual' }], participants: 40 };
  const hasFacilitation = pkg.facilitationHours && pkg.facilitationHours > 0;
  const participants = cs.participants || 40;
  const facilitators = Math.max(1, Math.ceil(participants / 40));
  const sessions = (cs.sessions || [{ hours: pkg.facilitationHours || 0, delivery: 'virtual' }]).map(s => ({ ...s }));

  let compId = 1;
  const components = pkg.components.map(c => ({ ...c, id: 'c' + compId++ }));

  const travelCounts = getDefaultTravelCounts(sessions);
  const qpkg = {
    pkgId: nextPkgId++,
    packageId: pkgId,
    participants,
    facilitators,
    facilitatorsManual: false,
    sessions,
    travelLocalDays: travelCounts.localDays,
    travelFlightTrips: travelCounts.flightTrips,
    launchMeetingQty: getSupportDefaults(pkg, sessions).launchMeetingQty,
    officeHoursQty: getSupportDefaults(pkg, sessions).officeHoursQty,
    checkInQty: getSupportDefaults(pkg, sessions).checkInQty,
    reflectionMeetingQty: getSupportDefaults(pkg, sessions).reflectionMeetingQty,
    discount: (pkg.pathwayDiscount || 0) * 100,
    components
  };
  quotePackages.push(qpkg);
  expandedPkgId = qpkg.pkgId;
  activeConfigPkgId = null;
  track('add_package', { package_name: pkg.name, package_id: pkgId, participants: participants, sessions: sessions.length });
  renderCatalog();
  renderQuote();
  renderTotals();
  showToast(`Added: ${pkg.name}`);
}

// Direct add for impact pathway packages (no config needed - but we still show config for delivery mode)
function addPackage(packageId) {
  openConfig(packageId);
}

function renamePkg(pkgId, name) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  qpkg.customName = name.trim() || null;
  saveToUrl();
}

function renameComp(pkgId, compId, name) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  const comp = qpkg.components.find(c => c.id === compId);
  if (!comp) return;
  comp.customLabel = name.trim() || null;
  saveToUrl();
}

function renameAddon(addonId, name) {
  const addon = quoteAddons.find(a => a.addonId === addonId);
  if (!addon) return;
  addon.customLabel = name.trim() || null;
  saveToUrl();
}

function setPkgDiscount(pkgId, input) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  let val = parseFloat(input.value) || 0;
  if (val < 0) val = 0;
  if (val > 100) val = 100;
  qpkg.discount = val;
  renderQuote();
  renderTotals();
}

function removePkg(pkgId) {
  const removed = quotePackages.find(qp => qp.pkgId === pkgId);
  if (removed) { const pkg = PACKAGES.find(p => p.id === removed.packageId); track('remove_package', { package_name: pkg ? pkg.name : removed.packageId }); }
  quotePackages = quotePackages.filter(qp => qp.pkgId !== pkgId);
  if (expandedPkgId === pkgId) expandedPkgId = quotePackages.length > 0 ? quotePackages[quotePackages.length - 1].pkgId : null;
  renderCatalog();
  renderQuote();
  renderTotals();
}

function togglePkg(pkgId) {
  expandedPkgId = expandedPkgId === pkgId ? null : pkgId;
  renderQuote();
}

function setParticipants(pkgId, input, commit) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  let val = parseFloat(input.value);
  if (commit) {
    if (isNaN(val) || val < 1) val = 1;
    val = Math.round(val);
    input.value = val;
  }
  if (!isNaN(val) && val >= 1) {
    qpkg.participants = val;
    if (!qpkg.facilitatorsManual) {
      qpkg.facilitators = Math.max(1, Math.ceil(val / 30));
    }
  }
  renderTotals();
  if (commit) {
    const hadFocus = document.activeElement === input;
    renderQuote();
    if (hadFocus) {
      const card = document.querySelector(`.qpkg[data-pkg-id="${pkgId}"]`);
      const newInput = card?.querySelector('.participants-input');
      if (newInput) { newInput.focus(); newInput.select(); }
    }
  }
  saveToUrl();
}

function setFacilitators(pkgId, input, commit) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  let val = parseFloat(input.value);
  if (commit) {
    if (isNaN(val) || val < 1) val = 1;
    val = Math.round(val);
    input.value = val;
  }
  if (!isNaN(val) && val >= 1) {
    qpkg.facilitators = val;
    const autoVal = Math.max(1, Math.ceil(qpkg.participants / 40));
    qpkg.facilitatorsManual = (val !== autoVal);
  }
  renderTotals();
  if (commit) {
    const hadFocus = document.activeElement === input;
    renderQuote();
    if (hadFocus) {
      const card = document.querySelector(`.qpkg[data-pkg-id="${pkgId}"]`);
      const newInput = card?.querySelector('.facilitator-input');
      if (newInput) { newInput.focus(); newInput.select(); }
    }
  }
  saveToUrl();
}

function updateQuoteSessionHours(pkgId, idx, input, commit) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg || !qpkg.sessions[idx]) return;
  let val = parseFloat(input.value);
  if (commit) {
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
  }
  if (!isNaN(val) && val >= 0) {
    qpkg.sessions[idx].hours = val;
  }
  renderTotals();
  if (commit) {
    const hadFocus = document.activeElement === input;
    renderQuote();
    if (hadFocus) {
      const card = document.querySelector(`.qpkg[data-pkg-id="${pkgId}"]`);
      const inputs = card?.querySelectorAll('.builder-session-hours');
      if (inputs && inputs[idx]) { inputs[idx].focus(); inputs[idx].select(); }
    }
  }
  saveToUrl();
}

function updateQuoteSessionDelivery(pkgId, idx, mode) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg || !qpkg.sessions[idx]) return;
  qpkg.sessions[idx].delivery = mode;
  // Recalculate default travel counts from updated sessions
  const counts = getDefaultTravelCounts(qpkg.sessions);
  qpkg.travelLocalDays = counts.localDays;
  qpkg.travelFlightTrips = counts.flightTrips;
  renderQuote();
  renderTotals();
}

function changeCompQty(pkgId, compId, dir) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  const comp = qpkg.components.find(c => c.id === compId);
  if (!comp) return;
  const step = 0.5;
  const newQty = Math.round((comp.qty + dir * step) * 100) / 100;
  if (newQty < 0.5) return;
  comp.qty = newQty;
  renderQuote();
  renderTotals();
}

function setCompQty(pkgId, compId, input) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  const comp = qpkg.components.find(c => c.id === compId);
  if (!comp) return;
  let val = parseFloat(input.value);
  if (isNaN(val) || val < 0) val = 0;
  comp.qty = val;
  renderTotals();
  saveToUrl();
}

function changeAutoQty(pkgId, field, dir) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  const step = field === 'launchMeetingQty' ? 1 : 1;
  const newVal = qpkg[field] + dir * step;
  if (newVal < 0) return;
  qpkg[field] = newVal;
  renderQuote();
  renderTotals();
}

function setAutoQty(pkgId, field, input) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  let val = parseFloat(input.value);
  if (isNaN(val) || val < 0) val = 0;
  // Office hours are measured in hours (allow decimals); others are meeting counts (round to int)
  if (field !== 'officeHoursQty') val = Math.round(val);
  qpkg[field] = val;
  renderQuote();
  renderTotals();
}

function changeTravelQty(pkgId, field, dir) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  const newVal = (qpkg[field] || 0) + dir;
  if (newVal < 0) return;
  qpkg[field] = newVal;
  renderQuote();
  renderTotals();
}

function setTravelQty(pkgId, field, input) {
  const qpkg = quotePackages.find(q => q.pkgId === pkgId);
  if (!qpkg) return;
  let val = parseFloat(input.value);
  if (isNaN(val) || val < 0) val = 0;
  qpkg[field] = Math.round(val);
  renderQuote();
  renderTotals();
}

function addAddon(blockId) {
  const def = ADDONS.find(a => a.blockId === blockId);
  if (!def) return;
  quoteAddons.push({
    addonId: nextAddonId++,
    blockId: def.blockId,
    label: def.label,
    unit: def.unit,
    qty: def.defaultQty,
    minQty: def.minQty,
    step: def.step
  });
  track('add_addon', { addon_name: def.label, block_id: def.blockId });
  renderAddonGrid();
  renderQuote();
  renderTotals();
  showToast(`Added: ${def.label}`);
}

function removeAddon(addonId) {
  quoteAddons = quoteAddons.filter(a => a.addonId !== addonId);
  renderAddonGrid();
  renderQuote();
  renderTotals();
}

function changeAddonQty(addonId, dir) {
  const addon = quoteAddons.find(a => a.addonId === addonId);
  if (!addon) return;
  const newQty = Math.round((addon.qty + dir * addon.step) * 100) / 100;
  if (newQty < addon.minQty) return;
  addon.qty = newQty;
  renderQuote();
  renderTotals();
}

function setAddonQty(addonId, input) {
  const addon = quoteAddons.find(a => a.addonId === addonId);
  if (!addon) return;
  let val = parseFloat(input.value);
  if (isNaN(val) || val < 0) val = addon.minQty;
  addon.qty = val;
  renderQuote();
  renderTotals();
}

// ─── Render: Software Cards (Left Panel) ──────────────────────────────────────
function renderSwCards() {
  const grid = document.getElementById('swGrid');
  grid.innerHTML = '';

  // Non-school tiers (Play, Impact)
  for (const tier of SOFTWARE_TIERS.filter(t => !t.isSchool)) {
    const card = document.createElement('div');
    card.className = 'sw-card';
    card.id = 'sw-' + tier.id;
    const defaultCount = tier.defaultCount;
    const cost = tier.pricePerUnit * defaultCount;
    const priceLabel = tier.priceNote || `$${tier.pricePerUnit}/${tier.unitLabel}/year`;
    const countLabel = tier.unitLabel === 'user' ? 'Users' : 'Qty';
    const period = tier.periodLabel || '/yr';
    const computedText = tier.isCustom ? 'Custom' : `${fmt(cost)}${period}`;
    const countRow = `<div class="sw-card-row">
        <label>${countLabel}:</label>
        <input class="sw-count-input" type="number" step="any" value="${defaultCount}" id="sw-input-${tier.id}">
        <span class="sw-card-computed">${computedText}</span>
      </div>`;
    let metaRow = '';
    if (tier.educators) metaRow = `<div style="font-size:10px;color:var(--slate-400);margin-top:2px">${tier.educators} · ${tier.students}</div>`;
    let studentRow = '';
    if (tier.hasStudentInput) {
      studentRow = `<div class="sw-card-row">
        <label>Students:</label>
        <input class="sw-count-input" type="number" step="any" value="${tier.defaultStudents}" id="sw-students-${tier.id}">
      </div>`;
    }
    const cardColor = tier.color || '#8b5cf6';
    const cardColorLight = tier.colorLight || '#f5f3ff';
    const cardColorText = tier.colorText || cardColor;
    card.style.setProperty('--card-color', cardColor);
    card.style.setProperty('--card-color-light', cardColorLight);
    card.style.setProperty('--card-btn-text', tier.id === 'play' ? '#5a4000' : tier.id === 'impact' ? '#1a4a3a' : 'white');
    card.innerHTML = `
      <div class="sw-card-name">${tier.name}</div>
      <div class="sw-card-tagline">${tier.tagline}</div>
      <div class="sw-card-price" style="color:${cardColorText};background:${cardColorLight}">${priceLabel}</div>
      ${metaRow}
      ${countRow}
      ${studentRow}
      <button class="sw-add-btn" onclick="addLicenseFromCard('${tier.id}')">+ Add License</button>`;
    grid.appendChild(card);

    const input = card.querySelector('.sw-count-input');
    const computed = card.querySelector('.sw-card-computed');
    input.addEventListener('input', () => {
      const v = parseFloat(input.value) || tier.defaultCount;
      computed.textContent = tier.isCustom ? 'Custom' : fmt(tier.pricePerUnit * v) + (tier.periodLabel || '/yr');
    });
  }

  // Unified Schools card
  const schoolCard = document.createElement('div');
  schoolCard.className = 'sw-card';
  schoolCard.id = 'sw-schools';
  const defaultEnrollment = 5000;
  const defaultTier = getSchoolTierForEnrollment(defaultEnrollment);
  schoolCard.style.setProperty('--card-color', '#7ee4bb');
  schoolCard.style.setProperty('--card-color-light', '#edfdf5');
  schoolCard.style.setProperty('--card-btn-text', '#1a4a3a');
  schoolCard.innerHTML = `
    <div class="sw-card-name">Schools</div>
    <div class="sw-card-tagline">Enrollment-based pricing for K\u201312</div>
    <div class="sw-card-price" id="schools-price-badge" style="color:#1a6b4a;background:#edfdf5">${defaultTier.priceNote}</div>
    <div id="schools-tier-detail" style="font-size:10px;color:var(--slate-400);margin-top:2px">${defaultTier.name} · ${defaultTier.monthlyCredits}</div>
    <div class="sw-card-row">
      <label>Students:</label>
      <input class="sw-count-input" type="number" step="any" value="${defaultEnrollment}" id="sw-input-schools">
      <span class="sw-card-computed" id="schools-computed">${fmt(defaultTier.pricePerUnit * defaultEnrollment)}/yr</span>
    </div>
    <div id="schools-tier-table" style="margin-top:6px;font-size:9.5px;color:var(--slate-400);line-height:1.6">
      <div style="display:flex;justify-content:space-between"><span>1,000–9,999</span><span>$3.00/student</span></div>
      <div style="display:flex;justify-content:space-between"><span>10,000–24,999</span><span>$2.50/student</span></div>
      <div style="display:flex;justify-content:space-between"><span>25,000–49,999</span><span>$2.00/student</span></div>
      <div style="display:flex;justify-content:space-between"><span>50,000+</span><span>Custom</span></div>
    </div>
    <div id="schools-min-warning" style="display:none;font-size:10px;color:var(--rose-500,#f43f5e);margin-top:4px;line-height:1.4">Minimum 1,000 students — will be adjusted to 1,000 ($3,000/yr)</div>
    <button class="sw-add-btn" onclick="addSchoolLicense()">+ Add License</button>`;
  grid.appendChild(schoolCard);

  const schoolInput = schoolCard.querySelector('#sw-input-schools');
  schoolInput.addEventListener('input', () => {
    const raw = Math.round(parseFloat(schoolInput.value)) || 1000;
    const tier = getSchoolTierForEnrollment(raw);
    const v = Math.max(raw, tier.minCount);
    document.getElementById('schools-price-badge').textContent = tier.priceNote;
    document.getElementById('schools-tier-detail').textContent = tier.name + ' · ' + tier.monthlyCredits;
    document.getElementById('schools-computed').textContent = tier.isCustom ? 'Custom' : fmt(tier.pricePerUnit * v) + '/yr';
    const warn = document.getElementById('schools-min-warning');
    warn.style.display = (raw < tier.minCount) ? 'block' : 'none';
  });
}

function addSchoolLicense() {
  const input = document.getElementById('sw-input-schools');
  let count = Math.round(parseFloat(input.value)) || 5000;
  const tier = getSchoolTierForEnrollment(count);
  if (count < tier.minCount) count = tier.minCount;
  addLicense(tier.id, count);
}

function addLicenseFromCard(tierId) {
  const tier = SOFTWARE_TIERS.find(t => t.id === tierId);
  const input = document.getElementById('sw-input-' + tierId);
  let count = Math.round(parseFloat(input.value)) || tier.defaultCount;
  if (count < tier.minCount) count = tier.minCount;
  let students = 0;
  if (tier.hasStudentInput) {
    const studentInput = document.getElementById('sw-students-' + tierId);
    students = Math.round(parseFloat(studentInput.value)) || tier.defaultStudents;
  }
  addLicense(tierId, count, students);
}

// ─── Render: License List (Right Panel) ──────────────────────────────────────
function renderLicenseList() {
  const list = document.getElementById('licenseList');
  const wrap = document.getElementById('licenseSummaryWrap');

  if (quoteLicenses.length === 0) {
    list.innerHTML = '<div style="font-size:11px;color:var(--slate-400);padding:8px 0">No licenses added yet</div>';
    return;
  }

  list.innerHTML = '';
  for (const lic of quoteLicenses) {
    const tier = SOFTWARE_TIERS.find(t => t.id === lic.tierId);
    if (!tier) continue;
    const cost = calcLicenseCost(lic);
    const priceDisplay = tier.isCustom ? 'Custom' : `${fmt(cost)}/yr`;
    let detailDisplay = tier.isCustom ? `${lic.count.toLocaleString()} ${lic.count === 1 ? tier.unitLabel : tier.unitLabelPlural} \u2014 Custom` : `${lic.count.toLocaleString()} ${lic.count === 1 ? tier.unitLabel : tier.unitLabelPlural} @ $${tier.pricePerUnit}/${tier.unitLabel}/yr`;
    if (lic.students) detailDisplay += ` · ${lic.students.toLocaleString()} students`;
    const div = document.createElement('div');
    div.className = 'license-line';
    div.style.marginBottom = '6px';
    const licColor = tier.color || (tier.isSchool ? '#7ee4bb' : '#8b5cf6');
    const licColorLight = tier.colorLight || (tier.isSchool ? '#edfdf5' : '#f5f3ff');
    const licColorText = tier.colorText || (tier.isSchool ? '#1a6b4a' : '#7c3aed');
    div.style.setProperty('--lic-color', licColor);
    div.style.setProperty('--lic-bg', licColorLight);
    div.style.setProperty('--lic-text', licColorText);
    div.innerHTML = `
      <div class="comp-info">
        <div class="license-name">${tier.name}
          <input class="license-name-input" type="text" value="${escHtml(lic.customName || '')}" placeholder="e.g. District name"
                 onchange="updateLicenseName(${lic.licenseId}, this.value)"
                 oninput="updateLicenseName(${lic.licenseId}, this.value)">
        </div>
        <div class="license-detail">${detailDisplay}</div>
      </div>
      <div class="comp-qty">
        <input class="comp-qty-input" type="number" step="any" value="${lic.count}" style="width:60px"
               onchange="updateLicenseCount(${lic.licenseId}, this, true)"
               oninput="updateLicenseCount(${lic.licenseId}, this, false)">
      </div>
      <span class="license-price">${priceDisplay}</span>
      <button class="qpkg-delete" onclick="removeLicense(${lic.licenseId})" title="Remove" style="width:18px;height:18px;font-size:14px">\u00D7</button>`;
    list.appendChild(div);
  }
}

// ─── Render: Add-on Grid (Left Panel) ────────────────────────────────────────
function renderAddonGrid() {
  const grid = document.getElementById('addonGrid');
  grid.innerHTML = '';
  const categories = [];
  for (const addon of ADDONS) {
    if (!categories.includes(addon.category)) categories.push(addon.category);
  }
  for (const cat of categories) {
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate-500);margin:12px 0 6px;padding:0 2px';
    if (cat === categories[0]) heading.style.marginTop = '0';
    heading.textContent = cat;
    grid.appendChild(heading);
    const subgrid = document.createElement('div');
    subgrid.className = 'addon-grid';
    grid.appendChild(subgrid);
    for (const addon of ADDONS.filter(a => a.category === cat)) {
      const inQuote = isAddonInQuote(addon.blockId);
      const card = document.createElement('div');
      card.className = 'addon-card' + (inQuote ? ' in-quote' : '');
      card.onclick = () => addAddon(addon.blockId);
      card.innerHTML = `<div class="addon-name">${addon.label}</div>
        <div style="font-size:10px;color:var(--slate-400);margin:2px 0 6px;line-height:1.4">${addon.desc}</div>
        <div class="addon-price">${fmt(getBlockPrice(addon.blockId))}/${addon.unit === 'flat' ? 'ea' : addon.unit}</div>
        <div class="addon-add">${inQuote ? '+ Add Another' : '+ Add'}</div>`;
      subgrid.appendChild(card);
    }
  }
}

// ─── Render: Quote Panel ──────────────────────────────────────────────────────
function renderQuote() {
  const wrap = document.getElementById('quotePackages');

  if (quotePackages.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><span class="empty-icon">\uD83D\uDCE6</span><span>Add packages from the left to build a quote</span></div>';
  } else {
    wrap.innerHTML = '';
    for (const qpkg of quotePackages) wrap.appendChild(buildQuotePkg(qpkg));
  }

  // Add-ons section
  const addonsWrap = document.getElementById('quoteAddonsWrap');
  const addonsList = document.getElementById('quoteAddonsList');
  if (quoteAddons.length > 0) {
    addonsWrap.style.display = '';
    addonsList.innerHTML = '';
    for (const addon of quoteAddons) addonsList.appendChild(buildQuoteAddon(addon));
  } else {
    addonsWrap.style.display = 'none';
  }
}

function getDeliveryBadgesForSessions(sessions) {
  // Summarize delivery modes for header badge
  const modes = [...new Set(sessions.map(s => s.delivery))];
  const deliveryLabels = { virtual: '\uD83D\uDCBB Virtual', local: '\uD83D\uDE97 Local', travel: '\u2708\uFE0F Travel' };
  return modes.map(m => `<span class="delivery-badge ${m}">${deliveryLabels[m] || m}</span>`).join('');
}

function buildCompLineHtml(comp, qpkg) {
  const effQty = comp.scalable ? comp.qty * qpkg.facilitators : comp.qty;
  const total = getBlockPrice(comp.blockId) * effQty;
  const hourBlocks = ['facilitation', 'office-hours', 'admin-meetings'];
  const moBlocks = ['coaching-retainer-essentials', 'coaching-retainer-advisory', 'coaching-retainer-strategic', 'coaching-retainer-embedded'];
  const unit = hourBlocks.includes(comp.blockId) ? 'hr' : moBlocks.includes(comp.blockId) ? 'mo' : 'flat';
  const tags = [];
  if (comp.support) tags.push('<span class="support-tag">support</span>');
  if (comp.scalable && qpkg.facilitators > 1) tags.push(`<span class="scale-tag">\u00D7${qpkg.facilitators}</span>`);
  const displayLabel = comp.customLabel || comp.label;
  return `<div class="comp-line ${comp.support ? 'support' : ''}">
    <div class="comp-info"><div class="comp-name"><input class="comp-name-input" type="text" value="${escHtml(displayLabel)}"
             placeholder="${escHtml(comp.label)}"
             onchange="renameComp(${qpkg.pkgId},'${comp.id}',this.value)"
             title="Click to rename">${tags.join('')}</div></div>
    <div class="comp-qty">
      <button class="comp-qty-btn" onclick="changeCompQty(${qpkg.pkgId},'${comp.id}',-1)">\u2212</button>
      <input class="comp-qty-input" type="number" step="any" value="${comp.qty}"
             onchange="setCompQty(${qpkg.pkgId},'${comp.id}',this)">
      <span class="comp-unit">${unitShort(unit)}</span>
      <button class="comp-qty-btn" onclick="changeCompQty(${qpkg.pkgId},'${comp.id}',1)">+</button>
    </div>
    <div class="comp-total">${fmt(total)}</div>
  </div>`;
}

function buildQuotePkg(qpkg) {
  const pkg = PACKAGES.find(p => p.id === qpkg.packageId);
  const pathway = PATHWAYS.find(pw => pw.id === pkg?.pathway);
  const gross = calcQuotePkgGross(qpkg);
  const net = calcQuotePkgNet(qpkg);
  const isExpanded = expandedPkgId === qpkg.pkgId;
  const hasScalable = qpkg.components.some(c => c.scalable);
  const hasFacilitation = pkg && pkg.facilitationHours && pkg.facilitationHours > 0;
  const sessions = qpkg.sessions || [];

  const div = document.createElement('div');
  div.className = 'qpkg' + (isExpanded ? ' expanded' : '');
  div.dataset.pkgId = qpkg.pkgId;

  let bodyHtml = '';
  const sectionHdr = (label) => `<div class="comp-section-header">${label}</div>`;

  // Delivery badges for header
  const deliveryBadges = getDeliveryBadgesForSessions(sessions);

  // ── SESSIONS ──
  if (sessions.length > 0 && (hasFacilitation || sessions.some(s => s.delivery !== 'virtual'))) {
    bodyHtml += sectionHdr('Sessions');
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const sessionTravelUnit = s.delivery === 'local' ? getBlockPrice('travel-local') : s.delivery === 'travel' ? getBlockPrice('travel-flight') : 0;
      const sessionTravelCost = sessionTravelUnit * (qpkg.facilitators || 1);
      const travelNote = sessionTravelCost > 0 ? `+${fmt(sessionTravelCost)}` : '';

      bodyHtml += `<div class="builder-session-row">
        <span class="builder-session-label">Session ${i + 1}:</span>
        ${hasFacilitation ? `<input class="builder-session-hours" type="number" step="any" value="${s.hours}"
               onchange="updateQuoteSessionHours(${qpkg.pkgId}, ${i}, this, true)"
               oninput="updateQuoteSessionHours(${qpkg.pkgId}, ${i}, this, false)">
        <span class="session-hours-unit">hrs</span>` : ''}
        <div class="delivery-pills-sm">
          <button class="delivery-pill-sm ${s.delivery === 'virtual' ? 'active' : ''}" onclick="updateQuoteSessionDelivery(${qpkg.pkgId},${i},'virtual')">\uD83D\uDCBB Virtual</button>
          <button class="delivery-pill-sm ${s.delivery === 'local' ? 'active' : ''}" onclick="updateQuoteSessionDelivery(${qpkg.pkgId},${i},'local')">\uD83D\uDE97 Local</button>
          <button class="delivery-pill-sm ${s.delivery === 'travel' ? 'active' : ''}" onclick="updateQuoteSessionDelivery(${qpkg.pkgId},${i},'travel')">\u2708\uFE0F Travel</button>
        </div>
        <span class="builder-session-info">${travelNote}</span>
      </div>`;
    }
  }

  if (hasScalable) {
    bodyHtml += `<div class="participants-row">
      <label>Participants:</label>
      <input class="participants-input" type="number" step="any" value="${qpkg.participants}"
             onchange="setParticipants(${qpkg.pkgId}, this, true)" oninput="setParticipants(${qpkg.pkgId}, this, false)">
      <span>\u2192</span>
      <input class="facilitator-input" type="number" step="any" value="${qpkg.facilitators}"
             onchange="setFacilitators(${qpkg.pkgId}, this, true)" oninput="setFacilitators(${qpkg.pkgId}, this, false)">
      <span class="facilitator-count">${qpkg.facilitators > 1 ? 'facilitators' : 'facilitator'}</span>
      <span style="font-size:9px;color:#92400e">${qpkg.facilitatorsManual ? '(manual)' : '(1 per 40)'}</span>
    </div>`;
  }

  // ── COMPONENTS (grouped by type) ──
  const targetedAiBlockIds = ['ideation-lp-le', 'ideation-lp', 'tool-build-initial', 'tool-build-addl', 'tool-pilot'];
  const coachingBlockIds = ['coaching-retainer-essentials', 'coaching-retainer-advisory', 'coaching-retainer-strategic', 'coaching-retainer-embedded'];
  const facilitationComps = qpkg.components.filter(c => c.blockId === 'facilitation');
  const targetedAiComps = qpkg.components.filter(c => targetedAiBlockIds.includes(c.blockId));
  const coachingComps = qpkg.components.filter(c => coachingBlockIds.includes(c.blockId));
  const otherComps = qpkg.components.filter(c => c.blockId !== 'facilitation' && !targetedAiBlockIds.includes(c.blockId) && !coachingBlockIds.includes(c.blockId));

  if (facilitationComps.length > 0) {
    bodyHtml += sectionHdr('Facilitation');
    for (const comp of facilitationComps) bodyHtml += buildCompLineHtml(comp, qpkg);
  }
  if (targetedAiComps.length > 0) {
    bodyHtml += sectionHdr('Targeted AI');
    for (const comp of targetedAiComps) bodyHtml += buildCompLineHtml(comp, qpkg);
  }
  if (coachingComps.length > 0) {
    bodyHtml += sectionHdr('Coaching');
    for (const comp of coachingComps) bodyHtml += buildCompLineHtml(comp, qpkg);
  }
  if (otherComps.length > 0) {
    bodyHtml += sectionHdr('Other');
    for (const comp of otherComps) bodyHtml += buildCompLineHtml(comp, qpkg);
  }

  // ── SUPPORT ──
  const hasLaunch = qpkg.launchMeetingQty > 0 || hasFacilitation;
  const hasOH = qpkg.officeHoursQty > 0 || hasFacilitation;
  const hasCI = (qpkg.checkInQty || 0) > 0 || hasFacilitation;
  const hasRM = (qpkg.reflectionMeetingQty || 0) > 0 || hasFacilitation;
  if (hasLaunch || hasOH || hasCI || hasRM) {
    bodyHtml += sectionHdr('Support');
  }

  if (hasLaunch) {
    const lmTotal = qpkg.launchMeetingQty * getBlockPrice('admin-meetings');
    bodyHtml += `<div class="comp-line support">
      <div class="comp-info"><div class="comp-name">Launch Meeting<span class="auto-tag">auto</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'launchMeetingQty',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${qpkg.launchMeetingQty}"
               onchange="setAutoQty(${qpkg.pkgId},'launchMeetingQty',this)">
        <span class="comp-unit">\u00D7</span>
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'launchMeetingQty',1)">+</button>
      </div>
      <div class="comp-total">${fmt(lmTotal)}</div>
    </div>`;
  }

  if (hasOH) {
    const ohTotal = qpkg.officeHoursQty * getBlockPrice('office-hours');
    bodyHtml += `<div class="comp-line support">
      <div class="comp-info"><div class="comp-name">Office Hours<span class="auto-tag">auto</span><span style="font-size:9px;color:var(--slate-400);margin-left:4px">(sessions\u22121)</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'officeHoursQty',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${qpkg.officeHoursQty}"
               onchange="setAutoQty(${qpkg.pkgId},'officeHoursQty',this)">
        <span class="comp-unit">hr</span>
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'officeHoursQty',1)">+</button>
      </div>
      <div class="comp-total">${fmt(ohTotal)}</div>
    </div>`;
  }

  if (hasCI) {
    const ciTotal = (qpkg.checkInQty || 0) * 0.5 * getBlockPrice('office-hours');
    bodyHtml += `<div class="comp-line support">
      <div class="comp-info"><div class="comp-name">Check-ins<span class="auto-tag">auto</span><span style="font-size:9px;color:var(--slate-400);margin-left:4px">(sessions\u22121 \u00D7 30 min)</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'checkInQty',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${qpkg.checkInQty || 0}"
               onchange="setAutoQty(${qpkg.pkgId},'checkInQty',this)">
        <span class="comp-unit">\u00D7</span>
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'checkInQty',1)">+</button>
      </div>
      <div class="comp-total">${fmt(ciTotal)}</div>
    </div>`;
  }

  if (hasRM) {
    const rmTotal = (qpkg.reflectionMeetingQty || 0) * getBlockPrice('office-hours');
    bodyHtml += `<div class="comp-line support">
      <div class="comp-info"><div class="comp-name">Reflection Meeting<span class="auto-tag">auto</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'reflectionMeetingQty',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${qpkg.reflectionMeetingQty || 0}"
               onchange="setAutoQty(${qpkg.pkgId},'reflectionMeetingQty',this)">
        <span class="comp-unit">\u00D7</span>
        <button class="comp-qty-btn" onclick="changeAutoQty(${qpkg.pkgId},'reflectionMeetingQty',1)">+</button>
      </div>
      <div class="comp-total">${fmt(rmTotal)}</div>
    </div>`;
  }

  // ── TRAVEL ──
  const localDays = qpkg.travelLocalDays ?? getDefaultTravelCounts(sessions).localDays;
  const flightTrips = qpkg.travelFlightTrips ?? getDefaultTravelCounts(sessions).flightTrips;
  const fac = qpkg.facilitators || 1;
  const hasTravel = localDays > 0 || flightTrips > 0 || sessions.some(s => s.delivery === 'local') || sessions.some(s => s.delivery === 'travel');
  if (hasTravel) {
    bodyHtml += sectionHdr('Travel');
  }
  if (localDays > 0 || sessions.some(s => s.delivery === 'local')) {
    const localTotal = localDays * getBlockPrice('travel-local') * fac;
    const facTag = fac > 1 ? `<span class="scale-tag">\u00D7${fac}</span>` : '';
    bodyHtml += `<div class="comp-line travel-line">
      <div class="comp-info"><div class="comp-name">Travel (Local) ${facTag}<span style="font-size:9px;color:var(--slate-400)">${fmt(getBlockPrice('travel-local'))}/day</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeTravelQty(${qpkg.pkgId},'travelLocalDays',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${localDays}"
               onchange="setTravelQty(${qpkg.pkgId},'travelLocalDays',this)">
        <span class="comp-unit">day</span>
        <button class="comp-qty-btn" onclick="changeTravelQty(${qpkg.pkgId},'travelLocalDays',1)">+</button>
      </div>
      <div class="comp-total">${fmt(localTotal)}</div>
    </div>`;
  }
  if (flightTrips > 0 || sessions.some(s => s.delivery === 'travel')) {
    const flightTotal = flightTrips * getBlockPrice('travel-flight') * fac;
    const facTag = fac > 1 ? `<span class="scale-tag">\u00D7${fac}</span>` : '';
    bodyHtml += `<div class="comp-line travel-line">
      <div class="comp-info"><div class="comp-name">Travel (Flight) ${facTag}<span style="font-size:9px;color:var(--slate-400)">${fmt(getBlockPrice('travel-flight'))}/trip</span></div></div>
      <div class="comp-qty">
        <button class="comp-qty-btn" onclick="changeTravelQty(${qpkg.pkgId},'travelFlightTrips',-1)">\u2212</button>
        <input class="comp-qty-input" type="number" step="any" value="${flightTrips}"
               onchange="setTravelQty(${qpkg.pkgId},'travelFlightTrips',this)">
        <span class="comp-unit">trip</span>
        <button class="comp-qty-btn" onclick="changeTravelQty(${qpkg.pkgId},'travelFlightTrips',1)">+</button>
      </div>
      <div class="comp-total">${fmt(flightTotal)}</div>
    </div>`;
  }

  // Package discount (editable)
  const discPct = qpkg.discount || 0;
  const discAmt = gross * discPct / 100;
  bodyHtml += `<div class="pathway-discount-row${discPct > 0 ? '' : ' inactive'}">
    <span class="pathway-discount-label">Package Discount</span>
    <div style="display:flex;align-items:center;gap:4px">
      <input class="comp-qty-input" type="number" step="any" min="0" max="100" value="${discPct || ''}"
             placeholder="0" style="width:48px;text-align:center;font-size:11px"
             oninput="setPkgDiscount(${qpkg.pkgId},this)"
             onchange="setPkgDiscount(${qpkg.pkgId},this)">
      <span style="font-size:11px;font-weight:600;color:${discPct > 0 ? 'var(--emerald-600)' : 'var(--slate-400)'}">%</span>
    </div>
    <span class="pathway-discount-value">${discPct > 0 ? '\u2212' + fmt(discAmt) : ''}</span>
  </div>`;

  const displayName = qpkg.customName || (pkg ? (pkg.name) : 'Package');
  div.innerHTML = `<div class="qpkg-header" onclick="togglePkg(${qpkg.pkgId})">
      <span class="qpkg-chevron">\u25B6</span>
      <input class="qpkg-name-input" type="text" value="${escHtml(displayName)}"
             onclick="event.stopPropagation()"
             onchange="renamePkg(${qpkg.pkgId}, this.value)"
             title="Click to rename">${deliveryBadges}
      <span class="qpkg-total">${fmt(net)}</span>
      <button class="qpkg-delete" onclick="event.stopPropagation(); removePkg(${qpkg.pkgId})" title="Remove">\u00D7</button>
    </div>
    <div class="qpkg-body">${bodyHtml}</div>`;
  return div;
}

function buildQuoteAddon(addon) {
  const total = calcAddonTotal(addon);
  const unit = unitShort(addon.unit);
  const div = document.createElement('div');
  div.className = 'addon-line';
  const displayLabel = addon.customLabel || addon.label;
  div.innerHTML = `<div class="comp-info"><div class="comp-name"><input class="comp-name-input" type="text" value="${escHtml(displayLabel)}"
             placeholder="${escHtml(addon.label)}"
             onchange="renameAddon(${addon.addonId},this.value)"
             title="Click to rename"></div></div>
    <div class="comp-qty">
      <button class="comp-qty-btn" onclick="changeAddonQty(${addon.addonId},-1)">\u2212</button>
      <input class="comp-qty-input" type="number" step="any" value="${addon.qty}"
             onchange="setAddonQty(${addon.addonId},this)">
      <span class="comp-unit">${unit}</span>
      <button class="comp-qty-btn" onclick="changeAddonQty(${addon.addonId},1)">+</button>
    </div>
    <div class="comp-total">${fmt(total)}</div>
    <button class="qpkg-delete" onclick="removeAddon(${addon.addonId})" title="Remove" style="width:18px;height:18px;font-size:14px">\u00D7</button>`;
  return div;
}

// ─── Render: Totals ────────────────────────────────────────────────────────────
function renderTotals() {
  const services = calcServicesTotal();
  const grossServices = quotePackages.reduce((s, qp) => s + calcQuotePkgGross(qp), 0) + quoteAddons.reduce((s, a) => s + calcAddonTotal(a), 0);
  const pkgDiscounts = grossServices - services;
  const software = calcTotalSoftware();
  const std = services + software;
  const disc = calcDiscount(std);
  const partner = std - disc;
  const funder = calcFunderSubsidy(partner);
  const oop = partner - funder;
  const has = hasQuoteItems();

  // Package discounts row
  const pdRow = document.getElementById('pkgDiscountsRow');
  const gsRow = document.getElementById('grossServicesRow');
  if (pkgDiscounts > 0 && has) {
    gsRow.style.display = '';
    document.getElementById('grossServicesTotal').textContent = fmt(grossServices);
    pdRow.style.display = '';
    document.getElementById('pkgDiscountsDisplay').textContent = '\u2212' + fmt(pkgDiscounts);
  } else {
    gsRow.style.display = 'none';
    pdRow.style.display = 'none';
  }

  document.getElementById('servicesTotal').textContent = has ? fmt(services) : '\u2014';
  document.getElementById('softwareTotal').textContent = has ? fmt(software) : '\u2014';
  document.getElementById('standardTotal').textContent = has ? fmt(std) : '\u2014';
  document.getElementById('discountDisplay').textContent = disc > 0 ? '\u2212' + fmt(disc) : '';
  document.getElementById('partnerPrice').textContent = has ? fmt(partner) : '\u2014';
  document.getElementById('funderDisplay').textContent = funder > 0 ? '\u2212' + fmt(funder) : '';

  const oopRow = document.getElementById('oopRow');
  if (funder > 0 && has) {
    oopRow.style.display = '';
    document.getElementById('oopPrice').textContent = fmt(oop);
  } else {
    oopRow.style.display = 'none';
  }

  const sn = document.getElementById('savingsNote');
  if (disc > 0 && has) {
    sn.textContent = `Partner saves ${fmt(disc)} \u2014 ${Math.round(disc / std * 100)}% off standard`;
    sn.classList.add('show');
  } else { sn.classList.remove('show'); }

  renderInsights();
  saveToUrl();
}

function renderInsights() {
  const section = document.getElementById('insightsSection');
  const has = hasQuoteItems();
  section.style.display = has ? '' : 'none';
  if (!has) return;

  const std = calcStandardTotal();
  const disc = calcDiscount(std);
  const partner = std - disc;
  const funder = calcFunderSubsidy(partner);
  const finalCost = partner - funder;

  const students = parseFloat(document.getElementById('studentCount').value) || 0;
  const educators = parseFloat(document.getElementById('educatorCount').value) || 0;
  document.getElementById('perStudentCost').textContent = students > 0 ? fmt(Math.round(finalCost / students)) + '/student' : '\u2014';
  document.getElementById('perEducatorCost').textContent = educators > 0 ? fmt(Math.round(finalCost / educators)) + '/educator' : '\u2014';
}

// ─── Clear All ──────────────────────────────────────────────────────────────────
function resetBuilderState() {
  quotePackages = [];
  quoteAddons = [];
  quoteLicenses = [];
  nextPkgId = 1;
  nextAddonId = 1;
  nextLicenseId = 1;
  expandedPkgId = null;
  activeConfigPkgId = null;
  configState = {};
  rates = { ...DEFAULT_RATES };
  document.getElementById('rateLp').value = DEFAULT_RATES.lp;
  document.getElementById('rateDev').value = DEFAULT_RATES.dev;
  document.getElementById('rateTravel').value = DEFAULT_RATES.travel;
  updateRateStatus();
  document.getElementById('discountVal').value = '';
  document.getElementById('discountName').value = '';
  document.getElementById('funderVal').value = '';
  document.getElementById('funderName').value = '';
  document.getElementById('partnerName').value = '';
  document.getElementById('studentCount').value = '';
  document.getElementById('educatorCount').value = '';
}

function clearAll() {
  resetBuilderState();
  renderAll();
  saveToUrl();
  renderTabBar();
}

// ─── Rate Editor ──────────────────────────────────────────────────────────────
function updateRates() {
  rates.lp = parseFloat(document.getElementById('rateLp').value) || DEFAULT_RATES.lp;
  rates.dev = parseFloat(document.getElementById('rateDev').value) || DEFAULT_RATES.dev;
  rates.travel = parseFloat(document.getElementById('rateTravel').value) || DEFAULT_RATES.travel;
  updateRateStatus();
  renderAll();
}

function resetRates() {
  rates = { ...DEFAULT_RATES };
  document.getElementById('rateLp').value = DEFAULT_RATES.lp;
  document.getElementById('rateDev').value = DEFAULT_RATES.dev;
  document.getElementById('rateTravel').value = DEFAULT_RATES.travel;
  updateRateStatus();
  renderAll();
}

function updateRateStatus() {
  const el = document.getElementById('rateStatus');
  if (!el) return;
  const isDefault = rates.lp === DEFAULT_RATES.lp && rates.dev === DEFAULT_RATES.dev && rates.travel === DEFAULT_RATES.travel;
  el.textContent = `LP $${rates.lp} \u00B7 Dev $${rates.dev} \u00B7 Travel $${rates.travel}`;
  el.style.color = isDefault ? '' : 'var(--orange-600)';
}

// ─── Toast ──────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── Tab Switching ──────────────────────────────────────────────────────────
function switchMainTab(tab) {
  const btns = document.querySelectorAll('.tab-bar > .tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  const views = {
    welcome: document.getElementById('welcomeView'),
    builder: document.querySelector('.builder'),
    pricing: document.getElementById('pricingView'),
    resources: document.getElementById('resourcesView'),
    skills: document.getElementById('skillsView')
  };
  Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
  const tabIndex = { welcome: 0, builder: 1, pricing: 2, resources: 3, skills: 4 };
  if (btns[tabIndex[tab]]) btns[tabIndex[tab]].classList.add('active');
  track('tab_view', { tab_name: tab });
  if (tab === 'builder') {
    views.builder.style.display = 'grid';
  } else if (views[tab]) {
    views[tab].style.display = '';
  }
}

// ─── Cowork Skills Search ────────────────────────────────────────────────────
function filterSkills(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.skill-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = q && !text.includes(q) ? 'none' : '';
  });
  document.querySelectorAll('.skills-category').forEach(cat => {
    const visible = cat.querySelectorAll('.skill-card:not([style*="display: none"])');
    cat.style.display = visible.length === 0 ? 'none' : '';
  });
}

// ─── Render All ──────────────────────────────────────────────────────────────
function renderAll() {
  try {
    renderCatalog();
    renderAddonGrid();
    renderSwCards();
    renderLicenseList();
    renderQuote();
    renderTotals();
  } catch (err) {
    console.error('Render error:', err);
    showToast('Render error \u2014 try clearing your data');
  }
}

// ─── URL State ─────────────────────────────────────────────────────────────────
function getTabState() {
  // Compute prices so the proposal command can use them directly
  const std = calcStandardTotal();
  const discVal = parseFloat(document.getElementById('discountVal').value) || 0;
  const discType = document.getElementById('discountType').value;
  const discAmt = calcDiscount(std);
  const partnerTotal = std - discAmt;
  const funderAmt = calcFunderSubsidy(partnerTotal);
  const oopTotal = partnerTotal - funderAmt;

  return {
    v: 4,
    partner: document.getElementById('partnerName').value,
    currency: selectedCurrency,
    rates: (rates.lp !== DEFAULT_RATES.lp || rates.dev !== DEFAULT_RATES.dev || rates.travel !== DEFAULT_RATES.travel) ? rates : undefined,
    discountVal: document.getElementById('discountVal').value,
    discountType: document.getElementById('discountType').value,
    discountName: document.getElementById('discountName').value,
    funderVal: document.getElementById('funderVal').value,
    funderType: document.getElementById('funderType').value,
    funderName: document.getElementById('funderName').value,
    students: document.getElementById('studentCount').value,
    educators: document.getElementById('educatorCount').value,
    prices: {
      softwareTotal: calcTotalSoftware(),
      packages: quotePackages.map(qp => ({
        gross: calcQuotePkgGross(qp),
        net: calcQuotePkgNet(qp),
        discount: qp.discount || 0
      })),
      addons: quoteAddons.map(a => calcAddonTotal(a)),
      grossServicesTotal: quotePackages.reduce((s, qp) => s + calcQuotePkgGross(qp), 0) + quoteAddons.reduce((s, a) => s + calcAddonTotal(a), 0),
      packageDiscounts: quotePackages.reduce((s, qp) => s + (calcQuotePkgGross(qp) - calcQuotePkgNet(qp)), 0),
      servicesTotal: calcServicesTotal(),
      standardTotal: std,
      discountAmount: discAmt,
      partnerTotal: partnerTotal,
      funderAmount: funderAmt,
      outOfPocket: oopTotal,
      grandTotal: funderAmt > 0 ? oopTotal : partnerTotal
    },
    licenses: quoteLicenses.map(l => ({ tierId: l.tierId, count: l.count, customName: l.customName || undefined, students: l.students || undefined })),
    packages: quotePackages.map(qp => ({
      packageId: qp.packageId,
      customName: qp.customName || undefined,
      participants: qp.participants,
      facilitators: qp.facilitatorsManual ? qp.facilitators : undefined,
      sessions: qp.sessions.map(s => ({ hours: s.hours, delivery: s.delivery })),
      travelLocalDays: qp.travelLocalDays,
      travelFlightTrips: qp.travelFlightTrips,
      launchMeetingQty: qp.launchMeetingQty,
      officeHoursQty: qp.officeHoursQty,
      checkInQty: qp.checkInQty || 0,
      reflectionMeetingQty: qp.reflectionMeetingQty || 0,
      discount: qp.discount || 0,
      components: qp.components.map(c => ({ id: c.id, qty: c.qty, customLabel: c.customLabel || undefined }))
    })),
    addons: quoteAddons.map(a => ({ blockId: a.blockId, qty: a.qty, customLabel: a.customLabel || undefined }))
  };
}

function saveToUrl() {
  const state = getTabState();
  try {
    const hash = btoa(JSON.stringify(state));
    history.replaceState(null, '', '#' + hash);
  } catch {}
  saveActiveTab();
}

function hydrateState(state) {
  if (state.partner) document.getElementById('partnerName').value = state.partner;
  if (state.currency && CURRENCIES[state.currency]) selectedCurrency = state.currency;
  if (state.rates) {
    rates = { ...DEFAULT_RATES, ...state.rates };
    document.getElementById('rateLp').value = rates.lp;
    document.getElementById('rateDev').value = rates.dev;
    document.getElementById('rateTravel').value = rates.travel;
    updateRateStatus();
  }
  if (state.discountVal) document.getElementById('discountVal').value = state.discountVal;
  if (state.discountType) document.getElementById('discountType').value = state.discountType;
  if (state.discountName) document.getElementById('discountName').value = state.discountName;
  if (state.funderVal) document.getElementById('funderVal').value = state.funderVal;
  if (state.funderType) document.getElementById('funderType').value = state.funderType;
  if (state.funderName) document.getElementById('funderName').value = state.funderName;
  if (state.students) document.getElementById('studentCount').value = state.students;
  if (state.educators) document.getElementById('educatorCount').value = state.educators;

  // Load licenses (v3 format)
  if (state.licenses) {
    for (const sl of state.licenses) {
      const tier = SOFTWARE_TIERS.find(t => t.id === sl.tierId);
      if (!tier) continue;
      const lic = { licenseId: nextLicenseId++, tierId: sl.tierId, count: sl.count || tier.defaultCount, customName: sl.customName || '' };
      if (sl.students) lic.students = sl.students;
      quoteLicenses.push(lic);
    }
  }
  // Backward compat: v2 tier/tierCounts
  if (!state.licenses && state.tier) {
    const tierId = state.tier;
    const tier = SOFTWARE_TIERS.find(t => t.id === tierId);
    if (tier) {
      const count = state.tierCounts?.[tierId] || tier.defaultCount;
      quoteLicenses.push({ licenseId: nextLicenseId++, tierId, count, customName: '' });
    }
  }

  if (state.packages) {
    for (const sp of state.packages) {
      const pkg = PACKAGES.find(p => p.id === sp.packageId);
      if (!pkg) continue;
      let compId = 1;
      const components = pkg.components.map(c => ({ ...c, id: 'c' + compId++ }));
      if (sp.components) {
        for (const sc of sp.components) {
          const comp = components.find(c => c.id === sc.id);
          if (comp) { comp.qty = sc.qty; if (sc.customLabel) comp.customLabel = sc.customLabel; }
        }
      }
      const participants = sp.participants || 40;
      const hasFac = pkg.facilitationHours && pkg.facilitationHours > 0;

      // Load sessions: new format (sessions array) or backward compat (deliveryMode + sessionCount)
      let sessions;
      if (sp.sessions && Array.isArray(sp.sessions)) {
        sessions = sp.sessions.map(s => ({ hours: s.hours || 0, delivery: s.delivery || 'virtual' }));
      } else {
        // Backward compat from v3 old format
        const sessionCount = sp.sessionCount || 1;
        const sessionDuration = sp.sessionDuration || (hasFac ? pkg.facilitationHours : 0);
        const delivery = sp.deliveryMode || 'virtual';
        sessions = [];
        for (let si = 0; si < sessionCount; si++) {
          sessions.push({ hours: sessionDuration, delivery });
        }
      }

      const autoFac = Math.max(1, Math.ceil(participants / 40));
      const defaultDiscount = (pkg.pathwayDiscount || 0) * 100;
      const qpkg = {
        pkgId: nextPkgId++,
        packageId: sp.packageId,
        customName: sp.customName || null,
        participants,
        facilitators: sp.facilitators || autoFac,
        facilitatorsManual: sp.facilitators ? (sp.facilitators !== autoFac) : false,
        sessions,
        travelLocalDays: sp.travelLocalDays ?? getDefaultTravelCounts(sessions).localDays,
        travelFlightTrips: sp.travelFlightTrips ?? getDefaultTravelCounts(sessions).flightTrips,
        launchMeetingQty: sp.launchMeetingQty !== undefined ? sp.launchMeetingQty : getSupportDefaults(pkg, sessions).launchMeetingQty,
        officeHoursQty: sp.officeHoursQty !== undefined ? sp.officeHoursQty : getSupportDefaults(pkg, sessions).officeHoursQty,
        checkInQty: sp.checkInQty !== undefined ? sp.checkInQty : getSupportDefaults(pkg, sessions).checkInQty,
        reflectionMeetingQty: sp.reflectionMeetingQty !== undefined ? sp.reflectionMeetingQty : getSupportDefaults(pkg, sessions).reflectionMeetingQty,
        discount: sp.discount !== undefined ? sp.discount : defaultDiscount,
        components
      };
      quotePackages.push(qpkg);
    }
    if (quotePackages.length > 0) expandedPkgId = quotePackages[0].pkgId;
  }

  if (state.addons) {
    for (const sa of state.addons) {
      const def = ADDONS.find(a => a.blockId === sa.blockId);
      if (!def) continue;
      quoteAddons.push({
        addonId: nextAddonId++,
        blockId: def.blockId,
        label: def.label,
        customLabel: sa.customLabel || null,
        unit: def.unit,
        qty: sa.qty || def.defaultQty,
        minQty: def.minQty,
        step: def.step
      });
    }
  }

  document.getElementById('currencySelect').value = selectedCurrency;
}

function loadFromUrl() {
  const hash = location.hash.slice(1);
  if (!hash) return false;
  try {
    const state = JSON.parse(atob(hash));
    hydrateState(state);
    track('open_shared_link', { partner: state.partner || '', packages: (state.pkgs || []).length, addons: (state.addons || []).length });
    return true;
  } catch { return false; }
}

// ─── Copy for Proposal ────────────────────────────────────────────────────────
function copyForProposal() {
  if (!hasQuoteItems()) { showToast('Add services first'); return; }

  const partner = document.getElementById('partnerName').value.trim() || '[Partner]';
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const std = calcStandardTotal();
  const disc = calcDiscount(std);
  const partnerTotal = std - disc;
  const funderAmt = calcFunderSubsidy(partnerTotal);
  const oopTotal = partnerTotal - funderAmt;
  const W = 52;
  const pad = (l, r) => l + ' ' + '.'.repeat(Math.max(2, W - l.length - r.length - 1)) + ' ' + r;

  const lines = [];
  lines.push(`${partner} x Playlab \u2014 Partnership Proposal`);
  lines.push(`Date: ${today}`);
  if (selectedCurrency !== 'USD') {
    const note = ratesLastUpdated ? `ECB rate as of ${ratesLastUpdated}` : 'approximate rate';
    lines.push(`Currency: ${selectedCurrency} (${getCurrency().rate}\u00D7 USD \u2014 ${note})`);
  }
  lines.push('');

  // Software
  if (quoteLicenses.length > 0) {
    lines.push('SOFTWARE & LICENSING');
    lines.push('\u2500'.repeat(W));
    for (const lic of quoteLicenses) {
      const tier = SOFTWARE_TIERS.find(t => t.id === lic.tierId);
      if (!tier) continue;
      const cost = calcLicenseCost(lic);
      const licLabel = lic.customName ? `Playlab ${tier.name} (${lic.customName})` : `Playlab ${tier.name}`;
      const studentNote = lic.students ? ` \u2014 ${lic.students.toLocaleString()} students` : '';
      lines.push(pad(`  \u2022 ${licLabel} \u2014 ${lic.count.toLocaleString()} ${lic.count === 1 ? tier.unitLabel : tier.unitLabelPlural} @ $${tier.pricePerUnit}/${tier.unitLabel}/yr${studentNote}`, fmt(cost)));
    }
    lines.push('');
  }

  // Services
  if (quotePackages.length > 0 || quoteAddons.length > 0) {
    lines.push('SERVICES');
    lines.push('\u2500'.repeat(W));

    for (const qpkg of quotePackages) {
      const pkg = PACKAGES.find(p => p.id === qpkg.packageId);
      const net = calcQuotePkgNet(qpkg);
      lines.push('');
      const sessions = qpkg.sessions || [];
      const deliveryModes = [...new Set(sessions.map(s => s.delivery))];
      const deliveryTag = deliveryModes.length === 1 && deliveryModes[0] !== 'virtual' ? ` [${deliveryModes[0]}]` : deliveryModes.length > 1 ? ` [mixed delivery]` : '';
      const proposalPkgName = qpkg.customName || (pkg ? (pkg.name) : 'Package');
      lines.push(pad(`  ${proposalPkgName}${deliveryTag}`, fmt(net)));
      if (sessions.length > 0) {
        for (let si = 0; si < sessions.length; si++) {
          const s = sessions[si];
          const dTag = s.delivery !== 'virtual' ? ` (${s.delivery})` : '';
          lines.push(`    Session ${si + 1}: ${s.hours} hrs${dTag}`);
        }
      }
      for (const comp of qpkg.components) {
        const effQty = comp.scalable ? comp.qty * qpkg.facilitators : comp.qty;
        const total = getBlockPrice(comp.blockId) * effQty;
        const isRetainer = comp.blockId.startsWith('coaching-retainer-');
        const qtyStr = isRetainer ? ` (${effQty} months)` : comp.blockId.includes('tool-') || comp.blockId.includes('ideation') ? '' : ` (${effQty} hrs)`;
        lines.push(`    \u2022 ${comp.customLabel || comp.label}${qtyStr} \u2014 ${fmt(total)}`);
      }
      const travelCost = calcTravelCost(qpkg);
      if (travelCost > 0) {
        const nonVirtualCount = sessions.filter(s => s.delivery !== 'virtual').length;
        const facNote = qpkg.facilitators > 1 ? `, ${qpkg.facilitators} facilitators` : '';
        lines.push(`    \u2022 Travel (${nonVirtualCount} ${nonVirtualCount > 1 ? 'sessions' : 'session'}${facNote}) \u2014 ${fmt(travelCost)}`);
      }
      if (qpkg.launchMeetingQty > 0) {
        lines.push(`    \u2022 Launch Meeting (${qpkg.launchMeetingQty}\u00D7) \u2014 ${fmt(qpkg.launchMeetingQty * getBlockPrice('admin-meetings'))}`);
      }
      if (qpkg.officeHoursQty > 0) {
        lines.push(`    \u2022 Office Hours (${qpkg.officeHoursQty} hrs) \u2014 ${fmt(qpkg.officeHoursQty * getBlockPrice('office-hours'))}`);
      }
      if ((qpkg.checkInQty || 0) > 0) {
        lines.push(`    \u2022 Check-ins (${qpkg.checkInQty}\u00D7 30 min) \u2014 ${fmt(qpkg.checkInQty * 0.5 * getBlockPrice('office-hours'))}`);
      }
      if ((qpkg.reflectionMeetingQty || 0) > 0) {
        lines.push(`    \u2022 Reflection Meeting (${qpkg.reflectionMeetingQty}\u00D7) \u2014 ${fmt(qpkg.reflectionMeetingQty * getBlockPrice('office-hours'))}`);
      }
      if (qpkg.discount > 0) {
        const discAmt = calcQuotePkgGross(qpkg) * qpkg.discount / 100;
        lines.push(`    \u2022 Package Discount (${Math.round(qpkg.discount)}%) \u2014 \u2212${fmt(discAmt)}`);
      }
      if (qpkg.facilitators > 1) {
        lines.push(`    (${qpkg.participants} participants \u2192 ${qpkg.facilitators} facilitators)`);
      }
    }

    if (quoteAddons.length > 0) {
      lines.push('');
      lines.push('  ' + 'Add-Ons');
      for (const addon of quoteAddons) {
        const total = calcAddonTotal(addon);
        const qtyStr = addon.unit === 'flat' ? '' : ` (${addon.qty} ${addon.unit}${addon.qty !== 1 ? 's' : ''})`;
        lines.push(pad(`    \u2022 ${addon.customLabel || addon.label}${qtyStr}`, fmt(total)));
      }
    }
    lines.push('');
  }

  // Totals
  lines.push('\u2500'.repeat(W));
  lines.push(pad('Standard Total', fmt(std)));
  if (disc > 0) {
    const discName = document.getElementById('discountName').value.trim() || 'Discount';
    const discVal = document.getElementById('discountVal').value;
    const discType = document.getElementById('discountType').value;
    const discLabel = discType === 'pct' ? `${discName} (${discVal}%)` : `${discName}`;
    lines.push(pad(discLabel, '\u2212' + fmt(disc)));
  }
  lines.push(pad('Custom Partner Price', fmt(partnerTotal)));
  if (funderAmt > 0) {
    const funderName = document.getElementById('funderName').value.trim() || 'Funder Subsidy';
    const funderVal = document.getElementById('funderVal').value;
    const funderType = document.getElementById('funderType').value;
    const funderLabel = funderType === 'pct' ? `${funderName} (${funderVal}%)` : `${funderName}`;
    lines.push(pad(funderLabel, '\u2212' + fmt(funderAmt)));
    lines.push(pad('Partner Out-of-Pocket', fmt(oopTotal)));
  }
  lines.push('');

  const finalCost = funderAmt > 0 ? oopTotal : partnerTotal;
  const students = parseFloat(document.getElementById('studentCount').value) || 0;
  const educators = parseFloat(document.getElementById('educatorCount').value) || 0;
  if (students > 0) lines.push(`Per-student cost: ${fmt(Math.round(finalCost / students))}/student (${students.toLocaleString()} students)`);
  if (educators > 0) lines.push(`Per-educator cost: ${fmt(Math.round(finalCost / educators))}/educator (${educators.toLocaleString()} educators)`);
  if (students > 0 || educators > 0) lines.push('');

  lines.push('* AI model usage costs are covered by Playlab and not passed on to partners.');

  const output = lines.join('\n');
  navigator.clipboard.writeText(output).then(() => {
    track('copy_quote', { format: 'proposal', partner: partner, currency: selectedCurrency, total_usd: std, packages: quotePackages.length, addons: quoteAddons.length });
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy for Proposal'; btn.classList.remove('copied'); }, 2000);
  });
}

// ─── Copy as Markdown ─────────────────────────────────────────────────────────
function copyAsMarkdown() {
  if (!hasQuoteItems()) { showToast('Add services first'); return; }

  const partner = document.getElementById('partnerName').value.trim() || '[Partner]';
  const std = calcStandardTotal();
  const disc = calcDiscount(std);
  const partnerTotal = std - disc;
  const funderAmt = calcFunderSubsidy(partnerTotal);
  const oopTotal = partnerTotal - funderAmt;

  let md = `# ${partner} x Playlab \u2014 Partnership Proposal\n\n`;

  if (quoteLicenses.length > 0) {
    md += `## SOFTWARE & LICENSING\n\n`;
    md += `| License | Details | Annual Cost |\n|---|---|---|\n`;
    for (const lic of quoteLicenses) {
      const tier = SOFTWARE_TIERS.find(t => t.id === lic.tierId);
      if (!tier) continue;
      const cost = calcLicenseCost(lic);
      const licLabel = lic.customName ? `Playlab ${tier.name} (${lic.customName})` : `Playlab ${tier.name}`;
      const studentMd = lic.students ? ` · ${lic.students.toLocaleString()} students` : '';
      md += `| ${licLabel} | ${lic.count.toLocaleString()} ${lic.count === 1 ? tier.unitLabel : tier.unitLabelPlural}${studentMd} | ${fmt(cost)}/yr |\n`;
    }
    md += '\n';
  }

  md += `## SERVICES\n\n`;
  md += `| Services | Standard Total | Custom Partner Price |\n|---|---|---|\n`;

  for (const qpkg of quotePackages) {
    const pkg = PACKAGES.find(p => p.id === qpkg.packageId);
    const gross = calcQuotePkgGross(qpkg);
    const net = calcQuotePkgNet(qpkg);
    const sessions = qpkg.sessions || [];
    const deliveryModes = [...new Set(sessions.map(s => s.delivery))];
    const deliveryTag = deliveryModes.length === 1 && deliveryModes[0] !== 'virtual' ? ` [${deliveryModes[0]}]` : deliveryModes.length > 1 ? ` [mixed delivery]` : '';
    md += `| **${qpkg.customName || (pkg ? (pkg.name) : 'Package')}${deliveryTag}** | ${fmt(gross)} | ${fmt(net)} |\n`;
  }
  for (const addon of quoteAddons) {
    const total = calcAddonTotal(addon);
    md += `| ${addon.customLabel || addon.label} | ${fmt(total)} | ${fmt(total)} |\n`;
  }

  md += `\n**Standard Total:** ${fmt(std)}\n\n`;
  if (disc > 0) {
    const discName = document.getElementById('discountName').value.trim() || 'Discount';
    md += `**${discName}:** \u2212${fmt(disc)}\n\n`;
  }
  md += `**Custom Partner Price:** ${fmt(partnerTotal)}\n\n`;
  if (funderAmt > 0) {
    const funderName = document.getElementById('funderName').value.trim() || 'Funder Subsidy';
    const funderVal = document.getElementById('funderVal').value;
    const funderType = document.getElementById('funderType').value;
    const funderLabel = funderType === 'pct' ? `${funderName} (${funderVal}%)` : `${funderName}`;
    md += `**${funderLabel}:** \u2212${fmt(funderAmt)}\n\n`;
    md += `**Partner Out-of-Pocket:** ${fmt(oopTotal)}\n\n`;
  }
  md += `*${'* AI model usage costs are covered by Playlab and not passed on to partners.'.replace(/^\* ?/, '')}*\n`;

  navigator.clipboard.writeText(md).then(() => {
    track('copy_quote', { format: 'markdown', partner: partner, currency: selectedCurrency, total_usd: std, packages: quotePackages.length, addons: quoteAddons.length });
    const btn = document.getElementById('copyMdBtn');
    btn.textContent = '\u2713';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'MD'; btn.classList.remove('copied'); }, 2000);
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────
document.getElementById('copyLinkBtn').addEventListener('click', () => {
  saveToUrl();
  navigator.clipboard.writeText(location.href).then(() => {
    track('share_link', { packages: quotePackages.length, addons: quoteAddons.length });
    const btn = document.getElementById('copyLinkBtn');
    btn.textContent = 'Link Copied!';
    btn.style.background = 'var(--emerald-500)';
    setTimeout(() => { btn.textContent = 'Copy Shareable Link'; btn.style.background = 'var(--slate-700)'; }, 2000);
  });
});
document.getElementById('clearBtn').addEventListener('click', clearAll);
document.getElementById('discountVal').addEventListener('input', renderTotals);
document.getElementById('discountType').addEventListener('change', renderTotals);
document.getElementById('discountName').addEventListener('change', saveToUrl);
document.getElementById('funderVal').addEventListener('input', renderTotals);
document.getElementById('funderType').addEventListener('change', renderTotals);
document.getElementById('funderName').addEventListener('change', saveToUrl);
document.getElementById('partnerName').addEventListener('change', saveToUrl);
document.getElementById('partnerName').addEventListener('input', renderTabBar);
document.getElementById('studentCount').addEventListener('input', () => { renderInsights(); saveToUrl(); });
document.getElementById('educatorCount').addEventListener('input', () => { renderInsights(); saveToUrl(); });
document.getElementById('currencySelect').addEventListener('change', function() {
  selectedCurrency = this.value;
  track('currency_change', { currency: this.value });
  const cur = getCurrency();
  const sym = cur.prefix ? cur.symbol.trim() : cur.symbol.trim();
  document.getElementById('discFlatLabel').textContent = sym;
  document.getElementById('funderFlatLabel').textContent = sym;
  renderAll();
});

// ─── Tab Management ──────────────────────────────────────────────────────────
let builderTabs = [];
let activeTabId = null;

function generateTabId() {
  return 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function loadTabState(state) {
  resetBuilderState();
  if (!state) { renderAll(); return; }
  try {
    hydrateState(state);
  } catch (e) { console.error('loadTabState error:', e); }
  renderAll();
}

function saveActiveTab() {
  if (!activeTabId) return;
  const tab = builderTabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.state = getTabState();
  tab.name = document.getElementById('partnerName').value || 'New Quote';
  try {
    localStorage.setItem('playlab_builder_tabs', JSON.stringify(builderTabs));
    localStorage.setItem('playlab_builder_activeTabId', activeTabId);
  } catch {}
}

function switchQuoteTab(tabId) {
  if (tabId === activeTabId) return;
  saveActiveTab();
  activeTabId = tabId;
  const tab = builderTabs.find(t => t.id === tabId);
  if (tab) {
    loadTabState(tab.state);
  }
  try {
    localStorage.setItem('playlab_builder_activeTabId', activeTabId);
  } catch {}
  renderTabBar();
  // Update URL hash for the newly active tab
  const state = getTabState();
  try {
    const hash = btoa(JSON.stringify(state));
    history.replaceState(null, '', '#' + hash);
  } catch {}
}

function createNewTab() {
  saveActiveTab();
  const newTab = { id: generateTabId(), name: 'New Quote', state: null };
  builderTabs.push(newTab);
  activeTabId = newTab.id;
  resetBuilderState();
  renderAll();
  try {
    localStorage.setItem('playlab_builder_tabs', JSON.stringify(builderTabs));
    localStorage.setItem('playlab_builder_activeTabId', activeTabId);
  } catch {}
  renderTabBar();
  history.replaceState(null, '', location.pathname);
}

function deleteTab(tabId) {
  const tab = builderTabs.find(t => t.id === tabId);
  if (!tab) return;
  // Check if tab has content
  const hasContent = tab.state && (
    (tab.state.packages && tab.state.packages.length > 0) ||
    (tab.state.addons && tab.state.addons.length > 0) ||
    (tab.state.licenses && tab.state.licenses.length > 0) ||
    (tab.state.partner && tab.state.partner.trim())
  );
  const isSaved = !!tab._libFile;
  if (hasContent && !isSaved && !confirm(`Close tab "${tab.name}"? This quote is NOT saved to the Library and will be lost.`)) return;
  if (hasContent && isSaved && !confirm(`Close tab "${tab.name}"? You can reload it anytime from the Library.`)) return;

  const idx = builderTabs.findIndex(t => t.id === tabId);
  builderTabs.splice(idx, 1);

  if (builderTabs.length === 0) {
    // Always keep at least one tab
    const newTab = { id: generateTabId(), name: 'New Quote', state: null };
    builderTabs.push(newTab);
    activeTabId = newTab.id;
    resetBuilderState();
    renderAll();
  } else if (activeTabId === tabId) {
    // Switch to nearest tab
    const newIdx = Math.min(idx, builderTabs.length - 1);
    activeTabId = builderTabs[newIdx].id;
    loadTabState(builderTabs[newIdx].state);
  }

  try {
    localStorage.setItem('playlab_builder_tabs', JSON.stringify(builderTabs));
    localStorage.setItem('playlab_builder_activeTabId', activeTabId);
  } catch {}
  renderTabBar();
}

function renderTabBar() {
  const bar = document.getElementById('quoteTabBar');
  if (!bar) return;
  // Update the active tab name from current partner input (live)
  const currentName = document.getElementById('partnerName').value || 'New Quote';
  const activeTab = builderTabs.find(t => t.id === activeTabId);
  if (activeTab) activeTab.name = currentName;

  let html = '';
  for (const tab of builderTabs) {
    const isActive = tab.id === activeTabId;
    const displayName = tab.name || 'New Quote';
    html += '<button class="quote-tab' + (isActive ? ' active' : '') + '" onclick="switchQuoteTab(\'' + tab.id + '\')" title="' + escHtml(displayName) + '">';
    html += '<span class="quote-tab-name">' + escHtml(displayName) + '</span>';
    html += '<span class="quote-tab-close" onclick="event.stopPropagation(); deleteTab(\'' + tab.id + '\')">&times;</span>';
    html += '</button>';
  }
  html += '<button class="quote-tab-new" onclick="createNewTab()">+ New</button>';
  bar.innerHTML = html;
  // Library button is rendered separately (outside scrollable tabs, in the wrapper)
  const wrap = document.getElementById('quoteTabWrap');
  if (wrap && !document.getElementById('libraryBtn')) {
    const libBtn = document.createElement('button');
    libBtn.id = 'libraryBtn';
    libBtn.className = 'library-tab-btn';
    libBtn.onclick = openLibrary;
    libBtn.title = 'Open saved quotes library';
    libBtn.innerHTML = '&#x1F4C1; Library';
    wrap.insertBefore(libBtn, bar);
  }
}

function initTabs() {
  try {
    const saved = localStorage.getItem('playlab_builder_tabs');
    const savedActiveId = localStorage.getItem('playlab_builder_activeTabId');
    if (saved) {
      builderTabs = JSON.parse(saved);
      if (builderTabs.length > 0) {
        activeTabId = (savedActiveId && builderTabs.find(t => t.id === savedActiveId)) ? savedActiveId : builderTabs[0].id;
      }
    }
  } catch {}

  if (builderTabs.length === 0) {
    const newTab = { id: generateTabId(), name: 'New Quote', state: null };
    builderTabs.push(newTab);
    activeTabId = newTab.id;
  }

  renderTabBar();
}

// ─── Quote Library (GitHub Backend) ──────────────────────────────────────────
// Single directory (quotes/) with status field in index. No file moves for archive/restore.
const LIB_OWNER = 'nkelloggplaylab';
const LIB_REPO = 'playlab-quotes';
const LIB_QUOTES_PATH = 'quotes';
const LIB_TOKEN_KEY = 'playlab_github_token';
const LIB_USERNAME_KEY = 'playlab_github_user';
const LIB_DRAFT_KEY = 'playlab_library_draft';
const LIB_CACHE_KEY = 'playlab_library_cache';
const LIB_CACHE_TTL = 60000; // 60s

function getLibToken() { return localStorage.getItem(LIB_TOKEN_KEY); }
function getLibUsername() { return localStorage.getItem(LIB_USERNAME_KEY) || 'Team'; }

function promptLibToken(callback) {
  document.getElementById('tokenError').classList.remove('show');
  document.getElementById('githubTokenInput').value = '';
  const nameInput = document.getElementById('displayNameInput');
  const existing = getLibUsername();
  nameInput.value = existing === 'Team' ? '' : existing;
  document.getElementById('tokenOverlay').classList.add('open');
  window._tokenCallback = callback || null;
  setTimeout(() => (nameInput.value ? document.getElementById('githubTokenInput') : nameInput).focus(), 100);
}

function closeTokenPrompt() {
  document.getElementById('tokenOverlay').classList.remove('open');
  window._tokenCallback = null;
}

async function submitGithubToken() {
  const input = document.getElementById('githubTokenInput');
  const nameInput = document.getElementById('displayNameInput');
  const token = input.value.trim();
  const displayName = nameInput.value.trim();
  if (!token) return;
  if (!displayName) { nameInput.focus(); return; }
  try {
    // Validate: check repo access
    const repoResp = await fetch(`https://api.github.com/repos/${LIB_OWNER}/${LIB_REPO}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!repoResp.ok) { document.getElementById('tokenError').classList.add('show'); return; }
    localStorage.setItem(LIB_USERNAME_KEY, displayName);
    localStorage.setItem(LIB_TOKEN_KEY, token);
    closeTokenPrompt();
    updateSaveAttribution();
    updateUserBadge();
    if (window._tokenCallback) { window._tokenCallback(); window._tokenCallback = null; }
  } catch { document.getElementById('tokenError').classList.add('show'); }
}

let libEditingName = false;

function startEditName() {
  if (libEditingName) return;
  libEditingName = true;
  const display = document.getElementById('libNameDisplay');
  const input = document.getElementById('libNameInput');
  const current = getLibUsername();
  input.value = current === 'Team' ? '' : current;
  display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

function commitEditName() {
  if (!libEditingName) return;
  libEditingName = false;
  const display = document.getElementById('libNameDisplay');
  const input = document.getElementById('libNameInput');
  const val = input.value.trim();
  if (val) localStorage.setItem(LIB_USERNAME_KEY, val);
  display.style.display = '';
  input.style.display = 'none';
  updateLibraryFilters();
  updateSaveAttribution();
  updateUserBadge();
  if (libraryFilterMine) {
    if (libraryActiveTab === 'active') renderLibraryList(false);
    else renderArchivedList(false);
  }
}

function cancelEditName() {
  libEditingName = false;
  const display = document.getElementById('libNameDisplay');
  const input = document.getElementById('libNameInput');
  display.style.display = '';
  input.style.display = 'none';
}

function updateUserBadge() {
  const el = document.getElementById('userBadgeName');
  if (!el) return;
  const name = getLibUsername();
  el.textContent = name === 'Team' ? '' : name;
}

function startEditUserBadge() {
  const display = document.getElementById('userBadgeName');
  const input = document.getElementById('userBadgeInput');
  const current = getLibUsername();
  input.value = current === 'Team' ? '' : current;
  display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

function commitEditUserBadge() {
  const display = document.getElementById('userBadgeName');
  const input = document.getElementById('userBadgeInput');
  const val = input.value.trim();
  if (val) localStorage.setItem(LIB_USERNAME_KEY, val);
  display.style.display = '';
  input.style.display = 'none';
  updateUserBadge();
  updateSaveAttribution();
  updateLibraryFilters();
}

function cancelEditUserBadge() {
  const display = document.getElementById('userBadgeName');
  const input = document.getElementById('userBadgeInput');
  display.style.display = '';
  input.style.display = 'none';
}

function updateSaveAttribution() {
  const el = document.getElementById('saveAttribution');
  if (!el) return;
  const name = getLibUsername();
  if (name === 'Team' || !getLibToken()) { el.textContent = ''; return; }
  el.textContent = 'Saving as ' + name;
}

async function libApi(method, path, body, retries) {
  const token = getLibToken();
  if (!token) return null;
  const url = `https://api.github.com/repos/${LIB_OWNER}/${LIB_REPO}/contents/${path}`;
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const resp = await fetch(url, opts);
    if (resp.status === 401) {
      localStorage.removeItem(LIB_TOKEN_KEY);
      showToast('GitHub token expired \u2014 please reconnect');
      return null;
    }
    return resp;
  } catch (e) {
    if ((retries || 0) < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return libApi(method, path, body, (retries || 0) + 1);
    }
    return null;
  }
}

function generateQuoteId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function validateQuoteData(data) {
  return data && typeof data === 'object' && data.quoteState && data.partnerName && data.savedAt;
}

function decodeBase64Content(b64) {
  const clean = b64.replace(/\s/g, '');
  return JSON.parse(decodeURIComponent(escape(atob(clean))));
}

function encodeJsonContent(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
}

// ─── Library: Index Management ───────────────────────────────────────────────
// Single index.json in quotes/ with status field per entry ('active'|'archived').
// Index entry: { partnerName, savedAt, savedBy, status }

async function readIndex() {
  const resp = await libApi('GET', `${LIB_QUOTES_PATH}/index.json`);
  if (!resp || resp.status === 404) return { entries: {}, sha: null };
  if (!resp.ok) return null;
  try {
    const file = await resp.json();
    const content = decodeBase64Content(file.content);
    return { entries: content || {}, sha: file.sha };
  } catch { return { entries: {}, sha: null }; }
}

async function patchIndex(patchFn) {
  // Read-patch-write with 409 retry. patchFn mutates entries in place.
  const idx = await readIndex();
  if (!idx) return false;
  patchFn(idx.entries);
  const body = { message: '[auto] Update index', content: encodeJsonContent(idx.entries) };
  if (idx.sha) body.sha = idx.sha;
  const resp = await libApi('PUT', `${LIB_QUOTES_PATH}/index.json`, body);
  if (resp && resp.ok) return true;
  if (resp && resp.status === 409) {
    // Re-read fresh, apply patch again, retry
    const fresh = await readIndex();
    if (!fresh) return false;
    patchFn(fresh.entries);
    const retryBody = { message: '[auto] Update index (retry)', content: encodeJsonContent(fresh.entries) };
    if (fresh.sha) retryBody.sha = fresh.sha;
    const retryResp = await libApi('PUT', `${LIB_QUOTES_PATH}/index.json`, retryBody);
    return retryResp && retryResp.ok;
  }
  return false;
}

// Rebuild index by scanning all files
async function rebuildIndex() {
  const body = document.getElementById('libraryBody');
  if (body) body.innerHTML = '<div class="library-loading">Rebuilding index&hellip;</div>';
  const resp = await libApi('GET', LIB_QUOTES_PATH);
  if (!resp || !resp.ok) { showToast('Rebuild failed \u2014 could not list files'); return null; }
  const files = await resp.json();
  const jsonFiles = files.filter(f => f.name.endsWith('.json') && f.name !== 'index.json' && f.name !== '.gitkeep');
  const entries = {};
  await Promise.all(jsonFiles.map(async f => {
    try {
      const r = await libApi('GET', `${LIB_QUOTES_PATH}/${f.name}`);
      if (!r || !r.ok) return;
      const file = await r.json();
      const content = decodeBase64Content(file.content);
      if (!validateQuoteData(content)) return;
      // Preserve existing status if present, default to 'active'
      entries[f.name] = {
        partnerName: content.partnerName,
        savedAt: content.savedAt,
        savedBy: content.savedBy || 'Team',
        status: content.status || 'active'
      };
    } catch {}
  }));
  const existingIdx = await readIndex();
  // Merge: keep status from existing index where available
  if (existingIdx && existingIdx.entries) {
    for (const [k, v] of Object.entries(existingIdx.entries)) {
      if (entries[k] && v.status) entries[k].status = v.status;
    }
  }
  const writeBody = { message: '[auto] Rebuild index', content: encodeJsonContent(entries) };
  if (existingIdx?.sha) writeBody.sha = existingIdx.sha;
  await libApi('PUT', `${LIB_QUOTES_PATH}/index.json`, writeBody);
  showToast('Index rebuilt \u2014 found ' + Object.keys(entries).length + ' quotes');
  try { sessionStorage.removeItem(LIB_CACHE_KEY); } catch {}
  return entries;
}

// ─── Library: List ───────────────────────────────────────────────────────────
async function listQuotesByStatus(status, forceRefresh) {
  const cacheKey = LIB_CACHE_KEY + '_' + status;
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const c = JSON.parse(cached);
        if (Date.now() - c.ts < LIB_CACHE_TTL) return c.data;
      }
    } catch {}
  }
  let idx = await readIndex();
  if (!idx) return null;
  let entries = idx.entries;
  // If index is empty and has no SHA, try rebuilding
  if (Object.keys(entries).length === 0 && !idx.sha) {
    const rebuilt = await rebuildIndex();
    if (rebuilt) entries = rebuilt;
  }
  const data = Object.entries(entries)
    .filter(([, meta]) => (meta.status || 'active') === status)
    .map(([filename, meta]) => ({
      filename, partnerName: meta.partnerName, savedAt: meta.savedAt, savedBy: meta.savedBy || 'Team'
    }))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
}

async function listLibraryQuotes(forceRefresh) {
  return listQuotesByStatus('active', forceRefresh);
}

async function listArchivedQuotes(forceRefresh) {
  return listQuotesByStatus('archived', forceRefresh);
}

// ─── Library: Save ───────────────────────────────────────────────────────────
async function saveQuoteToLibrary(name, state, existingFilename, existingSha) {
  const savedBy = getLibUsername();
  const metadata = {
    partnerName: name,
    savedAt: new Date().toISOString(),
    savedBy,
    quoteState: state
  };
  // Draft to localStorage first
  try { localStorage.setItem(LIB_DRAFT_KEY, JSON.stringify(metadata)); } catch {}

  const filename = existingFilename || (generateQuoteId() + '.json');
  const body = {
    message: `[auto] Save quote: ${name}`,
    content: encodeJsonContent(metadata)
  };
  if (existingSha) body.sha = existingSha;

  const resp = await libApi('PUT', `${LIB_QUOTES_PATH}/${filename}`, body);
  if (resp && resp.ok) {
    try { localStorage.removeItem(LIB_DRAFT_KEY); } catch {}
    // Update index (patch — only touches this entry)
    await patchIndex(entries => {
      entries[filename] = { partnerName: name, savedAt: metadata.savedAt, savedBy, status: 'active' };
    });
    try { sessionStorage.removeItem(LIB_CACHE_KEY + '_active'); } catch {}
    const result = await resp.json();
    return { filename, sha: result.content.sha };
  }
  if (resp && resp.status === 409) {
    try {
      const fresh = await libApi('GET', `${LIB_QUOTES_PATH}/${filename}`);
      if (fresh && fresh.ok) {
        const freshFile = await fresh.json();
        showToast('Quote was modified by someone else \u2014 click Save again to overwrite');
        return { filename, sha: freshFile.sha, conflict: true };
      }
    } catch {}
    showToast('Quote was modified by someone else \u2014 try loading it first');
    return null;
  }
  showToast('Save failed \u2014 your quote is safe locally. Try again.');
  return null;
}

// ─── Library: Load ───────────────────────────────────────────────────────────
async function loadQuoteFromLibrary(filename) {
  const resp = await libApi('GET', `${LIB_QUOTES_PATH}/${filename}`);
  if (!resp || !resp.ok) { showToast('Failed to load quote'); return null; }
  const file = await resp.json();
  try {
    const content = decodeBase64Content(file.content);
    if (!validateQuoteData(content)) { showToast('Quote file is corrupted'); return null; }
    return { ...content, _sha: file.sha, _filename: filename };
  } catch { showToast('Failed to parse quote'); return null; }
}

// ─── Library: Archive / Restore (status toggle — no file moves) ─────────────
let libBusy = false;

async function archiveQuote(filename) {
  const ok = await patchIndex(entries => {
    if (entries[filename]) entries[filename].status = 'archived';
  });
  if (!ok) { showToast('Failed to archive'); return false; }
  try { sessionStorage.removeItem(LIB_CACHE_KEY + '_active'); sessionStorage.removeItem(LIB_CACHE_KEY + '_archived'); } catch {}
  return true;
}

async function restoreQuote(filename) {
  const ok = await patchIndex(entries => {
    if (entries[filename]) entries[filename].status = 'active';
  });
  if (!ok) { showToast('Failed to restore'); return false; }
  try { sessionStorage.removeItem(LIB_CACHE_KEY + '_active'); sessionStorage.removeItem(LIB_CACHE_KEY + '_archived'); } catch {}
  return true;
}

// ─── Library UI ──────────────────────────────────────────────────────────────
let libraryActiveTab = 'active';
let libraryFilterMine = false;
let librarySearchQuery = '';

function openLibrary() {
  if (!getLibToken()) { promptLibToken(() => openLibrary()); return; }
  libraryActiveTab = 'active';
  libraryFilterMine = true;
  librarySearchQuery = '';
  updateLibraryTabs();
  updateLibraryFilters();
  document.getElementById('libraryOverlay').classList.add('open');
  document.getElementById('libraryBody').innerHTML = '<div class="library-loading">Loading saved quotes&hellip;</div>';
  renderLibraryList();
}

function closeLibrary() { document.getElementById('libraryOverlay').classList.remove('open'); }

function switchLibraryTab(tab) {
  libraryActiveTab = tab;
  updateLibraryTabs();
  document.getElementById('libraryBody').innerHTML = '<div class="library-loading">Loading&hellip;</div>';
  if (tab === 'active') renderLibraryList();
  else renderArchivedList();
}

function updateLibraryTabs() {
  const a = document.getElementById('libTabActive');
  const b = document.getElementById('libTabArchived');
  if (a) a.classList.toggle('active', libraryActiveTab === 'active');
  if (b) b.classList.toggle('active', libraryActiveTab === 'archived');
}

function updateLibraryFilters() {
  const bar = document.getElementById('libraryFilterBar');
  if (!bar) return;
  const mineBtn = document.getElementById('libFilterMine');
  const allBtn = document.getElementById('libFilterAll');
  const searchInput = document.getElementById('libSearchInput');
  const nameDisplay = document.getElementById('libNameDisplay');
  const name = getLibUsername();
  const firstName = name === 'Team' ? 'Mine' : name.split(' ')[0];
  if (nameDisplay) nameDisplay.textContent = firstName;
  if (mineBtn) mineBtn.classList.toggle('active', libraryFilterMine);
  if (allBtn) allBtn.classList.toggle('active', !libraryFilterMine);
  if (searchInput && searchInput.value !== librarySearchQuery) searchInput.value = librarySearchQuery;
}

function toggleLibraryFilter(mine) {
  libraryFilterMine = mine;
  updateLibraryFilters();
  if (libraryActiveTab === 'active') renderLibraryList(false);
  else renderArchivedList(false);
}

function onLibrarySearch(val) {
  librarySearchQuery = val.trim().toLowerCase();
  if (libraryActiveTab === 'active') renderLibraryList(false);
  else renderArchivedList(false);
}

function filterQuotes(quotes) {
  let filtered = quotes;
  if (libraryFilterMine) {
    const me = getLibUsername();
    filtered = filtered.filter(q => q.savedBy === me);
  }
  if (librarySearchQuery) {
    filtered = filtered.filter(q => q.partnerName.toLowerCase().includes(librarySearchQuery));
  }
  return filtered;
}

async function renderLibraryList(forceRefresh) {
  const body = document.getElementById('libraryBody');
  const quotes = await listLibraryQuotes(forceRefresh !== false);
  if (quotes === null) { body.innerHTML = '<div class="library-empty">Could not connect to the quote library. Check your token.</div>'; return; }
  if (quotes.length === 0) { body.innerHTML = '<div class="library-empty">No saved quotes yet. Use &ldquo;Save to Library&rdquo; in the builder to save your first quote.</div>'; return; }
  const filtered = filterQuotes(quotes);
  if (filtered.length === 0) {
    const msg = libraryFilterMine ? 'No quotes saved under your name yet. Switch to <strong>All</strong> to see team quotes.' : 'No matching quotes. Try a different search.';
    body.innerHTML = '<div class="library-empty">' + msg + '</div>'; return;
  }
  body.innerHTML = renderQuoteCards(filtered, 'active');
}

async function renderArchivedList(forceRefresh) {
  const body = document.getElementById('libraryBody');
  const quotes = await listArchivedQuotes(forceRefresh !== false);
  if (quotes === null) { body.innerHTML = '<div class="library-empty">Could not connect to the archive. Check your token.</div>'; return; }
  if (quotes.length === 0) { body.innerHTML = '<div class="library-empty">No archived quotes.</div>'; return; }
  const filtered = filterQuotes(quotes);
  if (filtered.length === 0) {
    const msg = libraryFilterMine ? 'No archived quotes under your name. Switch to <strong>All</strong> to see team archives.' : 'No matching quotes. Try a different search.';
    body.innerHTML = '<div class="library-empty">' + msg + '</div>'; return;
  }
  body.innerHTML = renderQuoteCards(filtered, 'archived');
}

function renderQuoteCards(quotes, mode) {
  let html = '';
  for (const q of quotes) {
    const date = new Date(q.savedAt);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const ef = escHtml(q.filename);
    const en = escHtml(q.partnerName);
    if (mode === 'active') {
      html += `<div class="library-card" ondblclick="loadFromLibrary('${ef}')">
        <div class="library-card-info">
          <div class="library-card-name">${en}</div>
          <div class="library-card-meta">${dateStr} at ${timeStr} &middot; ${escHtml(q.savedBy)}</div>
        </div>
        <div class="library-card-actions">
          <button class="library-card-btn" onclick="event.stopPropagation();loadFromLibrary('${ef}')">Load</button>
          <button class="library-card-btn danger" onclick="event.stopPropagation();archiveFromLibrary('${ef}','${en}')">Archive</button>
        </div>
      </div>`;
    } else {
      html += `<div class="library-card" ondblclick="loadFromLibrary('${ef}')">
        <div class="library-card-info">
          <div class="library-card-name">${en}</div>
          <div class="library-card-meta">${dateStr} at ${timeStr} &middot; ${escHtml(q.savedBy)}</div>
        </div>
        <div class="library-card-actions">
          <button class="library-card-btn" onclick="event.stopPropagation();loadFromLibrary('${ef}')">Load</button>
          <button class="library-card-btn" onclick="event.stopPropagation();restoreFromArchive('${ef}','${en}')" style="color:var(--emerald-600)">Restore</button>
        </div>
      </div>`;
    }
  }
  return html;
}

async function loadFromLibrary(filename) {
  const data = await loadQuoteFromLibrary(filename);
  if (!data) return;
  closeLibrary();
  saveActiveTab();
  const newTab = { id: generateTabId(), name: data.partnerName || 'Loaded Quote', state: data.quoteState };
  newTab._libFile = data._filename;
  newTab._libSha = data._sha;
  builderTabs.push(newTab);
  activeTabId = newTab.id;
  loadTabState(newTab.state);
  try {
    localStorage.setItem('playlab_builder_tabs', JSON.stringify(builderTabs));
    localStorage.setItem('playlab_builder_activeTabId', activeTabId);
  } catch {}
  renderTabBar();
  showToast('Loaded: ' + (data.partnerName || 'Quote'));
  track('library_load', { partner: data.partnerName });
}

async function archiveFromLibrary(filename, name) {
  if (libBusy) return;
  if (!confirm('Archive "' + name + '"? It will be moved to the Archived tab.')) return;
  libBusy = true;
  document.getElementById('libraryBody').innerHTML = '<div class="library-loading">Archiving&hellip;</div>';
  try {
    const ok = await archiveQuote(filename);
    if (ok) { showToast('Archived: ' + name); track('library_archive', { partner: name }); }
    else { showToast('Archive failed \u2014 try again'); }
  } finally { libBusy = false; }
  await renderLibraryList();
}

async function restoreFromArchive(filename, name) {
  if (libBusy) return;
  if (!confirm('Restore "' + name + '" to the active library?')) return;
  libBusy = true;
  document.getElementById('libraryBody').innerHTML = '<div class="library-loading">Restoring&hellip;</div>';
  try {
    const ok = await restoreQuote(filename);
    if (ok) { showToast('Restored: ' + name); track('library_restore', { partner: name }); }
    else { showToast('Restore failed \u2014 try again'); }
  } finally { libBusy = false; }
  await renderArchivedList();
}

async function saveCurrentToLibrary() {
  if (!getLibToken()) { promptLibToken(() => saveCurrentToLibrary()); return; }
  const name = document.getElementById('partnerName').value.trim();
  if (!name) { document.getElementById('partnerName').focus(); showToast('Enter a partner name before saving'); return; }
  const state = getTabState();
  const btn = document.getElementById('saveToLibraryBtn');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  const activeTab = builderTabs.find(t => t.id === activeTabId);
  let existingFile = activeTab?._libFile || null;
  let existingSha = activeTab?._libSha || null;

  if (existingFile) {
    const doUpdate = confirm('Update the existing saved quote, or save as a new copy?\n\nOK = Update existing\nCancel = Save as new');
    if (!doUpdate) { existingFile = null; existingSha = null; }
  }

  const result = await saveQuoteToLibrary(name, state, existingFile, existingSha);
  btn.disabled = false;
  btn.textContent = '\uD83D\uDCBE Save to Library';

  if (result) {
    if (activeTab) { activeTab._libFile = result.filename; activeTab._libSha = result.sha; }
    if (!result.conflict) {
      showToast('Saved to library: ' + name);
      track('library_save', { partner: name, updated: !!existingFile });
    }
  }
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLibrary(); closeTokenPrompt(); }
});

// ─── Init ──────────────────────────────────────────────────────────────────────
initTabs();
const urlLoaded = loadFromUrl();
if (urlLoaded) {
  // URL hash takes priority — load into the active tab
  renderAll();
  saveActiveTab();
  renderTabBar();
} else {
  // No URL hash — load from the active tab's saved state
  const activeTab = builderTabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.state) {
    loadTabState(activeTab.state);
    renderTabBar();
  } else {
    renderAll();
  }
}
fetchLiveRates();
updateSaveAttribution();
updateUserBadge();
