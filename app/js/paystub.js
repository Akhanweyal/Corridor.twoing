// ---- Driver pay stubs (Time Logs → Pay Stub) ----
// Builds a printable earnings statement from the same semi-monthly periods and shift logs the
// manager dashboard already uses (mgrAllRecords, mgr_pp, getMs). Nothing is written to the
// database: the manager fills in rate/withholding, the stub opens in a new tab, and they use
// Print → Save as PDF to send it. Per-driver rate/address and the company EIN are remembered
// in this browser only, as a convenience.
var PAYSTUB_COMPANY={name:'Corridor Towing',address:'8607 Oakview Avenue',city:'Henrico, VA 23228',phone:'(804) 292-8414',email:'corridor.towing.services@gmail.com',web:'corridortowing.org'};
var SS_RATE=0.062,MEDICARE_RATE=0.0145;

function ps_store(key,val){try{if(val===undefined){var v=localStorage.getItem('ps_'+key);return v?JSON.parse(v):null;}localStorage.setItem('ps_'+key,JSON.stringify(val));}catch(e){return null;}}
function ps_num(id){var v=parseFloat(document.getElementById(id).value);return isNaN(v)?0:v;}
function ps_money(n){return '$'+(Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function ps_round(n){return Math.round(n*100)/100;}

// Last 24 semi-monthly periods, newest first, as {key,label,s,e}
function ps_periods(){
  var out=[],p=mgr_pp(Date.now());
  for(var i=0;i<24;i++){
    out.push({key:mgr_dK(p.s.getTime()),label:mgr_fD(p.s.getTime())+' – '+mgr_fD(p.e.getTime()),s:p.s,e:p.e});
    p=mgr_pp(p.s.getTime()-86400000);
  }
  return out;
}
function ps_driverNames(){
  var m={};(mgrAllRecords||[]).forEach(function(r){if(r.driverName)m[r.driverName]=1;});
  return Object.keys(m).sort();
}
function ps_shifts(name,s,e){
  var sk=mgr_dK(s.getTime()),ek=mgr_dK(e.getTime());
  return (mgrAllRecords||[]).filter(function(r){return r.driverName===name&&r.date>=sk&&r.date<=ek&&getMs(r)!=null;})
    .sort(function(a,b){return a.date.localeCompare(b.date);});
}
function ps_hours(shifts){var ms=0;shifts.forEach(function(r){ms+=getMs(r);});return msToHrsDecimal(ms);}

function openPayStub(name){
  var names=ps_driverNames();
  if(!names.length){alert('No driver time logs loaded yet. Tap Refresh and try again.');return;}
  var dSel=document.getElementById('ps-driver');
  dSel.innerHTML=names.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
  if(name&&names.indexOf(name)>=0)dSel.value=name;
  var pSel=document.getElementById('ps-period'),periods=ps_periods();
  pSel.innerHTML=periods.map(function(p){return '<option value="'+p.key+'">'+p.label+'</option>';}).join('');
  // Default to the most recently completed period — that's the one being paid out
  pSel.value=periods[1].key;
  document.getElementById('ps-paydate').value=mgr_dK(Date.now());
  document.getElementById('ps-ein').value=ps_store('ein')||'';
  document.getElementById('ps-legal').value=ps_store('legal')||'';
  ps_loadDriver();
  document.getElementById('mgr-paystub-modal').classList.add('active');
}

// Fill driver-specific fields from saved prefs + logged hours for the selected period
function ps_loadDriver(){
  var name=document.getElementById('ps-driver').value;
  var saved=ps_store('drv_'+name)||{};
  document.getElementById('ps-rate').value=saved.rate||'';
  document.getElementById('ps-addr').value=saved.addr||'';
  document.getElementById('ps-emptype').value=saved.emptype||'1099 Contractor';
  document.getElementById('ps-method').value=saved.method||'Check';
  ps_loadHours();
}
function ps_period(){
  var key=document.getElementById('ps-period').value;
  return ps_periods().filter(function(p){return p.key===key;})[0];
}
// Drivers don't always clock in, so the hours box is editable. YTD hours = logged hours from
// Jan 1 up to this period + whatever is in the hours box, until the manager types their own YTD.
var ps_priorHrs=0,ps_ytdTouched=false;
function ps_isContractor(){return document.getElementById('ps-emptype').value==='1099 Contractor';}
function ps_loadHours(){
  var name=document.getElementById('ps-driver').value,p=ps_period();
  var shifts=ps_shifts(name,p.s,p.e),hrs=ps_hours(shifts);
  ps_priorHrs=ps_hours(ps_shifts(name,new Date(p.s.getFullYear(),0,1),new Date(p.s.getTime()-1)));
  ps_ytdTouched=false;
  document.getElementById('ps-hours').value=hrs;
  document.getElementById('ps-hours-note').textContent='From time logs: '+hrs+' hrs over '+shifts.length+' shift(s). Change it if they did not clock in.';
  ps_recalc();
}
function ps_recalc(){
  var rate=ps_num('ps-rate'),gross=ps_round(ps_num('ps-hours')*rate+ps_num('ps-other'));
  var c=ps_isContractor();
  document.getElementById('ps-ss').value=c?'0.00':(gross*SS_RATE).toFixed(2);
  document.getElementById('ps-medicare').value=c?'0.00':(gross*MEDICARE_RATE).toFixed(2);
  document.getElementById('ps-ded-wrap').style.display=c?'none':'flex';
  if(!ps_ytdTouched)document.getElementById('ps-ytd-hours').value=ps_round(ps_priorHrs+ps_num('ps-hours'));
  document.getElementById('ps-gross-preview').textContent=ps_money(gross);
}

function generatePayStub(){
  var name=document.getElementById('ps-driver').value,p=ps_period();
  var rate=ps_num('ps-rate');
  if(!rate){alert('Enter the hourly rate.');return;}
  var ein=document.getElementById('ps-ein').value.trim();
  if(ein&&!/^\d{2}-?\d{7}$/.test(ein)){alert('EIN should be 9 digits like 12-3456789. Put the business legal name in the "Legal business name" box instead.');return;}
  var contractor=ps_isContractor();
  var hours=ps_num('ps-hours'),other=ps_num('ps-other');
  var gross=ps_round(hours*rate+other);
  var ded=[
    {k:'Federal Income Tax',v:ps_num('ps-fed'),ytd:ps_num('ps-ytd-fed')},
    {k:'VA State Income Tax',v:ps_num('ps-state'),ytd:ps_num('ps-ytd-state')},
    {k:'Social Security',v:ps_num('ps-ss')},
    {k:'Medicare',v:ps_num('ps-medicare')},
    {k:document.getElementById('ps-other-ded-lbl').value.trim()||'Other Deduction',v:ps_num('ps-other-ded'),ytd:ps_num('ps-ytd-other-ded')}
  ];
  var totalDed=ps_round(ded.reduce(function(a,d){return a+d.v;},0));
  var net=ps_round(gross-totalDed);
  if(contractor)ded=[];
  var ytdHours=Math.max(ps_num('ps-ytd-hours'),hours),ytdOther=ps_num('ps-ytd-other');
  var ytdGross=ps_round(ytdHours*rate+Math.max(ytdOther,other));
  // SS/Medicare are flat rates so their YTD is exact; other YTD fields default to this period's amount
  if(!contractor){ded[2].ytd=ded[2].v?ytdGross*SS_RATE:0;ded[3].ytd=ded[3].v?ytdGross*MEDICARE_RATE:0;}
  ded.forEach(function(d){if(!d.ytd||d.ytd<d.v)d.ytd=d.v;});
  var ytdDed=ps_round(ded.reduce(function(a,d){return a+d.ytd;},0));
  var shifts=ps_shifts(name,p.s,p.e);
  // Only list shifts when they back up the hours paid; a short list next to manually entered
  // hours would just raise questions for whoever is verifying income
  if(Math.abs(hours-ps_hours(shifts))>0.01)shifts=[];

  var info={addr:document.getElementById('ps-addr').value.trim(),emptype:document.getElementById('ps-emptype').value,method:document.getElementById('ps-method').value};
  ps_store('drv_'+name,{rate:rate,addr:info.addr,emptype:info.emptype,method:info.method});
  ps_store('ein',ein);
  var legal=document.getElementById('ps-legal').value.trim();ps_store('legal',legal);
  var checkNo=document.getElementById('ps-checkno').value.trim();
  var pd=document.getElementById('ps-paydate').value.split('-');
  var payDate=pd.length===3?mgr_fD(new Date(+pd[0],+pd[1]-1,+pd[2]).getTime()):'';
  var stubNo=p.key.replace(/-/g,'')+'-'+name.replace(/[^A-Za-z]/g,'').substring(0,4).toUpperCase();
  var C=PAYSTUB_COMPANY,logo=location.origin+'/images/logo.jpeg';

  var dedRows=ded.filter(function(d){return d.v||d.ytd;}).map(function(d){
    return '<tr><td>'+esc(d.k)+'</td><td class="r">'+ps_money(d.v)+'</td><td class="r">'+ps_money(d.ytd)+'</td></tr>';
  }).join('')||'<tr><td colspan="3" class="muted">No deductions</td></tr>';
  var shiftRows=shifts.map(function(r){
    var dp=r.date.split('-'),d=new Date(+dp[0],+dp[1]-1,+dp[2]);
    return '<tr><td>'+d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+'</td><td>'+(r.checkIn&&r.checkIn.time?mgr_fTs(r.checkIn.time):'—')+'</td><td>'+(r.checkOut&&r.checkOut.time?mgr_fTs(r.checkOut.time):'—')+'</td><td class="r">'+msToHrsDecimal(getMs(r)).toFixed(2)+'</td></tr>';
  }).join('');

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pay Stub - '+esc(name)+' - '+esc(p.label)+'</title>'+
  '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#eee;padding:20px;font-size:12px}'+
  '.page{background:#fff;max-width:8.5in;margin:0 auto;padding:.5in;box-shadow:0 2px 10px rgba(0,0,0,.15)}'+
  '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #d97706;padding-bottom:14px;margin-bottom:16px;gap:16px}'+
  '.co{display:flex;gap:12px;align-items:center}.co img{height:64px;width:64px;object-fit:cover;border-radius:8px}.co h1{font-size:20px}.co p{color:#444;line-height:1.45}'+
  '.ttl{text-align:right}.ttl h2{font-size:18px;letter-spacing:.05em;color:#d97706}.ttl p{color:#444;line-height:1.5}'+
  '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.box{border:1px solid #ccc;border-radius:6px;padding:10px 12px}'+
  '.box h3,.sec{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:6px}.kv{display:flex;justify-content:space-between;padding:2px 0}.kv span:first-child{color:#555}'+
  'table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#f3f3f3;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid #ccc}'+
  'td{padding:6px 8px;border-bottom:1px solid #eee}.r{text-align:right}.muted{color:#888}tfoot td{font-weight:bold;border-top:1px solid #999}'+
  '.net{display:flex;justify-content:space-between;align-items:center;background:#fff7ed;border:2px solid #d97706;border-radius:6px;padding:12px 16px;margin-bottom:16px}.net b{font-size:22px}'+
  '.foot{font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:10px;line-height:1.5}.sig{display:flex;gap:40px;margin-top:28px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:10px;color:#555}'+
  '.bar{max-width:8.5in;margin:0 auto 12px;display:flex;gap:8px}.bar button{padding:10px 18px;border:none;border-radius:6px;background:#d97706;color:#fff;font-weight:bold;cursor:pointer;font-size:14px}'+
  '@media print{body{background:#fff;padding:0}.page{box-shadow:none;padding:.4in}.bar{display:none}}</style></head><body>'+
  '<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>'+
  '<div class="page">'+
  '<div class="hdr"><div class="co"><img src="'+logo+'" onerror="this.style.display=\'none\'"><div><h1>'+esc(C.name)+'</h1><p>'+esc(C.address)+'<br>'+esc(C.city)+'<br>'+esc(C.phone)+' · '+esc(C.email)+(legal?'<br>Legal name: '+esc(legal):'')+(ein?'<br>EIN: '+esc(ein):'')+'</p></div></div>'+
  '<div class="ttl"><h2>'+(contractor?'CONTRACTOR PAYMENT STATEMENT':'EARNINGS STATEMENT')+'</h2><p>Stub #: '+esc(stubNo)+'<br>Pay Date: <b>'+esc(payDate)+'</b><br>Pay Period: '+esc(p.label)+'</p></div></div>'+
  '<div class="grid"><div class="box"><h3>'+(contractor?'Contractor':'Employee')+'</h3><p style="font-size:14px;font-weight:bold;margin-bottom:4px">'+esc(name)+'</p><p style="white-space:pre-line;color:#333">'+esc(info.addr)+'</p></div>'+
  '<div class="box"><h3>Pay Details</h3><div class="kv"><span>'+(contractor?'Worker Type':'Employment Type')+'</span><span>'+(contractor?'Independent Contractor (1099)':esc(info.emptype))+'</span></div><div class="kv"><span>Position</span><span>Tow Truck Driver</span></div><div class="kv"><span>Pay Frequency</span><span>Semi-Monthly</span></div><div class="kv"><span>Payment Method</span><span>'+esc(info.method)+(checkNo?' #'+esc(checkNo):'')+'</span></div></div></div>'+
  '<p class="sec">Earnings</p><table><thead><tr><th>Description</th><th class="r">Rate</th><th class="r">Hours</th><th class="r">Current</th><th class="r">Year to Date</th></tr></thead><tbody>'+
  '<tr><td>Regular Pay</td><td class="r">'+ps_money(rate)+'</td><td class="r">'+hours.toFixed(2)+'</td><td class="r">'+ps_money(hours*rate)+'</td><td class="r">'+ps_money(ytdHours*rate)+'</td></tr>'+
  (other||ytdOther?'<tr><td>Other Earnings</td><td></td><td></td><td class="r">'+ps_money(other)+'</td><td class="r">'+ps_money(Math.max(ytdOther,other))+'</td></tr>':'')+
  '</tbody><tfoot><tr><td>Gross Pay</td><td></td><td class="r">'+hours.toFixed(2)+'</td><td class="r">'+ps_money(gross)+'</td><td class="r">'+ps_money(ytdGross)+'</td></tr></tfoot></table>'+
  (contractor?'<p class="box" style="margin-bottom:16px">No taxes withheld. Paid as an independent contractor; earnings are reported on Form 1099-NEC.</p>':
  '<p class="sec">Deductions</p><table><thead><tr><th>Description</th><th class="r">Current</th><th class="r">Year to Date</th></tr></thead><tbody>'+dedRows+
  '</tbody><tfoot><tr><td>Total Deductions</td><td class="r">'+ps_money(totalDed)+'</td><td class="r">'+ps_money(ytdDed)+'</td></tr></tfoot></table>')+
  '<div class="net"><span style="font-size:14px;font-weight:bold">NET PAY</span><b>'+ps_money(net)+'</b><span class="muted">YTD Net: '+ps_money(ytdGross-ytdDed)+'</span></div>'+
  (shiftRows?'<p class="sec">Hours Worked This Period</p><table><thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th class="r">Hours</th></tr></thead><tbody>'+shiftRows+'</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">'+ps_hours(shifts).toFixed(2)+'</td></tr></tfoot></table>':'')+
  '<div class="sig"><div>Authorized Signature — '+esc(C.name)+'</div><div>Date</div></div>'+
  '<p class="foot" style="margin-top:16px">This statement reflects '+(contractor?'payments made':'wages paid')+' by '+esc(C.name)+' for the period shown. For employment or income verification, contact '+esc(C.phone)+' or '+esc(C.email)+'. Generated '+esc(new Date().toLocaleDateString('en-US'))+'.</p>'+
  '</div></body></html>';

  var w=window.open('','_blank');
  if(!w){alert('Pop-up blocked — allow pop-ups for this site to open the pay stub.');return;}
  w.document.open();w.document.write(html);w.document.close();
}

['ps-rate','ps-hours','ps-other'].forEach(function(id){document.getElementById(id).addEventListener('input',ps_recalc);});
document.getElementById('ps-emptype').addEventListener('change',ps_recalc);
document.getElementById('ps-ytd-hours').addEventListener('input',function(){ps_ytdTouched=true;});
document.getElementById('ps-driver').addEventListener('change',ps_loadDriver);
document.getElementById('ps-period').addEventListener('change',ps_loadHours);
document.getElementById('ps-btn-generate').addEventListener('click',generatePayStub);
document.getElementById('tt-btn-mgr-paystub').addEventListener('click',function(){openPayStub();});
// Per-driver "Pay Stub" buttons on the Time Logs cards (names come from the DB, so read them
// from a data attribute instead of interpolating into onclick)
document.getElementById('mgr-driver-cards').addEventListener('click',function(e){var b=e.target.closest('[data-paystub]');if(b)openPayStub(b.getAttribute('data-paystub'));});
