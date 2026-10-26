/* Golden Star V36 - PDF to spice picking sheet. Standalone, read-only. */
(()=>{'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let state={store:'',rows:[],warning:[]},pdfLoader;
const status=msg=>{$('spicepdf-status').textContent=msg};
function loadPdf(){if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);if(!pdfLoader)pdfLoader=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(window.pdfjsLib)};s.onerror=()=>reject(Error('PDF reader library could not load (internet required).'));document.head.append(s)});return pdfLoader}
function pageLines(content){let rows=[];for(const i of content.items){let t=String(i.str||'').trim();if(!t)continue;const x=i.transform?.[4]||0,y=i.transform?.[5]||0;let r=rows.find(r=>Math.abs(r.y-y)<2.5);if(!r){r={y,parts:[]};rows.push(r)}r.parts.push({x,t})}return rows.sort((a,b)=>b.y-a.y).map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.t).join(' ').replace(/\s+/g,' ').trim())}
async function catalog(){const url=String(window.GS_SUPABASE_URL||'').replace(/\/$/,''),key=window.GS_SUPABASE_ANON_KEY;if(!url||!key)throw Error('Supabase not configured');let out=[];for(let offset=0;offset<4000;offset+=750){let res=await fetch(url+'/rest/v1/gs_sales_products?select=sku,name,spice,pick_category&order=id.asc&limit=750&offset='+offset,{headers:{apikey:key,Authorization:'Bearer '+key}});if(!res.ok)throw Error('Unable to read current product categories ('+res.status+')');let batch=await res.json();out.push(...batch);if(batch.length<750)break}return out}
const isTenPoundBag=p=>/(?:^|[^\w])10\s*(?:lb|lbs|pounds?)(?=$|[^\w])/i.test(String(p.name||''));
const spice=p=>{
 if(isTenPoundBag(p)||['11276','11272','11273'].includes(String(p.sku||'').trim()))return false;
 const cat=String(p.pick_category||'').toUpperCase();
 if(cat)return cat==='SPICES';
 const sku=String(p.sku||'').trim();
 if(sku==='11456')return false;
 if(['11214','11269','11191','11663','11660'].includes(sku))return true;
 const name=String(p.name||'').toLowerCase();
 if(/\b(canned|tin|ready to eat|cooked|frozen|soup|drink|juice|sauce|paste|instant|rice|flour)\b/.test(name))return false;
 const dry=/\b(lentils?|bulgur|burghul|cracked wheat|gerish|jareesh|dry (?:broad |fava |white |red |black |kidney |pinto )?beans?|fava beans?|broad beans?|slivered almond|almonds? (?:sliced|slivered)|prunes? (?:pitted|dried))\b/.test(name);
 return !!p.spice || (dry && /\b(?:\d+(?:\.\d+)?\s*(?:oz|g|gr|gram|grams|kg|lb|lbs)|bag|packed)\b/.test(name));
};
function extract(pages,products){const bySku=new Map();for(const p of products){const k=String(p.sku||'').trim();if(!k)continue;if(!bySku.has(k))bySku.set(k,[]);bySku.get(k).push(p)}
let store='',rows=[],warnings=[],seenCategory=false;
for(const lines of pages){let section='',candidateStore='';for(let i=0;i<lines.length;i++){const line=lines[i];const fromMeta=line.match(/\bStore\s*:\s*(.+)$/i);if(fromMeta&&!store)store=fromMeta[1].trim();if(!candidateStore && i<4 && !/^(full order|warehouse packing|spice picking|\d+\/\d+|packed|sku|store:)/i.test(line))candidateStore=line;
if(/^SPICES(?:\s*\/.*)?$/i.test(line)){section='SPICES';seenCategory=true;continue}
if(/^(?:FROZEN|DAIRY|GROCERY|DROPS DRINKS|CHOCOLATES|PISTACHIO WAFERS|INVOICE\s+\d|INVOICE BREAK|DUBAI.*CHOCOLATE)$/i.test(line)){section='OTHER';continue}
// A salesman slip item line begins with a numeric SKU; never infer category from product name.
const skuMatch=line.match(/(?:^|\s)(\d{4,7}[A-Za-z]?)(?:\s|$)/);if(!skuMatch)continue;
const sku=skuMatch[1],matches=bySku.get(sku)||[];
if(matches.length!==1){if(section==='SPICES')warnings.push('SKU '+sku+' is missing or ambiguous in the current catalog; verify it on the original PDF.');continue}
const product=matches[0];if(isTenPoundBag(product)||['11276','11272','11273'].includes(sku))continue;if((product.pick_category && String(product.pick_category).toUpperCase()!=='SPICES') || sku==='11456')continue;
if(!spice(product)&&section!=='SPICES')continue;
// Quantity may be on the same PDF row or as a neighboring text run grouped on that row.
let qtyMatch=line.match(/(\d+(?:\.\d+)?)\s*cases?\b/i);
if(!qtyMatch){ // single numeric cell near the end is accepted only when text looks like a full item row.
const tail=line.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*$/);
if(tail && line.length>sku.length+10)qtyMatch=tail;
}
if(!qtyMatch){warnings.push('Could not read case quantity for spice SKU '+sku+'; excluded from print.');continue}
const qty=Number(qtyMatch[1]);if(!Number.isFinite(qty)||qty<=0||qty>10000){warnings.push('Invalid case quantity for '+sku+'; excluded.');continue}
// Exclude table headers or metadata even if they contain a product SKU.
if(!/\b(?:case|cases)\b/i.test(line) && !line.includes(product.name||'')){
 warnings.push('Verify row for '+sku+': '+line.slice(0,90));
}
rows.push({sku,name:product.name||sku,qty,checked:true});
}if(!store&&candidateStore)store=candidateStore.replace(/\s+(?:FULL ORDER|PACKING LIST).*$/i,'').trim();}
if(!store||/^golden star|^full order|^packing list/i.test(store)){warnings.push('Store could not be confidently identified: enter it before printing.');store=''}
if(!seenCategory)warnings.push('No SPICES section was found. Only items explicitly marked as spices in the current Supabase catalog were included.');
return {store,rows,warnings}}
function render(){const s=state;$('spicepdf-review').hidden=false;$('spicepdf-store').innerHTML=`Store: <input id="spicepdf-store-edit" value="${esc(s.store)}" placeholder="Enter store name (required)" style="max-width:75%;padding:9px;border:1px solid #b8c9bd;border-radius:8px">`;
$('spicepdf-warnings').innerHTML=s.warnings.length?`<div class="spicepdf-warning">${s.warnings.map(w=>'<div>⚠ '+esc(w)+'</div>').join('')}</div>`:'';
$('spicepdf-lines').innerHTML=s.rows.length?`<table><thead><tr><th>Include</th><th>SKU</th><th>Spice item</th><th>Cases</th></tr></thead><tbody>${s.rows.map((r,i)=>`<tr><td><input type="checkbox" data-spice-select="${i}" checked></td><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td><input type="number" min="0.01" step="0.01" value="${r.qty}" data-spice-qty="${i}" style="max-width:90px;padding:8px"></td></tr>`).join('')}</tbody></table>`:'<div class="spicepdf-warning">No confirmed spice lines found. Check whether the PDF contains selectable text and whether spices are correctly categorized in the Admin Portal.</div>';
$('spicepdf-print').disabled=!s.rows.length;status(`Read ${s.rows.length} spice line(s). Review the store and quantities before printing.`)}
async function read(file){if(!file)return;if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))return status('Choose a PDF file.');if(file.size>15*1024*1024)return status('File too large. Maximum 15 MB.');$('spicepdf-review').hidden=true;status('Reading '+file.name+'…');try{const lib=await loadPdf();const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;if(doc.numPages>25)throw Error('PDF must be 25 pages or fewer');const pages=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);pages.push(pageLines(await p.getTextContent()))}const products=await catalog();state=extract(pages,products);if(!pages.some(lines=>lines.some(l=>/\b(?:Cases|SKU|SPICES)\b/i.test(l))))throw Error('No extractable packing-list text. For scanned images, request a text-based PDF.');render()}catch(e){status('Could not read PDF: '+e.message)}}
$('spicepdf-file').addEventListener('change',e=>read(e.target.files[0]));const drop=$('spicepdf-drop');drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('spicepdf-file').click()}});for(const event of ['dragover','dragenter'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag')});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag')});drop.addEventListener('drop',e=>read(e.dataTransfer.files[0]));
$('spicepdf-reset').onclick=()=>{state={store:'',rows:[],warnings:[]};$('spicepdf-file').value='';$('spicepdf-review').hidden=true;status('Cleared. No data was saved.')};
$('spicepdf-print').onclick=()=>{const store=$('spicepdf-store-edit').value.trim();if(!store)return alert('Enter or confirm the store name before printing.');const selected=state.rows.map((r,i)=>({...r,enabled:document.querySelector(`[data-spice-select="${i}"]`)?.checked,qty:Number(document.querySelector(`[data-spice-qty="${i}"]`)?.value)})).filter(r=>r.enabled);if(!selected.length)return alert('Select at least one spice.');if(selected.some(r=>!Number.isFinite(r.qty)||r.qty<=0||r.qty>10000))return alert('Check every selected case quantity.');const w=window.open('','_blank');if(!w)return alert('Allow popups for the Packing Desk to print the sheet.');w.document.open();w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(store)} - Spices</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px}h1{font-size:28px}h2{font-size:17px}table{width:100%;border-collapse:collapse}td,th{padding:12px 8px;border-bottom:1px solid #bbb;text-align:left}th{background:#e9f1ed}td:last-child,th:last-child{text-align:right;font-weight:bold}.box{display:inline-block;width:18px;height:18px;border:2px solid #555;margin-right:8px;vertical-align:middle}@page{size:auto;margin:15mm}@media print{button{display:none}}</style></head><body><h1>${esc(store)}</h1><h2>SPICE PICKING SHEET</h2><table><thead><tr><th>Packed</th><th>SKU</th><th>Spice product</th><th>Cases</th></tr></thead><tbody>${selected.map(r=>`<tr><td><span class="box"></span></td><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td>${r.qty}</td></tr>`).join('')}</tbody></table><p>Verify picked quantities against original salesman PDF.</p><button onclick="print()">Print</button></body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),250)};
})();
