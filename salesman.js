(()=>{'use strict';
const $=id=>document.getElementById(id),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=String(window.GS_SUPABASE_URL||'').replace(/\/$/,''),anon=window.GS_SUPABASE_ANON_KEY;
let sess=null,staff=null,customers=[],products=[],history=[],customerId='',cart=[],lastSaved=null,lastSubmittedSignature=null,loading=false,currentGroup=1,editingOrderId=null;
const now=()=>Math.floor(Date.now()/1000);
const err=(where,msg)=>{$(where).textContent=msg||'';};
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u064b-\u065f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const headers=(token)=>({'apikey':anon,'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})});
async function request(urlOrPath,opts={}){const response=await fetch(urlOrPath.startsWith('http')?urlOrPath:url+urlOrPath,opts);let data;try{data=await response.json()}catch{data=null}if(!response.ok)throw Error(data?.message||data?.msg||data?.error_description||data?.error||'Request failed ('+response.status+')');return data;}
async function fresh(){if(!sess)throw Error('Please sign in');if(sess.expires_at-now()>90)return;let s=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:headers(),body:JSON.stringify({refresh_token:sess.refresh_token})});sess={...s,expires_at:now()+s.expires_in};sessionStorage.setItem('gs_sales_session_v23',JSON.stringify(sess));}
async function db(path,options={}){await fresh();return await request('/rest/v1/'+path,{...options,headers:{...headers(sess.access_token),...options.headers}})}
function activate(show){$('loginPage').hidden=show;$('appPage').hidden=!show;$('userBar').hidden=!show;}
function reset(){sess=null;staff=null;customers=[];products=[];cart=[];currentGroup=1;sessionStorage.removeItem('gs_sales_session_v23');activate(false);$('password').value='';}
async function auth(email,password){if(!url||!anon)throw Error('Supabase configuration missing');const s=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:headers(),body:JSON.stringify({email,password})});sess={...s,expires_at:now()+s.expires_in};try{const roles=await db('gs_sales_staff?select=user_id,role,enabled&user_id=eq.'+encodeURIComponent(sess.user.id));if(!roles.length||!roles[0].enabled)throw Error('This account is not authorized for Sales Order Hub. Ask Golden Star to enable access.');staff=roles[0];sessionStorage.setItem('gs_sales_session_v23',JSON.stringify(sess));activate(true);$('loggedAs').textContent=s.user.email;await loadData();}catch(e){reset();throw e;}}
async function loadCustomers(){let all=[];for(let offset=0;offset<100000;offset+=750){const batch=await db('gs_sales_customers?select=id,name,retailer,code,address&order=id.asc&limit=750&offset='+offset);all.push(...batch);if(batch.length<750)break;}return all;}
async function loadData(){err('orderMessage','');$('saveStatus').textContent='Loading stores & products…';const [c,p]=await Promise.all([loadCustomers(),loadProducts()]);customers=c;products=p;const saved=localStorage.getItem('gs_sales_draft_'+sess.user.id);let state={};try{state=saved?JSON.parse(saved):{}}catch{};customerId=state.customerId&&customers.some(x=>String(x.id)===String(state.customerId))?String(state.customerId):'';currentGroup=Math.max(1,Number(state.currentGroup)||1);editingOrderId=state.editingOrderId||null;cart=(state.cart||[]).filter(x=>x&&x.key&&x.name&&Number(x.qty)>0).map(x=>{const saved={...x,invoice_group:Number(x.invoice_group)||1,qty:Number(x.qty)};const current=products.find(p=>saved.key==='p'+p.id+'-g'+saved.invoice_group||saved.key==='p'+p.id);return current?{...saved,name:current.name,arabic:current.arabic||'',sku:current.sku||'',sku_status:current.sku_status,spice:!!current.spice,pick_category:current.pick_category||null}:saved;});$('delivery').value=state.delivery||'';$('notes').value=state.notes||'';renderStores();renderProducts();renderCart();renderAdmin();editingLabel();await loadOrders();await openRequestedOrder();$('saveStatus').textContent='Ready · '+customers.length+' stores · '+products.length+' items · '+products.filter(p=>p.arabic&&p.arabic.trim()).length+' Arabic names'+(customers.length?'':' · Store list EMPTY: add or import stores');}
async function loadProducts(){let all=[];for(let offset=0;offset<6000;offset+=750){let rows=await db('gs_sales_products?select=id,name,arabic,brand,gtin,sku,sku_status,spice,pick_category,origin&order=id.asc&limit=750&offset='+offset);all.push(...rows);if(rows.length<750)break;}return all;}
function saveLocal(){if(!sess)return;try{localStorage.setItem('gs_sales_draft_'+sess.user.id,JSON.stringify({customerId,cart,currentGroup,editingOrderId,delivery:$('delivery').value,notes:$('notes').value}));$('saveStatus').textContent='Draft saved on this device';}catch{$('saveStatus').textContent='Storage full — submit your order';}}
function currentCustomer(){return customers.find(x=>String(x.id)===customerId)||null;}
let storeActiveIndex=-1;
function chooseStore(id){
 const c=customers.find(x=>String(x.id)===String(id));if(!c)return;
 customerId=String(c.id);$('storeFind').value='';storeActiveIndex=-1;
 renderStores();renderCart();saveLocal();
}
function renderStores(){
 const input=$('storeFind'), q=norm(input.value),matches=$('storeMatches');
 const chosen=currentCustomer();
 $('storeChosen').innerHTML=chosen?`<div class="selectedStore"><div><strong>Selected: ${safe(chosen.name)}</strong><small>${safe(chosen.retailer||'')}${chosen.code?' · #'+safe(chosen.code):''}</small></div><button type="button" id="changeStore" class="secondary">Change store</button></div>`:'<div class="muted">No store selected. Start typing to find one.</div>';
 $('storeAddress').textContent=chosen?.address||'';
 const change=$('changeStore');if(change)change.onclick=()=>{input.focus();input.select();};
 if(!q){matches.hidden=true;matches.innerHTML='';input.setAttribute('aria-expanded','false');storeActiveIndex=-1;return;}
 const ranked=customers.map(c=>{const name=norm(c.name),code=norm(c.code||''),retailer=norm(c.retailer||''),addr=norm(c.address||''),all=[name,code,retailer,addr].join(' ');const words=q.split(' ').filter(Boolean);if(!words.every(w=>all.includes(w)))return null;let score=name===q?0:code===q?1:name.startsWith(q)?2:code.startsWith(q)?3:name.includes(q)?4:addr.includes(q)?5:6;return {c,score};}).filter(Boolean).sort((a,b)=>a.score-b.score||a.c.name.localeCompare(b.c.name)).slice(0,40).map(x=>x.c);
 matches.hidden=false;input.setAttribute('aria-expanded','true');storeActiveIndex=Math.min(storeActiveIndex,ranked.length-1);
 matches.innerHTML=ranked.length?ranked.map((c,i)=>`<button type="button" role="option" aria-selected="${i===storeActiveIndex}" class="storeOption${i===storeActiveIndex?' active':''}" data-store-id="${safe(c.id)}"><strong>${safe(c.name)}</strong><small>${safe(c.address||'')}${c.code?' · Store #'+safe(c.code):''}</small></button>`).join(''):`<div class="empty">No stores match “${safe(input.value)}”.${customers.length?' Try a store number, chain, or city.':' No stores loaded in the database yet.'}</div>`;
}

// Invoice classification is applied only to Meijer and Nino Salvaggio accounts.
const SALES_SPLIT_LABELS={1:'GROCERY',2:'FROZEN',3:'DUBAI + ANGEL HAIR CHOCOLATES',4:'PISTACHIO WAFERS',5:'DROPS DRINKS',6:'BAKLAVA + TURKISH DELIGHT',7:'DAIRY'};
function isPistachioWafer(x){const name=String([x?.name,x?.line,x?.source?.name,x?.description].filter(Boolean).join(' ')).toLowerCase();return /(?:wafer|wafers|ويفر)/i.test(name)&&/(?:pistachio|pistachios|فستق)/i.test(name);}
const DROPS_DRINK_SKUS=new Set(['44537','44538','44539','44540','44541']);
const KNOWN_FROZEN_SKUS=new Set(['1119','1120','1121','1122','1123','1125','1126','1127','1128','1129','1136','1137','1138','1139','1140','1142','1148','1155','1156','1158','1159','1160','1161','1164','1165','1166','1175']);
function needsSplit(c=currentCustomer()){return !!c && /\b(meijer|nino\s*salvaggio)\b/i.test([c.retailer,c.name].join(' '));}
function classifyItem(x){const name=norm(x.name),sku=String(x.sku||'').trim().toUpperCase();
 if(DROPS_DRINK_SKUS.has(sku))return 5;
 if(/(wafer|wafers|ويفر)/i.test(name)&&/(pistachio|فستق|فستق)/i.test(name))return 4;
 if(sku==='11257'||sku==='11546'||sku==='12044')return 3;
 if(/(dubai.*chocolat|chocolat.*dubai|angel\s*hair.*chocolat|chocolat.*angel\s*hair|دبي.*شوك|شوك.*دبي)/i.test(name)||(/angel hair/i.test(name)&&/^(12044|11546)$/.test(sku)))return 3;
 if(KNOWN_FROZEN_SKUS.has(sku)||/(frozen|ready meals?|kubba|kibbie|kibbeh|borek|samosa|shawarma|pizza|potato chop|lahmajeen|falafel|كبة|سمبوس|بورك)/i.test(name))return 2;
 return 1; // Ambiguous items stay grocery until a human sets their category.
}
// The admin Product & Store Manager is authoritative for picking/invoice category.
// Look up the current Supabase-loaded product, including historical saved orders whose
// invoice_category was persisted before an admin changed the product category.
function adminCategoryFor(x){
 const sku=String(x.sku||'').trim().toUpperCase();
 const key=String(x.key||'');
 const idMatch=key.match(/^p(\d+)(?:-g\d+)?$/);
 const live=idMatch?products.find(p=>String(p.id)===idMatch[1]):null;
 const skuMatches=sku?products.filter(p=>String(p.sku||'').trim().toUpperCase()===sku):[];
 const product=live||(skuMatches.length===1?skuMatches[0]:null);
 const category=String(product?.pick_category||x.pick_category||'').trim().toUpperCase();
 return {FROZEN:2,GROCERY:1,DAIRY:7,SPICES:1}[category]||null;
}
function categoryOf(x){
 // Meijer/Nino dedicated product invoice families override stale Grocery/Frozen
 // product and order categories, including already submitted/reloaded orders.
 const sku=String(x.sku||'').trim().toUpperCase();
 if(needsSplit() && /\bmeijer\b/i.test([currentCustomer()?.retailer,currentCustomer()?.name].join(' ')) && (sku==='12012'||sku==='11050'))return 6;
 if(DROPS_DRINK_SKUS.has(sku))return 5;
 if(sku==='12044'||sku==='11546'||sku==='11257')return 3;
 if(isPistachioWafer(x))return 4; // Dedicated Meijer/Nino wafer invoice overrides admin Grocery/Frozen.
 // Borek Cheese is frozen even if a stale category or the word 'cheese' suggests dairy.
 if(sku==='1160')return 2;
 const assigned=adminCategoryFor(x);
 if(assigned!==null)return assigned;
 // Unassigned dairy merchandise gets a dedicated Meijer invoice.
 if(/\b(yogurt|yoghurt|labneh|laban|ayran|cheese|milk|dairy|kashkaval|feta|butter|cream)\b/i.test(String(x.name||'')))return 7;
 return [1,2,3,4,5,6,7].includes(Number(x.invoice_category))?Number(x.invoice_category):classifyItem(x);
}
function invoiceGroupFor(x,c=currentCustomer()){return needsSplit(c)?categoryOf(x):Number(x.invoice_group)||1}
function updateSplitControls(){const split=needsSplit();if($('invoiceBreakBtn'))$('invoiceBreakBtn').hidden=split;if($('invoiceGroupStatus'))$('invoiceGroupStatus').textContent=split?'Automatic Meijer / Nino invoice categories — check each product below':'New items → Invoice '+currentGroup+(currentGroup>1?' (separate invoice)':' (main invoice)');}
function addFromCatalog(id,step){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const key='p'+p.id+'-g'+currentGroup,existing=cart.find(x=>x.key===key||(currentGroup===1&&x.key==='p'+p.id));if(existing)existing.qty=roundQty(existing.qty+step);else cart.push({key,invoice_group:currentGroup,name:p.name,arabic:p.arabic||'',sku:p.sku||'',sku_status:p.sku_status,gtin:p.gtin||'',spice:!!p.spice,pick_category:p.pick_category||null,sticker:false,qty:roundQty(step)});saveLocal();renderCart();renderProducts();}
const roundQty=x=>Math.round(Number(x)*100)/100;
function prodView(p){const sku=p.sku?`SKU ${safe(p.sku)}${p.sku_status==='barcode_candidate'?'<span class="skucheck"> (CHECK)</span>':''}`:'NO SKU';const selected=cart.find(x=>x.key==='p'+p.id+'-g'+currentGroup||(currentGroup===1&&x.key==='p'+p.id));return `<div class="resultrow" data-product="${p.id}"><div class="productInfo"><strong>${safe(p.name)}</strong><small>${safe(p.brand||'')} · ${sku}${p.gtin?' · '+safe(p.gtin):''}</small><small class="ar" lang="ar" dir="rtl">${safe(p.arabic||'العربية غير مضافة — Arabic not entered')}</small></div><label class="stickerChoice" title="Add a quantity, then check if warehouse must sticker this item"><input type="checkbox" data-search-sticker="${p.id}" ${selected&&selected.sticker?'checked':''}> Sticker</label><div class="quickqty"><label class="visually-hidden" for="directQty_${p.id}">Case quantity for ${safe(p.name)}</label><input id="directQty_${p.id}" class="quickqtyinput" type="number" inputmode="decimal" min="0.01" max="10000" step="any" placeholder="Cases" data-setqty="${p.id}" value="${selected?selected.qty:''}" aria-label="Type total cases for ${safe(p.name)}"></div><button class="smallbutton" data-step="0.25" title="Add quarter case">+¼</button><button class="smallbutton" data-step="0.5" title="Add half case">+½</button><button class="smallbutton" data-step="1" title="Add one case">+1</button></div>`;}
function renderProducts(){const query=norm($('productFind').value);let found;if(query){const words=query.split(' ').filter(Boolean);found=products.filter(p=>words.every(w=>norm([p.name,p.arabic,p.sku,p.gtin,p.brand].join(' ')).includes(w))).sort((a,b)=>{const score=p=>p.sku&&norm(p.sku)===query?0:norm(p.name)===query?1:norm(p.name).startsWith(query)?2:norm(p.sku).startsWith(query)?3:4;return score(a)-score(b)}).slice(0,45);}else{const priority=['1137','1142','1119','1120','1121','1122','1129','1136','1138','1139','1140','1155','1158','1165','12044','11546','44267'];found=priority.map(s=>products.find(p=>p.sku===s)).filter(Boolean).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,18);} $('searchResults').innerHTML=found.length?found.map(prodView).join(''):'<div class="empty">No match. Use + Item not listed.</div>';}
function addInvoiceBreak(){
 const groups=cart.map(x=>Number(x.invoice_group)||1);
 if(!cart.length){alert('Add an item before creating an invoice break.');return;}
 if(!cart.some(x=>(Number(x.invoice_group)||1)===currentGroup)){alert('Add an item to the current invoice before making another break.');return;}
 currentGroup=Math.max(...groups,currentGroup)+1;
 $('invoiceGroupStatus').textContent='New items → Invoice '+currentGroup+' (separate invoice)';
 saveLocal();renderProducts();renderCart();
 $('productFind').focus();
}
function renderCart(){
 updateSplitControls();const count=cart.length,sum=cart.reduce((a,b)=>a+Number(b.qty||0),0),split=needsSplit();
 $('basketCount').textContent=count+' item'+(count!==1?'s':'');$('caseTotal').textContent=Number(sum.toFixed(2))+' cases';
 const ordered=split?[...cart].sort((a,b)=>invoiceGroupFor(a)-invoiceGroupFor(b)):(isKrogerOrder({customer_name:currentCustomer()?.name})?[...cart].sort((a,b)=>KROGER_PICK_ORDER.indexOf(krogerPickCategory(a))-KROGER_PICK_ORDER.indexOf(krogerPickCategory(b))):cart);
 $('basket').innerHTML=count?ordered.map((x,i)=>`${(i===0||(split?invoiceGroupFor(ordered[i-1])!==invoiceGroupFor(x):isKrogerOrder({customer_name:currentCustomer()?.name})?krogerPickCategory(ordered[i-1])!==krogerPickCategory(x):invoiceGroupFor(ordered[i-1])!==invoiceGroupFor(x)))?'<div class="invoiceGroupHeader">'+(split?'INVOICE — '+SALES_SPLIT_LABELS[invoiceGroupFor(x)]:isKrogerOrder({customer_name:currentCustomer()?.name})?'PICKING — '+krogerPickCategory(x)+' (one QuickBooks invoice)':'INVOICE '+invoiceGroupFor(x)+(invoiceGroupFor(x)>1?' — SEPARATE INVOICE':' — MAIN INVOICE'))+'</div>':''}<div class="basketrow" data-line="${safe(x.key)}"><div class="productInfo"><strong>${safe(x.name)}</strong><small>${x.sku?'SKU '+safe(x.sku):'NO SKU'}${x.sku_status==='barcode_candidate'?' · CHECK SKU':''}${x.spice?' · SPICE PICK':''}</small><small class="ar" lang="ar" dir="rtl">${safe(x.arabic||'العربية غير مضافة — Arabic not entered')}</small>${split?`<label class="categoryLabel">Invoice category <select class="categorySelect" data-category="${safe(x.key)}" ${(adminCategoryFor(x)!==null || (needsSplit() && /\bmeijer\b/i.test([currentCustomer()?.retailer,currentCustomer()?.name].join(' ')) && ['12012','11050'].includes(String(x.sku||'').trim())))?'disabled title="Managed by product or Meijer invoice rule"':''} aria-label="Invoice category for ${safe(x.name)}">${Object.entries(SALES_SPLIT_LABELS).map(([g,label])=>`<option value="${g}" ${invoiceGroupFor(x)===Number(g)?'selected':''}>${label}</option>`).join('')}</select></label>`:''}</div><label class="stickerChoice"><input type="checkbox" data-sticker="${safe(x.key)}" ${x.sticker?'checked':''}> Sticker</label><button class="smallbutton" data-delta="-0.25">−¼</button><input class="qty" type="number" inputmode="decimal" min="0.01" max="10000" step="any" aria-label="Cases of ${safe(x.name)}" data-quantity="${safe(x.key)}" value="${x.qty}"><button class="smallbutton" data-delta="1">+1</button><button class="remove" data-delete="1" aria-label="Remove ${safe(x.name)}">Remove</button></div>`).join(''):'<div class="empty">Items you add appear here.</div>';
}

async function createStore(){const name=$('newStoreName').value.trim(),address=$('newStoreAddress').value.trim(),retailer=$('newStoreChain').value;if(!name||!address){alert('Enter the store name and delivery address.');return;}try{const rows=await db('gs_sales_customers?select=id,name,retailer,code,address',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({name,retailer,address,code:'',created_by:sess.user.id,origin:'manual'})});customers.push(rows[0]);customerId=String(rows[0].id);$('storeFind').value='';$('newStoreBox').hidden=true;renderStores();saveLocal();}catch(e){alert('Could not save store: '+e.message);}}
async function addCustom(){const name=$('customName').value.trim(),sku=$('customSku').value.trim(),qty=Number($('customQty').value);if(!name||!Number.isFinite(qty)||qty<=0||qty>10000){alert('Enter a product name and a valid case quantity.');return;}const spice=$('customSpice').checked;let item={invoice_group:currentGroup,key:'m'+Date.now()+'-'+Math.random().toString(36).slice(2,5),name,arabic:$('customArabic').value.trim(),sku,sku_status:'manual_unverified',gtin:'',spice,sticker:false,qty:roundQty(qty)};if($('customSave').checked){try{const rows=await db('gs_sales_products?select=id,name,arabic,brand,gtin,sku,sku_status,spice,pick_category,origin',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({name,arabic:item.arabic,brand:'',gtin:'',sku,sku_status:'manual_unverified',spice,origin:'Manual addition',created_by:sess.user.id})});products.push(rows[0]);item.key='p'+rows[0].id+'-g'+currentGroup;}catch(e){alert('Could not save to catalog, but the item will be added to this order: '+e.message);}}
cart.push(item);$('newItemBox').hidden=true;$('customName').value='';$('customArabic').value='';$('customSku').value='';$('customSave').checked=false;$('customSpice').checked=false;saveLocal();renderCart();renderProducts();}
function validated(){if(!currentCustomer())throw Error('Choose a store first');if(!cart.length)throw Error('Add at least one product');for(const x of cart){if(!Number.isFinite(Number(x.qty))||Number(x.qty)<=0||Number(x.qty)>10000)throw Error('Invalid case quantity for '+x.name);}return true;}
function payload(){for(const x of cart){const p=products.find(p=>x.key==='p'+p.id+'-g'+(Number(x.invoice_group)||1)||x.key==='p'+p.id);if(p){x.name=p.name;x.arabic=p.arabic||'';x.sku=p.sku||'';x.spice=!!p.spice;x.pick_category=p.pick_category||null;}}const c=currentCustomer();return {created_by:sess.user.id,customer_id:c.id,customer_name:c.name,customer_address:c.address,delivery_note:$('delivery').value.trim(),notes:$('notes').value.trim(),status:'submitted',items:cart.map(x=>({name:x.name,arabic:x.arabic,sku:x.sku,sku_status:x.sku_status,spice:x.spice,pick_category:x.pick_category||null,sticker:!!x.sticker,gtin:x.gtin,qty:x.qty,invoice_group:invoiceGroupFor(x,c),invoice_category:needsSplit(c)?categoryOf(x):null}))};}
function editingLabel(){
 const btn=$('submitOrder');if(btn)btn.textContent=editingOrderId?'Save Updated Order':'Submit order';
 const label=$('loadedOrderNotice');if(label){label.hidden=!editingOrderId;label.textContent=editingOrderId?'Editing saved order '+editingOrderId.slice(0,8)+' · Saving replaces this order, not a new one.':'';}
}
function loadExistingOrder(o){
 if(loading)return;
 // Look up the ID first, then fall back to an unambiguous exact store name.
 const idMatch=customers.find(x=>String(x.id)===String(o.customer_id));
 const byName=customers.filter(x=>x.name===o.customer_name);
 const selected=idMatch||(byName.length===1?byName[0]:null);
 if(!selected){alert('Cannot load: this saved order’s customer is not in the current customer list. Ask an admin to fix the customer before editing.');return;}
 if(!Array.isArray(o.items)||!o.items.length){alert('This saved order has no item lines.');return;}
 const warning='Load order for '+o.customer_name+'?\n\nThis will DISCARD the entire current working order on this device and REPLACE it with the saved order. Items will NOT be combined.\n\nThe saved order in Supabase will not change until you press Save Updated Order.';
 if(!confirm(warning))return;
 // Atomic replacement after confirmation. Do not merge any draft lines or customer details.
 clearTimeout(directQtyTimer);
 const counts=new Map();
 const rebuilt=o.items.map((x,i)=>{
   const group=Math.max(1,Number(x.invoice_group)||1);
   const matches=products.filter(p=>x.sku&&String(p.sku)===String(x.sku));
   const p=matches.length===1?matches[0]:products.find(p=>p.name===x.name&&(!x.sku||String(p.sku)===String(x.sku)));
   const base=p?'p'+p.id:'loaded'+i;
   const rawKey=base+'-g'+group;
   const seq=counts.get(rawKey)||0;counts.set(rawKey,seq+1);
   return {key:seq?rawKey+'-copy'+seq:rawKey,invoice_group:group,invoice_category:x.invoice_category??null,
     name:String(x.name||''),arabic:String(x.arabic||''),sku:String(x.sku||''),sku_status:x.sku_status||'manual_unverified',
     gtin:x.gtin||'',spice:!!x.spice,pick_category:x.pick_category||null,sticker:!!x.sticker,qty:Number(x.qty)};
 });
 if(rebuilt.some(x=>!x.name||!Number.isFinite(x.qty)||x.qty<=0)){alert('This order contains invalid product lines; it was not loaded.');return;}
 cart=rebuilt;customerId=String(selected.id);currentGroup=Math.max(1,...cart.map(x=>Number(x.invoice_group)||1));
 editingOrderId=o.id;lastSaved=o;lastSubmittedSignature=null;
 $('delivery').value=o.delivery_note||'';$('notes').value=o.notes||'';
 $('storeFind').value='';$('productFind').value='';storeActiveIndex=-1;$('newItemBox').hidden=true;
 saveLocal();renderStores();renderProducts();renderCart();editingLabel();
 $('orderMessage').classList.remove('success');err('orderMessage','Loaded '+o.customer_name+' — '+cart.length+' lines. Your previous draft has been replaced. Make changes, then Save Updated Order or Print List.');
 $('orderStore').scrollIntoView({behavior:'smooth',block:'start'});
}
async function submit(){try{validated();if(loading)return;const order=payload(),signature=JSON.stringify(order);
 if(lastSubmittedSignature===signature){err('orderMessage','This version is already saved. Print it or change the order before saving again.');return;}
 loading=true;$('submitOrder').disabled=true;err('orderMessage',editingOrderId?'Updating original order…':'Saving new order…');
 let rows;
 if(editingOrderId){
   // Backend checks that the caller owns the order or is an authorized admin.
   const saved=await db('rpc/gs_sales_update_order',{method:'POST',body:JSON.stringify({p_order_id:editingOrderId,p_items:order.items,p_delivery_note:order.delivery_note,p_notes:order.notes})});
   if(!saved||saved.id!==editingOrderId)throw Error('Order update not confirmed. Original order was not overwritten.');
   rows=[saved];
 }else{
   rows=await db('gs_sales_orders?select=id,created_at,customer_name,status',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(order)});
 }
 lastSaved=rows[0];lastSubmittedSignature=signature;
 err('orderMessage','✓ '+(editingOrderId?'Original order updated':'New order saved')+'! '+lastSaved.id.slice(0,8)+' · Print List again and share the UPDATED PDF with the warehouse.');
 $('orderMessage').classList.add('success');await loadOrders();
 }catch(e){$('orderMessage').classList.remove('success');err('orderMessage',e.message);}finally{loading=false;$('submitOrder').disabled=false;editingLabel();}}
async function openRequestedOrder(){
 const id=new URLSearchParams(location.search).get('loadOrder');
 if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
 try{const rows=await db('gs_sales_orders?select=id,customer_id,customer_name,customer_address,delivery_note,notes,status,items,created_at&id=eq.'+encodeURIComponent(id)+'&limit=1');if(rows.length)loadExistingOrder(rows[0]);else alert('Order not found or not accessible.');}
 catch(e){alert('Could not load requested order: '+e.message)}
 window.history.replaceState(null,'',location.pathname);
}
async function loadOrders(){try{history=await db('gs_sales_orders?select=id,customer_id,customer_name,customer_address,delivery_note,notes,status,items,created_at&order=created_at.desc&limit=30');
 $('orderHistory').innerHTML=history.length?history.map(o=>`<div class="historyrow"><div><strong>${safe(o.customer_name)}</strong><div class="muted">${new Date(o.created_at).toLocaleString()} · ${(o.items||[]).length} lines</div></div><button class="secondary" data-history="${o.id}">Load Order</button></div>`).join(''):'No saved orders yet.';
 }catch(e){$('orderHistory').textContent='Cannot load orders: '+e.message;}}
// Warehouse spice picks: confirmed SKU assignments, plus conservative dry-goods defaults.
// Admin saved categories override these defaults; server migration corrects known records.
const SPICE_CONFIRMED_SKUS=new Set(['11214','11269','11191','11663','11660']);
const GROCERY_CONFIRMED_SKUS=new Set(['11456','11276','11272','11273']); // Saffron and known 10 LB bags are Grocery.
function isTenPoundBag(x){return /(?:^|[^\w])10\s*(?:lb|lbs|pounds?)(?=$|[^\w])/i.test(String(x?.name||''));}
function dryGoodsSpiceDefault(item){
 if(isTenPoundBag(item))return false;
 const n=norm(item.name||'');
 if(/\b(canned|tin|ready to eat|cooked|frozen|soup|drink|juice|sauce|paste|instant|rice|flour)\b/.test(n))return false;
 const dry=/\b(lentils?|bulgur|burghul|cracked wheat|gerish|jareesh|dry (?:broad |fava |white |red |black |kidney |pinto )?beans?|fava beans?|broad beans?|slivered almond|almonds? (?:sliced|slivered)|prunes? (?:pitted|dried))\b/.test(n);
 return dry && /\b(?:\d+(?:\.\d+)?\s*(?:oz|g|gr|gram|grams|kg|lb|lbs)|bag|packed)\b/.test(n);
}
// Kroger picking category: admin-assigned categories override all legacy heuristics.
// The immutable invoice category rules for Meijer/Nino are separate.
const KROGER_PICK_ORDER=['FROZEN','DAIRY','GROCERY','SPICES'];
function isKrogerOrder(obj){return /\bkroger\b/i.test(String(obj.customer_name||''));}
function krogerPickCategory(item){
 const sku=String(item.sku||'').trim(), live=sku?products.find(p=>String(p.sku||'').trim()===sku):null;
 // Drops are beverages. Never classify Cheese Cake flavor as dairy; override stale category values.
 if(DROPS_DRINK_SKUS.has(sku))return 'GROCERY';
 // Ten-pound prepackaged products stay Grocery even if old records say SPICES.
 if(isTenPoundBag(live||item)||GROCERY_CONFIRMED_SKUS.has(sku))return 'GROCERY';
 const assigned=live?.pick_category||item.pick_category;
 if(KROGER_PICK_ORDER.includes(assigned))return assigned;
 // Existing spice flag remains the legacy fallback until its category is explicitly set.
 if(GROCERY_CONFIRMED_SKUS.has(sku))return 'GROCERY';
 if(SPICE_CONFIRMED_SKUS.has(sku))return 'SPICES';
 if(item.spice===true||item.spice===1||live?.spice===true)return 'SPICES';
 if(dryGoodsSpiceDefault(live||item))return 'SPICES';
 const brand=norm(live?.brand||item.brand||''),name=norm(item.name||'');
 if(/mosul kubba|gourme|gourmet/.test(brand)||/^(mosul kubba|gourme)\b/.test(name))return 'FROZEN';
 if(KNOWN_FROZEN_SKUS.has(sku)||/(frozen|ready meals?|kubba|kibbie|kibbeh|borek|samosa|shawarma|pizza|potato chop|lahmajeen|falafel|كبة|سمبوس|بورك)/i.test(name))return 'FROZEN';
 if(/\b(milk|yogurt|yoghurt|labneh|laban|ayran|cheese|cream cheese|heavy cream|whipping cream|sour cream|butter|kashkaval|halloumi|feta)\b/i.test(name))return 'DAIRY';
 return 'GROCERY';
}
function makePrintMarkup(obj,mode='full'){
 const split=/\b(meijer|nino\s*salvaggio)\b/i.test(obj.customer_name||'');
 const items=(obj.items||[]).map(x=>split?{...x,invoice_group:categoryOf(x),invoice_category:categoryOf(x)}:x);
 const groups=[...new Set(items.map(x=>Number(x.invoice_group)||1))].sort((a,b)=>a-b);
 const groupTitle=g=>split?SALES_SPLIT_LABELS[g]||'GROCERY':'INVOICE '+g+(g>1?' — SEPARATE INVOICE':' — MAIN INVOICE');
 const fmt=x=>String(Number(x.qty));
 const row=x=>`<tr><td class="pickCheck"><span class="emptyCheck"></span></td><td>${safe(x.sku||'NO SKU')}${x.sku_status==='barcode_candidate'?' <span class="warnprint">(CHECK)</span>':''}</td><td><span class="printEnglishName">${safe(x.name)}</span>${x.sticker?'<div class="stickerPrint"><b>● APPLY STICKER</b> — sticker required before packing</div>':''}<div class="arcell" lang="ar" dir="rtl">${safe(x.arabic||'الاسم العربي غير متوفر')}</div></td><td>${fmt(x)} case${Number(x.qty)===1?'':'s'}</td></tr>`;
 const meta=()=>`<p class="printMeta"><b>Store:</b> ${safe(obj.customer_name)}</p><p class="printMeta"><b>Address:</b> ${safe(obj.customer_address)}</p><p class="printMeta"><b>Delivery:</b> ${safe(obj.delivery_note||'Not specified')}</p>${obj.notes?`<p class="printMeta"><b>Notes:</b> ${safe(obj.notes)}</p>`:''}`;
 const table=arr=>`<table><thead><tr><th class="pickCheck">Packed</th><th>SKU</th><th>Product</th><th>Cases</th></tr></thead><tbody>${arr.map(row).join('')}</tbody></table>`;
 const header=subtitle=>`<header class="printTitle"><div><h1>${safe(obj.customer_name||"STORE NOT SELECTED")}</h1><small>${subtitle}</small></div><div>${new Date().toLocaleDateString()}</div></header>`;
 const kroger=isKrogerOrder(obj)&&!split;
 const krogerSections=KROGER_PICK_ORDER.map(category=>({category,rows:items.filter(x=>krogerPickCategory(x)===category)})).filter(section=>section.rows.length);
 const krogerFull=`<section class="printPage">${header('FULL ORDER / PACKING LIST')}${meta()}<p class="printMeta"><b>Billing instructions:</b> Single invoice. Products organized for warehouse picking.</p>${krogerSections.map(section=>`<div class="invoicePrintGroup"><h2 class="invoicePrintTitle">${section.category}</h2>${table(section.rows)}</div>`).join('')}</section>`;
 const full=split?`<section class="printPage">${header('FULL ORDER / PACKING LIST · '+groups.length+' INVOICE GROUP(S)')}${meta()}${groups.map((g,i)=>`${i?'<div class="invoiceBreakDivider"><span>INVOICE BREAK</span></div>':''}<div class="invoicePrintGroup"><h2 class="invoicePrintTitle">${groupTitle(g)}</h2>${table(items.filter(x=>(Number(x.invoice_group)||1)===g))}</div>`).join('')}</section>`:`<section class="printPage">${header('FULL ORDER / PACKING LIST · '+groups.length+' INVOICE GROUP(S)')}${meta()}<p class="printMeta"><b>Billing instructions:</b> ${groups.length>1?'Create a separate invoice for each numbered group below.':'Single invoice.'}</p>${groups.map(g=>`<h2 class="invoicePrintTitle">${groupTitle(g)}</h2>${table(items.filter(x=>(Number(x.invoice_group)||1)===g))}`).join('')}</section>`;
 const spices=items.filter(x=>krogerPickCategory(x)==='SPICES');
 const spicePage=`<section class="printPage">${header('SPICE PICKING SHEET')}${meta()}${groups.filter(g=>spices.some(x=>(Number(x.invoice_group)||1)===g)).map(g=>`<h2 class="invoicePrintTitle">${groupTitle(g)}</h2>${table(spices.filter(x=>(Number(x.invoice_group)||1)===g))}`).join('')||'<p>No items marked as spices in this order.</p>'}</section>`;
 return mode==='spices'?spicePage:(kroger?krogerFull:full);
}
// Print/PDF filenames use the actual customer name and delivery field, never the order date.
function packingFileName(obj,mode='full'){
 const clean=v=>String(v||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,85);
 const store=clean(obj.customer_name)||'Unnamed Store';
 const raw=String(obj.delivery_note||'').trim();
 let delivery=raw;
 // Standardize explicitly dated deliveries. Do not manufacture a date if the field
 // contains relative or ambiguous text (e.g. 'Tomorrow or Wednesday').
 const iso=raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
 const us=raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
 if(iso){const d=new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]));if(d.getFullYear()===+iso[1]&&d.getMonth()===+iso[2]-1&&d.getDate()===+iso[3])delivery=`${iso[1]}-${iso[2]}-${iso[3]}`;}
 else if(us){const d=new Date(+us[3],+us[1]-1,+us[2]);if(d.getFullYear()===+us[3]&&d.getMonth()===+us[1]-1&&d.getDate()===+us[2])delivery=`${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;}
 const datePart=clean(delivery)||'Date Not Specified';
 return `${store} - Delivery ${datePart}${mode==='spices'?' - Spices':''}.pdf`;
}
function printData(obj,mode='full'){
 // Always use the native browser print dialog for Print List on every device.
 // The former iOS-only PDF-share redirect prevented salesmen from printing.
 // Keep the PDF-generation helper separate; never block native printing on it.
 $('printCanvas').innerHTML=makePrintMarkup(obj,mode);
 // Browsers commonly use document.title as the suggested 'Save as PDF' name.
 // The print dialog's final filename remains controlled by the browser/user.
 const oldTitle=document.title;
 document.title=packingFileName(obj,mode).replace(/\.pdf$/i,'');
 let restored=false;
 const restore=()=>{if(restored)return;restored=true;document.title=oldTitle;window.removeEventListener('afterprint',restore);};
 window.addEventListener('afterprint',restore);
 try{window.print();}catch(e){restore();throw e;}
 // Fallback for browsers that don't send afterprint.
 setTimeout(restore,120000);
}
// V80: offline PDF renderer, built from browser Canvas and a small JPEG-to-PDF writer.
// No CDN dependencies. The native Print List path above remains unchanged.
// V88: direct-share PDF layout follows the original compact warehouse print slip.
// Uses the same data/grouping as makePrintMarkup; share filename stays unchanged.
function packingPDFPages(obj){
 const scale=2,W=612,H=792,pages=[];let canvas,ctx,y;
 const L=29,R=584,WIDTH=R-L, BOTTOM=763;
 function font(size=10,bold=false,arabic=false){return `${bold?'700':'400'} ${size}px ${arabic?'Tahoma, ':''}Arial, sans-serif`;}
 function page(){canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);y=30;pages.push(canvas);}
 function txt(value,x,at,size=10,bold=false,align='left',arabic=false){ctx.save();ctx.font=font(size,bold,arabic);ctx.fillStyle='#111';ctx.textAlign=align;ctx.direction=arabic?'rtl':'ltr';ctx.fillText(String(value||''),x,at);ctx.restore();}
 function line(x1,y1,x2,y2,color='#b8b8b8',width=.65){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
 function wrapped(value,width,size=10,bold=false,arabic=false){ctx.font=font(size,bold,arabic);const words=String(value||'').split(/\s+/).filter(Boolean),out=[];let current='';for(const word of words){const next=current?current+' '+word:word;if(ctx.measureText(next).width>width&&current){out.push(current);current=word;}else current=next;}if(current)out.push(current);return out.length?out:[''];}
 function space(h){if(y+h>BOTTOM){page();tinyHeader();}}
 function tinyHeader(){txt(obj.customer_name||'Store',L,y+3,15,true);txt(new Date().toLocaleDateString(),R,y+2,9,false,'right');y+=10;line(L,y,R,y,'#174e33',1.4);y+=12;}
 function start(){tinyHeader();txt('FULL ORDER / PACKING LIST',L,y,9);y+=15;for(const [k,v] of [['Store',obj.customer_name],['Address',obj.customer_address],['Delivery',obj.delivery_note],['Notes',obj.notes]]){if(!v)continue;for(const segment of wrapped(`${k}: ${v}`,WIDTH,10)){txt(segment,L,y,10);y+=12;}}y+=7;}
 function section(title){space(40);ctx.fillStyle='#ececec';ctx.fillRect(L,y,WIDTH,22);txt(title,L+7,y+15,14,true);y+=27;txt('Packed',L+3,y+9,10,true);txt('SKU',L+44,y+9,10,true);txt('Product',L+118,y+9,10,true);txt('Cases',R-3,y+9,10,true,'right');y+=16;line(L,y,R,y);y+=3;}
 function itemRow(item){const names=wrapped(item.name||'Unnamed product',335,10),ar=wrapped(item.arabic||'الاسم العربي غير متوفر',335,12,false,true);const height=Math.max(35,8+names.length*12+ar.length*14+(item.sticker?25:0));space(height+3);const top=y;ctx.strokeStyle='#303030';ctx.lineWidth=1.2;ctx.strokeRect(L+15,top+7,13,13);txt(item.sku||'NO SKU',L+44,top+15,10);let yy=top+13;for(const t of names){txt(t,L+118,yy,10);yy+=12;}for(const t of ar){txt(t,R-77,yy+1,12,false,'right',true);yy+=14;}if(item.sticker){ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.strokeRect(L+118,yy-6,244,18);txt('● APPLY STICKER — sticker required',L+123,yy+6,9,true);yy+=22;}const q=Number(item.qty)||0;txt(`${q} case${q===1?'':'s'}`,R-3,top+15,10,false,'right');y=top+height;line(L,y,R,y);y+=3;}
 function breakMark(){space(27);y+=8;line(L,y+4,L+185,y+4,'#777',1);line(R-185,y+4,R,y+4,'#777',1);txt('INVOICE BREAK',(L+R)/2,y+7,10,true,'center');y+=22;}
 page();start();const split=/\b(meijer|nino\s*salvaggio)\b/i.test(obj.customer_name||'');
 const items=(obj.items||[]).map(x=>split?{...x,invoice_group:categoryOf(x),invoice_category:categoryOf(x)}:x);
 if(isKrogerOrder(obj)&&!split){txt('Billing instructions: Single invoice. Products organized for warehouse picking.',L,y,9);y+=14;for(const category of KROGER_PICK_ORDER){const arr=items.filter(x=>krogerPickCategory(x)===category);if(!arr.length)continue;section(category);arr.forEach(itemRow);}}
 else{const groups=[...new Set(items.map(x=>Number(x.invoice_group)||1))].sort((a,b)=>a-b);groups.forEach((g,i)=>{if(i)breakMark();section(split?(SALES_SPLIT_LABELS[g]||'GROCERY'):`INVOICE ${g}`);items.filter(x=>(Number(x.invoice_group)||1)===g).forEach(itemRow);});}
 return pages;
}
function imagePagesToPDF(canvases){
 const enc=new TextEncoder(),parts=[],offs=[0];let byteLength=0;
 function append(data){const v=typeof data==='string'?enc.encode(data):data;parts.push(v);byteLength+=v.length;}
 function obj(id,content){offs[id]=byteLength;append(`${id} 0 obj\n`);append(content);append('\nendobj\n');}
 const n=canvases.length,ids=canvases.map((_,i)=>({page:3+i*3,img:4+i*3,content:5+i*3}));
 append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,`<< /Type /Pages /Kids [${ids.map(x=>x.page+' 0 R').join(' ')}] /Count ${n} >>`);
 canvases.forEach((c,i)=>{const {page,img,content}=ids[i];const data=atob(c.toDataURL('image/jpeg',.90).split(',')[1]);const binary=Uint8Array.from(data,ch=>ch.charCodeAt(0));const stream=`q 612 0 0 792 0 0 cm /Im${i} Do Q\n`;obj(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${content} 0 R >>`);offs[img]=byteLength;append(`${img} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n`);append(binary);append('\nendstream\nendobj\n');obj(content,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);});
 const start=byteLength;append(`xref\n0 ${3+n*3}\n0000000000 65535 f \n`);for(let i=1;i<3+n*3;i++)append(`${String(offs[i]).padStart(10,'0')} 00000 n \n`);append(`trailer\n<< /Size ${3+n*3} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
 return new Blob(parts,{type:'application/pdf'});
}
// V89: Share the *same HTML markup* as Print List, rather than drawing new rows.
// Rasterize the original print DOM with its print CSS to preserve typography and layout.
// Some versions of iOS Safari disallow SVG foreignObject capture; in that case we
// use the previous working named-PDF renderer and explain the fallback plainly.
function printStylesForCapture(css){
  // Keep the existing print rules in their original cascade order. The SVG document
  // is screen media, so convert print media blocks to normal rules.
  let out='', pos=0;
  const re=/@media\s+print\s*\{/g;let m;
  while((m=re.exec(css))){
    let start=re.lastIndex,depth=1,i=start;
    for(;i<css.length&&depth;i++){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;}
    if(!depth)out+='\n'+css.slice(start,i-1);
    re.lastIndex=i;
  }
  return out.replace(/@page\s*\{[^}]*\}/g,'')+`\n
    #printCanvas{display:block!important;width:720px!important;font-family:Arial,sans-serif!important;color:#000!important;background:#fff!important}
    #printCanvas .printPage{display:block!important;width:720px!important;height:auto!important;break-after:auto!important;page-break-after:auto!important}
    #printCanvas .printPage table{border-collapse:collapse;width:100%}
    #printCanvas .printPage th,#printCanvas .printPage td{border-bottom:1px solid #bbb;vertical-align:top;text-align:left}
    #printCanvas .printPage th:last-child,#printCanvas .printPage td:last-child{text-align:right}
    #printCanvas .arcell{direction:rtl;unicode-bidi:isolate;text-align:right;font-family:Tahoma,Arial,sans-serif}
    #printCanvas .emptyCheck{display:inline-block;border:1.5px solid #333;width:14px;height:14px}
    #printCanvas .invoiceBreakDivider{display:flex;align-items:center;justify-content:center}
    #printCanvas .printTitle{display:flex;justify-content:space-between;border-bottom:2px solid #174e33}
    #printCanvas .invoicePrintTitle{background:#eaeaea}
    #printCanvas .stickerPrint{display:block;border:1px solid #000;background:#fff;color:#000}
  `;
}
async function originalTemplatePDFPages(obj){
  const markup=makePrintMarkup(obj,'full');
  // Use same-origin CSS; no external CDN or library is involved.
  const response=await fetch('salesman.css',{cache:'force-cache'});
  if(!response.ok)throw Error('Print styles unavailable');
  const css=printStylesForCapture(await response.text());
  const width=720, pageHeight=928, scale=1.6;
  const escaped=markup.replace(/&nbsp;/g,'&#160;');
  const stage=document.createElement('div');
  stage.id='gsPrintCaptureStage';
  stage.style.cssText='position:fixed;left:-10000px;top:0;width:720px;pointer-events:none;background:#fff;color:#000;z-index:-1';
  const style=document.createElement('style');style.textContent=css;
  stage.appendChild(style);
  const container=document.createElement('div');container.id='printCanvas';container.innerHTML=escaped;
  stage.appendChild(container);document.body.appendChild(stage);
  try{
    await document.fonts?.ready;
    const h=Math.ceil(container.scrollHeight);
    if(!h||h>22000)throw Error('Unexpected print document height');
    const pages=[];
    // An SVG foreignObject captures the browser-laid-out table, RTL Arabic,
    // checkboxes, borders and text rather than reconstructing them on Canvas.
    for(let offset=0;offset<h;offset+=pageHeight){
      const current=Math.min(pageHeight,h-offset);
      const serialized=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${current}" viewBox="0 0 ${width} ${current}"><foreignObject x="0" y="-${offset}" width="${width}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;background:white;color:black"><style>${css.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</style><div id="printCanvas">${escaped}</div></div></foreignObject></svg>`;
      const blob=new Blob([serialized],{type:'image/svg+xml;charset=utf-8'});
      const uri=URL.createObjectURL(blob);
      try{
        const img=new Image();
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('iPhone cannot capture print layout'));img.src=uri;});
        const c=document.createElement('canvas');c.width=Math.round(612*scale);c.height=Math.round(792*scale);
        const ctx=c.getContext('2d');if(!ctx)throw Error('PDF canvas unavailable');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
        ctx.drawImage(img,0,0,c.width,Math.round(current/pageHeight*c.height));
        // Safari may reject tainted SVG foreignObject at JPEG encoding stage.
        c.toDataURL('image/jpeg',.7);
        pages.push(c);
      }finally{URL.revokeObjectURL(uri);}
    }
    return pages;
  }finally{stage.remove();}
}
// V90: The named shared file comes from real Chromium print-to-PDF, using the
// EXACT markup and print stylesheet of the existing Print List. No canvas
// re-rendering or silent fallback to a different packing list design.
async function sharePDFWhatsApp(obj,downloadOnly=false){
 const button=downloadOnly?$('downloadPackingPDF'):$('shareWhatsApp');
 if(button)button.disabled=true;
 try{
  const markup=makePrintMarkup(obj,'full');
  const response=await fetch('/.netlify/functions/warehouse-pdf',{
   method:'POST',
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+(sess?.access_token||'')},
   body:JSON.stringify({html:markup})
  });
  if(!response.ok){
   let problem='PDF server returned '+response.status;
   try{const data=await response.json();problem=data.error||problem;}catch{}
   throw Error(problem);
  }
  const pdf=await response.blob();
  if(pdf.type!=='application/pdf'||pdf.size<1000)throw Error('PDF server returned an invalid file');
  const name=packingFileName(obj,'full');
  const file=new File([pdf],name,{type:'application/pdf'});
  if(!downloadOnly&&navigator.canShare?.({files:[file]})&&navigator.share){
   try{await navigator.share({files:[file],title:name});err('orderMessage','');return;}
   catch(e){if(e.name==='AbortError')return;throw e;}
  }
  const blobUrl=URL.createObjectURL(pdf),a=document.createElement('a');
  a.href=blobUrl;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
  err('orderMessage','Named PDF downloaded. Share it to the warehouse WhatsApp group.');
 }catch(e){
  err('orderMessage','Named PDF was not shared: '+(e instanceof Error?e.message:String(e))+'. The original Print List remains available.');
 }finally{if(button)button.disabled=false;}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const btn=$('loginBtn');btn.disabled=true;err('loginError','Signing in…');try{await auth($('email').value.trim(),$('password').value);err('loginError','');}catch(e){err('loginError',e.message);}finally{btn.disabled=false;}};
function isGSAdmin(){return !!staff?.enabled && staff.role==='admin' && String(sess?.user?.email||'').toLowerCase()==='simon@goldenstarwholesale.net';}
function renderAdmin(){const panel=$('adminPanel');if(!panel)return;const shortcut=$('adminShortcut');if(shortcut)shortcut.hidden=!isGSAdmin();panel.hidden=true;if(panel.hidden)return;renderAdminResults();}
function renderAdminResults(){if(!isGSAdmin())return;const q=norm($('adminFind').value);const matching=products.filter(p=>!q||norm([p.name,p.arabic,p.sku,p.gtin,p.brand].join(' ')).includes(q)).slice(0,80);$('adminResults').innerHTML=matching.map(p=>`<button class="adminresult" data-edit-id="${p.id}">${safe(p.name)} · SKU ${safe(p.sku||'—')} · ${safe(p.arabic||'No Arabic')}</button>`).join('')||'No products matched';}
function startEdit(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;$('editId').value=p.id;for(const k of ['name','arabic','sku','gtin','brand'])$('edit_'+k).value=p[k]||'';$('edit_spice').checked=!!p.spice;$('edit_status').value=p.sku_status||'manual_unverified';$('adminEditor').hidden=false;$('adminMsg').textContent='Editing '+p.name;}
async function saveEdit(){if(!isGSAdmin())return;const id=$('editId').value,body={};for(const k of ['name','arabic','sku','gtin','brand'])body[k]=$('edit_'+k).value.trim();body.spice=$('edit_spice').checked;body.sku_status=$('edit_status').value;if(!body.name){$('adminMsg').textContent='Product name is required';return;}try{let rows;if(id){rows=await db('gs_sales_products?id=eq.'+encodeURIComponent(id)+'&select=id,name,arabic,brand,gtin,sku,sku_status,spice,pick_category,origin',{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(body)});if(!rows.length)throw Error('No product updated');products=products.map(p=>String(p.id)===id?rows[0]:p);for(const x of cart)if(x.key.startsWith('p'+id+'-g')||x.key==='p'+id){Object.assign(x,{name:rows[0].name,arabic:rows[0].arabic,sku:rows[0].sku,sku_status:rows[0].sku_status,spice:rows[0].spice});}}else{body.created_by=sess.user.id;body.origin='Manual addition';body.sku_status='manual_unverified';rows=await db('gs_sales_products?select=id,name,arabic,brand,gtin,sku,sku_status,spice,pick_category,origin',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(body)});products.push(rows[0]);}renderProducts();renderCart();renderAdminResults();$('adminMsg').textContent='Saved '+rows[0].name;$('adminEditor').hidden=true;saveLocal();}catch(e){$('adminMsg').textContent='Could not save: '+e.message;}}
let arabicStop=false,arabicBusy=false;
async function translateArabic(name){
 if(typeof window.gsOfflineTranslate!=='function')throw Error('Translation model has not loaded. Check your internet connection and refresh.');
 const result=await window.gsOfflineTranslate(name,(message)=>{$('arabicProgress').textContent=message;});
 if(!result||!/[\u0600-\u06ff]/.test(result))throw Error('Translation failed for '+name);
 return result;
}
$('suggestOneArabic').onclick=async()=>{
 const b=$('suggestOneArabic');b.disabled=true;
 try{$('edit_arabic').value=await translateArabic($('edit_name').value.trim());$('adminMsg').textContent='Suggested Arabic is ready to edit. Click Save product to keep it.';}
 catch(e){$('adminMsg').textContent=e.message;}finally{b.disabled=false;}
};
$('stopArabic').onclick=()=>{arabicStop=true;$('arabicProgress').textContent='Stopping after current product…';};
$('bulkArabic').onclick=async()=>{if(!isGSAdmin())return;
 if(arabicBusy)return;
 const missing=products.filter(p=>!String(p.arabic||'').trim());
 if(!missing.length){$('arabicProgress').textContent='Every product already has an Arabic name.';return;}
 if(!confirm('Generate and save Arabic suggestions for '+missing.length+' products? These are unreviewed machine translations and will appear on packing slips until corrected. Existing Arabic will NOT be changed. This may take a while.'))return;
 arabicBusy=true;arabicStop=false;$('bulkArabic').disabled=true;$('stopArabic').hidden=false;
 let done=0,failed=0;
 try{
  for(const p of missing){
   if(arabicStop)break;
   try{
    const proposed=await translateArabic(p.name);
    const rows=await db('gs_sales_products?id=eq.'+p.id+'&arabic=is.null&select=id,arabic',{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({arabic:proposed})});
    // Blank-string rows need separate condition; never replace names that were filled while we worked.
    let saved=rows;
    if(!saved.length)saved=await db('gs_sales_products?id=eq.'+p.id+'&arabic=eq.&select=id,arabic',{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({arabic:proposed})});
    if(saved.length){p.arabic=saved[0].arabic;for(const x of cart)if(x.key.startsWith('p'+p.id+'-g')||x.key==='p'+p.id)x.arabic=p.arabic;done++;}
   }catch(e){failed++;$('adminMsg').textContent='Could not translate '+p.name+': '+e.message;}
   $('arabicProgress').textContent='Saved '+done+' / '+missing.length+' suggested Arabic names'+(failed?' · '+failed+' failed':'');
   if((done+failed)%10===0){renderAdminResults();renderCart();renderProducts();}
  }
  renderAdminResults();renderCart();renderProducts();saveLocal();
  $('arabicProgress').textContent='Finished: '+done+' translations saved; '+failed+' failed'+(arabicStop?' (stopped early)':'')+'. Review and correct names in Product Manager.';
 }finally{arabicBusy=false;$('bulkArabic').disabled=false;$('stopArabic').hidden=true;}
};
$('adminFind').oninput=renderAdminResults;$('adminResults').onclick=e=>{const b=e.target.closest('[data-edit-id]');if(b)startEdit(b.dataset.editId);};$('adminAdd').onclick=()=>{if(!isGSAdmin())return;$('editId').value='';for(const k of ['name','arabic','sku','gtin','brand'])$('edit_'+k).value='';$('edit_spice').checked=false;$('edit_status').value='manual_unverified';$('adminEditor').hidden=false;$('adminMsg').textContent='Adding product';};$('adminSave').onclick=saveEdit;$('adminCancel').onclick=()=>{$('adminEditor').hidden=true;};
$('logout').onclick=()=>{if(barcodeActive)closeBarcode();reset();};$('storeFind').oninput=()=>{storeActiveIndex=-1;renderStores();};
$('storeMatches').onclick=e=>{const btn=e.target.closest('[data-store-id]');if(btn)chooseStore(btn.dataset.storeId);};
$('storeFind').onkeydown=e=>{const buttons=[...$('storeMatches').querySelectorAll('[data-store-id]')];if(!buttons.length||$('storeMatches').hidden)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();storeActiveIndex=(storeActiveIndex+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>{b.classList.toggle('active',i===storeActiveIndex);b.setAttribute('aria-selected',String(i===storeActiveIndex))});buttons[storeActiveIndex].scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();chooseStore(buttons[Math.max(0,storeActiveIndex)].dataset.storeId);}else if(e.key==='Escape'){$('storeFind').value='';renderStores();}};$('newStoreBtn').onclick=()=>{$('newStoreBox').hidden=false;$('newStoreName').focus()};$('cancelStore').onclick=()=>{$('newStoreBox').hidden=true};$('saveNewStore').onclick=createStore;

// V42 Barcode ordering: exact catalog GTIN matching, and the SAME cart pathway as manual add.
let barcodeReader=null, barcodeActive=false, barcodeLocked=false, barcodeMatch=null;
let barcodeNativeTimer=null,barcodeFrameTimer=null,barcodeSession=0,barcodeScanAttempts=0,barcodeScanErrors=0,barcodeMisses=0,barcodeLastProblem="";
const barcodeDialog=$('barcodeDialog');
// V50: GTIN storage may include leading-zero padding (UPC-A 12 digits,
// EAN-13 13 digits, GTIN-14 14 digits). Match them as the same item.
// Never use a partial/suffix match: only zeros at the START may differ.
function normalizedGTIN(code){
 const digits=String(code??'').replace(/[\s-]/g,'');
 if(!/^\d{8,14}$/.test(digits))return '';
 return digits.replace(/^0+(?=\d)/,'');
}
function findBarcodeProduct(code){
 const normalized=normalizedGTIN(code);
 const raw=String(code??'').trim().replace(/[\s-]/g,'');
 if(!normalized&&!/^[A-Za-z0-9]{4,32}$/.test(raw))return {error:'Barcode is not a supported UPC/EAN or Code 128 value.'};
 // Standard GTINs match with leading-zero normalization. Other Code 128
 // values require an exact stored code; never approximate-match an item.
 const matches=products.filter(p=>normalized ? normalizedGTIN(p.gtin)===normalized : String(p.gtin||'').trim()===raw);
 if(!matches.length)return {error:'Barcode read: '+String(code)+'. No matching product in the loaded catalog. Nothing added.'};
 if(matches.length>1)return {error:'Multiple products share the same barcode (including leading-zero variants): '+String(code)+'. Ask admin to correct the duplicate. Nothing added.'};
 return {product:matches[0]};
}
let barcodeNoticeTimer=null, barcodeLastUnknown='', barcodeLastUnknownAt=0;
function showBarcodeNotice(title,detail,kind='error',autoClear=false){
 const note=$('barcodeNotice');note.dataset.kind=kind;
 $('barcodeNoticeTitle').textContent=title;
 $('barcodeNoticeDetail').textContent=detail||'';
 note.hidden=false;
 if(barcodeNoticeTimer)clearTimeout(barcodeNoticeTimer);
 if(autoClear)barcodeNoticeTimer=setTimeout(()=>{note.hidden=true;},3200);
}
function clearBarcodeNotice(){if(barcodeNoticeTimer)clearTimeout(barcodeNoticeTimer);$('barcodeNotice').hidden=true;}
$('barcodeNoticeDismiss').onclick=clearBarcodeNotice;
function barcodeFeedback(msg,bad=false){
 const el=$('barcodeFeedback');el.textContent=msg;el.hidden=!msg;
 el.style.color=bad?'#a72d2d':'#23613e';
}
function barcodeResult(code){
 if(!barcodeActive||barcodeLocked)return;
 if(!/^[A-Za-z0-9]{4,32}$/.test(String(code??'').replace(/[\s-]/g,''))){
  barcodeLastProblem='Scanner has not returned a supported barcode yet.';
  scanDiagnostics();return;
 }
 const barcode=String(code).replace(/[\s-]/g,'');
 $('barcodeManualInput').value=barcode;
 const result=findBarcodeProduct(barcode);
 if(result.error){
  barcodeMatch=null;$('barcodeMatched').hidden=true;
  const multiple=result.error.startsWith('Multiple products');
  showBarcodeNotice(multiple?'Duplicate barcode — ask admin':'Not in catalog',
   'Barcode '+barcode+' · Nothing added. Scan the next item.', 'error');
  barcodeFeedback('');
  return;
 }
 clearBarcodeNotice();
 barcodeMatch=result.product;barcodeLocked=true;
 $('barcodeProductDetails').innerHTML='<strong>'+safe(barcodeMatch.name)+'</strong><div class="muted small">'+safe(barcodeMatch.sku?'SKU '+barcodeMatch.sku:'No SKU')+' · UPC '+safe(barcodeMatch.gtin)+'</div><div lang="ar" dir="rtl">'+safe(barcodeMatch.arabic||'')+'</div>';
 $('barcodeMatched').hidden=false;$('barcodeCases').value='1';barcodeFeedback('');
 $('barcodeCameraStatus').textContent='Product found · Enter cases below.';
 // Do not focus the quantity automatically: Safari will scroll the dialog and obscure the camera.
}
// V49: Quagga2 UPC/EAN scanning; Quagga owns camera + video frames.
let quaggaDetectedHandler=null,quaggaProcessedHandler=null,quaggaRunning=false;
let barcodeSeenCode='',barcodeSeenCount=0;
function loadQuagga(){
 if(window.Quagga?.init&&window.Quagga?.decodeSingle)return Promise.resolve(window.Quagga);
 if(window.gsQuaggaLoading)return window.gsQuaggaLoading;
 window.gsQuaggaLoading=new Promise((resolve,reject)=>{
  const urls=['https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.4/dist/quagga.min.js','https://unpkg.com/@ericblade/quagga2@1.8.4/dist/quagga.min.js'];
  let index=0,settled=false;
  function next(){
   if(settled)return;
   if(index>=urls.length){settled=true;reject(Error('Scanner library could not load. Please check your internet connection.'));return;}
   const script=document.createElement('script');script.src=urls[index++];script.async=true;
   const timer=setTimeout(()=>{script.onload=script.onerror=null;script.remove();next();},9000);
   script.onload=()=>{clearTimeout(timer);if(settled)return;if(window.Quagga?.init&&window.Quagga?.decodeSingle){settled=true;resolve(window.Quagga);}else next();};
   script.onerror=()=>{clearTimeout(timer);if(!settled)next();};document.head.appendChild(script);
  }next();
 }).catch(e=>{window.gsQuaggaLoading=null;throw e});
 return window.gsQuaggaLoading;
}
function barcodeCheckDigitValid(code){
 const digits=String(code||'').replace(/\D/g,'');
 if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits))return false;
 let sum=0;for(let i=digits.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(digits[i])*weight;
 return (10-(sum%10))%10===Number(digits[digits.length-1]);
}
async function stopBarcodeCamera(){
 ++barcodeSession;
 if(barcodeNativeTimer){clearTimeout(barcodeNativeTimer);barcodeNativeTimer=null;}
 if(barcodeFrameTimer){clearTimeout(barcodeFrameTimer);barcodeFrameTimer=null;}
 try{if(quaggaDetectedHandler&&window.Quagga)window.Quagga.offDetected(quaggaDetectedHandler)}catch(e){}
 try{if(quaggaProcessedHandler&&window.Quagga)window.Quagga.offProcessed(quaggaProcessedHandler)}catch(e){}
 quaggaDetectedHandler=null;quaggaProcessedHandler=null;
 try{if(quaggaRunning&&window.Quagga)window.Quagga.stop()}catch(e){}
 quaggaRunning=false;barcodeSeenCode='';barcodeSeenCount=0;
 // Release camera even when Quagga startup was interrupted.
 $('barcodeCamera').querySelectorAll('video').forEach(v=>{try{v.srcObject?.getTracks().forEach(t=>t.stop());v.srcObject=null;}catch(e){}});
 $('barcodeCamera').replaceChildren();
}
async function closeBarcode(){barcodeActive=false;barcodeLocked=false;barcodeMatch=null;clearBarcodeNotice();barcodeDialog.hidden=true;await stopBarcodeCamera();$('openBarcodeScanner').focus();}
function scanDiagnostics(){
 if(!barcodeActive||barcodeLocked)return;
 $('barcodeCameraStatus').textContent='Quagga2 scanning · '+barcodeScanAttempts+' frames · '+barcodeMisses+' without a barcode'+(barcodeScanErrors?' · '+barcodeScanErrors+' camera/decoder errors':'')+'. '+(barcodeLastProblem||'Hold the full barcode steady with good light.');
}
async function openBarcode(){
 if(!sess){alert('Sign in first.');return;}if(barcodeActive)return;
 barcodeActive=true;barcodeLocked=false;barcodeMatch=null;
 barcodeScanAttempts=0;barcodeScanErrors=0;barcodeMisses=0;barcodeLastProblem='';
 barcodeSeenCode='';barcodeSeenCount=0;
 clearBarcodeNotice();
 const token=++barcodeSession;barcodeDialog.hidden=false;
 $('barcodeMatched').hidden=true;$('barcodeManualInput').value='';barcodeFeedback('');
 $('barcodeCameraStatus').textContent='Loading Quagga2 scanner…';
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera unavailable. Open the portal in Safari or Chrome using HTTPS.');
  const Q=await loadQuagga();if(!barcodeActive||token!==barcodeSession)return;
  $('barcodeCameraStatus').textContent='Opening back camera…';
  await new Promise((resolve,reject)=>Q.init({
   inputStream:{name:'Live',type:'LiveStream',target:$('barcodeCamera'),constraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},area:{top:'0%',right:'0%',left:'0%',bottom:'0%'}},
   locate:true,numOfWorkers:0,frequency:12,
   locator:{patchSize:'medium',halfSample:false},
   decoder:{readers:['upc_reader','upc_e_reader','ean_reader','ean_8_reader','code_128_reader']}
  },error=>error?reject(error):resolve()));
  if(!barcodeActive||token!==barcodeSession){try{Q.stop()}catch(e){}return;}
  quaggaDetectedHandler=result=>{
   if(!barcodeActive||token!==barcodeSession||barcodeLocked)return;
   const code=String(result?.codeResult?.code||'').replace(/\s|-/g,'');
   const format=String(result?.codeResult?.format||'').toLowerCase();
   const isCode128=format==='code_128';
   if(isCode128 ? !/^[A-Za-z0-9]{4,32}$/.test(code) : !barcodeCheckDigitValid(code))return;
   // Code 128 has no UPC/EAN check digit; require an extra confirmation.
   // Require two matching detections to limit false positives from live video.
   if(code===barcodeLastUnknown && Date.now()-barcodeLastUnknownAt<1800)return;
   if(code===barcodeSeenCode)barcodeSeenCount++;else{barcodeSeenCode=code;barcodeSeenCount=1;}
   if(barcodeSeenCount<(isCode128?3:2)){$('barcodeCameraStatus').textContent='Barcode '+code+' detected — confirming…';return;}
   barcodeResult(code);
   if(!barcodeLocked){barcodeLastUnknown=code;barcodeLastUnknownAt=Date.now();barcodeSeenCode='';barcodeSeenCount=0;}
  };
  quaggaProcessedHandler=()=>{
   if(!barcodeActive||token!==barcodeSession||barcodeLocked)return;
   barcodeScanAttempts++;barcodeMisses++;
   if(barcodeScanAttempts%20===0)scanDiagnostics();
  };
  Q.onDetected(quaggaDetectedHandler);Q.onProcessed(quaggaProcessedHandler);
  Q.start();quaggaRunning=true;
  $('barcodeCameraStatus').textContent='Quagga2 camera active — aim at a UPC/EAN or Code 128 barcode.';
 }catch(e){
  barcodeScanErrors++;barcodeFeedback('Scanner could not start: '+String(e?.message||e),true);
  $('barcodeCameraStatus').textContent='Scanner unavailable — use photo or manual barcode entry.';
  // Camera may have been partially acquired.
  try{window.Quagga?.stop()}catch(e){}
 }
}
$('openBarcodeScanner').onclick=openBarcode;
$('closeBarcodeScanner').onclick=closeBarcode;
barcodeDialog.addEventListener('click',e=>{if(e.target===barcodeDialog)closeBarcode()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&barcodeActive)closeBarcode()});
$('barcodeManualFind').onclick=()=>{barcodeLocked=false;barcodeResult($('barcodeManualInput').value)};
$('barcodePhoto').onchange=async e=>{
 const file=e.target.files?.[0];if(!file||!barcodeActive)return;
 $('barcodeCameraStatus').textContent='Reading barcode from photo with Quagga2…';
 let url=null;
 try{
  const Q=await loadQuagga();if(!barcodeActive)return;
  await stopBarcodeCamera();
  // Keep the dialog active after stopping the live camera.
  const token=barcodeSession;
  url=URL.createObjectURL(file);
  const data=await new Promise(resolve=>Q.decodeSingle({src:url,numOfWorkers:0,locate:true,
    inputStream:{size:1600},locator:{patchSize:'medium',halfSample:false},
    decoder:{readers:['upc_reader','upc_e_reader','ean_reader','ean_8_reader','code_128_reader']}},resolve));
  if(!barcodeActive||barcodeSession!==token)return;
  const code=String(data?.codeResult?.code||'').trim();
  const format=String(data?.codeResult?.format||'').toLowerCase();
  if(format==='code_128' ? !/^[A-Za-z0-9]{4,32}$/.test(code) : !barcodeCheckDigitValid(code))throw Error('No valid UPC/EAN or Code 128 barcode detected in photo.');
  barcodeLocked=false;barcodeResult(code);
  $('barcodeCameraStatus').textContent='Photo decoded: '+code+'. Reopen scanner for live camera.';
 }catch(error){barcodeFeedback('Photo scanner: '+String(error?.message||error),true);$('barcodeCameraStatus').textContent='Photo not decoded. Close and reopen for live camera.';}
 finally{if(url)URL.revokeObjectURL(url);e.target.value='';}
};
$('barcodeManualInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('barcodeManualFind').click()}};
$('barcodeAddToOrder').onclick=()=>{
 if(!barcodeActive||!barcodeMatch)return;
 const n=Number($('barcodeCases').value),raw=$('barcodeCases').value.trim();
 if(!raw||!Number.isFinite(n)||n<=0||n>10000||Math.abs(n*100-Math.round(n*100))>1e-6){barcodeFeedback('Enter a valid quantity of cases, up to two decimals (e.g. 0.25, 0.5, 1).',true);return;}
 const p=barcodeMatch;
 addFromCatalog(p.id,roundQty(n)); // existing, tested path to draft order, invoice groups, Arabic and SKU
 // Keep the camera running and return the scanner window to the live preview.
 const active=document.activeElement;
 if(active&&barcodeDialog.contains(active)&&typeof active.blur==='function')active.blur();
 barcodeMatch=null;barcodeLocked=false;$('barcodeMatched').hidden=true;
 barcodeSeenCode='';barcodeSeenCount=0;
 $('barcodeManualInput').value='';
 barcodeFeedback('');
 showBarcodeNotice('Added '+roundQty(n)+' case(s)',p.name+' · Ready for the next barcode','success',true);
 $('barcodeCameraStatus').textContent='Ready for next barcode — camera stays on.';
 // On mobile, focusing the cases input scrolls the dialog to its bottom.
 // Restore its own scroll position, not the page behind the modal.
 const panel=barcodeDialog.querySelector('.barcodeDialog');
 if(panel)panel.scrollTop=0;
 barcodeDialog.scrollTop=0;
 requestAnimationFrame(()=>{if(barcodeActive&&panel){panel.scrollTop=0;barcodeDialog.scrollTop=0;}});
};

$('productFind').oninput=renderProducts;
function setDirectCases(id,input){const p=products.find(x=>String(x.id)===String(id));if(!p||!input)return;const raw=input.value.trim(),num=Number(raw);if(!raw||!Number.isFinite(num)||num<=0||num>10000||Math.round(num*100)!==num*100){alert('Enter a case quantity above 0, up to 2 decimal places (for example 0.25, 0.5 or 10).');input.focus();return;}const qty=roundQty(num),key='p'+p.id+'-g'+currentGroup,existing=cart.find(x=>x.key===key||(currentGroup===1&&x.key==='p'+p.id));if(existing)existing.qty=qty;else cart.push({key,invoice_group:currentGroup,name:p.name,arabic:p.arabic||'',sku:p.sku||'',sku_status:p.sku_status,gtin:p.gtin||'',spice:!!p.spice,sticker:false,qty});saveLocal();renderCart();input.value=String(qty);}
$('searchResults').onclick=e=>{const btn=e.target.closest('button[data-step]');if(!btn)return;const row=btn.closest('[data-product]');addFromCatalog(row.dataset.product,Number(btn.dataset.step));const input=row.querySelector('[data-setqty]'),item=cart.find(x=>x.key==='p'+row.dataset.product+'-g'+currentGroup);if(input&&item)input.value=String(item.qty);};
let directQtyTimer;
$('searchResults').oninput=e=>{const input=e.target.closest('[data-setqty]');if(!input)return;clearTimeout(directQtyTimer);const raw=input.value.trim(),v=Number(raw);if(!raw||!Number.isFinite(v)||v<=0||v>10000||Math.abs(v*100-Math.round(v*100))>1e-6)return;directQtyTimer=setTimeout(()=>setDirectCases(input.dataset.setqty,input),450);};
$('searchResults').onchange=e=>{const box=e.target.closest('[data-search-sticker]');if(box){const id=box.dataset.searchSticker;const x=cart.find(x=>x.key==='p'+id+'-g'+currentGroup||(currentGroup===1&&x.key==='p'+id));if(!x){box.checked=false;alert('Add a case quantity first, then check Sticker.');return;}x.sticker=box.checked;saveLocal();renderCart();return;}const input=e.target.closest('[data-setqty]');if(!input)return;clearTimeout(directQtyTimer);if(input.value.trim())setDirectCases(input.dataset.setqty,input);};
$('searchResults').onkeydown=e=>{const input=e.target.closest('[data-setqty]');if(input&&e.key==='Enter'){e.preventDefault();clearTimeout(directQtyTimer);setDirectCases(input.dataset.setqty,input);input.blur();}};
$('invoiceBreakBtn').onclick=addInvoiceBreak; $('newItemBtn').onclick=()=>{$('newItemBox').hidden=false;$('customName').focus()};$('cancelCustom').onclick=()=>{$('newItemBox').hidden=true};$('addCustom').onclick=addCustom;
$('basket').onchange=e=>{const category=e.target.closest('[data-category]');if(category){const x=cart.find(x=>x.key===category.dataset.category);if(x){x.invoice_category=Number(category.value);saveLocal();renderCart();}return;}const box=e.target.closest('[data-sticker]');if(box){const x=cart.find(x=>x.key===box.dataset.sticker);if(x){x.sticker=box.checked;saveLocal();renderProducts();}return;}const inp=e.target.closest('[data-quantity]');if(!inp)return;const x=cart.find(x=>x.key===inp.dataset.quantity);if(!x)return;const value=Number(inp.value);if(!Number.isFinite(value)||value<=0||value>10000){alert('Case quantity must be greater than zero.');renderCart();return;}x.qty=roundQty(value);saveLocal();renderCart();};
$('basket').onclick=e=>{const b=e.target.closest('button'),row=b?.closest('[data-line]');if(!row)return;const key=row.dataset.line,x=cart.find(x=>x.key===key);if(!x)return;if(b.dataset.delete){cart=cart.filter(x=>x.key!==key);}else if(b.dataset.delta){const v=roundQty(x.qty+Number(b.dataset.delta));if(v<=0)cart=cart.filter(i=>i.key!==key);else x.qty=v;}saveLocal();renderCart();};
$('delivery').oninput=saveLocal;$('notes').oninput=saveLocal;$('submitOrder').onclick=submit;$('printSpices').onclick=()=>{try{validated();printData(payload(),'spices');}catch(e){err('orderMessage',e.message);}};// V85: one-tap named PDF file sharing via the native iOS share sheet.
// Do not call window.print() here: the native print dialog replaces the filename
// and prevents direct file sharing. Existing printData and its HTML/CSS remain intact.
// V91: restore native browser printing from the original packing-list template.
// No PDF server or alternate canvas renderer in the Print List click path.
$('printList').onclick=()=>{
  try{validated();printData(payload(),'full');}
  catch(e){err('orderMessage',e instanceof Error?e.message:String(e));}
};
$('clearOrder').onclick=()=>{if(!confirm('Clear the current order and selected store? This does not delete saved orders.'))return;clearTimeout(directQtyTimer);cart=[];currentGroup=1;editingOrderId=null;lastSubmittedSignature=null;lastSaved=null;customerId='';storeActiveIndex=-1;$('storeFind').value='';$('productFind').value='';$('delivery').value='';$('notes').value='';$('newItemBox').hidden=true;saveLocal();renderStores();renderProducts();renderCart();editingLabel();err('orderMessage','');};
$('refreshOrders').onclick=loadOrders;$('orderHistory').onclick=e=>{const b=e.target.closest('[data-history]');if(!b)return;const o=history.find(x=>x.id===b.dataset.history);if(o)loadExistingOrder(o);};
// Deliberately no public signup and no automatic anonymous sessions.
activate(false);if(!url||!anon){err('loginError','Supabase configuration missing.');}else{
  let old;try{old=JSON.parse(sessionStorage.getItem('gs_sales_session_v23')||'null')}catch{}
  if(old&&old.access_token&&old.refresh_token&&old.user?.id){(async()=>{try{sess=old;await fresh();const roles=await db('gs_sales_staff?select=user_id,role,enabled&user_id=eq.'+encodeURIComponent(sess.user.id));if(!roles.length||!roles[0].enabled)throw Error('Access not authorized');staff=roles[0];activate(true);$('loggedAs').textContent=sess.user.email;await loadData();}catch(e){reset();err('loginError','Session expired. Please sign in.');}})();}
}
})();
