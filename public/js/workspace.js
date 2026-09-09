const Workspace = {
  properties: [], currentTab: 'website', dirty: false, site: null,
  async request(path, method = 'GET', body) {
    const response = await fetch(`/api/admin${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not complete this action'); return result;
  },
  async init(user) {
    this.user = user;
    const invitation = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (invitation) {
      await this.request('/invitations/accept', 'POST', { token: invitation });
      history.replaceState(null, '', location.pathname); user = (await this.request('/verify', 'POST')).user; this.user = user;
    }
    this.properties = (await this.request('/properties')).data;
    const stored = sessionStorage.getItem('activeProperty');
    this.property = this.properties.find(p => p.property_id === stored) || this.properties[0];
    const select = document.getElementById('activeProperty'); select.replaceChildren();
    for (const p of this.properties) select.add(new Option(p.name, p.property_id));
    if (this.property) { select.value = this.property.property_id; sessionStorage.setItem('activeProperty', this.property.property_id); }
    else { sessionStorage.removeItem('activeProperty'); select.add(new Option('No assigned properties', '')); }
    select.onchange = () => {
      if (this.dirty && !confirm('Discard unsaved website changes and switch property?')) { select.value = this.property.property_id; return; }
      sessionStorage.setItem('activeProperty', select.value); location.reload();
    };
    document.querySelectorAll('[data-workspace-tab]').forEach(btn => btn.onclick = () => {
      if (this.dirty && !confirm('Discard your unsaved website changes?')) return;
      this.dirty = false; this.currentTab = btn.dataset.workspaceTab; this.open();
    });
  },
  isOwner() { return this.user.role === 'full_admin' || this.user.properties.some(p => p.id === this.property?.id && p.is_owner); },
  async open() {
    const root = document.getElementById('workspaceContent');
    document.querySelectorAll('[data-workspace-tab]').forEach(btn => {
      btn.setAttribute('aria-selected', btn.dataset.workspaceTab === this.currentTab);
      btn.hidden = ['team', 'payments'].includes(btn.dataset.workspaceTab) && !this.isOwner();
    });
    if (this.currentTab === 'account') { this.account(root); return; }
    if (!this.property) { root.innerHTML = '<div class="workspace-empty">No properties assigned. Ask your property owner for an invitation, or create a property from Properties.</div>'; return; }
    root.innerHTML = '<p role="status">Loading your workspace…</p>';
    try {
      if (this.currentTab === 'website') await this.website(root);
      if (this.currentTab === 'team') await this.team(root);
      if (this.currentTab === 'payments') await this.payments(root);
      if (this.currentTab === 'deposits') await this.deposits(root);
      if (this.currentTab === 'account') this.account(root);
    } catch (err) { root.innerHTML = `<div class="workspace-empty" role="alert">${escapeHtml(err.message)} <button class="btn" onclick="Workspace.open()">Try again</button></div>`; }
  },
  field(key, label, value, type = 'text', hint = '') {
    const input = type === 'textarea' ? `<textarea id="ws-${key}" name="${key}" rows="4">${escapeHtml(value)}</textarea>` : `<input id="ws-${key}" name="${key}" type="${type}" value="${escapeHtml(value)}">`;
    return `<div class="form-group"><label for="ws-${key}">${label}</label>${input}${hint ? `<p class="field-hint">${hint}</p>` : ''}</div>`;
  },
  message(text, error = false) { const el = document.getElementById('workspaceStatus'); if (el) { el.textContent = text; el.className = `workspace-status${error ? ' error' : ''}`; } },
  async website(root) {
    const { data } = await this.request(`/properties/${this.property.id}/website`); this.site = data;
    const d = data.draft, field = (...args) => this.field(...args);
    root.innerHTML = `<div class="workspace-toolbar"><div><h2>Your property, in your words.</h2><p>Edit your website here. Publish when it is ready.</p></div><div class="workspace-actions"><a class="btn" href="/admin/preview/${encodeURIComponent(this.property.property_id)}" target="_blank" rel="noopener">Preview</a><button class="btn" id="saveWebsite">Save draft</button><button class="btn btn-primary" id="publishWebsite">Publish</button></div></div>
      <p id="workspaceStatus" class="workspace-status" role="status">${data.published_at ? `Published ${escapeHtml(new Date(data.published_at).toLocaleDateString())}` : 'Draft — your website is not public yet.'}</p>
      <div class="website-grid"><form id="websiteForm"><section class="workspace-card"><h3>First impressions</h3>${field('name','Property name',d.name)}${field('tagline','Headline',d.tagline)}${field('description','Introduction',d.description,'textarea')}${field('hero_image_url','Cover photo URL',d.hero_image_url,'url','Use a public HTTPS image URL.')}</section>
      <section class="workspace-card"><h3>About the property</h3>${field('about_title','Section heading',d.about_title)}${field('about_text','About',d.about_text,'textarea')}${field('features','Amenities',d.features.join('\n'),'textarea','One amenity per line.')}${field('gallery','Gallery',d.gallery.map(g=>`${g.url} | ${g.caption}`).join('\n'),'textarea','One image per line: HTTPS URL | caption')}</section>
      <section class="workspace-card"><h3>Location & contact</h3>${field('address','Address',d.address)}<div class="form-row">${field('city','Town or city',d.city)}${field('contact_phone','Contact phone',d.contact_phone,'tel')}</div>${field('email','Contact email',d.email,'email')}${field('maps_url','Map link',d.maps_url,'url')}${field('policies','House rules & booking policy',d.policies,'textarea')}${field('seo_description','Search description',d.seo_description,'textarea','Up to 160 characters.')}</section>
      </form><aside class="workspace-card preview-card"><img class="preview-image" id="websitePreviewImage" alt="Property cover"><div class="preview-copy"><span class="preview-eyebrow">Website cover</span><h3 id="websitePreviewName"></h3><p id="websitePreviewTagline"></p><hr style="border:0;border-top:1px solid var(--border);margin:24px 0"><p>Your rooms, rates and photos come from <a href="#" onclick="showPage('units');return false">Units & Rooms</a>.</p><a class="btn" href="/p/${encodeURIComponent(this.property.property_id)}" target="_blank" rel="noopener" ${data.published ? '' : 'hidden'}>View live website</a>${data.published ? '<button type="button" class="btn" id="unpublishWebsite">Unpublish</button>' : ''}</div></aside></div>`;
    const form = document.getElementById('websiteForm'); form.onsubmit = event => event.preventDefault();
    const preview = () => { document.getElementById('websitePreviewName').textContent = form.elements.name.value; document.getElementById('websitePreviewTagline').textContent = form.elements.tagline.value; const image = document.getElementById('websitePreviewImage'); const url = safeUrl(form.elements.hero_image_url.value); image.hidden = !url; if (url) image.src = url; };
    form.oninput = () => { this.dirty = true; this.message('Unsaved changes'); preview(); }; preview();
    document.getElementById('saveWebsite').onclick = () => this.saveWebsite(false);
    document.getElementById('publishWebsite').onclick = () => this.saveWebsite(true);
    document.getElementById('unpublishWebsite')?.addEventListener('click', async () => {
      if (!confirm('Take this property website offline? Your draft will be kept.')) return;
      try { await this.request(`/properties/${this.property.id}/website/unpublish`, 'POST', { version: this.site.version }); this.dirty = false; this.open(); } catch (err) { this.message(err.message, true); }
    });
  },
  async saveWebsite(publish) {
    const form = document.getElementById('websiteForm'); if (!form.reportValidity()) return;
    const content = Object.fromEntries(new FormData(form));
    content.features = content.features.split('\n').map(s=>s.trim()).filter(Boolean);
    content.gallery = content.gallery.split('\n').filter(s=>s.trim()).map(s=>{ const [url, ...caption] = s.split('|'); return { url: url.trim(), caption: caption.join('|').trim() }; });
    const buttons = [document.getElementById('saveWebsite'), document.getElementById('publishWebsite')]; buttons.forEach(b=>b.disabled=true);
    try {
      this.site = (await this.request(`/properties/${this.property.id}/website`, 'PUT', { content, version: this.site.version })).data;
      this.dirty = false;
      if (publish) { this.site = (await this.request(`/properties/${this.property.id}/website/publish`, 'POST', { version: this.site.version })).data; await this.website(document.getElementById('workspaceContent')); }
      this.message(publish ? 'Website published. Your changes are live.' : 'Draft saved. Preview it before publishing.');
    } catch (err) { this.message(err.message, true); }
    finally { buttons.forEach(b=>b.disabled=false); }
  },
  async team(root) {
    const result = await this.request(`/properties/${this.property.id}/team`);
    root.innerHTML = `<div class="workspace-toolbar"><div><h2>People at ${escapeHtml(this.property.name)}</h2><p>Team members can manage this property and its website.</p></div></div><section class="workspace-card">${result.data.map(m=>`<div class="team-row"><div><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.email)} · ${m.is_owner ? 'Owner' : 'Manager'}</small></div>${m.is_owner ? '' : `<button class="btn" data-remove-member="${m.id}">Remove</button>`}</div>`).join('')}</section>
      <form id="inviteForm" class="workspace-card"><h3>Invite a manager</h3>${this.field('email','Email address','','email')}<button class="btn btn-primary">Create invitation</button><p id="workspaceStatus" class="workspace-status" role="status"></p><input id="inviteLink" aria-label="Invitation link" readonly hidden></form>
      <section class="workspace-card"><h3>Pending invitations</h3>${result.invitations.length ? result.invitations.map(i=>`<div class="team-row"><span>${escapeHtml(i.email)}</span><button class="btn" data-cancel-invite="${i.id}">Revoke</button></div>`).join('') : '<p class="field-hint">No pending invitations.</p>'}</section>`;
    document.getElementById('inviteForm').onsubmit = async event => {
      event.preventDefault(); const button=event.target.querySelector('button'); button.disabled=true;
      try { const result=await this.request(`/properties/${this.property.id}/team`, 'POST', {email:event.target.elements.email.value}); const link=document.getElementById('inviteLink'); link.hidden=false; link.value=location.origin+result.path; this.message(result.message); } catch(err){this.message(err.message,true);} finally{button.disabled=false;}
    };
    root.querySelectorAll('[data-remove-member]').forEach(btn=>btn.onclick=async()=>{ if(!confirm('Remove this manager’s access to this property?'))return; try{await this.request(`/properties/${this.property.id}/team/${btn.dataset.removeMember}`,'DELETE');this.open();}catch(err){this.message(err.message,true);} });
    root.querySelectorAll('[data-cancel-invite]').forEach(btn=>btn.onclick=async()=>{try{await this.request(`/properties/${this.property.id}/invitations/${btn.dataset.cancelInvite}`,'DELETE');this.open();}catch(err){this.message(err.message,true);}});
  },
  async payments(root) {
    const d=(await this.request(`/properties/${this.property.id}/payments-settings`)).data;
    root.innerHTML=`<div class="workspace-toolbar"><div><h2>Receive payments</h2><p>Use this property’s own M-Pesa account.</p></div></div><form id="merchantForm" class="workspace-card" style="max-width:720px"><h3>M-Pesa Express</h3><div class="form-row"><div class="form-group"><label for="merchantEnvironment">Environment</label><select id="merchantEnvironment" name="environment"><option value="sandbox">Sandbox testing</option><option value="production">Live payments</option></select></div><div class="form-group"><label for="transactionType">Account type</label><select id="transactionType" name="transaction_type"><option value="CustomerPayBillOnline">Paybill</option><option value="CustomerBuyGoodsOnline">Till</option></select></div></div>${this.field('shortcode','Shortcode',d.shortcode||'')}${this.field('consumer_key','Consumer key','','password')}${this.field('consumer_secret','Consumer secret','','password')}${this.field('passkey','Passkey','','password')}<p class="field-hint">${d.configured?'Leave secret fields blank to keep the existing credentials.':'Enter the credentials from your Safaricom Daraja account.'}</p><label style="margin:20px 0"><input type="checkbox" name="enabled" style="width:auto" ${d.enabled?'checked':''}> Enable online payments</label><button class="btn btn-primary">Save payment settings</button><p id="workspaceStatus" class="workspace-status" role="status"></p></form>`;
    const form=document.getElementById('merchantForm');form.elements.environment.value=d.environment||'sandbox';form.elements.transaction_type.value=d.transaction_type||'CustomerPayBillOnline';
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;const data=Object.fromEntries(new FormData(form));data.enabled=form.elements.enabled.checked;for(const k of ['consumer_key','consumer_secret','passkey'])if(!data[k])delete data[k];try{await this.request(`/properties/${this.property.id}/payments-settings`,'PUT',data);for(const k of ['consumer_key','consumer_secret','passkey'])form.elements[k].value='';this.message('Payment settings saved.');}catch(err){this.message(err.message,true);}finally{button.disabled=false;}};
  },
  async deposits(root) {
    const data=(await this.request('/payment-attempts')).data;
    root.innerHTML=`<div class="workspace-toolbar"><div><h2>Payment activity</h2><p>Follow pending requests and review payments that need attention.</p></div></div><section class="workspace-card">${data.length?data.map(p=>`<div class="team-row"><div><strong>KES ${Number(p.amount_kes).toLocaleString()} · ${escapeHtml(p.kind)}</strong><small>${escapeHtml(p.reference)} · ${escapeHtml(p.status.replaceAll('_',' '))}</small>${p.status==='needs_review'?'<small>Check the M-Pesa statement before making any adjustment.</small>':''}</div><button class="btn" data-reconcile="${p.id}" ${!p.has_callback?'disabled':''}>Recheck</button></div>`).join(''):'<p>No online payments yet.</p>'}<p id="workspaceStatus" class="workspace-status" role="status"></p></section>`;
    root.querySelectorAll('[data-reconcile]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{await this.request(`/payment-attempts/${btn.dataset.reconcile}/reconcile`,'POST',{});this.open();}catch(err){this.message(err.message,true);btn.disabled=false;}});
  },
  account(root) {
    root.innerHTML=`<section class="workspace-card" style="max-width:650px"><h3>Change password</h3><form id="passwordForm">${this.field('current_password','Current password','','password')}${this.field('password','New password','','password','At least 12 characters.')}<button class="btn btn-primary">Update password</button><p id="workspaceStatus" class="workspace-status" role="status"></p></form></section>`;
    document.getElementById('passwordForm').onsubmit=async e=>{e.preventDefault();try{await this.request('/account/password','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();this.message('Password updated. Other sessions have been signed out.');}catch(err){this.message(err.message,true);}};
  }
};
window.addEventListener('beforeunload',e=>{if(Workspace.dirty){e.preventDefault();e.returnValue='';}});
