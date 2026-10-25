(() => {
  const C = window.CASA_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let rows = [], tab = 'pending';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

  const toast = (t, bad) => {
    const el = $('#toast'); el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  };

  /* ---------- Auth ---------- */
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    const { data: ok, error } = await sb.rpc('casa_is_admin');
    if (error || !ok) {
      await sb.auth.signOut();
      return showLogin('This account is not set up as a Casa Poblacion admin.');
    }
    $('#login').hidden = true; $('#app').hidden = false; $('#who').hidden = false;
    $('#whoEmail').textContent = session.user.email;
    load();
  }
  function showLogin(err) {
    $('#app').hidden = true; $('#who').hidden = true; $('#login').hidden = false;
    $('#lErr').textContent = err || '';
  }
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#lBtn'); b.disabled = true; b.textContent = 'Signing in…'; $('#lErr').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPass').value });
    b.disabled = false; b.textContent = 'Sign in';
    if (error) return ($('#lErr').textContent = 'Incorrect email or password.');
    $('#lPass').value = '';
    boot();
  });
  $('#outBtn').onclick = async () => { await sb.auth.signOut(); rows = []; showLogin(); };

  /* ---------- Data ---------- */
  async function load() {
    const { data, error } = await sb.from('casa_bookings').select('*').order('event_date', { ascending: true }).order('created_at', { ascending: true });
    if (error) return toast('Could not load bookings: ' + error.message, true);
    rows = data; render();
  }

  async function update(id, patch, btn) {
    if (btn) btn.disabled = true;
    const { data, error } = await sb.from('casa_bookings').update(patch).eq('id', id).select().single();
    if (btn) btn.disabled = false;
    if (error) return toast(error.message.includes('approved booking') ? 'That date/slot already has an approved booking.' : error.message, true);
    rows = rows.map(r => r.id === id ? data : r);
    render();
    toast(patch.status ? `Marked as ${patch.status}.` : 'Note saved.');
  }

  /* ---------- Render ---------- */
  const fmt = d => {
    const x = new Date(d + 'T00:00:00');
    return { day: x.getDate(), rest: x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', year: 'numeric' }) };
  };
  const clashes = r => rows.filter(o => o.id !== r.id && o.status === 'approved' && o.event_date === r.event_date &&
    (o.slot === r.slot || o.slot === 'Whole day' || r.slot === 'Whole day'));

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    const when = $('#when').value;
    const scoped = rows.filter(r => when === 'any' || (when === 'upcoming' ? r.event_date >= todayISO : r.event_date < todayISO));
    document.querySelectorAll('#tabs button').forEach(b => {
      const s = b.dataset.s;
      b.querySelector('b').textContent = scoped.filter(r => s === 'all' || r.status === s).length || '';
      b.classList.toggle('on', s === tab);
    });
    let list = scoped.filter(r => tab === 'all' || r.status === tab);
    if (q) list = list.filter(r => [r.full_name, r.phone, r.email, r.ref, r.event_type].join(' ').toLowerCase().includes(q));
    if (when === 'past') list.reverse();

    $('#list').innerHTML = list.length ? list.map(r => {
      const d = fmt(r.event_date);
      const tel = r.phone.replace(/[^\d+]/g, '');
      const clash = r.status !== 'approved' && clashes(r).length;
      return `<article class="card">
        <div class="date"><b>${d.day}</b><span>${esc(d.rest)}</span><em>${esc(r.slot)}</em></div>
        <div class="info">
          <h3>${esc(r.full_name)}</h3>
          <div class="meta">
            <span>${esc(r.event_type)}${r.guests ? ' · ' + r.guests + ' guests' : ''}${r.package ? ' · ' + esc(r.package) : ''}</span>
            <a href="tel:${esc(tel)}">${esc(r.phone)}</a>
            <a href="sms:${esc(tel)}">Text</a>
            ${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}
          </div>
          ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ''}
          <div class="note"><input data-note="${r.id}" value="${esc(r.admin_note)}" placeholder="Private note (deposit, package agreed…)" maxlength="500"><button data-save="${r.id}">Save</button></div>
          <div class="small" style="margin-top:8px">Ref ${esc(r.ref)} · requested ${new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${clash ? ' · <strong style="color:#a5432f">clashes with an approved booking</strong>' : ''}</div>
        </div>
        <div class="side">
          <span class="pill ${r.status}">${r.status}</span>
          ${r.status !== 'approved' ? `<button class="act ok" data-id="${r.id}" data-s="approved" ${clash ? 'disabled title="Slot already taken"' : ''}>Approve</button>` : ''}
          ${r.status === 'pending' ? `<button class="act no" data-id="${r.id}" data-s="declined">Decline</button>` : ''}
          ${r.status === 'approved' ? `<button class="act no" data-id="${r.id}" data-s="cancelled">Cancel booking</button>` : ''}
          ${r.status !== 'pending' ? `<button class="act" data-id="${r.id}" data-s="pending">Back to pending</button>` : ''}
        </div>
      </article>`;
    }).join('') : `<div class="empty">No ${tab === 'all' ? '' : tab + ' '}requests ${when === 'past' ? 'in the past' : when === 'upcoming' ? 'for upcoming dates' : ''}.</div>`;
  }

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.s; render(); } });
  $('#q').addEventListener('input', render);
  $('#when').addEventListener('change', render);
  $('#list').addEventListener('click', e => {
    const a = e.target.closest('button[data-s]');
    if (a) {
      if (a.dataset.s === 'cancelled' && !confirm('Cancel this approved booking? The date will open up again on the website.')) return;
      return update(a.dataset.id, { status: a.dataset.s }, a);
    }
    const s = e.target.closest('button[data-save]');
    if (s) update(s.dataset.save, { admin_note: document.querySelector(`[data-note="${s.dataset.save}"]`).value.trim() || null }, s);
  });

  // Refresh when returning to the tab
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) load(); });
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
  boot();
})();
