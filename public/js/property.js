(() => {
  const parts=location.pathname.split('/'),slug=parts.at(-1),preview=parts.includes('preview');
  let property,units=[],paymentsEnabled=false,selected,quote=null,requestKey=null,pollTimer=null,quoting=0;
  const el=id=>document.getElementById(id), set=(id,value)=>el(id).textContent=value||'';
  async function api(path,options={}){const response=await fetch(path,options);const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again.');return result;}
  function link(label,href){const a=document.createElement('a');a.className='btn btn-primary';a.textContent=label;a.href=href;a.rel='noopener';return a;}
  function open(unit){
    selected=unit;quote=null;requestKey=crypto.randomUUID();el('propertyBookingForm').reset();set('bookingUnitName',unit.name);
    const rental=unit.type!=='bnb';el('checkoutField').hidden=rental;el('checkout').required=!rental;el('guestsField').hidden=rental;
    el('checkin').min=new Date().toISOString().slice(0,10);el('checkout').min=el('checkin').min;el('guests').max=unit.max_guests;el('guests').value=Math.min(2,unit.max_guests);
    el('propertyBookingForm').hidden=false;el('paymentProgress').hidden=true;el('payBookingButton').disabled=true;
    set('quoteDescription','Select your dates to see the total.');set('quoteAmount','');set('bookingStatus','');el('bookingDialog').showModal();
  }
  async function updateQuote(){
    quote=null;el('payBookingButton').disabled=true;const version=++quoting;
    if(!selected||!el('checkin').value)return;
    if(selected.type==='bnb'&&!el('checkout').value)return;
    set('bookingStatus','Checking availability…');
    try{
      let amount,description;
      if(selected.type==='bnb'){
        const result=await api('/api/calendar/check-availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitId:selected.unit_id,checkinDate:el('checkin').value,checkoutDate:el('checkout').value,totalGuests:Number(el('guests').value)})});
        if(version!==quoting)return;if(!result.data.isAvailable)throw new Error('These dates are unavailable. Please choose another stay.');amount=result.data.pricing.finalPrice;description=`${result.data.pricing.nights} nights · including any guest and seasonal charges`;
      }else{amount=selected.base_price_kes*2+selected.water_deposit_kes;description=`First month KES ${selected.base_price_kes.toLocaleString()} + security deposit KES ${selected.base_price_kes.toLocaleString()} + utilities KES ${selected.water_deposit_kes.toLocaleString()}`;}
      if(version!==quoting)return;quote=amount;set('quoteDescription',description);set('quoteAmount','KES '+amount.toLocaleString());set('bookingStatus','');el('payBookingButton').disabled=!paymentsEnabled||preview;
    }catch(err){if(version===quoting){set('bookingStatus',err.message);set('quoteAmount','');}}
  }
  function showPayment(record){el('propertyBookingForm').hidden=true;el('paymentProgress').hidden=false;set('paymentReference',record.ref||'');
    const messages={initiating:'Your payment request is being prepared.',pending:'Check your phone for the M-Pesa prompt.',confirmed:'Payment received. Your reference is below.',failed:'The payment was not completed. Please contact the property if you were charged.',needs_review:'The payment needs checking. Contact the property with your M-Pesa message before paying again.'};
    set('paymentProgressText',messages[record.status]||'Checking payment status…');if(['confirmed','failed','needs_review'].includes(record.status)){clearInterval(pollTimer);pollTimer=null;} }
  async function refresh(){const saved=JSON.parse(sessionStorage.getItem(`payment:${slug}`)||'null');if(!saved)return;try{const r=await api('/api/mpesa/status/'+saved.id,{headers:{'X-Booking-Token':saved.key}});showPayment(r);}catch{set('paymentProgressText','Could not check the payment. Check your connection, then try again.');}}
  async function load(){
    try{const result=await api(preview?`/api/admin/websites/${slug}/preview`:`/api/websites/${slug}`);property=result.data;units=result.units;paymentsEnabled=result.payments_enabled;
      el('previewNotice').hidden=!preview;document.title=property.name;document.querySelector('meta[name=description]').content=property.seo_description||property.description.slice(0,160);
      for(const id of ['propertyLogo','propertyName','contactName'])set(id,property.name);set('propertyCity',property.city||'Welcome');set('propertyTagline',property.tagline);set('propertyDescription',property.description);set('aboutTitle',property.about_title);set('aboutText',property.about_text);set('contactAddress',[property.address,property.city].filter(Boolean).join(', '));set('propertyPolicies',property.policies);el('policySection').hidden=!property.policies;
      const hero=safeUrl(property.hero_image_url);if(hero){el('heroImage').style.backgroundImage=`url("${hero.replaceAll('"','%22')}")`;el('aboutImage').src=hero;}else el('aboutImage').hidden=true;
      for(const feature of property.features||[]){const li=document.createElement('li');li.textContent=feature;el('propertyFeatures').append(li);}
      for(const unit of units){const card=document.createElement('article');card.className='listing-card';const source=safeUrl(unit.images?.[0]?.image_url);card.innerHTML=`<div class="listing-img-wrap">${source?`<img src="${escapeHtml(source)}" alt="${escapeHtml(unit.images[0].alt_text||unit.name)}" loading="lazy">`:''}<span class="listing-badge ${unit.type==='bnb'?'badge-airbnb':'badge-rent'}">${unit.type==='bnb'?'Short stays':'Monthly rental'}</span></div><div class="listing-body"><div class="listing-price">KES ${Number(unit.base_price_kes).toLocaleString()} <span>/ ${unit.type==='bnb'?'night':'month'}</span></div><h3 class="listing-title">${escapeHtml(unit.name)}</h3><p class="listing-location">${escapeHtml(unit.description||property.city)}</p><div class="listing-specs"><span>${unit.bedrooms?unit.bedrooms+' bedroom(s)':'Studio'}</span><span>${unit.bathrooms} bathroom(s)</span></div><div class="listing-actions"><button class="btn btn-primary btn-sm" ${preview?'disabled':''}>${paymentsEnabled?'Check availability':'Enquire about this room'}</button></div></div>`;
        card.querySelector('button').onclick=()=>{if(paymentsEnabled)open(unit);else el('contact').scrollIntoView({behavior:'smooth'});};el('roomListings').append(card);}
      set('siteStatus',units.length?'':'No rooms are listed yet. Contact the property for availability.');
      for(const photo of property.gallery||[]){const source=safeUrl(photo.url);if(!source)continue;el('gallery').hidden=false;const button=document.createElement('button');button.innerHTML=`<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(photo.caption)}" loading="lazy"><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`;button.onclick=()=>{el('galleryLarge').src=source;el('galleryLarge').alt=photo.caption;set('galleryCaption',photo.caption);el('galleryDialog').showModal();};el('galleryImages').append(button);}
      const phone=String(property.contact_phone).replace(/[^+\d]/g,'');if(phone){el('contactLinks').append(link('Call us','tel:'+phone));const wa=phone.replace(/^0/,'254').replace('+','');el('contactLinks').append(link('WhatsApp','https://wa.me/'+wa));}if(property.email)el('contactLinks').append(link('Email us','mailto:'+property.email));if(safeUrl(property.maps_url))el('contactLinks').append(link('Find us',safeUrl(property.maps_url)));
      set('propertyCopyright',`© ${new Date().getFullYear()} ${property.name}`);
      const unitId=new URLSearchParams(location.hash.slice(1)).get('unit');const target=units.find(u=>u.unit_id===unitId);if(target&&paymentsEnabled&&!preview)open(target);
      const pending=JSON.parse(sessionStorage.getItem(`payment:${slug}`)||'null');if(pending&&!preview){if(!el('bookingDialog').open)el('bookingDialog').showModal();await refresh();}
    }catch(err){set('siteStatus',err.message);set('propertyTagline','This website could not be loaded. Please refresh to try again.');}}
  for(const id of ['checkin','checkout','guests'])el(id).addEventListener('change',updateQuote);
  el('propertyBookingForm').onsubmit=async event=>{event.preventDefault();if(!quote||preview)return;const button=el('payBookingButton');button.disabled=true;set('bookingStatus','Sending the payment request…');try{const body=Object.fromEntries(new FormData(event.target));Object.assign(body,{type:selected.type==='bnb'?'bnb':'rental',unitId:selected.unit_id,property:slug,amount:quote,guests:Number(body.guests)});const result=await api('/api/mpesa/stk-push',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(body)});sessionStorage.setItem(`payment:${slug}`,JSON.stringify({id:result.bookingId,key:requestKey}));showPayment(result);if(result.status==='pending'||result.status==='initiating')pollTimer=setInterval(refresh,5000);}catch(err){set('bookingStatus',err.message);button.disabled=false;}};
  el('refreshPayment').onclick=refresh;
  document.querySelector('.close-booking').onclick=()=>{el('bookingDialog').close();clearInterval(pollTimer);};
  document.querySelector('.close-gallery').onclick=()=>el('galleryDialog').close();
  load();
})();
