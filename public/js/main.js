(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  navToggle.addEventListener('click', () => {
    const open = siteNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  siteNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => siteNav.classList.remove('open')));

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

  fetch('/api/site').then(r => r.json()).then(data => {
    const { settings, destinations, packages, gallery } = data;
    const waNumber = settings.whatsapp_number || '';

    document.title = `${settings.site_name} — Himalayan Trip Planning`;
    document.getElementById('brandTagline').textContent = settings.tagline || '';
    document.getElementById('heroHeading').textContent = settings.hero_heading || '';
    document.getElementById('heroSub').textContent = settings.hero_subheading || '';
    if (settings.hero_image_url) {
      const heroEl = document.querySelector('.hero');
      heroEl.style.backgroundImage =
        `linear-gradient(180deg, rgba(22,35,43,.55), rgba(22,35,43,.88)), url("${settings.hero_image_url.replace(/"/g, '')}")`;
      heroEl.classList.add('has-image');
    }
    document.getElementById('aboutText').textContent = settings.about_text || '';
    document.getElementById('footerLegalName').textContent = settings.legal_name || settings.site_name;

    const genericWaText = `Hi ${settings.site_name}! I'd like help planning a Himalayan trip.`;
    document.getElementById('headerWhatsapp').href = waLink(waNumber, genericWaText);
    document.getElementById('fabWhatsapp').href = waLink(waNumber, genericWaText);
    document.getElementById('contactWhatsapp').href = waLink(waNumber, genericWaText);
    document.getElementById('contactWhatsappText').textContent = settings.contact_phone ? `Chat with us · ${settings.contact_phone}` : 'Chat with us';
    document.getElementById('contactPhone').textContent = settings.contact_phone || '—';
    document.getElementById('contactEmail').textContent = settings.contact_email || '—';
    document.getElementById('contactAddress').textContent = settings.contact_address || '—';

    // Destinations
    const destGrid = document.getElementById('destGrid');
    const plannerSelect = document.getElementById('plannerDestination');
    const searchMatch = document.getElementById('searchMatch');
    destGrid.innerHTML = destinations.map(d => {
      const count = packages.filter(p => matchesDestination(p, d.name)).length;
      const media = d.image_url
        ? `<img src="${escapeHtml(d.image_url)}" alt="${escapeHtml(d.name)}" loading="lazy">`
        : destPlaceholder();
      return `
      <article class="dest-card" data-dest="${escapeHtml(d.name)}">
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
    }).join('') || '<p>Destinations coming soon.</p>';

    plannerSelect.innerHTML = '<option value="" disabled selected>Choose a destination</option>' +
      destinations.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    // Packages
    const pkgList = document.getElementById('pkgList');
    pkgList.innerHTML = packages.map((p, i) => {
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
            <a class="btn btn-whatsapp btn-block" href="${waLink(waNumber, waText)}" target="_blank" rel="noopener">Ask on WhatsApp</a>
          </div>
          ${itinerary ? `<div class="pkg-itinerary" id="itin-${i}">${itinerary}</div>` : ''}
        </article>
      `;
    }).join('') || '<p>Packages coming soon.</p>';

    pkgList.querySelectorAll('.pkg-itin-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(`itin-${btn.dataset.idx}`);
        const open = target.classList.toggle('open');
        btn.textContent = open ? 'Hide day-wise itinerary' : 'View day-wise itinerary';
      });
    });

    // Destination -> package filtering
    const pkgFilterBanner = document.getElementById('pkgFilterBanner');
    const pkgFilterName = document.getElementById('pkgFilterName');
    const pkgFilterClear = document.getElementById('pkgFilterClear');
    const pkgCards = [...pkgList.querySelectorAll('.pkg-card')];

    function filterPackagesByDestination(destName, { scroll = false } = {}) {
      const matchCount = packages.filter(p => matchesDestination(p, destName)).length;
      if (matchCount === 0) {
        pkgCards.forEach(c => c.classList.remove('is-hidden'));
        pkgFilterBanner.hidden = false;
        pkgFilterName.textContent = `${destName} — no fixed package yet, showing all packages (chat with us to build one)`;
      } else {
        pkgCards.forEach(c => c.classList.toggle('is-hidden', !matchesDestination(packages[c.dataset.idx], destName)));
        pkgFilterBanner.hidden = false;
        pkgFilterName.textContent = destName;
      }
      if (scroll) document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
    }

    pkgFilterClear.addEventListener('click', () => {
      pkgCards.forEach(c => c.classList.remove('is-hidden'));
      pkgFilterBanner.hidden = true;
    });

    destGrid.querySelectorAll('.dest-card').forEach(card => {
      card.addEventListener('click', () => {
        const dest = card.dataset.dest;
        plannerSelect.value = dest;
        showSearchMatch(dest);
        filterPackagesByDestination(dest, { scroll: true });
      });
    });

    function showSearchMatch(destName) {
      if (!destName) { searchMatch.hidden = true; return; }
      const count = packages.filter(p => matchesDestination(p, destName)).length;
      searchMatch.hidden = false;
      searchMatch.textContent = count
        ? `✓ ${count} ready-made package${count > 1 ? 's' : ''} for ${destName} — see them below or send your trip on WhatsApp.`
        : `No fixed package for ${destName} yet — we'll happily customise one, just send your trip on WhatsApp.`;
    }
    plannerSelect.addEventListener('change', () => showSearchMatch(plannerSelect.value));

    // Gallery
    const galleryGrid = document.getElementById('galleryGrid');
    if (gallery.length) {
      galleryGrid.innerHTML = gallery.map(g => `
        <div class="gallery-item">
          <img src="${escapeHtml(g.image_url)}" alt="${escapeHtml(g.caption || g.location || '')}" loading="lazy">
          ${g.caption ? `<span class="gallery-caption">${escapeHtml(g.caption)}</span>` : ''}
        </div>
      `).join('');
    } else {
      galleryGrid.innerHTML = '<p class="gallery-empty">Photos are being added — check back soon.</p>';
    }

    // Planner form -> WhatsApp
    document.getElementById('plannerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const dest = document.getElementById('plannerDestination').value;
      const month = document.getElementById('plannerMonth').value;
      const travellers = document.getElementById('plannerTravellers').value;
      const notes = document.getElementById('plannerNotes').value.trim();
      let text = `Hi ${settings.site_name}! I'd like to plan a trip to ${dest || 'the mountains'}.`;
      if (month) text += ` Travel month: ${month}.`;
      if (travellers) text += ` Travellers: ${travellers}.`;
      if (notes) text += ` Notes: ${notes}.`;
      window.open(waLink(waNumber, text), '_blank', 'noopener');
    });
  }).catch(err => {
    console.error('Failed to load site data', err);
  });

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }
})();
