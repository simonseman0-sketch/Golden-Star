'use strict';
let catalog=[],orders=[],selected=0,view='all';
const $=id=>document.getElementById(id), escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
// The spices employee receives only loose, fractional-case bulk-pick lines,
// not packaged dry goods such as 10lb bulgur, rice, or vermicelli.
// The category "Bulk & Spices" alone is NOT sufficient to put an item on this slip.
const looseBulkNames=/^(?:bulgur|habia|green lentil|red lentil|white beans|dry chickpeas|slivered almond|dried apricot|sumac|citric acid|golden raisins|dry (?:yellow|black) lemon|card[ao]mom|sesame seed|semolina|coconut|bay leaves|cream of rice|seven spices|nine spices|shish tawook|curry|fish(?: spice)?|black eyed peas|golden raisins|dry yellow lemon|dried black lemon|cardamom|spices?)/i;
const packagedBulk=/\b(?:10\s*lb|10lb|4\s*lb|4lb|37\s*lb|37lb|500\s*g|500g|900\s*g|900g|200\s*g|200g|1600|plastic|glass|can|bottle|bag)\b/i;
const isSpice=p=>{
 const name=String(p.en||'');
 const q=String(p.qty||'').trim();
 // These are the loose quantities from the salesman's dedicated spice section.
 const loose=/^(?:0?\.(?:25|5|50|75)|0\.25|0\.50|0\.5|0\.75)$/.test(q);
 return loose && !packagedBulk.test(name) && (looseBulkNames.test(name) || p.category==='Bulk & Spices');
};
const spiceItem=i=>isSpice({category:i.category,en:i.name,qty:i.qty});
const synonyms={'kubba mousl':'kubba mosul','kibbie krass':'kibbie krass','kibbie krasss':'kibbie krass','black eyed peas':'black eyed peas','green lentil':'green lentils','ready meals beef shawarma':'ready meals beef shawarma','ready meals chicken shawarma':'ready meals chicken shawarma','can mango juice':'can juice mango','fresh cucumber pickles 1600':'fresh cucumbers pickles 1600','fresh cucumber pickles 600':'fresh cucumbers pickles 600','fava beans iraq':'fave beans iraq','balck eyed peas':'black eyed peas','cardamom whole':'cardomom whole','alrref honey bear':'alreef honey bear','hummus tahini':'hummus tahini','oil 3l':'oil 3l','kubba riec':'kubba rice','mcdous 600':'mackdous 600','mcdous':'mackdous 600','kibbie halab':'kibbie halab','cardomom whole':'cardamom whole','can chickpeas':'can chickpeas','can chickpea':'can chickpeas','small can large beans beans':'small can large broad beans','fresh mixed pickles 1600':'fresh mixed pickles 1600','tea cardomom 400':'tea cardamom 400','falih abu amba mild plastic':'falih abu amba mild plastic' };
function key(s){let n=norm(s).replace(/\bgrams?\b/g,'g').replace(/\bounces?\b/g,'oz');return synonyms[n]||n}
function getName(line){return line.replace(/^\s*\d{4,5}\s+/, '').trim()}
function skuOf(line){return /^\s*(\d{4,5})\s+/.exec(line)?.[1]||''}
function qtyLine(line){
 let s=line.trim();
 // Double-dot / ellipsis followed by 5 means five full cases, not half a case.
 let five=s.match(/^(.+?)(?:\.{2,}|…+|·+)\s*5\s*$/);
 if(five)return {name:five[1].trim(),qty:"5",issue:""};
 // Fractional quantities are CASES; recognize attached forms (sumac0.5),
 // spaced forms (sumac .5), and dotted forms (sumac..0.5) BEFORE integer parsing.
 let m=s.match(/^(.+?)(?:\s*[.·…]+\s*|\s*?)(0?\.(?:25|5|50|75)|0\.25|0\.50|0\.5|0\.75)\s*$/i);
 if(m && /[a-zA-Z]\s*$/.test(m[1])){
   let q=String(Number(m[2]));
   return {name:m[1].replace(/[.·…\s]+$/g,'').trim(),qty:q,issue:''};
 }
 // The salesman's shorthand 025 represents 0.25 case.
 m=s.match(/^(.+?[a-zA-Z])\s*[.·…\s]+025\s*$/i);
 if(m)return {name:m[1].trim(),qty:'0.25',issue:''};
 m=s.match(/(?:\s*[.·…]+\s*|\s+)(\d+(?:\.\d+)?\s*(?:\+\s*\d+)?\s*(?:master\s*bags?|p|pcs?|stickers?)?)\s*$/i);
 if(!m)return {name:s,qty:'',issue:'Missing quantity'};
 let qty=m[1].trim();let name=s.slice(0,m.index).replace(/[.·…\s]+$/g,'').trim();
 if(!name)return {name:s,qty:'',issue:'Missing product'};
 return {name,qty,issue:''};
}
const fractionalCase=q=>/^(?:0?\.(?:25|5|50|75)|0\.25|0\.5|0\.50|0\.75)$/.test(String(q).trim());
const displayQty=q=>fractionalCase(q)?`${Number(q)} case / ${Number(q)} كرتون`:q;

function looksLikeAddress(s){return /\b\d{3,6}\s+[NSEW]?\s*\w+.*\b(rd|road|st|street|mile|dr|drive|ave|avenue|blvd|hwy|highway|ford|groesbeck|haggerty)\b/i.test(s)||/\b(MI|Michigan)\s+\d{5}\b/i.test(s)}
function looksHeader(s,next=''){return /^(?:\d{1,2}-)?\s*(?:#?meijer\s*#?\s*\d+|#?kroger\s*#?\s*\d+|\d{3}\s+kroger\b|kroger\s*#?\s*\d+|holiday market\b|fresh thyme\b|nino\b|[a-z ]+\s+market\b)/i.test(s)||(!/\d.*\./.test(s)&&looksLikeAddress(next)&&s.length<65&&!looksLikeAddress(s))}
// Remove WhatsApp timestamps and sender names from headers before parsing.
// Do not change any product line, SKU, quantity, or invoice separator.
function cleanWhatsAppLine(line){
 let s=String(line||'').trim();
 s=s.replace(/^\[\s*(?:(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*,\s*\d{1,2}\/\d{1,2}\/\d{2,4})|(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s*,\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?))\s*\]\s*[^:]*:\s*/i,'');
 s=s.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*[-–]\s*[^:]+:\s*/i,'');
 return s.trim();
}
function parse(raw){
 let lines=raw.replace(/\r/g,'').split('\n').map(cleanWhatsAppLine),stores=[],current=null,started=false,pendingBreak=false;
 for(let idx=0;idx<lines.length;idx++){
  let l=lines[idx].trim();
  if(!l||/^[.·…\s]+$/.test(l)){
   // Preserve intentional visual splits only AFTER the first product.
   // Consecutive empty/dot-only lines represent ONE invoice boundary.
   if(current&&started)pendingBreak=true;
   continue;
  }
  if(looksHeader(l,(lines[idx+1]||'').trim())){
   current={name:l.replace(/^\d{1,2}-/,'').replace(/[🔴🟠🟢🟤]/gu,'').trim(),info:[],items:[],other:[],notes:[],id:stores.length};
   stores.push(current);started=false;pendingBreak=false;continue;
  }
  if(!current){current={name:'Order '+(stores.length+1),info:[],items:[],other:[],notes:[],id:stores.length};stores.push(current)}
  if(looksLikeAddress(l)||/^tomorrow$|^friday$|^today$|^monday$|^tuesday$|^wednesday$|^thursday$|^saturday$|^sunday$/i.test(l)||/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(l)||/^\+?1?\d[\d ()-]{8,}$/.test(l)){
   current.info.push(l);continue;
  }
  let itemNote='';
  let productLine=l.replace(/\s+(stickers?)\s*$/i,(_m,word)=>{itemNote='PUT STICKER / حط ستيكر';return ''}).trim();
  let parsed=qtyLine(productLine);
  if(!parsed.qty&&!started){current.info.push(l);continue}
  if(!parsed.qty && /(?:shelf|rack|display|endcap|fixture|stand|signage|\bft\b|\bfeet\b|\bfoot\b|please|remember|include|bring|deliver|note\s*:)/i.test(l)){current.notes.push(l);continue}
  let last=current.items.at(-1);
  let group=(last?.group||1)+(pendingBreak&&last?1:0);
  let item=identify(parsed.name,parsed.qty||'',l);
  item.group=group;item.note=itemNote;
  if(!parsed.qty)item.issues.push('No recognizable quantity — check original line');
  current.items.push(item);started=true;pendingBreak=false;
 }
 stores.forEach(store=>{let seen=new Map();for(let item of store.items){let k=key(item.name);if(seen.has(k)){item.issues.push('Duplicate line: check if intentional');seen.get(k).issues.push('Duplicate line: check if intentional')}else seen.set(k,item)}});
 return stores.filter(s=>s.items.length||s.info.length||s.other.length||s.notes.length)
}
function groupRows(items,rowFn){let last=null;return items.map(it=>{let divider=it.group!==last?`<tr class="invoice-break"><td colspan="5">INVOICE SECTION ${it.group} <span>Keep separate for invoicing</span></td></tr>`:'';last=it.group;return divider+rowFn(it)}).join('')}

function identify(name,qty,raw){let sku=skuOf(name),clean=getName(name),k=key(clean),issues=[],p=null;
 if(sku){let matches=catalog.filter(x=>x.sku===sku);if(matches.length===1){p=matches[0];if(k!==key(p.en)&&!k.includes(key(p.en))&&!key(p.en).includes(k)){issues.push('SKU / item description disagree — verify product');p=null}}else if(matches.length>1)issues.push('SKU matches multiple products — verify');else issues.push('SKU not in dictionary')}
 if(!p){let matches=catalog.filter(x=>key(x.en)===k);if(matches.length===1)p=matches[0];else if(matches.length>1)issues.push('Multiple exact products — verify')}
 if(!p){let matches=catalog.filter(x=>k.length>5&&((key(x.en).startsWith(k)&&key(x.en).length-k.length<=5)||(k.startsWith(key(x.en))&&k.length-key(x.en).length<=5)));if(matches.length===1){issues.push('Approximate name match — verify');p=matches[0]}}
 if(!p)issues.push('Unknown or ambiguous product — enter Arabic or verify dictionary item');
 if(k==='falafel' && /^(?:0\.25|0\.5|0\.50|0\.75)$/.test(qty)){issues.push('Falafel could mean frozen product or bulk spice mix — verify department');p=null}if(p?.notes?.includes('requires staff approval'))issues.push('New product translation — verify Arabic');if(!qty)issues.push('Missing quantity');if(/^\d+\s*\+\s*\d+$/.test(qty))issues.push('Confirm + quantity: bonus/free goods?');// Fractional quantities (0.25, 0.5, 0.75) are established fractions of a CASE.if(/sticker/i.test(qty))issues.push('Sticker instruction: confirm product quantity');
 return {id:Math.random().toString(36).slice(2),raw,name:clean,sku:sku||(p?.sku||''),qty,ar:p?.ar||'',catalogId:p?.id??null,category:p?.category||'',issues:[...new Set(issues)],approved:false,manual:false};
}
function loadAddedProducts(){try{let saved=JSON.parse(localStorage.getItem('gs-added-products')||'[]');if(Array.isArray(saved)){for(const p of saved){if(p && p.en && !catalog.some(x=>key(x.en)===key(p.en)&&String(x.sku||'')===String(p.sku||''))){catalog.push({...p,id:String(catalog.length),notes:p.notes||'Added by staff — verify Arabic'});}}}}catch(e){console.warn('Could not read saved products',e)}}
function saveAddedProducts(){let base=Number(sessionStorage.getItem('gs-base-count')||201);localStorage.setItem('gs-added-products',JSON.stringify(catalog.slice(base).filter(p=>p.notes?.includes('Added by staff')||p.notes?.includes('Restored product')).map(({sku,en,ar,category,notes})=>({sku,en,ar,category,notes}))))}
function loadDict(){try{let saved=JSON.parse(localStorage.getItem('gs-warehouse-dictionary')||'{}');catalog.forEach(p=>{if(Object.prototype.hasOwnProperty.call(saved,p.id))p.ar=saved[p.id]})}catch(e){}}
function saveDict(){localStorage.setItem('gs-warehouse-dictionary',JSON.stringify(Object.fromEntries(catalog.map(p=>[p.id,p.ar]))))}
function renderStats(){let items=orders.flatMap(o=>o.items),uncertain=items.filter(i=>i.issues.length&&!i.approved),spices=items.filter(i=>spiceItem(i));$('stats').innerHTML=[['Stores',orders.length],['Items',items.length],['Spice lines',spices.length],['Needs review',uncertain.length]].map(([l,n])=>l==='Needs review'?`<button type="button" class="stat statbutton ${view==='review'?'active':''}" id="reviewcount" title="Show only items needing review"><strong>${n}</strong><span>${l} ↗</span></button>`:`<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join('');$('alerts').innerHTML=uncertain.length?`<div class="warning">⚠ ${uncertain.length} item(s) need checking. Review orange-highlighted rows, correct the Arabic if needed, then check <b>Confirmed</b>. Printing is blocked for unconfirmed flagged lines unless you choose to print a clearly labeled draft.</div>`:'<div class="warning" style="background:#e9f4eb;color:#225936;border-color:#c7e5d0">✓ No unresolved product flags. Check final quantities before releasing to the warehouse.</div>'}
function renderTabs(){$('storetabs').innerHTML=orders.map((o,i)=>`<button class="storetab ${selected===i?'active':''}" data-store="${i}">${escapeHtml(o.name)}${o.items.some(x=>x.issues.length&&!x.approved)?'<small>Review</small>':''}</button>`).join('')}
function currentItems(){return orders[selected].items.filter(x=>view==='all'||(view==='review'?(x.issues.length&&!x.approved):spiceItem(x)))}
function renderStore(){let store=orders[selected],items=currentItems();$('storeview').innerHTML=`<div class="storetop"><div><h3>${escapeHtml(store.name)}</h3><div class="address">${escapeHtml(store.info.join('\n'))}</div></div><div class="tabactions"><button class="ghost" data-print="all">Print full slip</button><button class="ghost" data-print="spices">Print spices slip</button></div></div><div class="sectiontabs"><button class="${view==='all'?'active':''}" data-view="all">Full packing slip (${store.items.length})</button><button class="${view==='spices'?'active':''}" data-view="spices">Spices only (${store.items.filter(x=>spiceItem(x)).length})</button><button class="${view==='review'?'active':''}" data-view="review">Needs review (${store.items.filter(x=>x.issues.length&&!x.approved).length})</button></div><div class="ordernotes"><label for="notes-${store.id}"><b>Store notes / ملاحظات الطلب</b> — shelves, displays, delivery instructions</label><textarea id="notes-${store.id}" data-notes="${store.id}" rows="2" placeholder="e.g. 4ft shelf; include Dubai chocolate shelf">${escapeHtml(store.notes.join('\n'))}</textarea></div>${store.other.length?`<div class="warning">Unparsed notes: ${escapeHtml(store.other.join(' | '))}</div>`:''}${items.length?`<div style="overflow-x:auto"><table class="itemtable"><thead><tr><th>SKU</th><th>ENGLISH PRODUCT</th><th>QTY</th><th>ARABIC · EDIT IF NEEDED</th>${view==='review'?'<th>REVIEW</th>':''}</tr></thead><tbody>${groupRows(items,it=>`<tr class="${it.issues.length&&!it.approved?'flagged':''}"><td>${escapeHtml(it.sku)}</td><td><span class="en">${escapeHtml(it.raw)}</span>${view==='review'&&it.raw.trim()!==it.name.trim()?`<div class="small">Matched product: ${escapeHtml(it.name)}</div>`:''}${view==='review'&&it.issues.length?`<span class="flag">⚠ ${escapeHtml(it.issues.join(' · '))}</span>`:''}${it.note?`<div class="itemnote">⚑ ${escapeHtml(it.note)}</div>`:''}</td><td class="qty">${escapeHtml(displayQty(it.qty))}</td><td><input class="ar" lang="ar" dir="rtl" data-ar="${it.id}" value="${escapeHtml(it.ar)}" placeholder="اكتب الاسم بالعربي"></td>${view==='review'?'<td class="checkcell">':''}${it.issues.length&&view==='review'?`<div class="reviewcontrols"><label class="confirm"><input type="checkbox" data-check="${it.id}" ${it.approved?'checked':''}> ${it.proposalSubmitted?'Saved for everyone':'Confirm & save'}</label>${it.catalogId==null?`<button type="button" class="smallaction" data-new="${it.id}">＋ Add to dictionary</button><button type="button" class="smallaction" data-suggest="${it.id}">✦ Find saved Arabic</button><button type="button" class="smallaction translate-google" data-google="${it.id}" title="Suggest Arabic without opening another site or using an API key">✦ Translate Arabic here</button><label class="small">Department <select data-category="${it.id}">${productCategories.map(c=>`<option value="${escapeHtml(c)}" ${c===(it.category||'Other')?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label></div>`:''}</div>`:''}${view==='review'?'</td>':''}</tr>`)}</tbody></table></div>`:`<div class="empty">No ${view==='spices'?'spice':view==='review'?'unresolved':'product'} lines found in this store order.</div>`}<div class="printfooter">Product Arabic terms are drafts until verified by your team. Print only after review.</div>`;}
function render(){renderStats();renderTabs();if(orders.length)renderStore()}
function printSlips(which='all',allStores=false,draft=false,approvedOnly=false){let set=allStores?orders:[orders[selected]],list=set.map(store=>({store,items:store.items.filter(i=>(which==='all'||spiceItem(i))&&(!approvedOnly||(!i.issues.length||i.approved)))})).filter(o=>o.items.length);if(!list.length){alert(approvedOnly?'No approved spice items to print. Review unresolved spice lines first.':'No items in this section.');return}let flagged=list.flatMap(o=>o.items).filter(i=>i.issues.length&&!i.approved);if(flagged.length&&!draft){if(!confirm(`${flagged.length} flagged item(s) have not been confirmed. Press OK to print an UNVERIFIED DRAFT with warnings, or Cancel to review first.`))return;draft=true}
 let pages=list.map(({store,items})=>`<section class="page"><div class="heading"><div><h1>${escapeHtml(store.name)} ${draft?'<span class="draft">UNVERIFIED DRAFT</span>':''}</h1><div class="tiny">${which==='spices'?'SPICES PACKING SLIP':'WAREHOUSE PACKING SLIP'}</div></div><div class="date">${new Date().toLocaleDateString('en-US')}</div></div><p class="metadata">${escapeHtml(store.info.join(' · '))}</p>${store.notes.length?`<div class="printnotes"><b>STORE NOTES / ملاحظات:</b> ${escapeHtml(store.notes.join(' · '))}</div>`:''}<table><thead><tr><th>✓</th><th>SKU</th><th>English item</th><th>الاسم بالعربي</th><th>Qty / الكمية</th></tr></thead><tbody>${groupRows(items,it=>`<tr><td>□</td><td>${escapeHtml(it.sku)}</td><td>${escapeHtml(it.raw)}${it.note?`<small class="print-item-note">⚑ ${escapeHtml(it.note)}</small>`:''}</td><td class="ar">${escapeHtml(it.ar||'_________________')}</td><td class="qty">${escapeHtml(displayQty(it.qty))}</td></tr>`)}</tbody></table><div class="sign">Packed by: ____________________ &nbsp;&nbsp; Checked by: ____________________ &nbsp;&nbsp; Date: _____________</div></section>`).join('');
 let win=window.open('','_blank');if(!win){alert('Allow pop-ups to print, or try again.');return}win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Golden Star Packing Slips</title><style>@page{size:letter;margin:9mm}body{font-family:Arial,sans-serif;color:#162b20}.page{break-after:page}.heading{display:flex;justify-content:space-between;border-bottom:2px solid #155337;padding-bottom:5px;align-items:flex-end}.invoice-break td{background:#eaf1eb!important;color:#1b5034;font-weight:bold;border-top:2px solid #93b69e;padding:9px 6px}.invoice-break span{font-size:9px;color:#607a65;margin-left:14px}.tiny{color:#64746a;font-size:10px;letter-spacing:1.3px;margin-top:5px}h1{font-size:29px;margin:0 0 3px;line-height:1.12}.metadata{color:#4e5f53;font-size:11px;margin:5px 0 9px;line-height:1.4}.draft{color:#a5580b;border:1px solid #a5580b;font-size:10px;padding:4px 7px;vertical-align:middle}table{border-collapse:collapse;width:100%;font-size:12px}th{background:#eaf1eb;text-align:left;font-size:11px;padding:7px 5px}td{border-bottom:1px solid #d8e0d8;padding:6px 5px;vertical-align:top}td.ar{font-size:14px;direction:rtl;text-align:right;min-width:140px}.qty{font-weight:bold;white-space:nowrap}.canonical-name{color:#5c625e;font-style:italic}small{display:block;color:#a35d08;font-size:9px;margin-top:3px}.printnotes{border:2px solid #b47c20;padding:10px;margin:10px 0 14px;font-size:12px;white-space:pre-wrap}.print-item-note{font-weight:bold;color:#805100}.sign{border-top:1px solid #ccd7cf;padding-top:8px;margin-top:16px;font-size:11px}</style></head><body>${pages}</body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),400)}
function renderDictionary(){let k=norm($('productsearch').value);let matches=catalog.filter(p=>!k||norm(p.en).includes(k)||norm(p.ar).includes(k)||p.sku.includes(k));$('dictionary').innerHTML=matches.slice(0,200).map(p=>`<div class="dictrow"><div><b>${escapeHtml(p.en)}</b><div class="small">${escapeHtml(p.sku||'No SKU')} · ${escapeHtml(p.category)}</div></div><input dir="rtl" lang="ar" data-dict="${p.id}" value="${escapeHtml(p.ar)}"></div>`).join('')||'<p>No results</p>'}
let translationBatch=0;
async function suggestUnknowns(batch){
 const status=document.getElementById('translationstatus');
 const unknown=orders.flatMap(o=>o.items).filter(it=>it.catalogId==null && !it.ar?.trim() && !it.manual);
 if(!unknown.length){if(status)status.textContent='All product names have a dictionary translation or were entered manually.';return;}
 if(status)status.textContent=`Finding Arabic suggestions for ${unknown.length} new item(s)… First use downloads a free translation model.`;
 let done=0;
 const seen=new Map();
 for(const it of unknown){
  if(batch!==translationBatch)return;
  if(it.ar?.trim() || it.manual)continue;
  try{
   const id=key(it.name), suggestion=seen.has(id)?seen.get(id):await window.gsOfflineTranslate(it.name.trim(),message=>{if(status)status.textContent=message;});
   seen.set(id,suggestion);
   if(batch!==translationBatch)return;
   if(suggestion && !it.manual && !it.ar?.trim()){
    it.ar=suggestion;it.translationSuggested=true;
    const input=document.querySelector(`[data-ar="${it.id}"]`);
    if(input)input.value=suggestion;
   }
   done++;
   if(status)status.textContent=`Arabic suggestions: ${done}/${unknown.length}. Please verify every suggestion.`;
  }catch(err){
   if(status)status.textContent='Automatic translation unavailable ('+err.message+'). You can enter Arabic manually.';
   return;
  }
 }
 if(batch===translationBatch && status)status.textContent=`Suggested Arabic for ${done} unknown item(s). Review before saving to the shared dictionary.`;
}
async function init(){let res=await fetch('products.json');if(!res.ok)throw Error('Product dictionary unavailable');catalog=(await res.json()).map((p,i)=>({...p,id:String(i)}));sessionStorage.setItem('gs-base-count',String(catalog.length));loadAddedProducts();loadDict();initProductManager();shared.init();$('example').onclick=()=>{$('raw').value=`#Meijer 109🔴\n1703 Haggerty Rd\nCommerce Township, MI 48390\nTomorrow\n\nBlack can Turkish delight ..100\n…\nWafer pistachio..7\n…..\nCan juice mango ..2\nMarie cookies ..2\nSuper extra Nuts ..5\nVermicelli.3\nFresh turnip pickles sliced 1600..11\nLemon juice ..5 sticker\nOil 3L…15\n…\n11257 small dubai chocolate.1\n…..\n1138 Ready meals beef shawarma…2\n1140 ready meals tikka .1\n1136 ready meals ground beef .1\n1142 ready meals chicken biryani.2\n1139 ready meals chicken shawarma.1\n1122 Ground Beef .1\n1119 Potato chop .1\n1121 kibbie krass.1\n1120 kibbie halab..1\n1121 kibbie krass.1\n1165 Samosa beef..1\n1164 Samosas vegetable & mushrooms…1\n1166 samosa chicken.1\n1175 lahamajeen .1\n1129 Kubba special ..1`};$('convert').onclick=()=>{translationBatch++;orders=parse($('raw').value);if(!orders.length){alert('Paste at least one order.');return}selected=0;view='all';$('workspace').classList.remove('hidden');render();$('workspace').scrollIntoView({behavior:'smooth'});void suggestUnknowns(translationBatch)};$('stats').onclick=e=>{if(e.target.closest('#reviewcount')){let first=orders.findIndex(o=>o.items.some(i=>i.issues.length&&!i.approved));if(first<0){alert('Nothing needs review.');return}selected=first;view='review';render()}};$('storetabs').onclick=e=>{let btn=e.target.closest('[data-store]');if(btn){selected=Number(btn.dataset.store);view='all';render()}};$('storeview').onclick=async e=>{
 let newBtn=e.target.closest('[data-new]'),suggestBtn=e.target.closest('[data-suggest]'),googleBtn=e.target.closest('[data-google]');
 if(googleBtn){
  const it=orders[selected].items.find(i=>i.id===googleBtn.dataset.google);
  if(!it)return;
  googleBtn.disabled=true;
  googleBtn.textContent='Loading translator…';
  try {
   const suggestion=await window.gsOfflineTranslate(it.name.trim(), msg=>{
    const status=document.getElementById('translationstatus');
    if(status)status.textContent=msg;
   });
   if(!suggestion)throw Error('The model returned an empty suggestion.');
   // Suggestions are NEVER approved or sent to Supabase without review.
   if(!it.manual || !it.ar.trim()){
    it.ar=suggestion;it.translationSuggested=true;
    const row=document.querySelector('[data-ar="'+it.id+'"]');
    if(row)row.value=suggestion;
   }
   const status=document.getElementById('translationstatus');
   if(status)status.textContent='Arabic suggested. Verify the wording before confirming.';
  }catch(err){
   const status=document.getElementById('translationstatus');
   if(status)status.textContent='Translator unavailable: '+err.message+'. Enter Arabic manually.';
   alert('Offline translator could not load. Your order and dictionary are unchanged. You can type Arabic manually.\\n\\n'+err.message);
  }finally{
   googleBtn.disabled=false;googleBtn.textContent='✦ Translate Arabic here';
  }
  return;
 }

 if(newBtn){let it=orders[selected].items.find(i=>i.id===newBtn.dataset.new);if(!it)return;
  if(!it.ar.trim()){alert('Enter the Arabic name or use Suggest Iraqi Arabic first.');return}
  let en=it.name.trim(),sku=it.sku||'',existing=catalog.find(p=>(sku&&p.sku===sku)||key(p.en)===key(en));
  if(existing){alert('This product already exists. Verify the matched name instead.');return}
  if(!confirm('Add '+en+' to the product dictionary? This saves a local draft and submits it for admin approval if signed in.'))return;
  let p={id:String(catalog.length),en,sku,ar:it.ar.trim(),category:it.category||'Other',notes:'Added by staff — verify Arabic'};
  catalog.push(p);saveAddedProducts();saveDict();it.catalogId=p.id;
  it.issues=it.issues.filter(v=>!v.includes('Unknown or ambiguous product'));
  if(!it.issues.includes('New product translation — verify Arabic'))it.issues.push('New product translation — verify Arabic');
  if(shared.isConnected()){let ok=await shared.submit(p,'product');it.proposalSubmitted=ok;if(!ok)alert('Saved on this browser, but the shared submission failed. Use Team Sync to retry.');else alert('Submitted for administrator approval. Until approved, this is local only.');}
  else alert('Saved on this browser only. Sign in under Team Sync and submit locally added products to share.');
  render();return;
 }
 if(suggestBtn){let it=orders[selected].items.find(i=>i.id===suggestBtn.dataset.suggest);if(!it)return;
  // Free, offline-first lookup from the product dictionary. No external translator or API key.
  // Only suggest an exact/known-alias or matching-SKU entry; do not guess a new Arabic name.
  const candidates=catalog.filter(p=>p.ar?.trim() && (
    (it.sku && p.sku && String(it.sku)===String(p.sku)) || key(p.en)===key(it.name)
  ));
  const unique=[...new Set(candidates.map(p=>p.ar.trim()))];
  if(unique.length!==1){alert(unique.length>1?'Multiple existing Arabic names match this item. Please enter the correct translation manually.':'No reliable saved Arabic translation exists yet. Ask your salesman to enter the Arabic once, then add this product to the dictionary.');return}
  it.ar=unique[0];it.manual=true;
  const row=document.querySelector('[data-ar="'+it.id+'"]');if(row)row.value=it.ar;
  alert('Found an existing dictionary translation: '+it.ar+'\n\nPlease verify it before confirming.');return;
 }
 let tab=e.target.closest('[data-view]');if(tab){view=tab.dataset.view;renderStats();renderStore()}let b=e.target.closest('[data-print]');if(b)printSlips(b.dataset.print)};$('storeview').oninput=e=>{let input=e.target;if(input.dataset.category!==undefined){let it=orders[selected].items.find(i=>i.id===input.dataset.category);if(it)it.category=input.value}if(input.dataset.ar!==undefined){let it=orders[selected].items.find(i=>i.id===input.dataset.ar);if(it){it.ar=input.value;it.manual=true}}if(input.dataset.notes!==undefined){let store=orders.find(o=>o.id===Number(input.dataset.notes));if(store)store.notes=input.value.split('\n').map(v=>v.trim()).filter(Boolean)}};$('storeview').onchange=async e=>{let input=e.target;if(input.dataset.ar){let it=orders[selected].items.find(i=>i.id===input.dataset.ar);if(it){it.ar=input.value;it.manual=true}}if(input.dataset.check){let it=orders[selected].items.find(i=>i.id===input.dataset.check);if(it){if(input.checked&&!it.ar.trim()){alert('Enter the Arabic product name before confirming.');input.checked=false;return}if(input.checked){
   if(!shared.isConnected()){alert('Shared sync is not connected. Wait for automatic connection before saving for everyone.');input.checked=false;return}
   input.disabled=true;
   const saved=await shared.confirmItem(it);
   it.approved=saved;
   if(!saved){input.checked=false;alert('Could not save to the shared dictionary. Check Team Sync status and run the V17 SQL setup.');}
   if(view==='review'&&!orders[selected].items.some(x=>x.issues.length&&!x.approved)){let next=orders.findIndex(o=>o.items.some(x=>x.issues.length&&!x.approved));if(next>=0)selected=next;}render();
  }else{it.approved=false;render()}}}};$('printall').onclick=()=>printSlips('all',true);$('printapprovedspices').onclick=()=>{let pending=orders.flatMap(o=>o.items).filter(i=>spiceItem(i)&&i.issues.length&&!i.approved).length;if(pending)alert(`${pending} unconfirmed spice line(s) will be skipped. Review them before sending complete spice orders.`);printSlips('spices',true,false,true)};$('clear').onclick=()=>{translationBatch++;orders=[];selected=0;view='all';$('raw').value='';$('workspace').classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'})};$('toggleDictionary').onclick=()=>{$('dictionary').classList.toggle('hidden');if(!$('dictionary').classList.contains('hidden'))renderDictionary()};$('productsearch').oninput=()=>{$('dictionary').classList.remove('hidden');renderDictionary()};$('dictionary').onchange=e=>{if(e.target.dataset.dict!==undefined){catalog[Number(e.target.dataset.dict)].ar=e.target.value;saveDict();}};$('exportdict').onclick=()=>{let obj={format:'golden-star-dictionary-v1',products:catalog};let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));a.download='golden-star-arabic-dictionary.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};$('importdict').onchange=async e=>{try{let d=JSON.parse(await e.target.files[0].text());if(d.format!=='golden-star-dictionary-v1'||!Array.isArray(d.products))throw Error('Not a Golden Star dictionary backup');let matching=new Map(d.products.map(p=>[p.sku+'|'+p.en,p.ar]));let updated=0;catalog.forEach(p=>{let k=p.sku+'|'+p.en;if(matching.has(k)){p.ar=String(matching.get(k));updated++}});saveDict();renderDictionary();alert(`Imported ${updated} product names. Convert the orders again to apply new translations.`)}catch(err){alert(err.message)}};}
init().catch(err=>{console.error(err);$('inputnote').textContent='Could not load product dictionary. Please deploy the complete ZIP.'});


let queuedProducts=[];
const productCategories=['Other','Frozen','Ready Meals','Pickles','Olives','Dairy','Beverages','Dry Goods','Sweets','Bulk & Spices'];
function csvFields(line){let parts=[],part='',quoted=false;for(let i=0;i<line.length;i++){let c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){part+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){parts.push(part.trim());part=''}else part+=c}parts.push(part.trim());return parts}
function parseNewProductList(text){let out=[];let lines=text.replace(/\r/g,'').split('\n');for(let line of lines){line=line.trim();if(!line||line.startsWith('#'))continue;let values=line.includes('|')?line.split('|').map(s=>s.trim()):line.includes('\t')?line.split('\t').map(s=>s.trim()):line.includes(',')?csvFields(line):[line];if(/^english|^product name|^item name/i.test(values[0])&&values.length>1)continue;let [en,sku='',ar='',category='Other']=values;if(!en)continue;en=en.trim();sku=sku.trim();ar=ar.trim();category=category.trim()||'Other';// SKU-first shorthand: 1122 Ground Beef
let leading=en.match(/^(\d{4,5})\s+(.+)$/);if(leading&&!sku){sku=leading[1];en=leading[2]}// Do not mistake quantities from pasted orders for product names
if(/^\d+(?:\.\d+)?$/.test(en)||/^tomorrow$|^friday$/i.test(en))continue;out.push({en,sku,ar,category,add:true})}return out}
function markDuplicates(rows){let batch=new Set();for(const row of rows){let k=key(row.en),existing=catalog.find(x=>key(x.en)===k||(row.sku&&x.sku===row.sku));row.existing=existing||null;row.warning=existing?'Already exists'+(existing.en!==row.en?': '+existing.en:''):batch.has(k)?'Repeated in this upload':'';if(row.warning)row.add=false;batch.add(k)}return rows}
function renderProductPreview(){let show=$('showexisting').checked,rows=queuedProducts.filter(x=>show||!x.existing),newCount=queuedProducts.filter(x=>!x.existing).length;$('importpreview').classList.remove('hidden');$('previewstats').textContent=`${newCount} new · ${queuedProducts.length-newCount} possible existing`;$('previewrows').innerHTML=`<div class="previewrow head"><span>ADD</span><span>ENGLISH PRODUCT</span><span>SKU</span><span>ARABIC NAME</span><span>CATEGORY</span></div>`+rows.map(row=>{let i=queuedProducts.indexOf(row);return `<div class="previewrow ${row.existing?'existing':''}" data-row="${i}"><input type="checkbox" data-enabled="${i}" ${row.add?'checked':''}><input data-field="en" data-index="${i}" value="${escapeHtml(row.en)}"><input data-field="sku" data-index="${i}" value="${escapeHtml(row.sku)}"><input class="arabic" dir="rtl" data-field="ar" data-index="${i}" value="${escapeHtml(row.ar)}" placeholder="Arabic pending"><select data-field="category" data-index="${i}">${[...new Set([...productCategories,row.category])].map(c=>`<option ${row.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>${row.warning?`<small class="warn">⚠ ${escapeHtml(row.warning)}</small>`:''}</div>`}).join('')}
function downloadFile(filename,content,type='text/plain;charset=utf-8'){let a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function initProductManager(){const count=()=>$('productcount').textContent=`${catalog.length} products in dictionary`;count();let drop=$('dropzone');async function readFile(file){if(!file)return;if(!/\.(txt|csv)$/i.test(file.name)){alert('Please use CSV or TXT. In Excel, choose Save As → CSV UTF-8.');return}$('newlist').value=await file.text();$('managerstatus').textContent=`Loaded ${file.name}. Click Review new products.`}drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragover')};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragover');readFile(e.dataTransfer.files[0])};$('productfile').onchange=e=>readFile(e.target.files[0]);$('previewproducts').onclick=()=>{queuedProducts=markDuplicates(parseNewProductList($('newlist').value));if(!queuedProducts.length){alert('Add at least one product name.');return}renderProductPreview();$('importpreview').scrollIntoView({behavior:'smooth',block:'nearest'})};$('showexisting').onchange=renderProductPreview;$('previewrows').onchange=e=>{let d=e.target.dataset;if(d.enabled!==undefined)queuedProducts[+d.enabled].add=e.target.checked;else if(d.field){queuedProducts[+d.index][d.field]=e.target.value;}};$('saveproducts').onclick=()=>{let added=0,skipped=0;for(const row of queuedProducts){if(!row.add)continue;let en=row.en.trim(),sku=row.sku.trim();if(!en){skipped++;continue}if(catalog.some(x=>key(x.en)===key(en)||(sku&&x.sku===sku))){skipped++;continue}let p={id:String(catalog.length),en,sku,ar:row.ar.trim(),category:row.category,notes:'Added by staff — verify Arabic'};catalog.push(p);added++}saveAddedProducts();saveDict();count();$('managerstatus').textContent=`Added ${added} product(s)${skipped?`; skipped ${skipped} duplicate(s)`:''}. Saved on this browser. Export a backup to share changes.`;queuedProducts=[];$('importpreview').classList.add('hidden');$('newlist').value='';renderDictionary()};$('downloadtemplate').onclick=()=>downloadFile('golden-star-products-template.csv','English Product,SKU,Arabic Name,Category\nGround Beef,1122,لحم مفروم,Frozen\nSumac,,سماق,Bulk & Spices\n','text/csv;charset=utf-8');$('backupall').onclick=()=>downloadFile('golden-star-full-product-backup.json',JSON.stringify({format:'golden-star-full-products-v1',products:catalog.map(({en,sku,ar,category,notes})=>({en,sku,ar,category,notes}))},null,2),'application/json');$('restoreall').onchange=async e=>{try{let f=e.target.files[0];if(!f)return;let obj=JSON.parse(await f.text());if(obj.format!=='golden-star-full-products-v1'||!Array.isArray(obj.products))throw Error('Not a full product backup');let added=0,updated=0;for(let row of obj.products){if(typeof row.en!=='string'||!row.en.trim())continue;let sku=String(row.sku||''),en=row.en.trim();let existing=catalog.find(x=>key(x.en)===key(en)||(sku&&x.sku===sku));if(existing){existing.ar=String(row.ar||'');updated++}else{catalog.push({id:String(catalog.length),en,sku,ar:String(row.ar||''),category:String(row.category||'Other'),notes:'Restored product — verify Arabic'});added++}}saveAddedProducts();saveDict();renderDictionary();count();$('managerstatus').textContent=`Restored ${added} new items and ${updated} existing translations.`}catch(err){alert('Restore failed: '+err.message)}finally{e.target.value=''}}}
