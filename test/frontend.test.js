const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(file,'utf8');
function page(file, url='https://property.example.test/admin/') {
  const dom=new JSDOM(read(file),{url,runScripts:'outside-only'});
  const w=dom.window;w.eval=source=>vm.runInContext(source,dom.getInternalVMContext());w.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,data:[]})});w.Headers=Headers;w.AbortSignal=AbortSignal;
  w.eval(read('public/js/http-client.js'));w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};
  return dom;
}
test('CMS renders untrusted text safely and submits draft then publish with current versions',async()=>{
  const dom=page('public/admin/index.html'),w=dom.window;
  try{
    w.eval(read('public/js/workspace.js'));
    const content={name:'"/><img data-injected src=x>',description:'</textarea><img data-injected>',tagline:'A home',hero_image_url:'https://example.test/photo.jpg',features:['Parking'],gallery:[],about_title:'About',about_text:'',address:'',city:'',contact_phone:'0712345678',email:'',maps_url:'',policies:'',seo_description:''};
    const calls=[];let site={draft:content,version:1,published:null,published_at:null};
    w.fakeRequest=async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='PUT')site={...site,draft:body.content,version:site.version+1};if(path.endsWith('/publish'))site={...site,published:site.draft,published_at:new Date().toISOString(),version:site.version+1};return {data:site};};
    w.eval("Workspace.property={id:1,property_id:'garden'};Workspace.request=window.fakeRequest;");
    await w.eval("Workspace.website(document.getElementById('workspaceContent'))");
    assert.equal(w.document.querySelector('[data-injected]'),null);
    assert.equal(w.document.getElementById('ws-name').value,content.name);
    w.document.getElementById('ws-name').value='Garden House';
    await w.eval('Workspace.saveWebsite(true)');
    const saved=calls.find(c=>c.method==='PUT'),published=calls.find(c=>c.path.endsWith('/publish'));
    assert.equal(saved.body.version,1);assert.equal(published.body.version,2);assert.equal(published.method,'POST');
    assert.equal(site.published.name,'Garden House');assert.ok(w.document.getElementById('unpublishWebsite'));
    assert.equal(w.document.getElementById('workspaceStatus').textContent,'Website published. Your changes are live.');
  }finally{w.close();}
});
test('existing unit editor supports a studio, empty description, zero extra fee and HTTPS photos',async()=>{
  const dom=page('public/admin/index.html'),w=dom.window;
  try{
    w.eval("const API_BASE='';const state={token:'cookie'};function showToast(){};");w.eval(read('public/js/units-manager.js'));
    const unit={id:1,property_id:'garden',unit_id:'studio',name:'Studio',description:'',type:'bedsit',bedrooms:0,bathrooms:1,max_guests:2,base_price_kes:10000,extra_guest_charge:0,water_deposit_kes:1000,min_night_stay:1,status:'active',images:[{image_url:'https://example.test/room.jpg'}]};
    const calls=[];w.fetch=async(path,options={})=>{calls.push({path,options});return {ok:true,json:async()=>({ok:true,data:[unit]})};};
    w.eval("unitsState.propertiesList=[{property_id:'garden',name:'Garden'}];populatePropertyDropdown();");
    await w.openEditUnitModal(1);
    await w.handleUnitSubmit({preventDefault(){}});
    const update=calls.find(c=>c.options.method==='PUT'&&!c.path.endsWith('/images'));
    assert.ok(update,w.document.getElementById('unitFormError').textContent);
    const body=JSON.parse(update.options.body);assert.equal(body.bedrooms,0);assert.equal(body.description,'');assert.equal(body.extra_guest_charge,0);
    assert.equal(calls.filter(c=>c.path.endsWith('/images')).length,1);
  }finally{w.close();}
});
test('request context uses cookies and current property, without exposing session tokens',async()=>{
  const dom=page('public/admin/index.html'),w=dom.window;
  try{
    const calls=[];w.fetch=async(input,options)=>{calls.push({input,options});return {status:200};};
    w.localStorage.setItem('adminToken','stale-token');w.sessionStorage.setItem('activeProperty','garden');w.eval(read('public/js/http-client.js'));
    await w.fetch('/api/admin/units',{headers:{Authorization:'Bearer stale-token'}});
    await w.fetch('/api/admin/properties');
    assert.equal(calls[0].options.headers.get('X-Property-ID'),'garden');assert.equal(calls[0].options.headers.has('Authorization'),false);assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[1].options.headers.has('X-Property-ID'),false);assert.equal(w.localStorage.getItem('adminToken'),null);
  }finally{w.close();}
});
test('onboarding advances and reports server conflicts without losing entered details',async()=>{
  const dom=page('public/onboard.html','https://property.example.test/onboard.html'),w=dom.window;
  try{
    w.eval(read('public/js/onboard.js'));const form=w.document.getElementById('onboardForm');
    const values={ownerName:'Owner',ownerEmail:'owner@example.test',ownerUsername:'owner',ownerPassword:'a-long-test-password',propertyName:'Garden',propertySlug:'garden',propertyCity:'Thika',propertyPhone:'0712345678'};
    for(const [id,value] of Object.entries(values))w.document.getElementById(id).value=value;
    await form.onsubmit({preventDefault(){}});assert.equal(w.document.getElementById('propertyFields').hidden,false);
    w.fetch=async()=>({ok:false,json:async()=>({error:'That website address already exists'})});
    await form.onsubmit({preventDefault(){}});
    assert.equal(w.document.getElementById('onboardError').textContent,'That website address already exists');assert.equal(w.document.getElementById('ownerName').value,'Owner');assert.equal(w.document.getElementById('onboardSubmit').disabled,false);
  }finally{w.close();}
});
