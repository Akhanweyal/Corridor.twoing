async function loadMgrData(){
  document.getElementById('mgr-logs-tb').innerHTML='<tr><td colspan="5" style="text-align:center;color:#6b6b6b;padding:30px 0"><i class="fas fa-spinner fa-spin"></i> Loading from cloud...</td></tr>';
  try{
    var res=await fbFetch(FIREBASE_URL+'/driverLogs.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    if(!data){mgrAllRecords=[];renderMgrDash();return;}
    var all=[];
    for(var drvId in data){var driverData=data[drvId];for(var recId in driverData){var r=driverData[recId];if(r&&typeof r.date==='string')all.push({id:recId,driverName:r.driverName||drvId,date:r.date,checkIn:r.checkIn||null,checkOut:r.checkOut||null,hours:r.hours!=null?r.hours:null});}}
    mgrAllRecords=all;renderMgrDash();
  }catch(err){console.error('Manager load error:',err);mgrAllRecords=[];renderMgrDash();}
}

function mgr_pp(ts){var d=new Date(ts),dy=d.getDate(),mo=d.getMonth(),yr=d.getFullYear();if(dy<=15)return{s:new Date(yr,mo,1),e:new Date(yr,mo,15,23,59,59)};var l=new Date(yr,mo+1,0).getDate();return{s:new Date(yr,mo,16),e:new Date(yr,mo,l,23,59,59)};}
function mgr_cp(){return mgr_pp(Date.now());}
function mgr_ppv(){var n=new Date();if(n.getDate()<=15){var pm=new Date(n.getFullYear(),n.getMonth()-1,1);var ld=new Date(n.getFullYear(),n.getMonth(),0).getDate();return{s:new Date(pm.getFullYear(),pm.getMonth(),16),e:new Date(pm.getFullYear(),pm.getMonth(),ld,23,59,59)};}return{s:new Date(n.getFullYear(),n.getMonth(),1),e:new Date(n.getFullYear(),n.getMonth(),15,23,59,59)};}
function mgr_dK(t){var d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function mgr_filterByPeriod(records,period){if(!period)return records;var sk=mgr_dK(period.s.getTime()),ek=mgr_dK(period.e.getTime());return records.filter(function(r){return r.date>=sk&&r.date<=ek;});}
function mgr_fTs(t){return new Date(t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});}
function mgr_fT(t){return new Date(t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});}
function mgr_fD(t){return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

function renderMgrDash(){
  var period=null;
  if(mgrPeriod==='current')period=mgr_cp();
  else if(mgrPeriod==='previous')period=mgr_ppv();
  var filtered=mgr_filterByPeriod(mgrAllRecords,period);
  var totalMs=0,driverMap={};

  filtered.forEach(function(r){
    var ms=getMs(r);
    if(ms!=null)totalMs+=ms;
    var name=r.driverName||'Unknown';
    if(!driverMap[name])driverMap[name]={ms:0,days:0,open:false};
    if(ms!=null)driverMap[name].ms+=ms;
    else if(r.checkIn&&!r.checkOut)driverMap[name].open=true;
    driverMap[name].days++;
  });

  // Current month both-halves breakdown for all drivers
  var now=new Date(),yr=now.getFullYear(),mo=now.getMonth();
  var ld=new Date(yr,mo+1,0).getDate();
  var h1s=mgr_dK(new Date(yr,mo,1).getTime()), h1e=mgr_dK(new Date(yr,mo,15,23,59,59).getTime());
  var h2s=mgr_dK(new Date(yr,mo,16).getTime()),h2e=mgr_dK(new Date(yr,mo,ld,23,59,59).getTime());
  var monthlyMap={};
  mgrAllRecords.forEach(function(r){
    var name=r.driverName||'Unknown';
    if(!monthlyMap[name])monthlyMap[name]={h1Ms:0,h2Ms:0,h1Days:0,h2Days:0};
    var ms=getMs(r);
    if(r.date>=h1s&&r.date<=h1e){if(ms!=null)monthlyMap[name].h1Ms+=ms;monthlyMap[name].h1Days++;}
    if(r.date>=h2s&&r.date<=h2e){if(ms!=null)monthlyMap[name].h2Ms+=ms;monthlyMap[name].h2Days++;}
  });

  document.getElementById('mgr-total-hrs').textContent=msToHM(totalMs);
  document.getElementById('mgr-total-drivers').textContent=Object.keys(driverMap).length;
  document.getElementById('mgr-total-days').textContent=filtered.length;
  document.getElementById('mgr-period-label').textContent=period?'Period: '+mgr_fD(period.s.getTime())+' — '+mgr_fD(period.e.getTime()):'All records';

  // Per-driver breakdown cards
  var allNames=Object.keys(monthlyMap);
  Object.keys(driverMap).forEach(function(n){if(allNames.indexOf(n)<0)allNames.push(n);});
  allNames.sort();

  var cardHtml='';
  if(!allNames.length){
    cardHtml='<div style="color:#6b6b6b;font-size:13px;padding:12px 0">No drivers on record yet.</div>';
  }else{
    allNames.forEach(function(name){
      var parts=(name||'?').trim().split(' ');
      var ini=(parts.length>=2?(parts[0][0]+parts[parts.length-1][0]):(name.substring(0,2))).toUpperCase();
      var mm=monthlyMap[name]||{h1Ms:0,h2Ms:0,h1Days:0,h2Days:0};
      var totalMonthMs=mm.h1Ms+mm.h2Ms;
      var isOpen=driverMap[name]&&driverMap[name].open;
      var periodMs=driverMap[name]?driverMap[name].ms:0;
      cardHtml+='<div style="background:#1a1a1a;border:1px solid #262626;border-radius:14px;padding:14px 16px">';
      // Header row
      cardHtml+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">';
      cardHtml+='<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#000;flex-shrink:0">'+ini+'</div>';
      cardHtml+='<div style="flex:1"><p style="font-weight:700;font-size:15px;color:#f0f0f0">'+esc(name)+'</p>';
      cardHtml+='<p style="font-size:11px;color:#6b6b6b">Month: <span style="color:#f59e0b;font-weight:700">'+msToHM(totalMonthMs)+'</span> &nbsp;|&nbsp; Period: <span style="color:#60a5fa;font-weight:700">'+msToHM(periodMs)+'</span></p>';
      cardHtml+='</div>';
      if(isOpen)cardHtml+='<span style="font-size:10px;font-weight:700;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);padding:3px 8px;border-radius:20px;white-space:nowrap">ON SHIFT</span>';
      cardHtml+='</div>';
      // Two-half totals
      cardHtml+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
      cardHtml+='<div style="background:#111;border-radius:10px;padding:10px;border-left:3px solid #10b981">';
      cardHtml+='<p style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b;margin-bottom:4px">1st – 15th</p>';
      cardHtml+='<p style="font-family:\'JetBrains Mono\',monospace;font-size:18px;font-weight:900;color:#10b981">'+msToHM(mm.h1Ms)+'</p>';
      cardHtml+='<p style="font-size:10px;color:#6b6b6b;margin-top:2px">'+mm.h1Days+' shift'+(mm.h1Days!==1?'s':'')+'</p>';
      cardHtml+='</div>';
      cardHtml+='<div style="background:#111;border-radius:10px;padding:10px;border-left:3px solid #f59e0b">';
      cardHtml+='<p style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b;margin-bottom:4px">16th – '+ld+'th</p>';
      cardHtml+='<p style="font-family:\'JetBrains Mono\',monospace;font-size:18px;font-weight:900;color:#f59e0b">'+msToHM(mm.h2Ms)+'</p>';
      cardHtml+='<p style="font-size:10px;color:#6b6b6b;margin-top:2px">'+mm.h2Days+' shift'+(mm.h2Days!==1?'s':'')+'</p>';
      cardHtml+='</div>';
      cardHtml+='</div>';
      cardHtml+='</div>';
    });
  }
  document.getElementById('mgr-driver-cards').innerHTML=cardHtml;

  // Shift log table
  var sorted=filtered.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var lh='';
  if(!sorted.length){
    lh='<tr><td colspan="6" style="text-align:center;color:#6b6b6b;padding:32px 0">No shifts found for this period</td></tr>';
  }else{
    sorted.forEach(function(r){
      var dp=r.date.split('-');var d=new Date(+dp[0],+dp[1]-1,+dp[2]);
      var ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      var ws=d.toLocaleDateString('en-US',{weekday:'short'});
      var iT=(r.checkIn&&r.checkIn.time)?mgr_fTs(r.checkIn.time):'--';
      var oT=(r.checkOut&&r.checkOut.time)?mgr_fTs(r.checkOut.time):'--';
      var ms=getMs(r);
      var hr=ms!=null?msToHM(ms):'<span style="color:#f59e0b;font-size:11px;font-weight:700">OPEN</span>';
      var inPhoto=safePhoto(r.checkIn&&r.checkIn.photo)?'<img src="'+r.checkIn.photo+'" onclick="mgrViewPhoto(this.src,\'Check-In\')" style="width:34px;height:34px;border-radius:6px;object-fit:cover;cursor:pointer;border:1.5px solid #10b981;margin-right:3px" title="Check-In">':'<span style="color:#444;font-size:10px">—</span>';
      var outPhoto=safePhoto(r.checkOut&&r.checkOut.photo)?'<img src="'+r.checkOut.photo+'" onclick="mgrViewPhoto(this.src,\'Check-Out\')" style="width:34px;height:34px;border-radius:6px;object-fit:cover;cursor:pointer;border:1.5px solid #f59e0b" title="Check-Out">':'';
      lh+='<tr>'+
        '<td style="font-weight:600;color:#f59e0b;font-size:12px">'+esc(r.driverName||'Unknown')+'</td>'+
        '<td><span style="font-weight:600">'+ds+'</span><br><span style="font-size:10px;color:#6b6b6b">'+ws+'</span></td>'+
        '<td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+iT+'</td>'+
        '<td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+oT+'</td>'+
        '<td style="font-family:\'JetBrains Mono\',monospace;font-weight:700">'+hr+'</td>'+
        '<td style="text-align:center">'+inPhoto+outPhoto+'</td>'+
        '</tr>';
    });
    lh+='<tr class="tt-total-row"><td colspan="4" style="text-align:right;padding-right:12px">PERIOD TOTAL:</td><td style="font-family:\'JetBrains Mono\',monospace;font-size:15px;padding:10px 12px">'+msToHM(totalMs)+'</td><td></td></tr>';
  }
  document.getElementById('mgr-logs-tb').innerHTML=lh;
}
document.getElementById('mgr-ptabs').addEventListener('click',function(e){var b=e.target.closest('.tt-mgr-tab');if(!b)return;mgrPeriod=b.dataset.p;document.querySelectorAll('#mgr-ptabs .tt-mgr-tab').forEach(function(t){t.classList.remove('on');});b.classList.add('on');renderMgrDash();});
document.getElementById('tt-btn-mgr-refresh').addEventListener('click',function(){loadMgrData();});
document.getElementById('tt-btn-mgr-excel').addEventListener('click',function(){downloadMgrExcel();});

function mgrViewPhoto(src, label){
  var modal=document.getElementById('mgr-photo-modal');
  var img=document.getElementById('mgr-photo-img');
  var lbl=document.getElementById('mgr-photo-label');
  if(!modal||!img)return;
  img.src=src;
  if(lbl)lbl.textContent=label||'Photo';
  modal.style.display='flex';
}

function downloadMgrExcel(){
  if(typeof XLSX==='undefined'){alert('Excel library not loaded.');return;}
  if(!mgrAllRecords||!mgrAllRecords.length){alert('No data to download.');return;}
  var wb=XLSX.utils.book_new(),cur=mgr_cp(),pv=mgr_ppv();
  function makeSheet(records,label,period){
    var totalMs=0;records.forEach(function(r){var ms=getMs(r);if(ms!=null)totalMs+=ms;});
    var data=[['CORRIDOR TOWING'],['MANAGER REPORT — '+label],[''],['Period:',period?(mgr_fD(period.s.getTime())+' — '+mgr_fD(period.e.getTime())):'All Time'],['Total Time:',msToHM(totalMs)],['Total Hours (decimal):',msToHrsDecimal(totalMs)],['Total Shifts:',records.length],[''],['Driver','Date','Day','Check In','Check Out','Duration','Hours (decimal)','Has Photo']];
    records.slice().sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(r){
      var dp=r.date.split('-');var d=new Date(+dp[0],+dp[1]-1,+dp[2]);
      var ms=getMs(r);
      data.push([r.driverName||'Unknown',d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),d.toLocaleDateString('en-US',{weekday:'short'}),(r.checkIn&&r.checkIn.time)?mgr_fT(r.checkIn.time):'N/A',(r.checkOut&&r.checkOut.time)?mgr_fT(r.checkOut.time):'N/A',ms!=null?msToHM(ms):'OPEN',ms!=null?msToHrsDecimal(ms):'',(r.checkIn&&r.checkIn.photo?'✓ Check-In':'')]);
    });
    data.push(['','','','','TOTAL:',msToHM(totalMs),msToHrsDecimal(totalMs)]);
    var ws2=XLSX.utils.aoa_to_sheet(data);ws2['!cols']=[{wch:22},{wch:18},{wch:8},{wch:12},{wch:12},{wch:10},{wch:14}];ws2['!merges']=[{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}];return ws2;
  }
  XLSX.utils.book_append_sheet(wb,makeSheet(mgr_filterByPeriod(mgrAllRecords,cur),'Current Period',cur),'Current Period');
  XLSX.utils.book_append_sheet(wb,makeSheet(mgr_filterByPeriod(mgrAllRecords,pv),'Previous Period',pv),'Previous Period');
  XLSX.utils.book_append_sheet(wb,makeSheet(mgrAllRecords,'All Time',null),'All Records');
  XLSX.writeFile(wb,'TowTrack_Manager_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

