
/* ========== BUSINESS / TAX SUMMARY ========== */
var mgrBizPeriod='month',mgrBizCompletedCache=[];
var SERVICE_LABELS={'light-tow':'Car / SUV Tow','medium-tow':'Truck / Van Tow','jumpstart':'Jumpstart','lockout':'Lockout','tire':'Tire Change','fuel':'Fuel Delivery','extraction':'Winch Out'};
function bizPeriodLabel(p){return({month:'This Month',lastmonth:'Last Month',year:'This Year',all:'All Time'})[p]||p;}
function mgrBizRange(period){
  var now=new Date();
  if(period==='month')return{s:new Date(now.getFullYear(),now.getMonth(),1).getTime(),e:Date.now()};
  if(period==='lastmonth'){
    var s=new Date(now.getFullYear(),now.getMonth()-1,1);
    var e=new Date(now.getFullYear(),now.getMonth(),0,23,59,59);
    return{s:s.getTime(),e:e.getTime()};
  }
  if(period==='year')return{s:new Date(now.getFullYear(),0,1).getTime(),e:Date.now()};
  return null; // all time
}
// Completed jobs only (dropped_off/done) — pending/cancelled jobs never earned revenue
// or drove business miles, so they're excluded from every stat here.
function mgrBizCompletedJobs(period){
  var range=mgrBizRange(period);
  return mgrJobs.filter(function(j){
    if(j.status!=='dropped_off'&&j.status!=='done')return false;
    var t=j.droppedOffAt||j.updatedAt||j.createdAt||0;
    if(range&&(t<range.s||t>range.e))return false;
    return true;
  });
}
// Every release form is a completed transaction by definition (it only exists
// once a vehicle is actually released) — unlike jobs there's no separate
// pending/cancelled status to filter out. signedAt (when the digital signature
// was captured) is the truest "when this happened" timestamp if present, since
// createdAt can be well before the actual pickup for a form prepared in advance.
function mgrBizReleaseFormsInRange(period){
  var range=mgrBizRange(period);
  return mgrReleaseForms.filter(function(r){
    var t=r.signedAt||r.createdAt||0;
    if(range&&(t<range.s||t>range.e))return false;
    return true;
  });
}
function mgrBizAggregate(completed,releaseForms){
  releaseForms=releaseForms||[];
  var revenue=0,miles=0,byService={};
  completed.forEach(function(j){
    var amt=Number(j.amount)||0,mi=(Number(j.enrouteMiles)||0)+(Number(j.towMiles)||0);
    revenue+=amt;miles+=mi;
    var code=j.serviceCode||'other',label=SERVICE_LABELS[code]||j.service||code;
    if(!byService[code])byService[code]={label:label,count:0,revenue:0,miles:0};
    byService[code].count++;byService[code].revenue+=amt;byService[code].miles+=mi;
  });
  releaseForms.forEach(function(r){
    // Counts what was actually PAID, not the theoretical total — a partially
    // paid release (rare, but the form allows it) shouldn't overstate revenue
    // actually collected for tax purposes.
    var amt=Number(r.paid)||0,mi=(Number(r.towInMiles)||0)+(Number(r.towOutMiles)||0);
    revenue+=amt;miles+=mi;
    var code='storage-release',label='Vehicle Storage Release';
    if(!byService[code])byService[code]={label:label,count:0,revenue:0,miles:0};
    byService[code].count++;byService[code].revenue+=amt;byService[code].miles+=mi;
  });
  return{revenue:revenue,miles:miles,byService:byService};
}
var mgrBizReleaseFormsCache=[];
function renderMgrBusiness(){
  var completed=mgrBizCompletedJobs(mgrBizPeriod);
  var releaseForms=mgrBizReleaseFormsInRange(mgrBizPeriod);
  mgrBizCompletedCache=completed;
  mgrBizReleaseFormsCache=releaseForms;
  var agg=mgrBizAggregate(completed,releaseForms);
  document.getElementById('mgr-biz-revenue').textContent='$'+agg.revenue.toFixed(2);
  document.getElementById('mgr-biz-jobcount').textContent=completed.length;
  document.getElementById('mgr-biz-miles').textContent=agg.miles.toFixed(1);
  var codes=Object.keys(agg.byService).sort(function(a,b){return agg.byService[b].revenue-agg.byService[a].revenue;});
  var tb=document.getElementById('mgr-biz-svc-tb');
  if(!codes.length){
    tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:#6b6b6b;padding:20px 0">No completed jobs or storage releases in this period</td></tr>';
  }else{
    var html='';
    codes.forEach(function(code){
      var r=agg.byService[code];
      html+='<tr><td>'+esc(r.label)+'</td><td>'+r.count+'</td><td>'+r.miles.toFixed(1)+'</td><td>$'+r.revenue.toFixed(2)+'</td></tr>';
    });
    tb.innerHTML=html;
  }
}
function downloadBizExcel(){
  if(typeof XLSX==='undefined'){alert('Excel library not loaded.');return;}
  var completed=mgrBizCompletedCache,releaseForms=mgrBizReleaseFormsCache;
  if(!completed.length&&!releaseForms.length){alert('No completed jobs or storage releases in this period to export.');return;}
  var agg=mgrBizAggregate(completed,releaseForms);
  var wb=XLSX.utils.book_new();
  var summaryData=[['CORRIDOR TOWING'],['BUSINESS / TAX SUMMARY'],[''],['Period:',bizPeriodLabel(mgrBizPeriod)],['Generated:',new Date().toLocaleString('en-US')],[''],['Gross Revenue:','$'+agg.revenue.toFixed(2)],['Jobs Completed:',completed.length],['Storage Releases:',releaseForms.length],['Total Business Miles (enroute + tow + storage tow-in/out):',agg.miles.toFixed(1)],[''],['Service Type','Count','Miles','Revenue']];
  Object.keys(agg.byService).sort(function(a,b){return agg.byService[b].revenue-agg.byService[a].revenue;}).forEach(function(code){
    var r=agg.byService[code];summaryData.push([r.label,r.count,r.miles.toFixed(1),'$'+r.revenue.toFixed(2)]);
  });
  var ws1=XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols']=[{wch:32},{wch:16},{wch:12},{wch:14}];
  ws1['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}}];
  XLSX.utils.book_append_sheet(wb,ws1,'Summary');

  var itemData=[['Date','Customer','Service','Vehicle','Enroute Mi','Tow Mi','Amount ($)','Driver']];
  completed.slice().sort(function(a,b){return(a.droppedOffAt||a.updatedAt||0)-(b.droppedOffAt||b.updatedAt||0);}).forEach(function(j){
    var t=j.droppedOffAt||j.updatedAt||j.createdAt||0;
    itemData.push([t?new Date(t).toLocaleDateString('en-US'):'',j.customerName||'',j.service||'',j.vehicle||'',Number(j.enrouteMiles)||0,Number(j.towMiles)||0,Number(j.amount)||0,j.assignedDriverName||'']);
  });
  var ws2=XLSX.utils.aoa_to_sheet(itemData);
  ws2['!cols']=[{wch:12},{wch:18},{wch:24},{wch:18},{wch:11},{wch:9},{wch:11},{wch:16}];
  XLSX.utils.book_append_sheet(wb,ws2,'Itemized Jobs');

  var SOURCE_LABELS={website:'Corridor Towing',agero:'Agero',aaa:'AAA',honk:'Honk',other:'Other'};
  var relData=[['Date','Source','Vehicle','Plate','Nights','Tow-in Mi','Tow-out Mi','Total ($)','Paid ($)']];
  releaseForms.slice().sort(function(a,b){return(a.signedAt||a.createdAt||0)-(b.signedAt||b.createdAt||0);}).forEach(function(r){
    var t=r.signedAt||r.createdAt||0;
    relData.push([t?new Date(t).toLocaleDateString('en-US'):'',SOURCE_LABELS[r.src]||r.src||'',r.veh||'',[r.plate,r.state].filter(Boolean).join(' '),Number(r.nights)||0,Number(r.towInMiles)||0,Number(r.towOutMiles)||0,Number(r.total)||0,Number(r.paid)||0]);
  });
  var ws3=XLSX.utils.aoa_to_sheet(relData);
  ws3['!cols']=[{wch:12},{wch:14},{wch:20},{wch:14},{wch:9},{wch:11},{wch:12},{wch:11},{wch:11}];
  XLSX.utils.book_append_sheet(wb,ws3,'Itemized Storage Releases');

  XLSX.writeFile(wb,'Corridor_Towing_Tax_Summary_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

// Wire manager main tabs + job filter + add driver
document.getElementById('mgr-maintabs').addEventListener('click',function(e){
  var b=e.target.closest('.tt-mgr-tab');if(!b||!b.dataset.m)return;switchMgrMainTab(b.dataset.m);
});
document.getElementById('mgr-job-filter').addEventListener('click',function(e){
  var b=e.target.closest('.tt-mgr-tab');if(!b||!b.dataset.jf)return;
  mgrJobFilter=b.dataset.jf;
  document.querySelectorAll('#mgr-job-filter .tt-mgr-tab').forEach(function(t){t.classList.remove('on');});
  b.classList.add('on');
  renderMgrJobs();
});
document.getElementById('mgr-btn-add-driver').addEventListener('click',addMgrDriver);
document.getElementById('tt-btn-new-job').addEventListener('click',function(){njResetForm();document.getElementById('mgr-newjob-modal').classList.add('active');});
document.getElementById('nj-service').addEventListener('change',njOnServiceChange);
document.getElementById('nj-enroute').addEventListener('input',njCalcTotal);
document.getElementById('nj-tow').addEventListener('input',njCalcTotal);
document.getElementById('nj-payment').addEventListener('change',njTogglePayMethod);
document.getElementById('nj-pickup').addEventListener('blur',function(){njAutoCalcEnroute();njAutoCalcTowMiles();});
document.getElementById('nj-dest').addEventListener('blur',njAutoCalcTowMiles);
CTAddr.attach(document.getElementById('nj-pickup'),function(){njAutoCalcEnroute();njAutoCalcTowMiles();});
CTAddr.attach(document.getElementById('nj-dest'),function(){njAutoCalcTowMiles();});
document.getElementById('tt-btn-release-form').addEventListener('click',openReleaseModal);
document.getElementById('rf-in-date').addEventListener('change',rfRecalcNights);
document.getElementById('rf-out-date').addEventListener('change',rfRecalcNights);
document.getElementById('rf-nights').addEventListener('input',rfRecalcStorageFee);
document.getElementById('rf-storage-fee').addEventListener('input',rfRecalcTotal);
document.getElementById('rf-towin-miles').addEventListener('input',rfRecalcTowInFee);
document.getElementById('rf-towin-fee').addEventListener('input',rfRecalcTotal);
document.getElementById('rf-towout-miles').addEventListener('input',rfRecalcTowOutFee);
document.getElementById('rf-towout-fee').addEventListener('input',rfRecalcTotal);
document.getElementById('rf-processing-fee').addEventListener('input',rfRecalcTotal);
document.getElementById('rf-paid').addEventListener('input',function(){rfPaidManuallyEdited=true;});
document.getElementById('mgr-biz-ptabs').addEventListener('click',function(e){
  var b=e.target.closest('.tt-mgr-tab');if(!b||!b.dataset.bp)return;
  mgrBizPeriod=b.dataset.bp;
  document.querySelectorAll('#mgr-biz-ptabs .tt-mgr-tab').forEach(function(t){t.classList.remove('on');});
  b.classList.add('on');
  renderMgrBusiness();
});
document.getElementById('tt-btn-biz-excel').addEventListener('click',downloadBizExcel);

// Override refresh to load everything
document.getElementById('tt-btn-mgr-refresh').addEventListener('click',function(){
  loadMgrData();
  loadMgrJobs();
  loadMgrDrivers();
  loadMgrReleaseForms();
});

