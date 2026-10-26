(()=>{'use strict';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base=String(window.GS_SUPABASE_URL||'').replace(/\/$/,''),key=window.GS_SUPABASE_ANON_KEY;
let session=null,orders=[],exported=new Set(),exportCounts={},items=[],priced={},overrides={},productCategories={},prepared=[],selected=new Set(),editingId=null,editingItems=[],saveQueue=new Map(),saveErrors=new Map(),savingSkus=new Set();
function message(v){$('status').textContent=v;}
async function req(path,opts={}){if(!base||!key)throw Error('Missing Supabase configuration');const h={'apikey':key,'Content-Type':'application/json',...(session?{'Authorization':'Bearer '+session.access_token}:{}),...(opts.headers||{})};const res=await fetch(base+path,{...opts,headers:h});const t=await res.text();let v;try{v=JSON.parse(t)}catch{v=t}if(!res.ok)throw Error(typeof v==='object'?(v.message||v.error||t):t);return v}
async function login(){try{const s=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});session=s;$('password').value='';const staff=await req('/rest/v1/gs_sales_staff?select=role,enabled&user_id=eq.'+encodeURIComponent(s.user.id));if(staff.length!==1||staff[0].role!=='admin'||!staff[0].enabled)throw Error('Only enabled Golden Star admins can export routes.');const [all,prices,ov,pc]=await Promise.all([fetch('qb-item-list.json').then(r=>r.json()),fetch('qb-prices-reviewed.json').then(r=>r.json()),req('/rest/v1/gs_qb_item_overrides?select=sku,item_name,description,price,invoice_group'),req('/rest/v1/gs_sales_products?select=sku,pick_category&limit=10000')]);items=all;priced=prices;overrides=Object.fromEntries(ov.map(x=>[String(x.sku),x]));productCategories={};for(const product of pc){const sku=String(product.sku||'').trim(),cat=String(product.pick_category||'').trim().toUpperCase();if(sku&&cat){if(productCategories[sku]&&productCategories[sku]!==cat)productCategories[sku]='CONFLICT';else productCategories[sku]=cat;}}$('qbNames').innerHTML=items.map(x=>'<option value="'+escape(x.name)+'"></option>').join('');$('authBox').hidden=true;$('workspace').hidden=false;await refresh();}catch(e){session=null;alert('Sign-in or setup failed: '+e.message)}}

// Permanent QuickBooks defaults: save only complete, validated product settings.
// Queue by SKU so a slower earlier request cannot overwrite a newer correction.
function cleanSku(v){return String(v||'').trim()}
function skuLines(sku){return prepared.flatMap((o,oi)=>o.lines.map((l,li)=>({o,oi,l,li}))).filter(x=>cleanSku(x.l.sku)===sku)}
function setSkuStatus(sku,value,kind='muted'){
 for(const node of document.querySelectorAll('[data-save-status]'))if(node.dataset.saveStatus===sku){node.textContent=value;node.className='saveState '+kind;}
}
function validateSkuSettings(sku){
 const rows=skuLines(sku);if(!rows.length)return null;
 const l=rows[0].l,name=String(l.name||'').trim(),description=String(l.description||'').trim(),price=l.price;
 if(!name||!items.some(x=>x.name===name)||!description||price===null||!Number.isFinite(price)||price<0)return null;
 return {sku,item_name:name,description,price,invoice_group:overrides[sku]?.invoice_group??null,updated_by:session.user.id};
}
async function persistSku(sku){
 const data=validateSkuSettings(sku);
 if(!data){saveErrors.delete(sku);setSkuStatus(sku,'Fill item, description and price to save','warn');review();return;}
 savingSkus.add(sku);setSkuStatus(sku,'Saving…');review();
 try{
  await req('/rest/v1/gs_qb_item_overrides?on_conflict=sku',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(data)});
  overrides[sku]={...overrides[sku],...data};saveErrors.delete(sku);setSkuStatus(sku,'Saved permanently ✓','ok');
 }catch(e){saveErrors.set(sku,e.message);setSkuStatus(sku,'Save failed — retry','warn');}
 finally{savingSkus.delete(sku);review();}
}
function saveSku(sku){
 // Each SKU change chains after the previous request, even across rapid field changes.
 const prior=saveQueue.get(sku)||Promise.resolve();
 const task=prior.catch(()=>{}).then(()=>persistSku(sku));saveQueue.set(sku,task);
 task.finally(()=>{if(saveQueue.get(sku)===task)saveQueue.delete(sku)});
 return task;
}
function scheduleSkuSave(input){const oi=Number(input.dataset.o),li=Number(input.dataset.i),l=prepared[oi]?.lines[li];if(!l)return;
 const sku=cleanSku(l.sku);if(!sku)return;
 if(input.dataset.value==='qty')return; // Quantities belong to each order, not SKU defaults.
 if(!validateSkuSettings(sku)){setSkuStatus(sku,'Complete item, description and price to save','warn');review();return;}
 // Save only on change/blur, not on every keypress.
 saveSku(sku);
}

function dateDisplay(o){return String(o.delivery_note||'').trim()}
function dateISO(x){const v=String(x||'').trim(),m=v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:m?`${m[3].length===2?'20'+m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:''}
async function refresh(){try{const [o,a,h]=await Promise.all([req('/rest/v1/gs_sales_orders?select=id,customer_name,customer_id,delivery_note,notes,items,created_at,status&order=created_at.desc&limit=500'),req('/rest/v1/gs_route_iif_exports?select=order_id'),req('/rest/v1/gs_route_iif_export_history?select=order_id')]);orders=o;const histories=[...a,...h];exportCounts={};for(const x of histories)exportCounts[x.order_id]=(exportCounts[x.order_id]||0)+1;exported=new Set(Object.keys(exportCounts));selected=new Set([...selected].filter(id=>orders.some(o=>o.id===id)));renderOrders();message('Loaded '+orders.length+' recent saved orders. '+exported.size+' have past exports (re-export permitted with confirmation).');}catch(e){message('Cannot load orders or audit records: '+e.message+' — run V75 SQL before exporting.')}}
function shown(){const d=$('deliveryFilter').value;return orders.filter(o=>!d||dateISO(o.delivery_note)===d)}
function renderOrders(){const entries=shown();$('orders').innerHTML=entries.map(o=>`<div class="orderrow"><label><input type="checkbox" data-oid="${escape(o.id)}" ${selected.has(o.id)?'checked':''} ><span><b>${escape(o.customer_name)}</b><small>Delivery: ${escape(dateDisplay(o)||'not specified')} · ${(o.items||[]).length} lines · ${escape(o.id.slice(0,8))}</small></span></label><span class="${exported.has(o.id)?'warn':'muted'}">${exported.has(o.id)?'Exported '+exportCounts[o.id]+' time(s) — re-export available':'Ready for review'}</span><button type="button" class="secondary" data-edit-order="${escape(o.id)}">Edit quantities</button></div>`).join('')||'<p>No orders match this delivery date.</p>';}
function closeEditor(){editingId=null;editingItems=[];$('quantityEditor').hidden=true;$('quantityRows').innerHTML='';}
function openEditor(id){const o=orders.find(x=>x.id===id);if(!o){message('Order not found. Refresh.');return;}
 editingId=id;editingItems=structuredClone(o.items||[]);
 $('quantityHeading').textContent='Edit quantities · '+o.customer_name;
 $('quantityRows').innerHTML=editingItems.map((x,i)=>`<tr><td>${escape(x.sku||'—')}</td><td>${escape(x.name||'Unnamed item')}</td><td><input type="number" min="0.01" max="10000" step="0.01" inputmode="decimal" data-edit-qty="${i}" value="${escape(x.qty)}" aria-label="Cases for ${escape(x.name||x.sku)}"></td></tr>`).join('');
 $('quantityEditor').hidden=false;$('quantityEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveQuantityEdits(){if(!editingId)return;const id=editingId,o=orders.find(x=>x.id===id);if(!o){message('Order no longer found. Refresh.');return;}
 const fields=[...$('quantityRows').querySelectorAll('[data-edit-qty]')];const next=structuredClone(editingItems);
 for(const input of fields){const v=input.value.trim(),num=Number(v);if(!v||!Number.isFinite(num)||num<=0||num>10000){message('Enter a valid case quantity between 0.01 and 10000 for every item.');input.focus();return;}next[+input.dataset.editQty].qty=num;}
 const btn=$('saveQuantityEdits');btn.disabled=true;
 try{
  const recent=await req('/rest/v1/gs_sales_orders?select=id,items,delivery_note,notes&id=eq.'+encodeURIComponent(id));
  if(recent.length!==1||JSON.stringify(recent[0].items)!==JSON.stringify(o.items))throw Error('Order changed since opening this editor. Refresh and try again.');
  const saved=await req('/rest/v1/rpc/gs_sales_update_order',{method:'POST',body:JSON.stringify({p_order_id:id,p_items:next,p_delivery_note:recent[0].delivery_note||'',p_notes:recent[0].notes||''})});
  if(!saved||saved.id!==id)throw Error('Database did not confirm the order update.');
  closeEditor();prepared=[];$('lines').innerHTML='';$('confirm').checked=false;await refresh();
  message('Saved updated case quantities to the ORIGINAL order '+id.slice(0,8)+'. Route review cleared: prepare the selected orders again before IIF export. Share a new packing list with the warehouse.');
 }catch(e){message('Quantity save failed: '+e.message)}finally{btn.disabled=false;}
}
const groupNames={1:'Grocery',2:'Frozen',3:'Dubai + Angel Hair Chocolates',4:'Pistachio Wafers',5:'Drops Drinks',6:'Baklava + Turkish Delight',7:'Dairy'};
function isMeijer(store){return /\bmeijer\b/i.test(store)}
function isSplitStore(store){return /\b(meijer|nino(?:\s+salvaggio)?)\b/i.test(store)}
function categoryGroup(cat){return ({FROZEN:2,GROCERY:1,DAIRY:7,SPICES:1})[String(cat||'').trim().toUpperCase()]||null}
function resolveLine(line){const sku=String(line.sku||'').trim(),override=overrides[sku],candidates=items.filter(x=>x.sku===sku),match=override?items.find(x=>x.name===override.item_name):(candidates.length===1?candidates[0]:null),name=match?.name||'',p=override?.price!=null?Number(override.price):Number(priced[name]?.price),description=override?.description||priced[name]?.description||'',qty=Number(line.qty);
const liveCategory=productCategories[sku]||'',orderCategory=String(line.pick_category||'').trim().toUpperCase();
const category=liveCategory&&liveCategory!=='CONFLICT'?liveCategory:orderCategory;
const pickGroup=categoryGroup(category),savedGroup=override?.invoice_group==null?null:Number(override.invoice_group);
const invoiceCategory=Number(line.invoice_category),oldGroup=Number(line.invoice_group);
let group=Number.isFinite(savedGroup)?savedGroup:(Number.isInteger(invoiceCategory)&&invoiceCategory>0?invoiceCategory:(Number.isInteger(oldGroup)&&oldGroup>0?oldGroup:1));
// The current Product Manager category wins over old saved Grocery/Frozen labels.
if(pickGroup!==null && [1,2].includes(group))group=pickGroup;
// Biryani SKUs are frozen by default, unless a current admin product setting says otherwise.
if(['1141','1142'].includes(sku)&&pickGroup===null&&group===1)group=2;
return {sku,name,description,qty,price:Number.isFinite(p)?p:null,group,categoryConflict:liveCategory==='CONFLICT',source:line}}
function isPistachioWafer(x){const name=String([x?.name,x?.line,x?.source?.name,x?.description].filter(Boolean).join(' ')).toLowerCase();return /(?:wafer|wafers|ويفر)/i.test(name)&&/(?:pistachio|pistachios|فستق)/i.test(name);}
function invoiceGroup(x,store){
 if(!isSplitStore(store))return 1;
 const sku=String(x.sku||'').trim().toUpperCase();
 if(isMeijer(store)&&['12012','11050'].includes(sku))return 6;
 // Dedicated Meijer/Nino invoice families must override stale saved group IDs
 // and outdated product-admin Grocery/Frozen labels.
 if(['12044','11546','11257'].includes(sku))return 3;
 if(['44537','44538','44539','44540','44541'].includes(sku))return 5;
 if(isPistachioWafer(x))return 4; // Dedicated pistachio wafers invoice even if old category says Grocery.
 // SKU 1160 is frozen Borek Cheese, not dairy. Ignore stale saved dairy invoice groups.
 if(sku==='1160')return 2;
 if(isMeijer(store) && (String(productCategories[sku]||x.source?.pick_category||'').trim().toUpperCase()==='DAIRY'||x.group===7))return 7;
 if(isMeijer(store)&&/\b(yogurt|yoghurt|labneh|laban|ayran|cheese|milk|dairy|kashkaval|feta|butter|cream)\b/i.test(String(x.source?.name||'')))return 7;
 return [1,2,3,4,5,6,7].includes(x.group)?x.group:1;
}
// Mirrors salesman.js Kroger warehouse picking priority. These are sections within ONE invoice.
const KROGER_PICK_ORDER=['FROZEN','DAIRY','GROCERY','SPICES'];
const KROGER_SPICE_SKUS=new Set(['11214','11269','11191','11663','11660']);
const KROGER_GROCERY_SKUS=new Set(['11456','11276','11272','11273']);
const KROGER_DROPS_SKUS=new Set(['44537','44538','44539','44540','44541']);
const KROGER_FROZEN_SKUS=new Set(['1119','1120','1121','1122','1123','1125','1126','1127','1128','1129','1136','1137','1138','1139','1140','1142','1148','1155','1156','1158','1159','1160','1161','1164','1165','1166','1175']);
function krogerPickCategoryForRoute(l){
 const source=l.source||l, sku=String(l.sku||source.sku||'').trim(), name=String(source.name||l.name||'').toLowerCase(), brand=String(source.brand||'').toLowerCase();
 if(KROGER_DROPS_SKUS.has(sku))return 'GROCERY';
 if(/(?:^|[^\w])10\s*(?:lb|lbs|pounds?)(?=$|[^\w])/i.test(name)||KROGER_GROCERY_SKUS.has(sku))return 'GROCERY';
 const live=productCategories[sku], assigned=live&&live!=='CONFLICT'?live:String(source.pick_category||'').trim().toUpperCase();
 if(KROGER_PICK_ORDER.includes(assigned))return assigned;
 if(KROGER_SPICE_SKUS.has(sku))return 'SPICES';
 if(source.spice===true||source.spice===1)return 'SPICES';
 if(!/\b(canned|tin|ready to eat|cooked|frozen|soup|drink|juice|sauce|paste|instant|rice|flour)\b/.test(name)&&/\b(lentils?|bulgur|burghul|cracked wheat|gerish|jareesh|dry (?:broad |fava |white |red |black |kidney |pinto )?beans?|fava beans?|broad beans?|slivered almond|almonds? (?:sliced|slivered)|prunes? (?:pitted|dried))\b/.test(name)&&/\b(?:\d+(?:\.\d+)?\s*(?:oz|g|gr|gram|grams|kg|lb|lbs)|bag|packed)\b/.test(name))return 'SPICES';
 if(/mosul kubba|gourme|gourmet/.test(brand)||/^(mosul kubba|gourme)\b/.test(name))return 'FROZEN';
 if(KROGER_FROZEN_SKUS.has(sku)||/(frozen|ready meals?|kubba|kibbie|kibbeh|borek|samosa|shawarma|pizza|potato chop|lahmajeen|falafel|كبة|سمبوس|بورك)/i.test(name))return 'FROZEN';
 if(/\b(milk|yogurt|yoghurt|labneh|laban|ayran|cheese|cream cheese|heavy cream|whipping cream|sour cream|butter|kashkaval|halloumi|feta)\b/i.test(name))return 'DAIRY';
 return 'GROCERY';
}
function isKrogerRoute(store){return /\bkroger\b/i.test(String(store||''));}
function warehouseOrderedLines(lines,store){
 if(!isKrogerRoute(store))return lines;
 return [...lines].sort((a,b)=>KROGER_PICK_ORDER.indexOf(krogerPickCategoryForRoute(a))-KROGER_PICK_ORDER.indexOf(krogerPickCategoryForRoute(b)));
}
function groupLabel(x,store){return isSplitStore(store)?groupNames[invoiceGroup(x,store)]||'Unknown category':isKrogerRoute(store)?krogerPickCategoryForRoute(x)+' · single invoice':'Single invoice'}
function prepare(){try{const picked=orders.filter(o=>selected.has(o.id));if(!picked.length)throw Error('Select one or more orders.');prepared=picked.map(o=>({order:o,customer:o.customer_name,lines:warehouseOrderedLines((o.items||[]).map(resolveLine),o.customer_name)}));if(prepared.some(x=>!x.lines.length))throw Error('An order has no items');renderLines();message('Review every row. Unknown QuickBooks names or prices block export. A saved override price takes precedence.')}catch(e){message(e.message)}}
function renderLines(){let html='';for(const [oi,o] of prepared.entries()){html+=`<tr><td colspan="7"><label>QuickBooks customer for ${escape(o.order.customer_name)} <input data-customer="${oi}" value="${escape(o.customer)}" aria-label="Exact QuickBooks customer name"></label> <small>${escape(o.order.id)}</small></td></tr>`;for(const [li,l] of o.lines.entries()){html+=`<tr><td>${escape(o.order.customer_name)} · <strong>${escape(groupLabel(l,o.order.customer_name))}</strong></td><td>${escape(l.sku)}</td><td><input list="qbNames" data-value="name" data-o="${oi}" data-i="${li}" value="${escape(l.name)}"></td><td><input data-value="description" data-o="${oi}" data-i="${li}" value="${escape(l.description)}"></td><td><input type="number" min="0" step="0.01" data-value="qty" data-o="${oi}" data-i="${li}" value="${escape(l.qty)}"></td><td><input type="number" min="0" step="0.01" data-value="price" data-o="${oi}" data-i="${li}" value="${l.price===null?'':escape(l.price)}"></td><td id="sum-${oi}-${li}">${l.qty===0?'Excluded from IIF':l.price===null?'Needs price':'$'+(l.price*l.qty).toFixed(2)}<div class="saveState muted" data-save-status="${escape(l.sku)}">${overrides[l.sku]?'Saved default':'Auto-save on edit'}</div></td></tr>`}}$('lines').innerHTML=html;review()}
function review(){
 const problems=[];let count=0,total=0;const names=new Set(items.map(x=>x.name));
 const issue=(label,oi,li)=>problems.push({label,oi,li});
 for(const [oi,o] of prepared.entries()){
  if(!o.customer.trim())issue(o.order.customer_name+': missing exact QuickBooks customer',oi,-1);
  for(const [li,l] of o.lines.entries()){
   if(l.qty===0)continue; // Excluded from this IIF only; saved Supabase order is not changed.
   count++;const prefix=o.order.customer_name+' · SKU '+l.sku;
   if(l.categoryConflict)issue(prefix+': conflicting admin categories',oi,li);
   if(!names.has(l.name))issue(prefix+': select an exact QuickBooks item',oi,li);
   if(!String(l.description||'').trim())issue(prefix+': missing description',oi,li);
   if(!Number.isFinite(l.qty)||l.qty<=0)issue(prefix+': invalid case quantity',oi,li);
   if(l.price===null||!Number.isFinite(l.price)||l.price<0)issue(prefix+': missing price',oi,li);
   if(l.price!==null&&Number.isFinite(l.qty))total+=l.qty*l.price;
  }
 }
 for(const sku of savingSkus)if(prepared.some(o=>o.lines.some(l=>l.sku===sku&&l.qty!==0)))issue('SKU '+sku+': product defaults still saving',-1,-1);
 for(const [sku,error] of saveErrors)if(skuLines(sku).some(l=>l.qty!==0))issue('SKU '+sku+': permanent save failed — '+error,-1,-1);
 const invoiceCount=prepared.reduce((sum,o)=>sum+new Set(o.lines.filter(l=>l.qty>0).map(l=>invoiceGroup(l,o.order.customer_name))).size,0);
 if(prepared.length&&!count)issue('All lines are excluded (quantity 0). At least one item must remain to export.',-1,-1);
 $('reviewStats').textContent=`${prepared.length} orders · ${invoiceCount} invoices · ${count} lines · $${total.toFixed(2)} · ${problems.length} export blocker(s)`;
 const box=$('exportBlockers');
 if(!prepared.length){box.innerHTML='<p class="muted">Select orders and click Prepare to see validation.</p>'}
 else if(!problems.length){box.innerHTML='<p class="ok">✓ All product mappings, descriptions, quantities and prices are complete.</p>'}
 else {box.innerHTML='<strong class="warn">Fix '+problems.length+' issue(s) before downloading:</strong><ul>'+problems.map((p,i)=>`<li><button type="button" class="blockerLink" data-blocker="${i}">${escape(p.label)}</button></li>`).join('')+'</ul>'}
 box._issues=problems;
 $('export').disabled=!!problems.length||!prepared.length||!$('confirm').checked||!$('invoiceDate').value;
 return problems.map(x=>x.label);
}
function escIIF(s){return String(s??'').replace(/[\t\r\n]+/g,' ').trim()}
function fmt(n){return (Math.round((Number(n)+Number.EPSILON)*100)/100).toFixed(2)}
function makeIIF(){const rows=[['!TRNS','TRNSTYPE','DATE','ACCNT','NAME','AMOUNT','DOCNUM','MEMO'],['!SPL','TRNSTYPE','DATE','ACCNT','NAME','AMOUNT','DOCNUM','INVITEM','QNTY','PRICE','MEMO'],['!ENDTRNS']];const [yyyy,mm,dd]=$('invoiceDate').value.split('-'),d=`${Number(mm)}/${Number(dd)}/${yyyy}`;for(const o of prepared){const groups=new Map();for(const l of warehouseOrderedLines(o.lines,o.order.customer_name)){if(l.qty===0)continue;const group=invoiceGroup(l,o.order.customer_name);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(l)}for(const [group,lines] of [...groups].sort((a,b)=>a[0]-b[0])){const total=fmt(lines.reduce((s,l)=>s+l.qty*l.price,0));rows.push(['TRNS','INVOICE',d,'Accounts Receivable',o.customer,total,'',`Golden Star saved order ${o.order.id.slice(0,8)} · ${groupNames[group]||"Single invoice"}`]);for(const l of lines)rows.push(['SPL','INVOICE',d,'Cost of Goods Sold',o.customer,fmt(-l.qty*l.price),'',l.name,String(-l.qty),fmt(l.price),l.description]);rows.push(['ENDTRNS'])}}return rows.map(r=>r.map(escIIF).join('\t')).join('\r\n')+'\r\n'}
function fingerprint(o){return JSON.stringify({id:o.order.id,items:o.order.items,customer:o.customer,lines:o.lines.map(x=>[x.name,x.description,x.qty,x.price,invoiceGroup(x,o.order.customer_name)])})}
async function digest(v){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function exportFile(){try{await Promise.all([...saveQueue.values()]);const problems=review();if(problems.length)throw Error('Fix these before exporting: '+problems.slice(0,5).join('; '));if(!$('confirm').checked)throw Error('Review confirmation required.');const repeats=prepared.filter(o=>exported.has(o.order.id));if(repeats.length&&!window.confirm('RE-EXPORT WARNING: '+repeats.map(o=>o.order.customer_name).join(', ')+' already had an IIF exported. Importing these again may create duplicate QuickBooks invoices. Export another file anyway?'))return;$('export').disabled=true;const refreshed=await req('/rest/v1/gs_sales_orders?select=id,items,customer_name&id=in.('+prepared.map(o=>o.order.id).join(',')+')');for(const o of prepared){const live=refreshed.find(x=>x.id===o.order.id);if(!live||JSON.stringify(live.items)!==JSON.stringify(o.order.items)||live.customer_name!==o.order.customer_name)throw Error('An order changed since this preview. Refresh and prepare the route again.')}const iif=makeIIF();if(!iif.includes('\tINVOICE\t'))throw Error('No invoice transactions generated');const hashes=await Promise.all(prepared.map(o=>digest(fingerprint(o))));const reserved=await req('/rest/v1/rpc/gs_route_reserve_iif_export',{method:'POST',body:JSON.stringify({p_order_ids:prepared.map(o=>o.order.id),p_hashes:hashes})});const a=document.createElement('a'),url=URL.createObjectURL(new Blob([iif],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='Golden_Star_Route_'+$('invoiceDate').value+'_BATCH_'+String(reserved).slice(0,8)+'.iif';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);message('Export reservation '+reserved+' saved. IIF download started. Verify actual QuickBooks imports. Export history recorded. Before importing, check QuickBooks for existing invoices: this file can create duplicates if imported twice.');prepared=[];$('lines').innerHTML='';$('confirm').checked=false;await refresh()}catch(e){message('EXPORT STOPPED: '+e.message)}finally{review()}}
$('orders').onclick=e=>{const b=e.target.closest('[data-edit-order]');if(b)openEditor(b.dataset.editOrder)};$('saveQuantityEdits').onclick=saveQuantityEdits;$('cancelQuantityEdits').onclick=closeEditor;$('login').onclick=login;$('refresh').onclick=refresh;$('deliveryFilter').onchange=renderOrders;$('selectFiltered').onclick=()=>{shown().forEach(x=>selected.add(x.id));renderOrders()};$('clearSelection').onclick=()=>{selected.clear();renderOrders()};$('orders').onchange=e=>{if(!e.target.dataset.oid)return;e.target.checked?selected.add(e.target.dataset.oid):selected.delete(e.target.dataset.oid)};$('prepare').onclick=prepare;$('lines').oninput=e=>{const a=e.target;if(a.dataset.customer!==undefined){prepared[+a.dataset.customer].customer=a.value;review();return}if(!a.dataset.value)return;const l=prepared[+a.dataset.o]?.lines[+a.dataset.i];if(!l)return;l[a.dataset.value]=['qty','price'].includes(a.dataset.value)?(a.value.trim()===''?null:Number(a.value)):a.value;const s=$('sum-'+a.dataset.o+'-'+a.dataset.i);if(s)s.textContent=l.qty===0?'Excluded from IIF':l.price===null||!Number.isFinite(l.qty)?'Needs value':'$'+(l.price*l.qty).toFixed(2);review()};$('confirm').onchange=review;$('invoiceDate').onchange=review;$('export').onclick=exportFile;
$('exportBlockers').onclick=e=>{const btn=e.target.closest('[data-blocker]');if(!btn)return;const item=$('exportBlockers')._issues?.[Number(btn.dataset.blocker)];if(!item||item.oi<0)return;const selector=item.li===-1?`[data-customer="${item.oi}"]`:`[data-o="${item.oi}"][data-i="${item.li}"]`;
 const target=$('lines').querySelector(selector);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus();};
$('lines').addEventListener('change',e=>{if(e.target.matches('[data-value="name"],[data-value="description"],[data-value="price"]'))scheduleSkuSave(e.target)});
$('lines').addEventListener('focusout',e=>{if(e.target.matches('[data-value="name"],[data-value="description"],[data-value="price"]'))scheduleSkuSave(e.target)});
 const now=new Date();$('invoiceDate').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');})();