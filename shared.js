'use strict';
const shared = (() => {
 let token = '',refresh='',user=null,admin=false,lastSync='',pending=[];
 const anonymous=()=>Boolean(user?.is_anonymous);
 const url=(window.GS_SUPABASE_URL||'').replace(/\/$/,''), apikey=window.GS_SUPABASE_ANON_KEY||'';
 const configured=Boolean(/^https:\/\/[^/]+\.supabase\.co$/.test(url)&&apikey.length>20);
 const keyFor=p=>`${String(p.sku||'').trim()}|${norm(p.en)}`;
 function status(msg){$('syncstatus').textContent=msg}
 async function request(path,opts={}){
  if(!configured)throw Error('Configure Supabase URL and publishable/anon key in config.js');
  const h={'apikey':apikey,'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{}),...(opts.headers||{})};
  const r=await fetch(url+path,{...opts,headers:h});let data=null;try{data=await r.json()}catch(e){}
  if(!r.ok)throw Error(data?.message||data?.error_description||data?.error||`Request failed (${r.status})`);
  return data;
 }
 async function login(){try{
  const email=$('syncemail').value.trim(),password=$('syncpassword').value;
  if(!email||!password)throw Error('Enter an email and password');
  let d=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
  token=d.access_token;refresh=d.refresh_token;user=d.user;localStorage.setItem('gs_sync_session',JSON.stringify({token,refresh,user}));$('syncpassword').value='';await sync();status('Connected. Shared dictionarys loaded.');
 }catch(e){status('Sign-in failed: '+e.message)}}
 async function autoAnonymous(){
  if(!configured)return;
  try {
   status('Connecting to shared dictionary…');
   const d=await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({data:{}})});
   if(!d?.access_token||!d?.user)throw Error('Anonymous sign-in not enabled in Supabase');
   token=d.access_token;refresh=d.refresh_token;user=d.user;
   localStorage.setItem('gs_sync_session',JSON.stringify({token,refresh,user}));
   await sync();
  } catch(e) {status('Shared saving unavailable: '+e.message+'. Enable anonymous sign-ins under Supabase Authentication settings. Local order conversion still works.');}
 }
 async function authRefresh(){if(!refresh)return;try{let d=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:refresh})});token=d.access_token;refresh=d.refresh_token;user=d.user;localStorage.setItem('gs_sync_session',JSON.stringify({token,refresh,user}))}catch(e){logout()}}
 async function sync(){if(!token){status(configured?'Sign in to use the shared dictionary.':'Offline mode: add Supabase settings to config.js first.');return}
  try{
   const roles=await request('/rest/v1/gs_warehouse_roles?select=role&user_id=eq.'+encodeURIComponent(user.id));
   admin=roles.some(r=>r.role==='admin');
   const products=await request('/rest/v1/gs_warehouse_products?select=product_key,en,sku,ar,category&limit=10000');
   for(const p of products){let existing=catalog.find(x=>keyFor(x)===p.product_key);
    if(existing){existing.ar=p.ar;existing.category=p.category;existing.notes='Shared dictionary'}
    else catalog.push({...p,id:String(catalog.length),notes:'Shared dictionary'});
   }
   lastSync=new Date().toLocaleTimeString();
   $('productcount').textContent=`${catalog.length} products in dictionary`;
   $('syncsession').textContent=anonymous()?'Team dictionary connected automatically — no staff login needed':`Signed in as ${user.email}${admin?' · Admin':''}`;
   $('syncauth').classList.add('hidden');$('syncconnected').classList.remove('hidden');
   $('reviewadmin').classList.toggle('hidden',!admin);
   if(!$('dictionary').classList.contains('hidden'))renderDictionary();
   status(`Synced ${products.length} shared products at ${lastSync}. Existing on-screen orders should be converted again to use updates.`);
   if(admin)await loadQueue();
  }catch(e){status('Sync error: '+e.message)}
 }
 async function submit(p,type){
  if(!token){status('Not connected to Supabase. Correction was not shared.');return false}
  if(!p.en?.trim()||!p.ar?.trim()){status('English and Arabic names are required.');return false}
  try{
   await request('/rest/v1/rpc/gs_warehouse_save_now',{method:'POST',body:JSON.stringify({p_en:p.en.trim(),p_sku:String(p.sku||''),p_ar:p.ar.trim(),p_category:p.category||'Other'})});
   const existing=catalog.find(x=>keyFor(x)===keyFor(p));
   if(existing){existing.ar=p.ar.trim();existing.category=p.category||'Other';existing.notes='Shared dictionary';}
   else catalog.push({...p,id:String(catalog.length),notes:'Shared dictionary'});
   status('✓ Saved to shared dictionary NOW: '+p.en+'. Other devices receive it on refresh/sync.');
   return true;
  }catch(e){status('NOT SHARED — '+e.message+'. Run the V17 SQL migration once in Supabase.');return false}
 }
 async function submitLocal(){
  let n=Number(sessionStorage.getItem('gs-base-count')||201);
  let products=catalog.slice(n).filter(p=>p.notes?.includes('Added by staff')||p.notes?.includes('Restored product'));
  if(!products.length){status('No new local products to share.');return}
  let ok=0;for(const p of products){if(!p.ar?.trim())continue;if(await submit(p,'product'))ok++;}
  status(`Shared ${ok} products immediately. Product names without Arabic were skipped.`);
 }
 async function loadQueue(){if(!admin)return;try{pending=await request('/rest/v1/gs_warehouse_proposals?select=id,en,sku,ar,category,change_type,submitted_at&status=eq.pending&order=submitted_at.asc&limit=1000');$('reviewqueue').innerHTML=pending.length?pending.map(p=>`<div class="approvalitem"><div><b>${escapeHtml(p.en)}</b> <small>${escapeHtml(p.sku)} · ${escapeHtml(p.change_type)}</small><div dir="rtl">${escapeHtml(p.ar)}</div></div><button class="ghost" data-reject="${p.id}">Reject</button><button class="primary" data-approve="${p.id}">Approve</button></div>`).join(''):'No pending suggestions.';status(`Admin review: ${pending.length} pending changes.`)}catch(e){status('Could not load approval queue: '+e.message)}}
 async function decide(id,approved){let p=pending.find(x=>x.id===id);if(!p)return;if(approved&&!confirm(`Approve ${p.en} → ${p.ar} for every salesman?`))return;try{await request('/rest/v1/rpc/gs_warehouse_decide',{method:'POST',body:JSON.stringify({p_id:id,p_approve:approved})});await sync()}catch(e){status('Approval failed: '+e.message)}}
 async function confirmItem(item){
  if(!token){status('Shared connection unavailable. Enable anonymous sign-ins in Supabase settings.');return false}
  const p=item.catalogId!=null?catalog.find(x=>String(x.id)===String(item.catalogId)):null;
  const arabic=item.ar.trim();
  if(!arabic){status('Enter Arabic before confirming.');return false}
  // Write the canonical entry AND the salesman's actual product wording as an exact alias.
  // This is why a confirmed approximate match used to get flagged again on the next order.
  const canonical={en:p?.en||item.name,sku:p?.sku||item.sku||'',ar:arabic,category:p?.category||item.category||'Other'};
  const alias={en:item.name,sku:'',ar:arabic,category:canonical.category};
  if(!await submit(canonical,'translation'))return false;
  if(keyFor(alias)!==keyFor(canonical)){
   if(!await submit(alias,'alias')){
    status('Canonical translation saved, but the shorthand alias was NOT saved. Retry Confirm & Save.');
    return false;
   }
  }
  item.proposalSubmitted=true;item.sharedState='Saved to shared dictionary';
  status('✓ Confirmed for future orders, including shorthand: '+item.name+'. Other devices use it after sync.');
  return true;
 }

 async function suggestArabic(item){
  if(!token)throw Error('Sign in first');
  const r=await fetch('/.netlify/functions/iraqi-translate',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({english:item.name,category:item.category||'Other',sku:item.sku||''})});
  let data;try{data=await r.json()}catch(e){throw Error('Translation service did not respond with JSON')}
  if(!r.ok)throw Error(data.error||`Service unavailable (${r.status})`);
  if(typeof data.ar!=='string'||!data.ar.trim())throw Error('No translation was provided');
  return {ar:data.ar.trim()};
 }
 function logout(){token='';refresh='';user=null;admin=false;localStorage.removeItem('gs_sync_session');$('syncauth').classList.remove('hidden');$('syncconnected').classList.add('hidden');$('reviewadmin').classList.add('hidden');status('Disconnected. Reconnecting with an automatic staff session…');autoAnonymous();}
 function init(){
  if(!configured)status('Shared sync not configured yet. Order conversion still works locally.');
  try{let d=JSON.parse(localStorage.getItem('gs_sync_session')||'null');if(d){token=d.token;refresh=d.refresh;user=d.user;authRefresh().then(()=>token?sync():autoAnonymous());}else autoAnonymous();}catch(e){autoAnonymous()}
  $('synclogin').onclick=login;$('syncnow').onclick=sync;$('synclogout').onclick=logout;
  $('submitproducts').onclick=submitLocal;$('refreshqueue').onclick=loadQueue;
  $('reviewqueue').onclick=e=>{let a=e.target.closest('[data-approve]'),r=e.target.closest('[data-reject]');if(a)decide(Number(a.dataset.approve),true);if(r)decide(Number(r.dataset.reject),false)};
  $('dictionary').addEventListener('change',e=>{let d=e.target.dataset.dict;if(d===undefined||!token)return;let p=catalog[Number(d)];if(p&&p.ar.trim())submit(p,'translation')});

  setInterval(()=>{if(token)authRefresh().then(sync);else autoAnonymous()},60000);
 }
 return{init,sync,submit,confirmItem,suggestArabic,isConnected:()=>Boolean(token)};
})();
