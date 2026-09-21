/* ========== DISPATCH / JOBS / DRIVERS ========== */
var mgrJobs=[],mgrDrivers=[],mgrJobFilter='pending',mgrMainTab='dispatch',_assignJobId=null;

function randomToken(n){n=n||20;var s='';while(s.length<n)s+=Math.random().toString(36).slice(2);return s.slice(0,n);}
function jobStatusLabel(s){return({pending:'Pending',assigned:'Assigned',enroute:'En Route',on_location:'On Location',picked_up:'Picked Up',dropped_off:'Done',done:'Done',cancelled:'Cancelled'})[s]||esc(s);}
function jobStatusColor(s){return({pending:'#f59e0b',assigned:'#60a5fa',enroute:'#a78bfa',on_location:'#34d399',picked_up:'#10b981',dropped_off:'#6b6b6b',done:'#6b6b6b',cancelled:'#ef4444'})[s]||'#6b6b6b';}
function isJobComplete(s){return s==='dropped_off'||s==='done'||s==='cancelled';}
function isJobActiveStatus(s){return s==='assigned'||s==='enroute'||s==='on_location'||s==='picked_up';}

async function loadMgrJobs(){
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    mgrJobs=[];
    if(data){for(var id in data){var j=data[id];if(j&&isSafeId(id)){j.id=id;mgrJobs.push(j);}}}
    mgrJobs.sort(function(a,b){return(b.createdAt||0)-(a.createdAt||0);});
  }catch(e){console.error('loadMgrJobs',e);mgrJobs=[];}
  renderMgrJobs();
  if(mgrMainTab==='business')renderMgrBusiness();
}
// /releaseForms lives separately from /jobs by design — most storage releases
// (Agero/AAA/Honk) never create a job record at all — so the Business tab needs
// its own fetch here to fold that revenue/mileage into the tax summary.
var mgrReleaseForms=[];
async function loadMgrReleaseForms(){
  try{
    var res=await fbFetch(FIREBASE_URL+'/releaseForms.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    mgrReleaseForms=[];
    if(data){for(var id in data){var r=data[id];if(r&&isSafeId(id)){r.id=id;mgrReleaseForms.push(r);}}}
    mgrReleaseForms.sort(function(a,b){return(b.createdAt||0)-(a.createdAt||0);});
  }catch(e){console.error('loadMgrReleaseForms',e);mgrReleaseForms=[];}
  if(mgrMainTab==='business')renderMgrBusiness();
}
async function loadMgrDrivers(){
  try{
    var res=await fbFetch(FIREBASE_URL+'/drivers.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    mgrDrivers=[];
    if(data){for(var id in data){var d=data[id];if(d&&isSafeId(id)){d.id=id;mgrDrivers.push(d);}}}
    mgrDrivers.sort(function(a,b){return(a.name||'').localeCompare(b.name||'');});
  }catch(e){console.error('loadMgrDrivers',e);mgrDrivers=[];}
  renderMgrDrivers();
}

function buildJobDetailText(job){
  return 'NEW JOB — Corridor Towing\n'+
    'Customer: '+(job.customerName||'')+'\n'+
    'Phone: '+(job.customerPhone||'')+'\n'+
    'Service: '+(job.service||'')+'\n'+
    'Vehicle: '+(job.vehicle||'')+'\n'+
    'Pickup: '+(job.pickupAddress||'')+'\n'+
    'Destination: '+(job.destinationAddress||'N/A')+'\n'+
    'Starts: '+(job.starts||'?')+' | Neutral: '+(job.neutral||'?')+'\n'+
    'Amount: $'+(job.amount!=null?Number(job.amount).toFixed(2):'0.00')+'\n'+
    'Open Driver Portal → Jobs to update status.';
}
function buildCustomerStatusHint(job){
  return 'Customer contact for status updates:\n'+
    (job.customerName||'Customer')+' · '+(job.customerPhone||'')+'\n'+
    'Sample texts:\n'+
    '• En route: "Corridor Towing: Driver is on the way to your location."\n'+
    '• Picked up: "Corridor Towing: Your vehicle has been picked up."\n'+
    '• Dropped off: "Corridor Towing: Your vehicle has been dropped off. Thank you!"';
}

function renderMgrJobs(){
  var today=new Date();today.setHours(0,0,0,0);var todayMs=today.getTime();
  var pending=0,active=0,done=0;
  mgrJobs.forEach(function(j){
    if(j.status==='pending')pending++;
    else if(isJobActiveStatus(j.status))active++;
    else if((j.status==='done'||j.status==='dropped_off')&&(j.droppedOffAt||j.updatedAt||0)>=todayMs)done++;
  });
  var elP=document.getElementById('mgr-job-pending');if(elP)elP.textContent=pending;
  var elA=document.getElementById('mgr-job-active');if(elA)elA.textContent=active;
  var elD=document.getElementById('mgr-job-done');if(elD)elD.textContent=done;

  var list=document.getElementById('mgr-jobs-list');if(!list)return;
  var filtered=mgrJobs.filter(function(j){
    if(mgrJobFilter==='all')return true;
    // "Done" also catches the older "dropped_off" status — the app no longer
    // creates that distinct status (it was confusingly separate from "Done"
    // for no real reason), but any job completed before this change still has
    // it, and it should show up under Done rather than nowhere.
    if(mgrJobFilter==='done')return j.status==='done'||j.status==='dropped_off';
    return j.status===mgrJobFilter;
  });
  if(!filtered.length){
    list.innerHTML='<div style="text-align:center;color:#6b6b6b;padding:24px 0;font-size:13px">No jobs in this filter</div>';
    return;
  }
  var html='';
  filtered.forEach(function(j){
    var color=jobStatusColor(j.status);
    var canManage=j.status==='pending'||isJobActiveStatus(j.status);
    html+='<div style="background:#141414;border:1px solid #262626;border-left:3px solid '+color+';border-radius:12px;padding:12px 14px">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">';
    html+='<div style="min-width:0;flex:1"><p style="font-weight:700;font-size:14px;color:#f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(j.customerName||'Customer')+'</p>';
    html+='<p style="font-size:11px;color:#6b6b6b;margin-top:2px"><a href="tel:'+esc(j.customerPhone||'')+'" style="color:#60a5fa">'+esc(j.customerPhone||'')+'</a> · '+esc(j.service||'')+'</p></div>';
    html+='<span style="flex-shrink:0;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;color:'+color+';border:1px solid '+color+'">'+jobStatusLabel(j.status)+'</span>';
    html+='</div>';
    html+='<p style="font-size:11px;color:#aaa;margin-bottom:2px;line-height:1.35"><i class="fas fa-map-marker-alt" style="color:#f59e0b;width:12px"></i> '+esc(j.pickupAddress||'—')+'</p>';
    if(j.destinationAddress&&j.destinationAddress!=='N/A')html+='<p style="font-size:11px;color:#aaa;margin-bottom:2px;line-height:1.35"><i class="fas fa-flag-checkered" style="color:#10b981;width:12px"></i> '+esc(j.destinationAddress)+'</p>';
    html+='<p style="font-size:11px;color:#6b6b6b;margin:4px 0 8px">'+esc(j.vehicle||'—')+' · $'+(j.amount!=null?Number(j.amount).toFixed(2):'0.00');
    if(j.assignedDriverName)html+=' · <span style="color:#60a5fa">'+esc(j.assignedDriverName)+'</span>';
    html+='</p>';
    if(canManage){
      html+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
      if(j.status==='pending'){
        html+='<button onclick="openAssignModal(\''+j.id+'\')" style="flex:1;min-width:110px;padding:9px 10px;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#000;font-family:\'Outfit\',sans-serif">Assign</button>';
      }else{
        html+='<button onclick="openAssignModal(\''+j.id+'\')" style="flex:1;min-width:100px;padding:9px 10px;border:1px solid #f59e0b;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;background:rgba(245,158,11,.12);color:#f59e0b;font-family:\'Outfit\',sans-serif">Reassign</button>';
        html+='<button onclick="unassignJob(\''+j.id+'\')" style="flex:1;min-width:100px;padding:9px 10px;border:1px solid #ef4444;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;background:rgba(239,68,68,.1);color:#fca5a5;font-family:\'Outfit\',sans-serif">Unassign</button>';
        html+='<button onclick="resendJobNotify(\''+j.id+'\')" style="flex:1;min-width:100px;padding:9px 10px;border:1px solid #262626;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:#1a1a1a;color:#aaa;font-family:\'Outfit\',sans-serif"><i class="fas fa-paper-plane"></i> Notify</button>';
      }
      html+='</div>';
    }
    if(isJobActiveStatus(j.status)&&j.driverLat!=null&&j.driverLng!=null){
      var ageMs=Date.now()-(j.driverLocationAt||0);
      var ageTxt=ageMs<90000?'just now':Math.round(ageMs/60000)+'m ago';
      var stale=ageMs>10*60000; // no update in 10+ min — GPS may be off/app backgrounded
      var driverMapUrl='https://www.google.com/maps?q='+encodeURIComponent(Number(j.driverLat))+','+encodeURIComponent(Number(j.driverLng));
      html+='<p style="font-size:11px;color:'+(stale?'#f59e0b':'#34d399')+';margin-bottom:6px"><i class="fas fa-location-crosshairs"></i> Driver location updated '+ageTxt+(stale?' (may be stale)':'')+' — <a href="'+driverMapUrl+'" target="_blank" rel="noopener" style="color:#60a5fa">View on map</a></p>';
    }
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
    html+='<button onclick="openTripMap(\''+j.id+'\')" style="flex:1;min-width:90px;padding:9px 10px;border:1px solid rgba(52,211,153,.4);border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:rgba(52,211,153,.1);color:#34d399;font-family:\'Outfit\',sans-serif"><i class="fas fa-map-location-dot"></i> Map</button>';
    html+='<button onclick="openReceiptModal(\''+j.id+'\')" style="flex:1;min-width:90px;padding:9px 10px;border:1px solid #262626;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:#1a1a1a;color:#aaa;font-family:\'Outfit\',sans-serif"><i class="fas fa-receipt"></i> Receipt</button>';
    html+='<button onclick="openEditJobModal(\''+j.id+'\')" style="flex:1;min-width:90px;padding:9px 10px;border:1px solid rgba(96,165,250,.35);border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:rgba(96,165,250,.1);color:#60a5fa;font-family:\'Outfit\',sans-serif"><i class="fas fa-pen"></i> Edit</button>';
    if(j.status!=='cancelled'&&!isJobComplete(j.status)){
      html+='<button onclick="cancelMgrJob(\''+j.id+'\')" style="flex:1;min-width:90px;padding:9px 10px;border:1px solid rgba(245,158,11,.35);border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:rgba(245,158,11,.1);color:#f59e0b;font-family:\'Outfit\',sans-serif"><i class="fas fa-ban"></i> Cancel</button>';
    }
    html+='<button onclick="deleteMgrJob(\''+j.id+'\')" style="flex:1;min-width:90px;padding:9px 10px;border:1px solid rgba(239,68,68,.35);border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;background:rgba(239,68,68,.1);color:#fca5a5;font-family:\'Outfit\',sans-serif"><i class="fas fa-trash"></i> Delete</button>';
    html+='</div>';
    if((j.status==='dropped_off'||j.status==='done')&&j.feedbackSubmitted){
      html+='<p style="font-size:11px;color:#10b981;margin-top:6px"><i class="fas fa-star"></i> '+esc(j.feedbackRating||'—')+'/5'+(j.feedbackComment?' — '+esc(j.feedbackComment):'')+'</p>';
    }
    if(j.dropoffLat!=null){
      html+='<p style="font-size:10px;color:#6b6b6b;margin-top:4px">GPS: '+Number(j.dropoffLat).toFixed(5)+', '+Number(j.dropoffLng).toFixed(5)+'</p>';
    }
    html+='</div>';
  });
  list.innerHTML=html;
}
async function cancelMgrJob(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!confirm('Cancel this job'+(job?' for '+(job.customerName||'this customer'):'')+'? The record is kept (visible under the Cancelled filter) but it stops counting toward dispatch, assignment, or the Business revenue/mileage summary.'))return;
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'cancelled',updatedAt:Date.now()})});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(job)syncTracking(job,{status:'cancelled',driver:null});
    await loadMgrJobs();
    tT('Job cancelled','success');
  }catch(e){alert('Could not cancel job: '+(e&&e.message||e));}
}
async function deleteMgrJob(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!confirm('Permanently delete this job'+(job?' for '+(job.customerName||'this customer'):'')+'? This cannot be undone. Use this for test/duplicate entries — for a real customer who cancelled, use Cancel instead so the record is kept.'))return;
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'DELETE'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(job&&job.trackToken&&isSafeId(job.trackToken))fbFetch(FIREBASE_URL+'/tracking/'+job.trackToken+'.json',{method:'DELETE'}).catch(function(){});
    await loadMgrJobs();
    tT('Job deleted','success');
  }catch(e){alert('Could not delete job: '+(e&&e.message||e));}
}

function renderMgrDrivers(){
  var list=document.getElementById('mgr-drivers-list');if(!list)return;
  if(!mgrDrivers.length){list.innerHTML='<div style="color:#6b6b6b;font-size:13px;padding:12px 0">No drivers yet. Add one above.</div>';return;}
  var html='';
  mgrDrivers.forEach(function(d){
    html+='<div class="tt-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px">';
    html+='<div><p style="font-weight:700;font-size:14px">'+esc(d.name||'')+'</p>';
    html+='<p style="font-size:12px;color:#6b6b6b">'+esc(d.phone||'')+(d.email?' · '+esc(d.email):'')+'</p></div>';
    html+='<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">';
    html+='<span style="font-size:10px;font-weight:700;color:'+(d.active!==false?'#10b981':'#6b6b6b')+'">'+(d.active!==false?'Active':'Inactive')+'</span>';
    html+='<button onclick="deleteMgrDriver(\''+d.id+'\')" title="Delete driver" style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#fca5a5;cursor:pointer;flex-shrink:0"><i class="fas fa-trash" style="font-size:12px"></i></button>';
    html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
}

async function deleteMgrDriver(driverId){
  var d=mgrDrivers.find(function(x){return x.id===driverId;});
  if(!d)return;
  var msg='Remove '+(d.name||'this driver')+' from dispatch?';
  if(d.uid)msg+=' Their login will also stop working immediately (the account itself isn\'t deleted, just revoked — you can remove it from Firebase Authentication later if you want to fully clean it up).';
  if(!confirm(msg))return;
  try{
    var res=await fbFetch(FIREBASE_URL+'/drivers/'+driverId+'.json',{method:'DELETE'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(d.uid){
      var empRes=await fbFetch(FIREBASE_URL+'/employees/'+d.uid+'.json',{method:'DELETE'});
      if(!empRes.ok)throw new Error('Removed from roster, but revoking their login failed (HTTP '+empRes.status+') — they may still have access.');
    }
    await loadMgrDrivers();
  }catch(e){alert('Could not remove driver: '+(e&&e.message||e));}
}

function showNewDriverModal(name,email,pass){
  document.getElementById('tt-newdriver-name').textContent=name||'this driver';
  document.getElementById('tt-newdriver-email').value=email;
  document.getElementById('tt-newdriver-pass').value=pass;
  document.getElementById('tt-newdriver-modal').classList.add('active');
}
function mgrCopyFallback(text){
  var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');}catch(e){}
  document.body.removeChild(ta);
}
function copyNewDriverCreds(){
  var text='Email: '+document.getElementById('tt-newdriver-email').value+'\nTemp password: '+document.getElementById('tt-newdriver-pass').value;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).catch(function(){mgrCopyFallback(text);});
  }else{
    mgrCopyFallback(text);
  }
}

function openAssignModal(jobId){
  _assignJobId=jobId;
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  var info=document.getElementById('mgr-assign-job-info');
  if(info){
    var cur=job&&job.assignedDriverName?('Currently: '+job.assignedDriverName+' · '):'';
    info.textContent=cur+(job?(job.customerName+' · '+(job.pickupAddress||'')):'');
  }
  var list=document.getElementById('mgr-assign-driver-list');
  if(!list)return;
  var active=mgrDrivers.filter(function(d){return d.active!==false;});
  if(!active.length){list.innerHTML='<p style="color:#6b6b6b;font-size:13px">No active drivers. Add drivers first.</p>';}
  else{
    var html='';
    active.forEach(function(d){
      var isCurrent=job&&job.assignedDriverId===d.id;
      html+='<button onclick="assignJobToDriver(\''+jobId+'\',\''+d.id+'\')" style="width:100%;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid '+(isCurrent?'#f59e0b':'#262626')+';background:'+(isCurrent?'rgba(245,158,11,.1)':'#1a1a1a')+';color:#f0f0f0;cursor:pointer;font-family:\'Outfit\',sans-serif">';
      html+='<span style="font-weight:700">'+esc(d.name)+(isCurrent?' (current)':'')+'</span><br>';
      html+='<span style="font-size:12px;color:#6b6b6b">'+esc(d.phone||'')+(d.email?' · '+esc(d.email):'')+'</span></button>';
    });
    list.innerHTML=html;
  }
  document.getElementById('mgr-assign-modal').classList.add('active');
}

var FORMSPREE_URL='https://formspree.io/f/xdkyonjb';
function mapsLink(addr){
  if(!addr||addr==='N/A')return '';
  return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addr);
}
function mapsSearchLink(addr){
  if(!addr||addr==='N/A')return '';
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(addr);
}

// URL-safe base64 so job details can be embedded directly in a receipt link — the
// receipt page then needs zero Firebase access (no DB rule for anonymous reads
// required), it just decodes whatever the authenticated app encoded into the URL.
function b64urlEncode(str){
  var b64=btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function randomShortId(n){
  n=n||8;
  var chars='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I — easier to read aloud/retype
  var s='';
  for(var i=0;i<n;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
// Saves the receipt payload under a short random ID (/receiptLinks/{id}, public
// read per database.rules.json) and returns a short link pointing at it, instead
// of the long base64-blob link this used to build inline. Falls back to the old
// self-contained long link if the save fails for any reason (rules not yet
// published, offline, etc.) so a receipt link is still always produced.
async function buildReceiptUrl(job){
  var isTow=job.jobType==='tow';
  var d={
    id:job.id||'',
    n:job.customerName||'',
    s:job.service||'',
    v:job.vehicle||'',
    pu:job.pickupAddress||'',
    do:(isTow&&job.destinationAddress&&job.destinationAddress!=='N/A')?job.destinationAddress:'',
    em:Number(job.enrouteMiles)||0,
    tm:isTow?(Number(job.towMiles)||0):0,
    amt:Number(job.amount)||0,
    pp:job.paymentPref||'',
    pm:job.payMethod||'',
    dn:job.assignedDriverName||'',
    dt:job.droppedOffAt||job.updatedAt||Date.now(),
    jt:job.jobType||'',
    ft:job.feedbackToken||'',
    er:RATES.enroute,
    tr:RATES.tow
  };
  try{
    var shortId=randomShortId(8);
    var res=await fbFetch(FIREBASE_URL+'/receiptLinks/'+shortId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return 'https://corridortowing.org/receipt.html?r='+shortId;
  }catch(e){
    console.warn('Receipt shortlink save failed, using long-form link instead:',e);
    return 'https://corridortowing.org/receipt.html?d='+b64urlEncode(JSON.stringify(d));
  }
}
async function openReceiptModal(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!job){alert('Job not found.');return;}
  var url=await buildReceiptUrl(job);
  document.getElementById('mgr-receipt-link').value=url;
  var smsBtn=document.getElementById('mgr-receipt-sms');
  var mailBtn=document.getElementById('mgr-receipt-email');
  var text='Corridor Towing: Here\'s your receipt — '+url;
  smsBtn.href=job.customerPhone?('sms:'+String(job.customerPhone).replace(/\s/g,'')+'?&body='+encodeURIComponent(text)):'#';
  smsBtn.style.opacity=job.customerPhone?'1':'.4';
  smsBtn.style.pointerEvents=job.customerPhone?'auto':'none';
  var custEmail=(job.customerEmail||'').trim();
  mailBtn.href=custEmail?('mailto:'+custEmail+'?subject='+encodeURIComponent('Your Corridor Towing Receipt')+'&body='+encodeURIComponent(text)):'#';
  mailBtn.style.opacity=custEmail?'1':'.4';
  mailBtn.style.pointerEvents=custEmail?'auto':'none';
  document.getElementById('mgr-receipt-modal').classList.add('active');
}
function copyReceiptLink(){
  var input=document.getElementById('mgr-receipt-link');
  input.select();
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(input.value).then(function(){tT('Receipt link copied','success');}).catch(function(){mgrCopyFallback(input.value);});
  }else{
    mgrCopyFallback(input.value);
  }
}

