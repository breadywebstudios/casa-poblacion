(() => {
  const C = window.CASA_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Nav ---------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 60 || nav.classList.contains('open'));
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('#navToggle').addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', open);
    onScroll();
  });
  $$('#menu a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); onScroll(); }));
  $('#yr').textContent = new Date().getFullYear();

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  const observe = () => $$('.reveal:not(.in)').forEach(el => io.observe(el));
  observe();

  /* ---------- Gallery + lightbox ---------- */
  const photos = [
    ['p07', 'Long banquet table under arched windows'],
    ['p01', 'Debut stage with gold throne and red roses'],
    ['p13', 'Guests seated before a floral garden stage'],
    ['p09', 'Rose-gold charger and gilded cutlery'],
    ['p06', 'Hall set for a reception with hanging greenery'],
    ['p05', 'Red roses on a black-and-gold table'],
    ['p02', 'Buffet service in progress'],
    ['p11', 'Newlyweds at the head of the table'],
    ['p14', 'Plated appetisers'],
    ['p16', 'Doorway framed by blush roses'],
    ['p03', 'Gold-charger place settings'],
    ['p15', 'Dessert cups on a grazing table'],
    ['p12', 'Couple walking through the reception hall'],
    ['p08', 'White and gold tablescape'],
    ['p10', 'Domed skylight over the hall'],
    ['p04', 'Throne stage detail'],
  ];
  const grid = $('#galleryGrid');
  grid.innerHTML = photos.map(([id, alt], i) =>
    `<button type="button" class="reveal" data-i="${i}" aria-label="View photo: ${alt}"><img src="${C.media}${id}.jpg" alt="${alt}" loading="lazy"></button>`
  ).join('');
  observe();

  const lb = $('#lightbox'), lbImg = $('img', lb);
  let cur = 0, lastFocus = null;
  const show = i => { cur = (i + photos.length) % photos.length; lbImg.src = C.media + photos[cur][0] + '.jpg'; lbImg.alt = photos[cur][1]; };
  const openLb = i => { lastFocus = document.activeElement; show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; $('.lb-close', lb).focus(); };
  const closeLb = () => { lb.classList.remove('open'); document.body.style.overflow = ''; lastFocus && lastFocus.focus(); };
  grid.addEventListener('click', e => { const b = e.target.closest('button'); if (b) openLb(+b.dataset.i); });
  $('.lb-close', lb).onclick = closeLb;
  $('.lb-prev', lb).onclick = () => show(cur - 1);
  $('.lb-next', lb).onclick = () => show(cur + 1);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });

  /* Occasion cards pre-fill the form */
  $$('.occ').forEach(card => card.addEventListener('click', () => { $('#fType').value = card.dataset.event; }));

  /* ---------- Booking calendar ---------- */
  const rpc = async (fn, body) => {
    const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && (data.message || data.hint)) || 'Something went wrong. Please try again.');
    return data;
  };

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  // "Today" in the venue's timezone
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const [ty, tm] = todayISO.split('-').map(Number);
  const minMonth = { y: ty, m: tm - 1 };
  const maxMonth = (() => { const d = new Date(ty, tm - 1 + 23, 1); return { y: d.getFullYear(), m: d.getMonth() }; })();
  let view = { ...minMonth };
  let booked = {}; // date -> Set(slots)
  let selDate = null;

  const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prettyDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const slotState = date => {
    const s = booked[date];
    if (!s || !s.size) return 'free';
    if (s.has('Whole day') || (s.has('Daytime') && s.has('Evening'))) return 'full';
    return 'partial';
  };
  const slotTaken = (date, slot) => {
    const s = booked[date]; if (!s) return false;
    if (s.has('Whole day')) return true;
    if (slot === 'Whole day') return s.size > 0;
    return s.has(slot);
  };

  function renderCal() {
    const { y, m } = view;
    $('#calTitle').textContent = monthName(y, m);
    $('#calPrev').disabled = y === minMonth.y && m === minMonth.m;
    $('#calNext').disabled = y === maxMonth.y && m === maxMonth.m;
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const ds = iso(y, m, d);
      const past = ds < todayISO;
      const st = slotState(ds);
      const cls = [st !== 'free' ? st : '', ds === selDate ? 'sel' : '', ds === todayISO ? 'today' : ''].join(' ');
      const label = `${prettyDate(ds)}${st === 'full' ? ', fully booked' : st === 'partial' ? ', partly booked' : ''}`;
      html += `<button type="button" class="${cls}" data-d="${ds}" ${past || st === 'full' ? 'disabled' : ''} aria-label="${label}" aria-pressed="${ds === selDate}">${d}</button>`;
    }
    $('#calDays').innerHTML = html;
  }

  function renderSlots() {
    $$('#slotList input').forEach(inp => {
      const taken = !selDate || slotTaken(selDate, inp.value);
      inp.disabled = taken;
      if (taken) inp.checked = false;
      inp.closest('.slot').querySelector('small').textContent =
        selDate && slotTaken(selDate, inp.value) ? 'Already booked' : ({ 'Daytime': 'Morning to afternoon', 'Evening': 'Late afternoon to night', 'Whole day': 'Exclusive use of the venue' })[inp.value];
    });
    updateChosen();
  }

  function updateChosen() {
    const slot = $('#slotList input:checked');
    const t = $('#chosenText');
    t.textContent = selDate ? prettyDate(selDate) : 'Choose a date on the calendar';
    t.classList.toggle('empty', !selDate);
    $('#chosenSlot').textContent = slot ? slot.value : (selDate ? 'Pick a time slot' : '');
  }

  $('#calDays').addEventListener('click', e => {
    const b = e.target.closest('button[data-d]'); if (!b || b.disabled) return;
    selDate = b.dataset.d; renderCal(); renderSlots();
  });
  $('#slotList').addEventListener('change', updateChosen);
  $('#calPrev').onclick = () => { const d = new Date(view.y, view.m - 1, 1); view = { y: d.getFullYear(), m: d.getMonth() }; renderCal(); };
  $('#calNext').onclick = () => { const d = new Date(view.y, view.m + 1, 1); view = { y: d.getFullYear(), m: d.getMonth() }; renderCal(); };

  async function loadBooked() {
    try {
      const rows = await rpc('casa_booked_slots');
      booked = {};
      (rows || []).forEach(r => { (booked[r.event_date] ||= new Set()).add(r.slot); });
    } catch (_) { /* calendar still works; server re-checks on submit */ }
    if (selDate && slotState(selDate) === 'full') selDate = null;
    renderCal(); renderSlots();
  }
  renderCal(); renderSlots(); loadBooked();

  /* ---------- Submit ---------- */
  const form = $('#bookForm'), msg = $('#formMsg'), btn = $('#submitBtn');
  const setMsg = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const slot = $('#slotList input:checked');
    const f = Object.fromEntries(new FormData(form));
    if (!selDate) return setMsg('Please choose a date on the calendar.', true), $('#cal').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!slot) return setMsg('Please pick a time slot for your date.', true), $('#slotList').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!f.name.trim()) return setMsg('Please enter your name.', true), $('#fName').focus();
    if (f.phone.replace(/\D/g, '').length < 10) return setMsg('Please enter a valid mobile number so we can reach you.', true), $('#fPhone').focus();
    if (!f.event_type) return setMsg('Please tell us the occasion.', true), $('#fType').focus();
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setMsg('That email address looks incomplete.', true), $('#fEmail').focus();

    btn.disabled = true; btn.textContent = 'Sending…'; setMsg('');
    try {
      const ref = await rpc('casa_request_booking', { p: { ...f, date: selDate, slot: slot.value } });
      $('#sName').textContent = ', ' + f.name.trim().split(/\s+/)[0];
      $('#sRef').textContent = ref;
      $('#sWhen').textContent = `${prettyDate(selDate)} · ${slot.value}`;
      form.style.display = 'none';
      $('#success').classList.add('show');
      $('#success').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      setMsg(err.message, true);
      loadBooked();
    } finally {
      btn.disabled = false; btn.textContent = 'Request booking';
    }
  });

  $('#againBtn').addEventListener('click', () => {
    form.reset(); selDate = null; setMsg('');
    $('#success').classList.remove('show'); form.style.display = '';
    renderCal(); renderSlots();
    $('#book').scrollIntoView({ behavior: 'smooth' });
  });
})();
