(()=>{'use strict';
const $=id=>document.getElementById(id),state={rows:[],invoice:'',store:'',source:''};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status=s=>$('pdfStatus').textContent=s;
const norm=s=>String(s||'').replace(/[^0-9]/g,'').replace(/^0+/,'')||'0';
let loader;
function loadPDF(){if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);if(!loader)loader=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';el.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(pdfjsLib)};el.onerror=()=>reject(Error('PDF reader could not load. Check internet connection.'));document.head.append(el)});return loader}
function parsePage(items){
// Extract positioned PDF text rather than depending on inconsistent reading order.
const lines=[];for(const it of items){const t=String(it.str||'').trim();if(!t)continue;const x=it.transform[4],y=it.transform[5];let line=lines.find(z=>Math.abs(z.y-y)<3);if(!line){line={y,parts:[]};lines.push(line)}line.parts.push({x,t})}
lines.sort((a,b)=>b.y-a.y);for(const line of lines)line.parts.sort((a,b)=>a.x-b.x);
const full=lines.map(l=>l.parts.map(p=>p.t).join(' ')).join('\n');
const invoice=(full.match(/Invoice\s*#\s*([0-9]{3,})/i)||[])[1]||'';
const ship=(full.match(/(?:Ship\/Bill To|Ship To)[\s\S]*?\n([^\n]+)/i)||[])[1]||'';
const rows=[];
for(const line of lines){const cells=line.parts;const qtyCell=cells.filter(v=>v.x<78).map(v=>v.t).join(' ').trim();const barcodeCell=cells.filter(v=>v.x>=78&&v.x<161).map(v=>v.t).join('').replace(/\s/g,'');const description=cells.filter(v=>v.x>=161&&v.x<470).map(v=>v.t).join(' ').trim();const m=description.match(/^(\d{3,8}[A-Za-z]?)\s+(.+)$/);if(!m||!/^\d+(?:\.\d+)?$/.test(qtyCell))continue;const qty=Number(qtyCell);if(!(qty>0&&qty<100000))continue;rows.push({sku:m[1],description:m[2],barcode:/^\d{8,14}$/.test(barcodeCell)?barcodeCell:'',qty});
}
return {invoice,ship,rows};
}
function matches(r){const all=window.gsVisualImportAccess?.products()||[];const skuMatches=all.filter(p=>String(p.sku||'').trim().toUpperCase()===r.sku.toUpperCase());const barcodeMatches=r.barcode?all.filter(p=>p.gtin&&norm(p.gtin)===norm(r.barcode)):[];
// Conflicting barcode/SKU or duplicated SKU means manual review, never an automatic guess.
if(skuMatches.length===1){const p=skuMatches[0];if(barcodeMatches.length&& !barcodeMatches.some(x=>x.id===p.id))return {error:'SKU/barcode conflict'};return {product:p}}
if(skuMatches.length>1){if(barcodeMatches.length===1&&skuMatches.some(x=>x.id===barcodeMatches[0].id))return {product:barcodeMatches[0]};return {error:'Duplicate SKU — review manually'}}
if(barcodeMatches.length===1)return {product:barcodeMatches[0]};
if(barcodeMatches.length>1)return {error:'Duplicate barcode — review manually'};return {error:'No exact SKU or barcode match'};
}
function preview(){let ok=0;const rows=state.rows.map((r,i)=>{const m=matches(r);r.product=m.product||null;r.error=m.error||'';if(r.product)ok++;return `<tr class="${r.product?'matched':'unmatched'}"><td>${esc(r.sku)}</td><td>${esc(r.description)}</td><td>${esc(r.qty)}</td><td>${r.product?esc(r.product.name):esc(r.error)}</td><td><input aria-label="Import row ${i+1}" type="checkbox" data-import-row="${i}" ${r.product?'checked':'disabled'}></td></tr>`}).join('');$('pdfRows').innerHTML=`<table><thead><tr><th>Invoice SKU</th><th>Invoice description</th><th>Cases</th><th>Matched catalog product / issue</th><th>Add</th></tr></thead><tbody>${rows}</tbody></table>`;$('pdfSummary').textContent=`Invoice ${state.invoice||'(number not found)'} · ${state.store||'Store not identified'} · ${ok} of ${state.rows.length} product rows matched. Select the verified items to add; unmatched rows need manual entry.`;$('pdfAdd').disabled=!ok;$('pdfReview').hidden=false}
async function read(file){if(!file)return;if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')return status('Please choose a PDF.');if(file.size>15*1024*1024)return status('The PDF must be 15 MB or smaller.');if(!$('workspace')||$('workspace').hidden)return status('Sign in to the Visual Order Builder first.');status('Reading '+file.name+'…');$('pdfReview').hidden=true;try{const pdfjs=await loadPDF();const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data}).promise;if(pdf.numPages>20)throw Error('Please use invoices of 20 pages or fewer.');let all=[];let invoice='',store='';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const result=parsePage((await pg.getTextContent()).items);all.push(...result.rows);invoice ||=result.invoice;store ||=result.ship}if(!all.length)throw Error('No invoice item rows could be read. Scanned PDFs without selectable text are not supported yet.');state.rows=all;state.invoice=invoice;state.store=store;state.source=file.name;preview();status('Review the matched products and quantities before adding them.')}catch(e){status('Cannot import: '+e.message)}}
$('pdfDrop').addEventListener('click',()=>$('pdfFile').click());$('pdfDrop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('pdfFile').click()}});$('pdfFile').addEventListener('change',e=>read(e.target.files[0]));
for(const kind of ['dragenter','dragover'])$('pdfDrop').addEventListener(kind,e=>{e.preventDefault();$('pdfDrop').classList.add('drag')});
for(const kind of ['dragleave','drop'])$('pdfDrop').addEventListener(kind,e=>{e.preventDefault();$('pdfDrop').classList.remove('drag')});
$('pdfDrop').addEventListener('drop',e=>read(e.dataTransfer.files[0]));
$('pdfCancel').onclick=()=>{$('pdfReview').hidden=true;state.rows=[];status('PDF preview discarded. No items added.')};
$('pdfAdd').onclick=()=>{const selected=[...document.querySelectorAll('[data-import-row]:checked')].map(el=>state.rows[Number(el.dataset.importRow)]).filter(r=>r.product);if(!selected.length)return status('Select at least one matched item.');window.gsVisualImportAccess.add(selected.map(r=>({product:r.product,qty:r.qty})));status(`Added ${selected.length} invoice lines to the visual order. Verify the store and check quantities before printing.`);$('pdfReview').hidden=true;document.querySelector('#basket')?.scrollIntoView({behavior:'smooth',block:'center'})};
})();
