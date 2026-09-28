(function () {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const toastEl = document.getElementById('toast');

  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    toastEl.classList.toggle('error', !!isError);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- Auth ----------
  async function checkSession() {
    try {
      await api('/api/me');
      showDashboard();
    } catch {
      showLogin();
    }
  }
  function showLogin() { loginScreen.classList.remove('hidden'); dashboard.classList.add('hidden'); }
  function showDashboard() { loginScreen.classList.add('hidden'); dashboard.classList.remove('hidden'); loadAll(); }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { username, password } });
      showDashboard();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- Tabs ----------
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });

  // ---------- Data ----------
  let siteData = null;

  async function loadAll() {
    siteData = await api('/api/site');
    renderSettings(siteData.settings);
    renderDestinations(siteData.destinations);
    renderPackages(siteData.packages);
    renderGallery(siteData.gallery);
  }

  const SETTINGS_FIELDS = [
    ['site_name', 'Site name', 'text'],
    ['tagline', 'Tagline', 'text'],
    ['legal_name', 'Legal / registered name (footer)', 'text'],
    ['whatsapp_number', 'WhatsApp number (with country code, digits only, e.g. 919876543210)', 'text'],
    ['contact_phone', 'Display phone number', 'text'],
    ['contact_email', 'Contact email', 'text'],
    ['contact_address', 'Address / based in', 'text'],
    ['map_url', 'Google Maps link', 'text'],
    ['site_url', 'Website URL (for SEO — no trailing slash, e.g. https://yourdomain.com)', 'text'],
    ['hero_heading', 'Hero heading', 'text'],
    ['hero_subheading', 'Hero subheading', 'textarea'],
    ['about_text', 'About paragraph', 'textarea']
  ];

  function renderSettings(settings) {
    const form = document.getElementById('settingsForm');
    form.innerHTML = `
      <label class="field">
        <span>Hero banner image <small class="muted">(shown behind the homepage heading)</small></span>
        <div class="image-field">
          <div class="image-preview" id="heroImagePreview"></div>
          <input type="file" accept="image/*" id="heroImageFile">
        </div>
        <input type="hidden" data-key="hero_image_url" id="heroImageUrl">
      </label>
    ` + SETTINGS_FIELDS.map(([key, label, type]) => `
      <label class="field">
        <span>${label}</span>
        ${type === 'textarea'
          ? `<textarea rows="3" data-key="${key}">${escapeHtml(settings[key] || '')}</textarea>`
          : `<input type="text" data-key="${key}" value="${escapeAttr(settings[key] || '')}">`}
      </label>
    `).join('') + `<button type="submit" class="btn btn-primary">Save settings</button>`;

    const heroPreview = document.getElementById('heroImagePreview');
    const heroUrlInput = document.getElementById('heroImageUrl');
    heroUrlInput.value = settings.hero_image_url || '';
    setImagePreview(heroPreview, settings.hero_image_url);

    document.getElementById('heroImageFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const uploaded = await api('/api/admin/upload', { method: 'POST', body: { dataUrl } });
        heroUrlInput.value = uploaded.url;
        setImagePreview(heroPreview, uploaded.url);
        toast('Hero image uploaded — click Save settings to apply');
      } catch (err) { toast(err.message, true); }
    });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {};
      form.querySelectorAll('[data-key]').forEach(el => payload[el.dataset.key] = el.value);
      try {
        await api('/api/admin/settings', { method: 'PUT', body: payload });
        toast('Settings saved');
      } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- Destinations ----------
  function renderDestinations(list) {
    const container = document.getElementById('destinationList');
    container.innerHTML = '';
    list.forEach(d => container.appendChild(buildDestinationCard(d)));
  }
  function setImagePreview(el, url) {
    el.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : 'none';
    el.textContent = url ? '' : 'No photo';
  }

  function renderPhotoGrid(card) {
    const grid = card.querySelector('[data-field="photo_grid"]');
    grid.innerHTML = card._images.map((url, i) => `
      <div class="photo-thumb${i === 0 ? ' is-cover' : ''}" style='background-image:url(${JSON.stringify(url)})'>
        ${i === 0 ? '<span class="cover-badge">Cover</span>' : '<button type="button" class="thumb-cover-btn" data-i="' + i + '" title="Set as cover">★</button>'}
        <button type="button" class="thumb-remove-btn" data-i="${i}" title="Remove">✕</button>
      </div>
    `).join('');
    grid.querySelectorAll('.thumb-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card._images.splice(Number(btn.dataset.i), 1);
        renderPhotoGrid(card);
      });
    });
    grid.querySelectorAll('.thumb-cover-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const [moved] = card._images.splice(Number(btn.dataset.i), 1);
        card._images.unshift(moved);
        renderPhotoGrid(card);
      });
    });
  }

  function buildDestinationCard(d) {
    const tpl = document.getElementById('destinationCardTpl').content.cloneNode(true);
    const card = tpl.querySelector('.admin-card');
    card.dataset.id = d.id || '';
    card._images = (d.images && d.images.length) ? [...d.images] : (d.image_url ? [d.image_url] : []);
    card.querySelector('[data-field="name"]').value = d.name || '';
    card.querySelector('[data-field="region"]').value = d.region || '';
    card.querySelector('[data-field="tagline"]').value = d.tagline || '';
    card.querySelector('[data-field="description"]').value = d.description || '';
    card.querySelector('[data-field="highlights"]').value = (d.highlights || []).join(', ');
    renderPhotoGrid(card);

    card.querySelector('[data-field="image_file"]').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      try {
        for (const file of files) {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const uploaded = await api('/api/admin/upload', { method: 'POST', body: { dataUrl } });
          card._images.push(uploaded.url);
        }
        renderPhotoGrid(card);
        e.target.value = '';
        toast('Photo(s) uploaded — click Save to apply');
      } catch (err) { toast(err.message, true); }
    });

    card.querySelector('.save-btn').addEventListener('click', async () => {
      const body = {
        name: card.querySelector('[data-field="name"]').value,
        region: card.querySelector('[data-field="region"]').value,
        tagline: card.querySelector('[data-field="tagline"]').value,
        description: card.querySelector('[data-field="description"]').value,
        highlights: card.querySelector('[data-field="highlights"]').value.split(',').map(s => s.trim()).filter(Boolean),
        images: card._images,
        image_url: card._images[0] || ''
      };
      try {
        if (card.dataset.id) {
          await api(`/api/admin/destinations/${card.dataset.id}`, { method: 'PUT', body });
        } else {
          const created = await api('/api/admin/destinations', { method: 'POST', body });
          card.dataset.id = created.id;
        }
        toast('Destination saved');
      } catch (err) { toast(err.message, true); }
    });
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this destination?')) return;
      if (card.dataset.id) {
        try { await api(`/api/admin/destinations/${card.dataset.id}`, { method: 'DELETE' }); } catch (err) { toast(err.message, true); return; }
      }
      card.remove();
      toast('Destination deleted');
    });
    return card;
  }
  document.getElementById('addDestinationBtn').addEventListener('click', () => {
    document.getElementById('destinationList').prepend(buildDestinationCard({}));
  });

  // ---------- Packages ----------
  function renderPackages(list) {
    const container = document.getElementById('packageList');
    container.innerHTML = '';
    list.forEach(p => container.appendChild(buildPackageCard(p)));
  }
  function itineraryToText(itin) {
    return (itin || []).map(d => `${d.day || ''} | ${d.title || ''} | ${d.text || ''}`).join('\n');
  }
  function textToItinerary(text) {
    return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [day, title, ...rest] = line.split('|').map(s => s.trim());
      return { day: day || '', title: title || '', text: rest.join('|').trim() };
    });
  }
  function buildPackageCard(p) {
    const tpl = document.getElementById('packageCardTpl').content.cloneNode(true);
    const card = tpl.querySelector('.admin-card');
    card.dataset.id = p.id || '';
    card.querySelector('[data-field="title"]').value = p.title || '';
    card.querySelector('[data-field="duration"]').value = p.duration || '';
    card.querySelector('[data-field="route"]').value = p.route || '';
    card.querySelector('[data-field="price"]').value = p.price || '';
    card.querySelector('[data-field="price_note"]').value = p.price_note || '';
    card.querySelector('[data-field="includes"]').value = (p.includes || []).join('\n');
    card.querySelector('[data-field="itinerary"]').value = itineraryToText(p.itinerary);

    card.querySelector('.save-btn').addEventListener('click', async () => {
      const body = {
        title: card.querySelector('[data-field="title"]').value,
        duration: card.querySelector('[data-field="duration"]').value,
        route: card.querySelector('[data-field="route"]').value,
        price: Number(card.querySelector('[data-field="price"]').value) || 0,
        price_note: card.querySelector('[data-field="price_note"]').value,
        includes: card.querySelector('[data-field="includes"]').value.split('\n').map(s => s.trim()).filter(Boolean),
        itinerary: textToItinerary(card.querySelector('[data-field="itinerary"]').value)
      };
      try {
        if (card.dataset.id) {
          await api(`/api/admin/packages/${card.dataset.id}`, { method: 'PUT', body });
        } else {
          const created = await api('/api/admin/packages', { method: 'POST', body });
          card.dataset.id = created.id;
        }
        toast('Package saved');
      } catch (err) { toast(err.message, true); }
    });
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this package?')) return;
      if (card.dataset.id) {
        try { await api(`/api/admin/packages/${card.dataset.id}`, { method: 'DELETE' }); } catch (err) { toast(err.message, true); return; }
      }
      card.remove();
      toast('Package deleted');
    });
    return card;
  }
  document.getElementById('addPackageBtn').addEventListener('click', () => {
    document.getElementById('packageList').prepend(buildPackageCard({}));
  });

  // ---------- Gallery ----------
  function renderGallery(list) {
    const grid = document.getElementById('galleryAdminGrid');
    grid.innerHTML = '';
    list.forEach(g => grid.appendChild(buildGalleryItem(g)));
  }
  function buildGalleryItem(g) {
    const div = document.createElement('div');
    div.className = 'gallery-admin-item';
    div.innerHTML = `<img src="${escapeAttr(g.image_url)}" alt=""><button title="Delete">✕</button>`;
    div.querySelector('button').addEventListener('click', async () => {
      if (!confirm('Delete this photo?')) return;
      try { await api(`/api/admin/gallery/${g.id}`, { method: 'DELETE' }); div.remove(); toast('Photo deleted'); }
      catch (err) { toast(err.message, true); }
    });
    return div;
  }
  document.getElementById('galleryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('galleryFile');
    const caption = document.getElementById('galleryCaption').value.trim();
    const file = fileInput.files[0];
    if (!file) { toast('Choose a photo first', true); return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await api('/api/admin/upload', { method: 'POST', body: { dataUrl } });
      const created = await api('/api/admin/gallery', { method: 'POST', body: { image_url: uploaded.url, caption } });
      document.getElementById('galleryAdminGrid').prepend(buildGalleryItem(created));
      fileInput.value = '';
      document.getElementById('galleryCaption').value = '';
      toast('Photo added');
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Password ----------
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('curPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    try {
      await api('/api/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      toast('Password updated');
      e.target.reset();
    } catch (err) { toast(err.message, true); }
  });

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])); }
  function escapeAttr(str) { return escapeHtml(str); }

  checkSession();
})();
