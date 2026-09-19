const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'index.html');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
function escapeAttr(str) { return escapeHtml(str); }

function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function destTokens(name) {
  return String(name || '').split(/[&(),]/).map(s => s.trim()).filter(s => s.length > 2);
}
function matchesDestination(pkg, destName) {
  const hay = `${pkg.route || ''} ${pkg.title || ''}`.toLowerCase();
  return destTokens(destName).some(t => hay.includes(t.toLowerCase()));
}

function destPlaceholder() {
  return `<svg viewBox="0 0 48 48" width="60" height="60" aria-hidden="true">
    <path d="M4 34 L16 16 L23 27 L28 19 L44 34 Z" fill="#3E6B57"/>
    <path d="M16 16 L20 22 L14 22 Z" fill="#FBFAF6"/>
    <path d="M28 19 L31.5 24 L26.5 24 Z" fill="#FBFAF6"/>
  </svg>`;
}

function renderDestCard(d, packages) {
  const count = packages.filter(p => matchesDestination(p, d.name)).length;
  const media = d.image_url
    ? `<img src="${escapeAttr(d.image_url)}" alt="${escapeAttr(d.name)}" loading="lazy">`
    : destPlaceholder();
  return `
    <article class="dest-card" data-dest="${escapeAttr(d.name)}">
      <div class="dest-media">${media}</div>
      <div class="dest-card-body">
        <span class="dest-region">${escapeHtml(d.region || '')}</span>
        <h3>${escapeHtml(d.name)}</h3>
        <p class="dest-tagline">${escapeHtml(d.tagline || '')}</p>
        <p>${escapeHtml(d.description || '')}</p>
        <ul class="dest-highlights">${(d.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
      </div>
      <span class="dest-count">${count ? `${count} package${count > 1 ? 's' : ''} available →` : 'Ask us to build one →'}</span>
    </article>
  `;
}

function renderPkgCard(p, i, settings, waNumber) {
  const includes = (p.includes || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
  const itinerary = (p.itinerary || []).map(d => `
    <div class="itin-day">
      <div class="day-label">${escapeHtml(d.day || '')}</div>
      <div>
        <p class="day-title">${escapeHtml(d.title || '')}</p>
        <p class="day-text">${escapeHtml(d.text || '')}</p>
      </div>
    </div>
  `).join('');
  const waText = `Hi ${settings.site_name}! I'm interested in the "${p.title}" package (${p.duration}). Please share availability.`;
  return `
    <article class="pkg-card" data-idx="${i}">
      <div>
        <p class="pkg-route">${escapeHtml(p.route || '')}</p>
        <h3>${escapeHtml(p.title)}</h3>
        <span class="pkg-duration">${escapeHtml(p.duration || '')}</span>
        <ul class="pkg-includes">${includes}</ul>
        ${itinerary ? `<button class="pkg-itin-toggle" data-idx="${i}">View day-wise itinerary</button>` : ''}
      </div>
      <div class="pkg-side">
        <span class="pkg-price">₹${Number(p.price || 0).toLocaleString('en-IN')}</span>
        <span class="pkg-price-note">${escapeHtml(p.price_note || '')}</span>
        <a class="btn btn-whatsapp btn-block" href="${escapeAttr(waLink(waNumber, waText))}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
      ${itinerary ? `<div class="pkg-itinerary" id="itin-${i}">${itinerary}</div>` : ''}
    </article>
  `;
}

function renderGalleryItem(g) {
  return `
    <div class="gallery-item">
      <img src="${escapeAttr(g.image_url)}" alt="${escapeAttr(g.caption || g.location || '')}" loading="lazy">
      ${g.caption ? `<span class="gallery-caption">${escapeHtml(g.caption)}</span>` : ''}
    </div>
  `;
}

function absoluteUrl(siteUrl, maybeRelative) {
  if (!maybeRelative) return '';
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${siteUrl.replace(/\/$/, '')}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

function buildJsonLd(settings, destinations, packages, siteUrl, description) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: settings.site_name,
    description,
    url: `${siteUrl}/`,
    telephone: settings.contact_phone || undefined,
    email: settings.contact_email || undefined,
    image: absoluteUrl(siteUrl, settings.hero_image_url) || undefined,
    address: settings.contact_address || undefined,
    areaServed: ['Himachal Pradesh', 'Uttarakhand', 'India'],
    makesOffer: packages.slice(0, 20).map(p => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'TouristTrip',
        name: p.title,
        description: (p.includes || []).join(', '),
        touristType: 'Leisure'
      },
      price: p.price || undefined,
      priceCurrency: 'INR'
    }))
  };
  const destinationList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: destinations.slice(0, 20).map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'TouristDestination',
        name: d.name,
        description: d.description || d.tagline || undefined
      }
    }))
  };
  return `<script type="application/ld+json">${JSON.stringify(org)}</script>\n<script type="application/ld+json">${JSON.stringify(destinationList)}</script>`;
}

function truncateAtWord(str, maxLen) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}...`;
}

function buildDescription(settings, destinations) {
  const names = destinations.slice(0, 6).map(d => d.name).join(', ');
  const base = settings.about_text || `Plan your Himalayan trip with ${settings.site_name}`;
  const full = names ? `${base} — trips to ${names} and more.` : base;
  return truncateAtWord(full, 157);
}

function renderIndex({ settings, destinations, packages, gallery }) {
  const siteUrl = (settings.site_url || '').replace(/\/$/, '') || 'https://mepia-wander-tales.onrender.com';
  const waNumber = settings.whatsapp_number || '';
  const genericWaText = `Hi ${settings.site_name}! I'd like help planning a Himalayan trip.`;
  const title = `${settings.site_name} | Himalayan Trip Planning — Manali, Shimla, Kasol & More`;
  const description = buildDescription(settings, destinations);
  const ogImage = absoluteUrl(siteUrl, settings.hero_image_url) || absoluteUrl(siteUrl, '/assets/logo.jpg');
  const year = new Date().getFullYear();

  const destCardsHtml = destinations.map(d => renderDestCard(d, packages)).join('') || '<p>Destinations coming soon.</p>';
  const destOptionsHtml = destinations.map(d => `<option value="${escapeAttr(d.name)}">${escapeHtml(d.name)}</option>`).join('');
  const pkgCardsHtml = packages.map((p, i) => renderPkgCard(p, i, settings, waNumber)).join('') || '<p>Packages coming soon.</p>';
  const galleryHtml = gallery.length
    ? gallery.map(renderGalleryItem).join('')
    : '<p class="gallery-empty">Photos are being added — check back soon.</p>';

  const extraHead = `
<link rel="canonical" href="${siteUrl}/">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeAttr(settings.site_name)}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${siteUrl}/">
${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
${ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}">` : ''}
${buildJsonLd(settings, destinations, packages, siteUrl, description)}
</head>`;

  const replacements = [
    ['<title>Mepiyu Wander Travels — Himalayan Trip Planning</title>', `<title>${escapeHtml(title)}</title>`],
    ['<meta name="description" content="Plan your Himalayan trip — Manali, Shimla, Kasol, Jibhi, Nainital and more. Build your itinerary and chat with us on WhatsApp.">', `<meta name="description" content="${escapeAttr(description)}">`],
    ['</head>', extraHead],
    ['<span class="brand-tagline" id="brandTagline">Explore. Dream. Discover.</span>', `<span class="brand-tagline" id="brandTagline">${escapeHtml(settings.tagline || '')}</span>`],
    ['<a class="btn btn-whatsapp header-cta" id="headerWhatsapp" target="_blank" rel="noopener">', `<a class="btn btn-whatsapp header-cta" id="headerWhatsapp" href="${escapeAttr(waLink(waNumber, genericWaText))}" target="_blank" rel="noopener">`],
    ['<h1 id="heroHeading">Plan your next Himalayan escape</h1>', `<h1 id="heroHeading">${escapeHtml(settings.hero_heading || '')}</h1>`],
    ['<p class="hero-sub" id="heroSub">Handpicked mountain getaways — tell us your dates, we\'ll build the trip.</p>', `<p class="hero-sub" id="heroSub">${escapeHtml(settings.hero_subheading || '')}</p>`],
    ['<option value="" disabled selected>Choose a destination</option>\n            </select>', `<option value="" disabled selected>Choose a destination</option>${destOptionsHtml}\n            </select>`],
    ['<div class="dest-grid" id="destGrid"></div>', `<div class="dest-grid" id="destGrid">${destCardsHtml}</div>`],
    ['<div class="pkg-list" id="pkgList"></div>', `<div class="pkg-list" id="pkgList">${pkgCardsHtml}</div>`],
    ['<p id="aboutText">Mepiyu Wander Travels designs small-group and custom Himalayan trips.</p>', `<p id="aboutText">${escapeHtml(settings.about_text || '')}</p>`],
    ['<div class="gallery-grid" id="galleryGrid"></div>', `<div class="gallery-grid" id="galleryGrid">${galleryHtml}</div>`],
    ['<a class="contact-row" id="contactWhatsapp" target="_blank" rel="noopener">', `<a class="contact-row" id="contactWhatsapp" href="${escapeAttr(waLink(waNumber, genericWaText))}" target="_blank" rel="noopener">`],
    ['<span id="contactWhatsappText">Chat with us</span>', `<span id="contactWhatsappText">${settings.contact_phone ? `Chat with us · ${escapeHtml(settings.contact_phone)}` : 'Chat with us'}</span>`],
    ['<span id="contactPhone">—</span>', `<span id="contactPhone">${escapeHtml(settings.contact_phone || '—')}</span>`],
    ['<span id="contactEmail">—</span>', `<span id="contactEmail">${escapeHtml(settings.contact_email || '—')}</span>`],
    ['<a class="contact-row" id="contactAddressRow" target="_blank" rel="noopener">', `<a class="contact-row" id="contactAddressRow" href="${escapeAttr(settings.map_url || '#')}" target="_blank" rel="noopener">`],
    ['<span id="contactAddress">—</span>', `<span id="contactAddress">${escapeHtml(settings.contact_address || '—')}</span>`],
    ['<span id="footerLegalName">Mepiyu Wander Travels</span>', `<span id="footerLegalName">${escapeHtml(settings.legal_name || settings.site_name || '')}</span>`],
    ['<span id="year"></span>', `<span id="year">${year}</span>`],
    ['<a class="whatsapp-fab" id="fabWhatsapp" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">', `<a class="whatsapp-fab" id="fabWhatsapp" href="${escapeAttr(waLink(waNumber, genericWaText))}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">`]
  ];

  if (settings.map_url) {
    replacements.push(
      ['<div class="contact-map reveal" id="contactMapWrap" hidden>', '<div class="contact-map reveal" id="contactMapWrap">'],
      ['<iframe id="contactMapFrame" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen title="Our location on Google Maps"></iframe>',
        `<iframe id="contactMapFrame" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen title="Our location on Google Maps" src="${escapeAttr(settings.map_url + (settings.map_url.includes('?') ? '&' : '?') + 'output=embed')}"></iframe>`],
      ['<a class="btn btn-outline contact-map-btn" id="contactMapBtn" target="_blank" rel="noopener">', `<a class="btn btn-outline contact-map-btn" id="contactMapBtn" href="${escapeAttr(settings.map_url)}" target="_blank" rel="noopener">`]
    );
  }

  if (settings.hero_image_url) {
    replacements.push(['<section class="hero" id="plan">',
      `<section class="hero has-image" id="plan" style="background-image: linear-gradient(180deg, rgba(22,35,43,.55), rgba(22,35,43,.88)), url('${escapeAttr(settings.hero_image_url)}')">`]);
  }

  let html = TEMPLATE;
  for (const [oldStr, newStr] of replacements) {
    if (!html.includes(oldStr)) {
      console.warn('[render] SSR template marker not found, skipping:', oldStr.slice(0, 60));
      continue;
    }
    html = html.replace(oldStr, newStr);
  }
  return html;
}

module.exports = { renderIndex };
