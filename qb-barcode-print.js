(()=>{'use strict';
const $=id=>document.getElementById(id), status=$('qb-barcode-status'), docs=$('qb-barcode-docs');
let invoices=[];let pdfjsPromise, barcodePromise, excelPromise;
const load=(url,globalName)=>new Promise((resolve,reject)=>{if(window[globalName])return resolve(window[globalName]);const s=document.createElement('script');s.src=url;s.onload=()=>resolve(window[globalName]);s.onerror=()=>reject(Error('Could not load '+globalName+'. Check internet connection.'));document.head.appendChild(s)});
const pdfjs=()=>pdfjsPromise??=(load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib').then(lib=>{lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';return lib}).catch(e=>{pdfjsPromise=null;throw e}));
const barcodeLib=()=>barcodePromise??=load('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js','JsBarcode').catch(e=>{barcodePromise=null;throw e});
const excelLib=()=>excelPromise??=load('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js','ExcelJS').catch(e=>{excelPromise=null;throw e});
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=n=>'$'+Number(n||0).toFixed(2);
function extractLines(content){const rows=[];for(const item of content.items){const text=clean(item.str);if(!text)continue;const y=Math.round((item.transform?.[5]||0)*2)/2,x=item.transform?.[4]||0;let row=rows.find(r=>Math.abs(r.y-y)<2.8);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x,text});}return rows.sort((a,b)=>b.y-a.y).map(r=>({text:clean(r.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ')),cells:r.items}));}
function parseInvoice(pages,file){const lines=pages.flatMap(p=>p);const text=lines.map(l=>l.text);const whole=text.join('\n');
 const invoiceNo=whole.match(/Invoice\s*#\s*(\d+)/i)?.[1]||'';
 const date=whole.match(/\bDate\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]||'';
 const account=whole.match(/Acct\s*#\s*([^\n]+)/i)?.[1]?.split(/Terms|P\.O\./i)[0].trim()||'';
 const addressStart=text.findIndex(t=>/Ship\/Bill To/i.test(t));
 const ship=addressStart>=0?text.slice(addressStart+1,addressStart+5).filter(t=>!/^(?:Terms|P\.O\.|Phone #|Customer Fax #)/i.test(t)).map(t=>t.replace(/\s+(?:Terms|P\.O\. No\.).*$/i,'')).filter(Boolean):[];
 const items=[];
 // Process each PDF page independently. Continuation pages may repeat the table header,
 // omit it, or start directly with item rows. A footer on page 1 must never stop page 2.
 const rowRegex=/^\s*(\d+(?:\.\d+)?)\s+(\d{8,14})\s+(\d{3,10})\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)\s*$/;
 const headerRe=/\bQty\b.*\bBarcode\b.*\bItem Code\b/i;
 let parsedRowsByPage=[];
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
  const page=pages[pageIndex];let inTable=pageIndex>0;let stopped=false;let pageRows=0;
  for(const line of page){
   const value=line.text;
   if(headerRe.test(value)){inTable=true;stopped=false;continue;}
   if(!inTable||stopped)continue;
   if(/NOTICE TO RECEIVERS|Total Balance|Deliver\/Pick up By|^\s*Total\s*\$|^\s*Total\s*$/i.test(value)){
    stopped=true;continue;
   }
   const m=value.match(rowRegex);if(!m)continue;
   const [,q,barcode,sku,middle,price,amount]=m;
   const sorted=(line.cells||[]).slice().sort((a,b)=>a.x-b.x);
   const pX=sorted.find(c=>c.text===price)?.x??Infinity;
   const skuCell=sorted.find(c=>c.text===sku);
   let description='',name=middle;
   const middleCells=sorted.filter(c=>c.x>(skuCell?.x??-1)&&c.x<pX);
   const descCells=middleCells.filter(c=>c.x>=328);
   const nameCells=middleCells.filter(c=>c.x<328);
   if(descCells.length&&nameCells.length){name=clean(nameCells.map(c=>c.text).join(' '));description=clean(descCells.map(c=>c.text).join(' '));}
   else {const match=middle.match(/^(.*?)\s+((?:\d+\s*(?:ml|oz|g|kg|lb|L)\b|\d+\s*\/\s*case|\d+\s*per case).*)$/i);if(match){name=match[1];description=match[2];}}
   items.push({qty:q,barcode,sku,name,description,price,amount,page:pageIndex+1});pageRows++;
  }
  parsedRowsByPage.push(pageRows);
 }
 // QuickBooks renders the label and currency value as separate text spans.
 // Select the right-hand currency cell from the matching PDF row instead of assuming one text chunk.
 function moneyNextTo(label){
  for(const line of lines){const cells=line.cells||[];
   const mark=cells.find(c=>label.test(clean(c.text)));
   if(!mark)continue;
   const amounts=cells.filter(c=>c.x>mark.x+15).map(c=>clean(c.text).match(/^\$?([\d,]+\.\d{2})$/)?.[1]).filter(Boolean);
   if(amounts.length)return Number(amounts[amounts.length-1].replace(/,/g,''));
   const match=line.text.match(/\$([\d,]+\.\d{2})/);
   if(match)return Number(match[1].replace(/,/g,''));
  }
  return null;
 }
 const displayedTotal=moneyNextTo(/^Total$/i);
 const balance=moneyNextTo(/Total Balance/i);
 const receiver=whole.match(/NOTICE TO RECEIVERS:[\s\S]*?(?=\bTotal Balance|\bDeliver\/Pick up By)/i)?.[0]?.replace(/\bTotal\s+\$[\d,.]+/,'').replace(/\$[\d,.]+/g,'').replace(/\s+/g,' ').trim()||'';
 return {file,number:invoiceNo,date,account,ship,items,total:displayedTotal,balance,notice:receiver,pageCount:pages.length,parsedRowsByPage};
}
function barcodeType(value){
 const digits=String(value||'').trim();
 if(!/^\d+$/.test(digits))return null;
 let payload,format;
 if(digits.length===12){payload=digits;format='UPC';}
 else if(digits.length===13){payload=digits;format='EAN13';}
 else if(digits.length===14&&digits.startsWith('00')){payload=digits.slice(2);format='UPC';}
 else if(digits.length===14&&digits.startsWith('0')){payload=digits.slice(1);format='EAN13';}
 else return null;
 const arr=payload.split('').map(Number);
 const check=(10-(arr.slice(0,-1).reduce((sum,d,i)=>sum+d*(((arr.length-2-i)%2===0)?3:1),0)%10))%10;
 if(check!==arr[arr.length-1])return null;
 return {format,payload,original:digits};
}
function invoiceTotal(doc){return Math.round(doc.items.reduce((sum,r)=>sum+Number(r.qty||0)*Number(r.price||0),0)*100)/100;}
function problems(){const out=[];for(const doc of invoices){if(!doc.number)out.push(doc.file+': invoice number not detected');if(!doc.items.length)out.push(doc.file+': no rows detected; verify QuickBooks PDF format');if(doc.pageCount>1)for(let p=0;p<doc.pageCount;p++){if(doc.parsedRowsByPage[p]===0)out.push(doc.file+': page '+(p+1)+' has no recognized item rows; check it before exporting');}for(const [i,r] of doc.items.entries()){
 if(!barcodeType(r.barcode))out.push(doc.file+' row '+(i+1)+': barcode is not a valid UPC-A or EAN-13 (including zero-padded GTIN); verify exact digits/check digit');
 if(!(Number(r.qty)>0)||!Number.isFinite(Number(r.price)))out.push(doc.file+' row '+(i+1)+': invalid quantity or price');
 if(Math.abs(Number(r.qty)*Number(r.price)-Number(r.amount))>.011)out.push(doc.file+' row '+(i+1)+': source line amount differs from quantity × unit price');}
 const sum=invoiceTotal(doc);
 if(doc.total!==null&&Math.abs(sum-doc.total)>.011)out.push(doc.file+': printed total '+currency(doc.total)+' differs from rows '+currency(sum));
 // Total Balance can be account-wide outstanding balance, not this invoice total; display separately without blocking.
 }
 return out;
}
function sync(){const warnings=problems(),confirmed=$('qb-barcode-confirm').checked; $('qb-barcode-errors').textContent=warnings.join('\n'); $('qb-barcode-print').disabled=!confirmed||warnings.length>0;$('qb-barcode-excel').disabled=!confirmed||warnings.length>0;}
function render(){const outer=$('qb-barcode-review');outer.hidden=!invoices.length;$('qb-barcode-confirm').checked=false;docs.replaceChildren();for(const [index,doc] of invoices.entries()){
 const panel=document.createElement('div');panel.className='qbiif-panel';panel.style='border:1px solid #d4e0dd;border-radius:12px;padding:12px;margin:12px 0;background:#fff';
 panel.innerHTML=`<strong>Invoice ${esc(doc.number||'UNKNOWN')} · ${esc(doc.file)}</strong><p class="fineprint">${esc(doc.ship.join(' · '))} · ${esc(doc.date)} · ${doc.items.length} lines across ${doc.pageCount} page(s)</p><div style="overflow-x:auto"><table class="qbiif-table" style="width:100%"><thead><tr><th>Qty</th><th>Barcode digits</th><th>SKU</th><th>Item / Description</th><th>Price</th><th>Amount</th></tr></thead><tbody></tbody></table></div><p class="fineprint">Invoice total: ${currency(invoiceTotal(doc))} · QuickBooks invoice total: ${doc.total==null?'not found':currency(doc.total)} · Total Balance: ${doc.balance==null?'not found':currency(doc.balance)}</p>`;
 const tbody=panel.querySelector('tbody');for(const [j,r] of doc.items.entries()){
 const tr=document.createElement('tr');for(const [field,width] of [['qty','75px'],['barcode','150px'],['sku','90px'],['name','200px'],['price','100px'],['amount','100px']]){
 const td=document.createElement('td');if(field==='name'){const inp=document.createElement('input');inp.value=r.name;inp.style='min-width:170px;width:100%';inp.setAttribute('aria-label','Item name');inp.addEventListener('input',()=>r.name=inp.value);td.append(inp);const sub=document.createElement('input');sub.value=r.description;sub.placeholder='Description';sub.style='min-width:170px;width:100%';sub.addEventListener('input',()=>r.description=sub.value);td.append(sub);}
 else {const inp=document.createElement('input');inp.value=r[field];inp.style='width:'+width+';max-width:100%';inp.setAttribute('aria-label',field+' row '+(j+1));inp.addEventListener('input',()=>{r[field]=inp.value;sync()});td.append(inp);}tr.append(td)}tbody.append(tr)}docs.append(panel)}sync();}
async function importFiles(files){if(!files.length)return;invoices=[];status.textContent='Reading '+files.length+' PDF(s)…';try{const pdf=await pdfjs();for(const f of files){if(f.size>15*1024*1024||!(/\.pdf$/i.test(f.name)||f.type==='application/pdf'))throw Error(f.name+' is not a PDF under 15 MB');const document=await pdf.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];if(document.numPages>50)throw Error('Maximum 50 pages per file');for(let p=1;p<=document.numPages;p++)pages.push(extractLines(await(await document.getPage(p)).getTextContent()));const d=parseInvoice(pages,f.name);invoices.push(d)}status.textContent=invoices.length+' invoice PDF(s), '+invoices.reduce((n,d)=>n+d.pageCount,0)+' source pages, '+invoices.reduce((n,d)=>n+d.items.length,0)+' item rows loaded. Check page counts and rows before printing.';render();}catch(e){status.textContent='Import failed: '+e.message;render();}}
function svgFor(r){const type=barcodeType(r.barcode);if(!type)throw Error('Invalid retail barcode: '+r.barcode);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');window.JsBarcode(svg,type.payload,{format:type.format,displayValue:true,fontSize:11,textMargin:2,width:1.2,height:40,margin:5});return new XMLSerializer().serializeToString(svg);}
function printHtml(){const css=`@page{size:letter;margin:0.35in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#222;margin:0;font-size:10pt}.invoice{break-after:page;page-break-after:always}.invoice:last-child{break-after:auto;page-break-after:auto}.head{display:flex;justify-content:space-between;gap:30px;border-bottom:2px solid #26374a;padding-bottom:12px}.head img{height:48px;max-width:180px;object-fit:contain}.title{font-size:24pt;font-weight:800;text-align:right}.block{display:flex;justify-content:space-between;margin:12px 0 20px;gap:20px}.small{font-size:9pt;line-height:1.5}.list{width:100%;border-collapse:collapse;table-layout:fixed}.list th{background:#dfe5e9}.list td,.list th{border:1px solid #9ea9b2;padding:5px 4px;vertical-align:middle}.list th:nth-child(1){width:7%}.list th:nth-child(2){width:28%}.list th:nth-child(3){width:31%}.list th:nth-child(4){width:11%}.list th:nth-child(5){width:11%}.list th:nth-child(6){width:12%}.list td svg{display:block;width:100%;height:49px}.qty{text-align:center;font-size:16pt;font-weight:700}.num{text-align:right}.summary{display:flex;justify-content:flex-end;padding:12px 0;font-size:14pt;font-weight:bold}.notice{margin-top:18px;background:#fff7bf;border:1px solid #dec955;padding:8px;font-size:8.5pt;line-height:1.4}.footer{margin-top:16px;border-top:1px solid #999;padding:8px 0}@media print{button{display:none}}`;
 const pages=invoices.map(doc=>`<article class="invoice"><div class="head"><div><img src="${new URL('golden-star-logo-clear.png',location.href)}"><div class="small">Golden Star Wholesale, Inc.<br>1400 Axtell Dr · Troy, MI 48084<br>(248) 577-5080</div></div><div><div class="title">Invoice</div><div class="small">Invoice # <strong>${esc(doc.number)}</strong><br>Date: ${esc(doc.date)}<br>Account: ${esc(doc.account)}</div></div></div><div class="block"><div><b>Ship / Bill To</b><br>${doc.ship.map(esc).join('<br>')}</div><div class="small">Please verify invoice details against QuickBooks.</div></div><table class="list"><thead><tr><th>Qty</th><th>Scan barcode</th><th>Item code / Description</th><th>Price Ea.</th><th>Amount</th><th>Pick</th></tr></thead><tbody>${doc.items.map(r=>`<tr><td class="qty">${esc(r.qty)}</td><td>${svgFor(r)}</td><td><b>${esc(r.sku)} ${esc(r.name)}</b><br>${esc(r.description)}</td><td class="num">${currency(r.price)}</td><td class="num">${currency(r.amount)}</td><td></td></tr>`).join('')}</tbody></table><div class="summary">Invoice Total: ${currency(invoiceTotal(doc))}</div>${doc.notice?`<div class="notice">${esc(doc.notice)}</div>`:''}<div class="footer">Deliver / Pick up By: ____________________________</div></article>`).join('');return '<!doctype html><html><head><meta charset="utf-8"><title>Golden Star Scannable Invoices</title><style>'+css+'</style></head><body>'+pages+'</body></html>';}
async function doPrint(){if($('qb-barcode-print').disabled)return;try{await barcodeLib();const frame=document.createElement('iframe');frame.style='position:fixed;top:-9999px;left:-9999px;width:850px;height:1100px';frame.setAttribute('title','Barcode invoice print');document.body.append(frame);const html=printHtml();frame.contentDocument.open();frame.contentDocument.write(html);frame.contentDocument.close();await new Promise(r=>setTimeout(r,650));frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),30000);}catch(e){status.textContent='Print failed: '+e.message;}}
async function excelDownload(){if($('qb-barcode-excel').disabled)return;try{status.textContent='Building Excel with embedded barcode images…';await barcodeLib();const ExcelJS=await excelLib();const wb=new ExcelJS.Workbook();for(const doc of invoices){const sh=wb.addWorksheet(('Invoice '+(doc.number||'Unknown')).slice(0,31),{pageSetup:{paperSize:1,orientation:'portrait',fitToPage:true,fitToWidth:1}});sh.columns=[{width:8},{width:27},{width:10},{width:28},{width:13},{width:13}];sh.mergeCells('A1:F1');sh.getCell('A1').value='GOLDEN STAR WHOLESALE · SCANNABLE INVOICE';sh.getCell('A1').font={bold:true,size:16};sh.mergeCells('A2:F2');sh.getCell('A2').value='Invoice # '+doc.number+'  |  Date '+doc.date+'  |  '+doc.ship.join(' · ');sh.getRow(4).values=['Qty','Barcode','SKU','Item / Description','Price','Amount'];sh.getRow(4).font={bold:true};for(const r of doc.items){const index=sh.rowCount+1;sh.getRow(index).values=[Number(r.qty),'',r.sku,r.name+(r.description?' · '+r.description:''),Number(r.price),Number(r.amount)];sh.getRow(index).height=49;sh.getCell('E'+index).numFmt='$#,##0.00';sh.getCell('F'+index).numFmt='$#,##0.00';const svg=svgFor(r),canvas=document.createElement('canvas');canvas.width=450;canvas.height=110;const ctx=canvas.getContext('2d');const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});ctx.fillStyle='#fff';ctx.fillRect(0,0,450,110);ctx.drawImage(img,0,0,450,110);const id=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});sh.addImage(id,{tl:{col:1.03,row:index-1+.1},ext:{width:180,height:44}});}const totalRow=sh.rowCount+2;sh.getCell('E'+totalRow).value='TOTAL';sh.getCell('F'+totalRow).value=invoiceTotal(doc);sh.getCell('F'+totalRow).numFmt='$#,##0.00';sh.printArea='A1:F'+totalRow;}const bytes=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='Golden_Star_Scannable_Invoices.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status.textContent='Excel downloaded with real barcode images embedded.';}catch(e){status.textContent='Excel export failed: '+e.message;console.error(e)}}
const input=$('qb-barcode-files');input.addEventListener('change',()=>importFiles([...input.files]));const drop=$('qb-barcode-drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.style.background='#e7f7ec'});drop.addEventListener('dragleave',()=>drop.style.background='');drop.addEventListener('drop',e=>{e.preventDefault();drop.style.background='';importFiles([...e.dataTransfer.files])});drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});$('qb-barcode-confirm').addEventListener('change',sync);$('qb-barcode-print').addEventListener('click',doPrint);$('qb-barcode-excel').addEventListener('click',excelDownload);$('qb-barcode-clear').addEventListener('click',()=>{invoices=[];input.value='';status.textContent='Cleared. No QuickBooks records were changed.';render()});
})();
