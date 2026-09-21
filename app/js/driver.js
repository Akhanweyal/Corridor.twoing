var initTT_done=false,ttD={driverName:'',records:[]},ttCS=null,ttCM=null,ttDB=null;
var COMPANY_EMAIL='corridor.towing.services@gmail.com'; // same inbox used everywhere else on the site


// ---- Firebase ----
function setSyncStatus(s){var el=document.getElementById('tt-sync-status');if(!el)return;if(s==='synced'){el.className='tt-sync-indicator synced';el.innerHTML='<i class="fas fa-cloud"></i> Synced';}else if(s==='syncing'){el.className='tt-sync-indicator syncing';el.innerHTML='<i class="fas fa-spinner fa-spin"></i> Syncing';}else if(s==='error'){el.className='tt-sync-indicator error';el.innerHTML='<i class="fas fa-cloud-exclamation"></i> Offline';}else{el.className='tt-sync-indicator';el.innerHTML='<i class="fas fa-cloud"></i> Cloud';}}
// Time logs are keyed by the signed-in account's Firebase UID (not by the freely-typed
// name) so two different logged-in drivers can never collide/overwrite each other's
// records — even if they type the same or a mistyped name. The typed name is still
// stored on each record purely as a display label for reports.
function driverUid(){return(fbAuth&&fbAuth.currentUser)?fbAuth.currentUser.uid:null;}
async function firebaseSaveRecord(rec){var uid=driverUid();if(!uid||!ttD.driverName)return false;setSyncStatus('syncing');try{var res=await fbFetch(FIREBASE_URL+'/driverLogs/'+uid+'/'+rec.id+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({driverName:ttD.driverName,date:rec.date,checkIn:rec.checkIn,checkOut:rec.checkOut,hours:rec.hours,updatedAt:Date.now()})});if(!res.ok)throw new Error('HTTP '+res.status);setSyncStatus('synced');return true;}catch(err){setSyncStatus('error');return false;}}
async function firebaseLoadRecords(){var uid=driverUid();if(!uid)return null;setSyncStatus('syncing');try{var res=await fbFetch(FIREBASE_URL+'/driverLogs/'+uid+'.json');if(!res.ok)throw new Error('HTTP '+res.status);var data=await res.json();setSyncStatus('synced');if(!data)return[];var records=[];for(var id in data){var r=data[id];if(r&&r.date&&isSafeId(id))records.push({id:id,date:r.date,checkIn:r.checkIn||null,checkOut:r.checkOut||null,hours:r.hours!=null?r.hours:null,driverName:r.driverName||null});}return records;}catch(err){setSyncStatus('error');return null;}}


// ---- Global checklist state (accessible from onclick attributes) ----
var _ttPendingPhoto = null;
var _ttClChecked = {oil: false, inspection: false, engine: false};

function toggleCL(el, key) {
  el.classList.toggle('checked');
  _ttClChecked[key] = el.classList.contains('checked');
  _updateCLProgress();
}

function _updateCLProgress() {
  var all = _ttClChecked.oil && _ttClChecked.inspection && _ttClChecked.engine;
  var done = [_ttClChecked.oil, _ttClChecked.inspection, _ttClChecked.engine].filter(Boolean).length;
  var note = document.getElementById('tt-cl-note');
  var btn = document.getElementById('tt-cl-confirm');
  if (!note || !btn) return;
  if (all) {
    note.innerHTML = '<p style="color:#10b981;font-weight:700;font-size:14px"><i class="fas fa-check-circle" style="margin-right:6px"></i>All confirmed — good to go!</p>';
    btn.disabled = false;
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
  } else {
    var left = 3 - done;
    note.innerHTML = '<p style="font-size:13px;color:#6b6b6b">' + left + ' item' + (left > 1 ? 's' : '') + ' remaining — tap to confirm</p>';
    btn.disabled = true;
    btn.style.background = '#2a2a2a';
    btn.style.color = '#555';
    btn.style.cursor = 'not-allowed';
  }
}

function openChecklist(photoData) {
  _ttPendingPhoto = photoData;
  _ttClChecked = {oil: false, inspection: false, engine: false};
  document.querySelectorAll('.cl-item').forEach(function(it) { it.classList.remove('checked'); });
  _updateCLProgress();
  var prev = document.getElementById('tt-cl-preview');
  if (prev) prev.src = photoData;
  var ov = document.getElementById('tt-cl-overlay');
  if (ov) { ov.classList.add('active'); ov.scrollTop = 0; }
}

function confirmChecklist() {
  var ov = document.getElementById('tt-cl-overlay');
  if (ov) ov.classList.remove('active');
  if (_ttPendingPhoto && typeof window._ttFinishCheckIn === 'function') {
    window._ttFinishCheckIn(_ttPendingPhoto);
  }
  _ttPendingPhoto = null;
}

function cancelChecklist() {
  var ov = document.getElementById('tt-cl-overlay');
  if (ov) ov.classList.remove('active');
  _ttPendingPhoto = null;
}

// ---- Main init ----
function initTT(){
  if(initTT_done)return;
  initTT_done=true;
  // Namespaced per signed-in account so a shared/borrowed device never shows one
  // driver's cached name and records to a different driver who signs in after them.
  var SK='tt_meta_v6_'+((fbAuth&&fbAuth.currentUser&&fbAuth.currentUser.uid)||'anon');

  function oDB(){return new Promise(function(rv,rj){if(ttDB){rv(ttDB);return;}var q=indexedDB.open('TowTrackPhotos',1);q.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};q.onsuccess=function(e){ttDB=e.target.result;rv(ttDB);};q.onerror=function(e){rj(e.target.error);};});}
  function sP(id,dataUrl){return oDB().then(function(db){return new Promise(function(rv,rj){var tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:id,data:dataUrl});tx.oncomplete=function(){rv();};tx.onerror=function(e){rj(e.target.error);};});});}
  function gP(id){return oDB().then(function(db){return new Promise(function(rv,rj){var tx=db.transaction('photos','readonly');var req=tx.objectStore('photos').get(id);req.onsuccess=function(){rv(req.result?req.result.data:null);};req.onerror=function(e){rj(e.target.error);};});});}
  function ld(){try{var r=localStorage.getItem(SK);if(r){var p=JSON.parse(r);ttD=Object.assign({driverName:'',records:[]},p);}}catch(e){}}
  function sv(){try{localStorage.setItem(SK,JSON.stringify(ttD));}catch(e){}}
  function uid(){return Date.now().toString(36)+Math.random().toString(36).substr(2,6);}
  function fD(t){return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
  function fT(t){return new Date(t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});}
  function fTs(t){return new Date(t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});}
  function dK(t){var d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function tK(){return dK(Date.now());}
  function pDK(dk){var p=dk.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}

  // THE ONE TRUE CALCULATION: returns elapsed milliseconds between two Unix timestamps
  function calcMs(startTs,endTs){
    var ms=Number(endTs)-Number(startTs);
    return ms>0?ms:0;
  }

  function initials(n){var p=n.trim().split(/\s+/);return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():n.substring(0,2).toUpperCase();}

  // Toasts
  // tT() toast helper is global now (see auth.js) so the manager screens can use it too.
  function sS(){var el=document.getElementById('tt-spop');el.classList.add('active');setTimeout(function(){el.classList.remove('active');},900);}
  function vP(src){document.getElementById('tt-pvw-img').src=src;document.getElementById('tt-pvw').classList.add('active');}

  // Pay periods
  function pp(ts){var d=new Date(ts),dy=d.getDate(),mo=d.getMonth(),yr=d.getFullYear();if(dy<=15)return{s:new Date(yr,mo,1),e:new Date(yr,mo,15,23,59,59)};var l=new Date(yr,mo+1,0).getDate();return{s:new Date(yr,mo,16),e:new Date(yr,mo,l,23,59,59)};}
  function cp(){return pp(Date.now());}
  function pv(){var n=new Date();if(n.getDate()<=15){var pm=new Date(n.getFullYear(),n.getMonth()-1,1);var ld=new Date(n.getFullYear(),n.getMonth(),0).getDate();return{s:new Date(pm.getFullYear(),pm.getMonth(),16),e:new Date(pm.getFullYear(),pm.getMonth(),ld,23,59,59)};}return{s:new Date(n.getFullYear(),n.getMonth(),1),e:new Date(n.getFullYear(),n.getMonth(),15,23,59,59)};}
  function rp(period){var sk=dK(period.s.getTime()),ek=dK(period.e.getTime());return ttD.records.filter(function(r){return r.date>=sk&&r.date<=ek;});}

  // Screen nav
  var navStack=['dash'],navIdx=0,drvJobFilter='active',drvJobsCache=[];

  function setPortalNavVisible(show){
    var b=document.getElementById('tt-portal-back'),h=document.getElementById('tt-portal-home');
    if(b)b.style.display=show?'inline-flex':'none';
    if(h)h.style.display=show?'inline-flex':'none';
  }
  function go(id,fromNav){
    if(!fromNav){
      if(navStack[navIdx]!==id){
        navStack=navStack.slice(0,navIdx+1);
        navStack.push(id);
        navIdx=navStack.length-1;
      }
    }
    document.querySelectorAll('.tt-screen').forEach(function(s){s.classList.remove('active');});
    var sc=document.getElementById('tt-scr-'+id);if(sc)sc.classList.add('active');
    document.querySelectorAll('.tt-ni').forEach(function(n){n.classList.toggle('active',n.dataset.s===id);});
    if(id==='dash')rD();else if(id==='hist')rH();else if(id==='rpt')rR();else if(id==='set')rS();else if(id==='jobs')loadDriverJobs();
    // Show Back/Home on every screen except Home and Setup
    setPortalNavVisible(id!=='dash'&&id!=='setup');
    var backBtn=document.getElementById('tt-portal-back');
    if(backBtn)backBtn.style.opacity=navIdx>0?'1':'0.5';
  }
  function navBack(){
    if(navIdx>0){navIdx--;go(navStack[navIdx],true);}
    else go('dash',true);
  }
  window.ttPortalBack=function(){navBack();};
  window.ttPortalHome=function(){
    navStack=['dash'];navIdx=0;go('dash',true);
  };

  // Live driver location while any job is actively assigned to them — lets the
  // manager see roughly where the driver is on the Dispatch board. Uses
  // watchPosition (fires on movement) but throttles actual Firebase writes to
  // once per ~30s to avoid hammering the database or draining battery. Stops
  // itself automatically once the driver has no active jobs left.
  var driverLocWatchId=null,driverLocLastSent=0,driverLocActiveIds=[],driverLocActiveJobs=[];
  function ensureDriverLocationTracking(activeJobs){
    driverLocActiveJobs=activeJobs||[];
    driverLocActiveIds=driverLocActiveJobs.map(function(j){return j.id;});
    if(!driverLocActiveIds.length){
      if(driverLocWatchId!=null&&navigator.geolocation){navigator.geolocation.clearWatch(driverLocWatchId);driverLocWatchId=null;}
      return;
    }
    if(driverLocWatchId!=null)return; // already tracking
    if(!navigator.geolocation)return;
    driverLocWatchId=navigator.geolocation.watchPosition(function(pos){
      var now=Date.now();
      if(now-driverLocLastSent<30000)return;
      driverLocLastSent=now;
      var payload={driverLat:pos.coords.latitude,driverLng:pos.coords.longitude,driverLocationAt:now};
      // Customer's live map (/track.html) reads this small public record, not the job itself.
      var trackDriver={lat:pos.coords.latitude,lng:pos.coords.longitude,at:now,name:firstName(ttD.driverName)};
      driverLocActiveJobs.forEach(function(j){
        if(j.trackToken&&isSafeId(j.trackToken))fbFetch(FIREBASE_URL+'/tracking/'+j.trackToken+'/driver.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(trackDriver)}).catch(function(){});
      });
      driverLocActiveIds.forEach(function(jobId){
        fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(function(){});
      });
    },function(err){console.warn('Driver location watch error',err);},{enableHighAccuracy:true,maximumAge:20000,timeout:20000});
  }

  async function loadDashJobsPreview(){
    var box=document.getElementById('tt-dash-jobs-list');
    var badge=document.getElementById('tt-jobs-badge');
    if(!box)return;
    try{
      var res=await fbFetch(FIREBASE_URL+'/jobs.json');
      if(!res.ok)throw new Error('HTTP '+res.status);
      var data=await res.json();
      var mine=[];
      var myName=(ttD.driverName||'').trim().toLowerCase();
      if(data){for(var id in data){var j=data[id];if(!j||!isSafeId(id))continue;j.id=id;
        if(jobBelongsToMe(j)&&!isJobComplete(j.status))mine.push(j);
      }}
      mine.sort(function(a,b){return(b.assignedAt||b.createdAt||0)-(a.assignedAt||a.createdAt||0);});
      ensureDriverLocationTracking(mine);
      if(badge){if(mine.length){badge.style.display='inline-block';badge.textContent=String(mine.length);}else{badge.style.display='none';}}
      if(!mine.length){
        box.innerHTML='<p style="font-size:13px;color:#6b6b6b;margin:0">No jobs assigned right now. When a manager assigns you a job, it will show here and under the <strong style="color:#f59e0b">Jobs</strong> tab below.</p>';
        return;
      }
      var html='';
      mine.forEach(function(j){
        var color=({assigned:'#60a5fa',enroute:'#a78bfa',picked_up:'#10b981'})[j.status]||'#f59e0b';
        html+='<div style="background:#1a1a1a;border:1px solid #262626;border-left:3px solid '+color+';border-radius:10px;padding:12px;margin-bottom:8px">';
        html+='<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px"><p style="font-weight:700;font-size:14px;margin:0">'+esc(j.customerName||'Customer')+'</p>';
        html+='<span style="font-size:9px;font-weight:700;color:'+color+'">'+esc((j.status||'').replace('_',' '))+'</span></div>';
        html+='<p style="font-size:12px;color:#aaa;margin:0 0 4px">'+esc(j.service||'')+' · <a href="tel:'+esc(j.customerPhone||'')+'" style="color:#60a5fa">'+esc(j.customerPhone||'')+'</a></p>';
        html+='<p style="font-size:11px;color:#6b6b6b;margin:0 0 8px;line-height:1.35">'+esc(j.pickupAddress||'')+'</p>';
        html+='<button type="button" onclick="document.querySelector(\'.tt-ni[data-s=jobs]\').click()" style="width:100%;padding:10px;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#000;font-family:\'Outfit\',sans-serif">View details &amp; update status</button>';
        html+='</div>';
      });
      box.innerHTML=html;
    }catch(e){
      box.innerHTML='<p style="font-size:13px;color:#ef4444;margin:0">Could not load jobs. Check connection.</p>';
    }
  }

  // ---- Route map on each job card (driver's own GPS -> pickup -> drop-off) ----
  var drvMaps={};
  function destroyDriverMaps(){
    Object.keys(drvMaps).forEach(function(k){
      var m=drvMaps[k];
      if(m.watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(m.watchId);
      try{m.map.destroy();}catch(e){}
    });
    drvMaps={};
  }
  window.toggleDriverMap=async function(jobId){
    var wrap=document.getElementById('drv-map-wrap-'+jobId),btn=document.getElementById('drv-map-btn-'+jobId);
    if(!wrap)return;
    if(drvMaps[jobId]){ // hide
      var old=drvMaps[jobId];
      if(old.watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(old.watchId);
      try{old.map.destroy();}catch(e){}
      delete drvMaps[jobId];wrap.style.display='none';
      if(btn)btn.innerHTML='<i class="fas fa-map-location-dot"></i> Show route map';
      return;
    }
    var job=drvJobsCache.find(function(x){return x.id===jobId;});
    if(!job)return;
    wrap.style.display='block';
    if(btn)btn.innerHTML='<i class="fas fa-eye-slash"></i> Hide route map';
    var info=document.getElementById('drv-map-info-'+jobId);
    var st={map:CTMap.create('drv-map-'+jobId),watchId:null,me:null,lastDraw:0,trip:null};
    drvMaps[jobId]=st;
    setTimeout(function(){st.map.invalidate();},80);
    info.textContent='Loading route…';
    st.trip=await tripFromJob(job);
    if(drvMaps[jobId]!==st)return;
    if(!st.trip.pickup){info.innerHTML='<span style="color:#f59e0b">This job’s address could not be placed on the map — use the Navigate button.</span>';return;}
    async function draw(refit){
      st.lastDraw=Date.now();
      var trip=Object.assign({},st.trip);
      if(st.me)trip.driver=st.me; // this phone's live GPS beats the last saved position
      var stats=await st.map.setTrip(trip,{refit:refit});
      if(drvMaps[jobId]!==st||!stats)return;
      var bits=[];
      if(trip.status==='picked_up'&&stats.toDest&&stats.toDest.seconds!=null)bits.push('To drop-off: '+CTMap.fmtMiles(stats.toDest.meters)+' · ~'+CTMap.fmtDuration(stats.toDest.seconds));
      else{
        if(stats.toPickup&&stats.toPickup.seconds!=null)bits.push('To pickup: '+CTMap.fmtMiles(stats.toPickup.meters)+' · ~'+CTMap.fmtDuration(stats.toPickup.seconds));
        if(stats.trip&&stats.trip.meters!=null)bits.push('Then to drop-off: '+CTMap.fmtMiles(stats.trip.meters)+' · ~'+CTMap.fmtDuration(stats.trip.seconds));
      }
      if(!trip.driver)bits.push('Waiting for your GPS… (allow location access)');
      info.textContent=bits.join('   |   ');
    }
    if(navigator.geolocation){
      var first=true;
      st.watchId=navigator.geolocation.watchPosition(function(pos){
        st.me={lat:pos.coords.latitude,lng:pos.coords.longitude,at:Date.now(),name:firstName(ttD.driverName)};
        if(first||Date.now()-st.lastDraw>10000){draw(first);first=false;}
      },function(){draw(true);},{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
    }
    draw(true);
  };

  function renderDriverJobsList(){
    var list=document.getElementById('drv-jobs-list');if(!list)return;
    destroyDriverMaps(); // the list is re-rendered below, which removes the old map containers
    var active=[],hist=[];
    drvJobsCache.forEach(function(j){
      if(isJobComplete(j.status))hist.push(j);else active.push(j);
    });
    var nA=document.getElementById('drv-job-active-n');if(nA)nA.textContent=active.length?'('+active.length+')':'';
    var nH=document.getElementById('drv-job-hist-n');if(nH)nH.textContent=hist.length?'('+hist.length+')':'';
    var badge=document.getElementById('tt-jobs-badge');
    if(badge){if(active.length){badge.style.display='inline-block';badge.textContent=String(active.length);}else{badge.style.display='none';}}
    var mine=drvJobFilter==='history'?hist:active;
    if(!mine.length){
      list.innerHTML='<div style="text-align:center;color:#6b6b6b;padding:32px 0;font-size:13px">'+(drvJobFilter==='history'?'No completed jobs yet':'No active jobs assigned to you')+'</div>';
      return;
    }
    var html='';
    mine.forEach(function(j){
        var isTow=(j.jobType==='tow')||/tow/i.test(j.service||'');
        var color=jobStatusColor(j.status);
        var puMap=typeof mapsSearchLink==='function'?mapsSearchLink(j.pickupAddress):('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(j.pickupAddress||''));
        var destOk=j.destinationAddress&&j.destinationAddress!=='N/A'&&j.destinationAddress.indexOf('roadside')<0;
        var destMap=destOk?(typeof mapsSearchLink==='function'?mapsSearchLink(j.destinationAddress):('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(j.destinationAddress))):'';
        var navPu=typeof mapsLink==='function'?mapsLink(j.pickupAddress):puMap;
        var navDest=destMap?(typeof mapsLink==='function'?mapsLink(j.destinationAddress):destMap):'';
        var complete=isJobComplete(j.status);
        html+='<div class="tt-card" style="border-left:3px solid '+(complete?'#10b981':color)+';padding:14px">';
        html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px">';
        html+='<div><p style="font-weight:800;font-size:17px;margin:0">'+esc(j.customerName||'Customer')+'</p>';
        html+='<p style="font-size:11px;color:#6b6b6b;margin:2px 0 0">'+(isTow?'Towing':'Roadside')+'</p></div>';
        html+='<div style="text-align:right;flex-shrink:0">';
        if(complete){
          html+='<span style="display:inline-block;font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;background:rgba(16,185,129,.15);color:#10b981;border:1px solid #10b981">COMPLETE</span>';
          html+='<p style="font-size:10px;color:#6b6b6b;margin:4px 0 0">'+jobStatusLabel(j.status)+'</p>';
        }else{
          html+='<span style="display:inline-block;font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;color:'+color+';border:1px solid '+color+'">'+jobStatusLabel(j.status)+'</span>';
          html+='<p style="font-size:10px;color:#f59e0b;margin:4px 0 0">Not complete</p>';
        }
        html+='</div></div>';

        html+='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;font-size:13px">';
        html+='<p style="color:#aaa;margin:0"><i class="fas fa-phone" style="width:16px;color:#60a5fa"></i> <a href="tel:'+esc(j.customerPhone||'')+'" style="color:#60a5fa;font-weight:600">'+esc(j.customerPhone||'—')+'</a></p>';
        if(j.customerEmail)html+='<p style="color:#aaa;margin:0"><i class="fas fa-envelope" style="width:16px;color:#6b6b6b"></i> '+esc(j.customerEmail)+'</p>';
        html+='<p style="color:#aaa;margin:0"><i class="fas fa-truck" style="width:16px;color:#f59e0b"></i> '+esc(j.service||'—')+'</p>';
        html+='<p style="color:#aaa;margin:0"><i class="fas fa-car" style="width:16px;color:#6b6b6b"></i> '+esc(j.vehicle||'—')+'</p>';
        html+='<p style="color:#aaa;margin:0"><i class="fas fa-dollar-sign" style="width:16px;color:#10b981"></i> $'+(j.amount!=null?Number(j.amount).toFixed(2):'0.00')+'</p>';
        html+='</div>';

        html+='<div style="background:#1a1a1a;border-radius:10px;padding:10px 12px;margin-bottom:8px">';
        html+='<p style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b;margin-bottom:4px">'+(isTow?'Pickup':'Service location')+'</p>';
        html+='<p style="font-size:13px;color:#f0f0f0;margin:0 0 8px;line-height:1.35">'+esc(j.pickupAddress||'—')+'</p>';
        if(j.pickupAddress)html+='<div style="display:flex;gap:6px;flex-wrap:wrap"><a href="'+navPu+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:12px;font-weight:700"><i class="fas fa-location-arrow"></i> Navigate</a><a href="'+puMap+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:#141414;border:1px solid #262626;color:#aaa;font-size:12px;font-weight:600"><i class="fas fa-map"></i> Map</a></div>';
        html+='</div>';

        if(isTow&&destOk){
          html+='<div style="background:#1a1a1a;border-radius:10px;padding:10px 12px;margin-bottom:10px">';
          html+='<p style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b;margin-bottom:4px">Drop-off'+(j.destKind==='house'?' · Home':(j.destKind==='biz'?' · Business':''))+'</p>';
          html+='<p style="font-size:13px;color:#f0f0f0;margin:0 0 8px;line-height:1.35">'+esc(j.destinationAddress)+'</p>';
          html+='<div style="display:flex;gap:6px;flex-wrap:wrap"><a href="'+navDest+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);color:#10b981;font-size:12px;font-weight:700"><i class="fas fa-location-arrow"></i> Navigate</a><a href="'+destMap+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:#141414;border:1px solid #262626;color:#aaa;font-size:12px;font-weight:600"><i class="fas fa-map"></i> Map</a></div>';
          html+='</div>';
        }

        if(!complete&&(j.pickupLat!=null||j.pickupAddress)){
          html+='<button type="button" id="drv-map-btn-'+j.id+'" onclick="toggleDriverMap(\''+j.id+'\')" style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(52,211,153,.4);background:rgba(52,211,153,.1);color:#34d399;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:10px;font-family:\'Outfit\',sans-serif"><i class="fas fa-map-location-dot"></i> Show route map</button>';
          html+='<div id="drv-map-wrap-'+j.id+'" style="display:none;margin-bottom:10px"><div id="drv-map-'+j.id+'" style="height:300px;border-radius:12px;overflow:hidden"></div><div id="drv-map-info-'+j.id+'" style="font-size:12px;color:#aaa;margin-top:6px"></div></div>';
        }

        if(drvJobFilter==='history'){
          var when=j.droppedOffAt||j.updatedAt||j.assignedAt;
          var whenStr=when?new Date(when).toLocaleString():'';
          html+='<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:'+(complete?'rgba(16,185,129,.08)':'rgba(245,158,11,.08)')+';border:1px solid '+(complete?'rgba(16,185,129,.25)':'rgba(245,158,11,.25)')+'">';
          html+='<p style="font-size:13px;font-weight:700;margin:0;color:'+(complete?'#10b981':'#f59e0b')+'">'+(complete?'✓ Job complete':'○ Job not complete')+'</p>';
          html+='<p style="font-size:11px;color:#6b6b6b;margin:4px 0 0">Status: '+jobStatusLabel(j.status)+(whenStr?' · '+whenStr:'')+'</p>';
          html+='</div>';
        }else{
          html+='<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">';
          if(j.status==='assigned')html+='<button onclick="driverUpdateStatus(\''+j.id+'\',\'enroute\')" style="padding:14px;border:none;border-radius:12px;font-weight:800;font-size:15px;background:#a78bfa;color:#000;cursor:pointer;font-family:\'Outfit\',sans-serif">En Route</button>';
          if(isTow){
            if(j.status==='enroute')html+='<button onclick="driverUpdateStatus(\''+j.id+'\',\'picked_up\')" style="padding:14px;border:none;border-radius:12px;font-weight:800;font-size:15px;background:#10b981;color:#fff;cursor:pointer;font-family:\'Outfit\',sans-serif">Vehicle Picked Up</button>';
            if(j.status==='picked_up'||j.status==='enroute')html+='<button onclick="driverUpdateStatus(\''+j.id+'\',\'done\')" style="padding:14px;border:none;border-radius:12px;font-weight:800;font-size:15px;background:#f59e0b;color:#000;cursor:pointer;font-family:\'Outfit\',sans-serif">Vehicle Delivered — Done</button>';
          }else{
            if(j.status==='enroute')html+='<button onclick="driverUpdateStatus(\''+j.id+'\',\'on_location\')" style="padding:14px;border:none;border-radius:12px;font-weight:800;font-size:15px;background:#34d399;color:#000;cursor:pointer;font-family:\'Outfit\',sans-serif">On Location</button>';
            if(j.status==='on_location'||j.status==='enroute')html+='<button onclick="driverUpdateStatus(\''+j.id+'\',\'done\')" style="padding:14px;border:none;border-radius:12px;font-weight:800;font-size:15px;background:#f59e0b;color:#000;cursor:pointer;font-family:\'Outfit\',sans-serif">Service Done</button>';
          }
          html+='</div>';
        }
        html+='</div>';
      });
      list.innerHTML=html;
  }

  function jobBelongsToMe(j){
    var myName=(ttD.driverName||'').trim().toLowerCase();
    if(!myName)return false;
    var assigned=(j.assignedDriverName||'').trim().toLowerCase();
    // Must be explicitly assigned to this driver (never show unassigned or other drivers' jobs)
    if(!assigned)return false;
    return assigned===myName;
  }

  async function loadDriverJobs(){
    var list=document.getElementById('drv-jobs-list');if(!list)return;
    list.innerHTML='<div style="text-align:center;color:#6b6b6b;padding:24px 0;font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
    try{
      var res=await fbFetch(FIREBASE_URL+'/jobs.json');
      if(!res.ok)throw new Error('HTTP '+res.status);
      var data=await res.json();
      var mine=[];
      if(data){for(var id in data){var j=data[id];if(!j||!isSafeId(id))continue;j.id=id;
        if(jobBelongsToMe(j))mine.push(j);
      }}
      mine.sort(function(a,b){return(b.assignedAt||b.updatedAt||b.createdAt||0)-(a.assignedAt||a.updatedAt||a.createdAt||0);});
      drvJobsCache=mine;
      ensureDriverLocationTracking(mine.filter(function(j){return!isJobComplete(j.status);}));
      renderDriverJobsList();
    }catch(e){
      list.innerHTML='<div style="color:#ef4444;text-align:center;padding:24px 0">Could not load jobs</div>';
    }
  }

  window.driverUpdateStatus=async function(jobId,status){
    var payload={status:status,updatedAt:Date.now()};
    var geoExtra=null;
    if(status==='picked_up')payload.pickedUpAt=Date.now();
    if(status==='on_location')payload.onLocationAt=Date.now();
    if(status==='dropped_off'||status==='done'){
      payload.droppedOffAt=Date.now();
      try{
        var pos=await new Promise(function(resolve,reject){
          if(!navigator.geolocation)return reject(new Error('no geo'));
          navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000});
        });
        payload.dropoffLat=pos.coords.latitude;
        payload.dropoffLng=pos.coords.longitude;
        payload.dropoffAccuracy=pos.coords.accuracy;
        geoExtra={lat:pos.coords.latitude,lng:pos.coords.longitude};
      }catch(geoErr){console.warn('GPS unavailable',geoErr);}
    }
    try{
      var patchRes=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!patchRes.ok)throw new Error('HTTP '+patchRes.status);
      var jr=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json');
      if(!jr.ok)throw new Error('HTTP '+jr.status);
      var job=await jr.json();
      if(job){
        job.id=jobId;
        syncTracking(job,(status==='done'||status==='dropped_off')?{status:'done',driver:null}:{status:trackStatus(status)});
        var custEmail=(job.customerEmail||'').trim();
        if(typeof notifyCustomerStatusEmail==='function'){
          await notifyCustomerStatusEmail(job,status,geoExtra);
          if(custEmail)tT('Email sent to customer: '+custEmail,'success');
          else tT('Status saved — customer has no email on this job','warning');
        }
        if(job.customerPhone){
          var dName=job.assignedDriverName||'your driver';
          var dPhone=job.assignedDriverPhone||'(804) 292-8414';
          var isTowJob=(job.jobType==='tow')||/tow/i.test(job.service||'');
          var text='';
          if(status==='enroute')text='Corridor Towing: '+dName+' is en route. Call '+dPhone+' if needed.';
          if(status==='on_location')text='Corridor Towing: '+dName+' is on location and starting service.';
          if(status==='picked_up')text='Corridor Towing: Your vehicle has been picked up by '+dName+'.';
          var fbUrl='https://corridortowing.org/feedback.html?job='+encodeURIComponent(job.id||'')+'&t='+encodeURIComponent(job.feedbackToken||'');
          var trkUrl=trackUrl(job);
          if(trkUrl&&(status==='enroute'||status==='on_location'||status==='picked_up'))text+='\nTrack live: '+trkUrl;
          // "dropped_off" only still appears here for any older job the app itself
          // no longer creates that status for — "done" is the only completion
          // status driver actions send now, for both tow and roadside jobs.
          if(status==='done'||status==='dropped_off'){
            var rcUrl=await buildReceiptUrl(job); // only needed once the job is finished
            text=(isTowJob?'Corridor Towing: Your vehicle has been delivered. Thank you!':'Corridor Towing: Your service is complete. Thank you!')+'\nReceipt: '+rcUrl+'\nFeedback: '+fbUrl;
          }
          if(text){
            setTimeout(function(){
              window.location.href='sms:'+String(job.customerPhone).replace(/\s/g,'')+'?&body='+encodeURIComponent(text);
            },700);
          }
        }
      }
      tT('Status updated','success');
      loadDriverJobs();
      if(typeof loadDashJobsPreview==='function')loadDashJobsPreview();
    }catch(e){console.error(e);tT('Update failed','error');}
  };

  // Dashboard
  function rD(){
    document.getElementById('tt-d-name').textContent=ttD.driverName;
    var tk=tK(),today=null,open=null;
    for(var i=ttD.records.length-1;i>=0;i--){if(ttD.records[i].date===tk&&!today)today=ttD.records[i];if(ttD.records[i].checkIn&&!ttD.records[i].checkOut&&!open)open=ttD.records[i];}
    var dot=document.getElementById('tt-s-dot'),lbl=document.getElementById('tt-s-lbl'),det=document.getElementById('tt-s-det'),btn=document.getElementById('tt-btn-act'),btnT=document.getElementById('tt-btn-act-t');
    if(open){dot.style.background='#10b981';lbl.textContent='Checked In';lbl.style.color='#10b981';det.textContent='Since '+fTs(open.checkIn.time);btn.style.background='linear-gradient(135deg,#f59e0b,#ea580c)';btn.className='';btnT.textContent='Check Out';btn.querySelector('i').className='fas fa-camera';}
    else{dot.style.background='#6b6b6b';lbl.textContent='Checked Out';lbl.style.color='#f0f0f0';det.textContent=today?'Last out: '+fTs(today.checkOut?today.checkOut.time:today.checkIn.time):'Ready to start your shift';btn.style.background='linear-gradient(135deg,#10b981,#059669)';btn.className='tt-pg';btnT.textContent='Check In';btn.querySelector('i').className='fas fa-clipboard-check';}
    if(today){
      document.getElementById('tt-t-in').textContent=today.checkIn?fTs(today.checkIn.time):'--:--';
      document.getElementById('tt-t-out').textContent=(today.checkOut&&today.checkOut.time)?fTs(today.checkOut.time):(open?'Active':'--:--');
      var ms=getMs(today);
      document.getElementById('tt-t-hrs').textContent=ms!=null?msToHM(ms):(open?'...':'--');
    }else{document.getElementById('tt-t-in').textContent='--:--';document.getElementById('tt-t-out').textContent='--:--';document.getElementById('tt-t-hrs').textContent='--';}
    var phDiv=document.getElementById('tt-photos');
    if(today){
      phDiv.style.display='block';
      var wIn=document.getElementById('tt-ph-in-wrap'),wOut=document.getElementById('tt-ph-out-wrap');
      if(!wIn||!wOut){phDiv.style.display='none';}else{
        wIn.innerHTML='<i class="fas fa-camera"></i>';wIn.onclick=null;wIn.style.cursor='default';
        wOut.innerHTML='<i class="fas fa-camera"></i>';wOut.onclick=null;wOut.style.cursor='default';
        if(today.checkIn){gP(today.id+'_in').then(function(data){if(data){var img=document.createElement('img');img.src=data;img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:10px;display:block';var w=document.getElementById('tt-ph-in-wrap');w.innerHTML='';w.appendChild(img);w.style.cursor='pointer';w.onclick=(function(d){return function(){vP(d);};})(data);}}).catch(function(){});}
        if(today.checkOut){gP(today.id+'_out').then(function(data){if(data){var img=document.createElement('img');img.src=data;img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:10px;display:block';var w=document.getElementById('tt-ph-out-wrap');w.innerHTML='';w.appendChild(img);w.style.cursor='pointer';w.onclick=(function(d){return function(){vP(d);};})(data);}}).catch(function(){});}
      }
    }else{phDiv.style.display='none';}
    loadDashJobsPreview();
  }

  // History
  var histPeriod='first';
  function rH(){
    document.getElementById('tt-hist-avatar').textContent=initials(ttD.driverName);
    document.getElementById('tt-hist-dname').textContent=ttD.driverName;
    var now=new Date(),yr=now.getFullYear(),mo=now.getMonth(),ld=new Date(yr,mo+1,0).getDate();
    var fS=dK(new Date(yr,mo,1).getTime()),fE=dK(new Date(yr,mo,15,23,59,59).getTime());
    var sS2=dK(new Date(yr,mo,16).getTime()),sE=dK(new Date(yr,mo,ld,23,59,59).getTime());
    var fRecs=ttD.records.filter(function(r){return r.date>=fS&&r.date<=fE;});
    var sRecs=ttD.records.filter(function(r){return r.date>=sS2&&r.date<=sE;});
    var fMs=0,sMs=0;
    fRecs.forEach(function(r){var ms=getMs(r);if(ms!=null)fMs+=ms;});
    sRecs.forEach(function(r){var ms=getMs(r);if(ms!=null)sMs+=ms;});
    document.getElementById('tt-h-first').textContent=msToHM(fMs);
    document.getElementById('tt-h-second').textContent=msToHM(sMs);
    // Update shift counts and month label
    var fd1=document.getElementById('tt-h-first-days');if(fd1)fd1.textContent=fRecs.length+' shift'+(fRecs.length!==1?'s':'');
    var fd2=document.getElementById('tt-h-second-days');if(fd2)fd2.textContent=sRecs.length+' shift'+(sRecs.length!==1?'s':'');
    var moLabel=new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'});
    var mo1=document.getElementById('tt-h-first-mo');if(mo1)mo1.textContent=moLabel;
    var mo2=document.getElementById('tt-h-second-mo');if(mo2)mo2.textContent=moLabel;
    var filtered=histPeriod==='first'?fRecs:histPeriod==='second'?sRecs:ttD.records;
    var totMs=0;filtered.forEach(function(r){var ms=getMs(r);if(ms!=null)totMs+=ms;});
    document.getElementById('tt-h-hrs').textContent=msToHM(totMs);
    document.getElementById('tt-h-days').textContent=filtered.length;
    var sorted=filtered.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
    var tb='';
    if(!sorted.length){tb='<tr><td colspan="5" style="text-align:center;color:#6b6b6b;padding:40px 0">No records for this period</td></tr>';}
    else{sorted.forEach(function(r){var d=pDK(r.date);var ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});var ws=d.toLocaleDateString('en-US',{weekday:'short'});var iT=(r.checkIn&&r.checkIn.time)?fTs(r.checkIn.time):'--';var oT=(r.checkOut&&r.checkOut.time)?fTs(r.checkOut.time):'--';var ms=getMs(r);var hr=ms!=null?msToHM(ms):'<span style="color:#f59e0b;font-size:11px;font-weight:700">OPEN</span>';tb+='<tr><td><span style="font-weight:600">'+ds+'</span><br><span style="font-size:10px;color:#6b6b6b">'+ws+'</span></td><td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+iT+'</td><td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+oT+'</td><td style="font-family:\'JetBrains Mono\',monospace;font-weight:700">'+hr+'</td><td id="phc-'+r.id+'"><span style="color:#444;font-size:12px">—</span></td></tr>';});
    tb+='<tr class="tt-total-row"><td colspan="3" style="text-align:right;padding-right:8px">TOTAL:</td><td style="font-family:\'JetBrains Mono\',monospace;font-weight:700;padding:10px 12px">'+msToHM(totMs)+'</td><td></td></tr>';}
    document.getElementById('tt-h-tb').innerHTML=tb;
    sorted.forEach(function(r){var cell=document.getElementById('phc-'+r.id);if(!cell)return;gP(r.id+'_in').then(function(d){if(d){var img=document.createElement('img');img.src=d;img.className='tt-pth';img.onclick=(function(src){return function(){vP(src);};})(d);cell.innerHTML='';cell.appendChild(img);}}).catch(function(){});});
  }

  // Reports
  function rR(){
    document.getElementById('tt-rpt-avatar').textContent=initials(ttD.driverName);
    document.getElementById('tt-rpt-dname').textContent=ttD.driverName;
    var cur=cp(),prev=pv();
    document.getElementById('tt-rp-cur').textContent=fD(cur.s.getTime())+' — '+fD(cur.e.getTime());
    document.getElementById('tt-rp-prev').textContent=fD(prev.s.getTime())+' — '+fD(prev.e.getTime());
    var cRecs=rp(cur),pRecs=rp(prev);
    var cMs=0,pMs=0;
    cRecs.forEach(function(r){var ms=getMs(r);if(ms!=null)cMs+=ms;});
    pRecs.forEach(function(r){var ms=getMs(r);if(ms!=null)pMs+=ms;});
    document.getElementById('tt-rp-ch').textContent=msToHM(cMs);
    document.getElementById('tt-rp-cd').textContent=cRecs.length;
    document.getElementById('tt-rp-ph').textContent=msToHM(pMs);
    document.getElementById('tt-rp-pd').textContent=pRecs.length;
    var sorted=cRecs.slice().sort(function(a,b){return a.date.localeCompare(b.date);});
    var tb='';
    if(!sorted.length){tb='<tr><td colspan="4" style="text-align:center;color:#6b6b6b;padding:40px 0">No records this period</td></tr>';}
    else{sorted.forEach(function(r){var d=pDK(r.date);var ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});var iT=(r.checkIn&&r.checkIn.time)?fTs(r.checkIn.time):'--';var oT=(r.checkOut&&r.checkOut.time)?fTs(r.checkOut.time):'--';var ms=getMs(r);var hr=ms!=null?msToHM(ms):'<span style="color:#f59e0b;font-size:11px;font-weight:700">OPEN</span>';tb+='<tr><td style="font-weight:600">'+ds+'</td><td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+iT+'</td><td style="font-family:\'JetBrains Mono\',monospace;font-size:12px">'+oT+'</td><td style="font-family:\'JetBrains Mono\',monospace;font-weight:700">'+hr+'</td></tr>';});
    tb+='<tr class="tt-total-row"><td colspan="3" style="text-align:right">TOTAL:</td><td style="font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:700;padding:10px 12px">'+msToHM(cMs)+'</td></tr>';}
    document.getElementById('tt-rp-tb').innerHTML=tb;
  }

  // Settings
  function rS(){document.getElementById('tt-set-n').value=ttD.driverName;}

  // Report text
  function rptT(label,period){var recs=rp(period);var totMs=0;recs.forEach(function(r){var ms=getMs(r);if(ms!=null)totMs+=ms;});var lines=['CORRIDOR TOWING','Driver: '+ttD.driverName,'Period: '+label+' ('+fD(period.s.getTime())+' — '+fD(period.e.getTime())+')','Total Time: '+msToHM(totMs)+' ('+msToHrsDecimal(totMs)+' hrs decimal)','Days Worked: '+recs.length,''];recs.slice().sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(r){var d=pDK(r.date);var ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',weekday:'short'});var iT=(r.checkIn&&r.checkIn.time)?fT(r.checkIn.time):'N/A';var oT=(r.checkOut&&r.checkOut.time)?fT(r.checkOut.time):'N/A';var ms=getMs(r);var hr=ms!=null?msToHM(ms)+' ('+msToHrsDecimal(ms)+' hrs)':'OPEN';lines.push(ds+'  In: '+iT+'  Out: '+oT+'  '+hr);});return lines.join('\n');}

  // Excel download
  function downloadExcel(){
    if(typeof XLSX==='undefined'){alert('Excel library not loaded.');return;}
    var wb=XLSX.utils.book_new(),cur=cp(),prev=pv();
    function makeSheet(recs,label,period){
      var totMs=0;recs.forEach(function(r){var ms=getMs(r);if(ms!=null)totMs+=ms;});
      var data=[['CORRIDOR TOWING'],['DRIVER PAYROLL REPORT — '+label],[''],['Driver:',ttD.driverName],['Period:',fD(period.s.getTime())+' — '+fD(period.e.getTime())],['Total Time:',msToHM(totMs)],['Total Hours (decimal):',msToHrsDecimal(totMs)],['Days Worked:',recs.length],[''],['Date','Day','Check In','Check Out','Duration','Hours (decimal)']];
      recs.slice().sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(r){var d=pDK(r.date);var ms=getMs(r);data.push([d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),d.toLocaleDateString('en-US',{weekday:'short'}),(r.checkIn&&r.checkIn.time)?fT(r.checkIn.time):'N/A',(r.checkOut&&r.checkOut.time)?fT(r.checkOut.time):'N/A',ms!=null?msToHM(ms):'OPEN',ms!=null?msToHrsDecimal(ms):'']);});
      data.push(['','','','TOTAL:',msToHM(totMs),msToHrsDecimal(totMs)]);
      var ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=[{wch:22},{wch:8},{wch:14},{wch:14},{wch:12},{wch:14}];ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}}];return ws;
    }
    XLSX.utils.book_append_sheet(wb,makeSheet(rp(cur),'Current Period',cur),'Current Period');
    XLSX.utils.book_append_sheet(wb,makeSheet(rp(prev),'Previous Period',prev),'Previous Period');
    XLSX.utils.book_append_sheet(wb,makeSheet(ttD.records,'All Time',{s:new Date(2020,0,1),e:new Date()}),'All Records');
    XLSX.writeFile(wb,'TowTrack_'+ttD.driverName.replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
    tT('Excel downloaded!','success');
  }

  // ---- Camera ----
  function openCam(mode){
    ttCM = mode;
    var te = document.getElementById('tt-cam-type');
    te.textContent = mode==='checkin' ? 'CHECK IN' : 'CHECK OUT';
    te.style.color  = mode==='checkin' ? '#10b981' : '#f59e0b';
    document.getElementById('tt-cam-dt').textContent = new Date().toLocaleString();
    document.getElementById('tt-camov').classList.add('active');
    navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false})
      .then(function(s){ ttCS=s; document.getElementById('tt-cam-vid').srcObject=s; })
      .catch(function(e){
        closeCam();
        var m = 'Camera error.';
        if(e.name==='NotAllowedError') m='Camera permission denied. Please allow camera access in your browser settings.';
        else if(e.name==='NotFoundError') m='No camera found on this device.';
        tT(m,'error');
      });
  }

  function closeCam(){
    if(ttCS){ ttCS.getTracks().forEach(function(t){t.stop();}); ttCS=null; }
    var vid = document.getElementById('tt-cam-vid');
    if(vid) vid.srcObject = null;
    document.getElementById('tt-camov').classList.remove('active');
    ttCM = null;
  }

  function doScreenFlash(){
    // Briefly flash the whole screen white — simulates front flash
    var fl = document.getElementById('tt-screen-flash');
    if(!fl) return;
    fl.style.transition = 'none';
    fl.style.opacity = '1';
    // Force reflow then fade out
    void fl.offsetWidth;
    fl.style.transition = 'opacity 0.6s ease';
    fl.style.opacity = '0';
  }

  function capPhoto(){
    var mode = ttCM;
    if(!mode){ return; }
    var vid = document.getElementById('tt-cam-vid');
    var cv  = document.getElementById('tt-cam-cv');
    var ctx = cv.getContext('2d');
    var W=480, H=360;
    cv.width=W; cv.height=H;
    // Mirror selfie horizontally
    ctx.save();
    ctx.translate(W,0);
    ctx.scale(-1,1);
    ctx.drawImage(vid,0,0,W,H);
    ctx.restore();
    // Timestamp bar
    var now   = new Date();
    var label = mode==='checkin' ? '✓ CHECK IN' : '✓ CHECK OUT';
    var color = mode==='checkin' ? '#10b981' : '#f59e0b';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,H-44,W,44);
    ctx.font='bold 13px Arial';
    ctx.fillStyle=color; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(label, 10, H-22);
    ctx.fillStyle='#fff'; ctx.textAlign='right';
    ctx.fillText(
      ttD.driverName + '  •  ' +
      now.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' +
      now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
      W-10, H-22
    );
    // Fire screen flash THEN capture
    doScreenFlash();
    var pd = cv.toDataURL('image/jpeg', 0.65);
    _ttSmallPhoto = compressCanvas(cv,320,240,0.35);
    closeCam();
    if(mode==='checkin'){
      openChecklist(pd);
    }else{
      finishCheckOut(pd);
    }
  }

  /* ===================== CHECK IN / OUT ===================== */
  function finishCheckIn(pd){
    for(var i=0;i<ttD.records.length;i++){if(ttD.records[i].checkIn&&!ttD.records[i].checkOut){tT('Already checked in! Check out first.','warning');rD();return;}}
    var now=Date.now(),tk=tK(),rid=uid();
    // Compress photo small enough for Firebase (max ~25KB)
    var smallPd=_ttSmallPhoto||pd;_ttSmallPhoto=null;
    var newRec={id:rid,date:tk,checkIn:{time:now,photo:smallPd},checkOut:null,hours:null};
    ttD.records.push(newRec);sv();
    sP(rid+'_in',pd).then(function(){rD();}).catch(function(e){console.error('Photo save:',e);});
    sS();tT('Checked in at '+fTs(now),'success');rD();
    firebaseSaveRecord(newRec).then(function(ok){if(ok)tT('Saved to cloud ☁️','info');});
  }

  // Downscale straight from the capture canvas. The old version drew a fresh
  // Image() whose data-URL had not finished decoding yet, so the thumbnail that
  // was uploaded for the manager's shift log could come out blank.
  var _ttSmallPhoto=null;
  function compressCanvas(srcCanvas,w,h,q){
    try{
      var cv2=document.createElement('canvas');cv2.width=w;cv2.height=h;
      cv2.getContext('2d').drawImage(srcCanvas,0,0,w,h);
      return cv2.toDataURL('image/jpeg',q||0.35);
    }catch(e){return null;}
  }

  function finishCheckOut(pd){
    var oR=null;
    for(var j=ttD.records.length-1;j>=0;j--){if(ttD.records[j].checkIn&&!ttD.records[j].checkOut){oR=ttD.records[j];break;}}
    if(!oR){tT('No open check-in found!','error');rD();return;}
    var now=Date.now();
    var smallPd=_ttSmallPhoto||pd;_ttSmallPhoto=null;
    oR.checkOut={time:now,photo:smallPd};
    oR.hours=calcMs(oR.checkIn.time,now); // exact milliseconds
    sv();
    sP(oR.id+'_out',pd).then(function(){rD();}).catch(function(e){console.error('Photo save:',e);});
    sS();tT('Checked out! '+msToHM(oR.hours)+' logged','success');rD();
    firebaseSaveRecord(oR).then(function(ok){if(ok)tT('Saved to cloud ☁️','info');});
  }

    // Clock
  function startClk(){
    function tick(){var n=new Date();var de=document.getElementById('tt-d-date'),te=document.getElementById('tt-d-time');if(de)de.textContent=n.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});if(te)te.textContent=n.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});}
    tick();setInterval(tick,10000);
  }

  // ---- Events ----
  document.getElementById('tt-btn-setup').addEventListener('click',async function(){
    var name=document.getElementById('tt-inp-name').value.trim();
    if(!name){tT('Please enter your name','warning');return;}
    ttD.driverName=name;sv();
    var cloudRecs=await firebaseLoadRecords();
    if(cloudRecs&&cloudRecs.length){var localIds={};ttD.records.forEach(function(r){localIds[r.id]=true;});var added=0;cloudRecs.forEach(function(r){if(!localIds[r.id]){ttD.records.push(r);added++;}});if(added){sv();tT('Synced '+added+' records from cloud','info');}}
    document.getElementById('tt-nav').style.display='block';go('dash');
  });

  document.getElementById('tt-btn-act').addEventListener('click',function(){
    var open=null;
    for(var i=ttD.records.length-1;i>=0;i--){if(ttD.records[i].checkIn&&!ttD.records[i].checkOut){open=ttD.records[i];break;}}
    openCam(open?'checkout':'checkin');
  });

  document.getElementById('tt-btn-cap').addEventListener('click', capPhoto);
  document.getElementById('tt-btn-cx').addEventListener('click', closeCam);
  document.getElementById('tt-pvw').addEventListener('click',function(){this.classList.remove('active');});
  document.getElementById('tt-spop').addEventListener('click',function(){this.classList.remove('active');});
  document.getElementById('tt-nav').addEventListener('click',function(e){var it=e.target.closest('.tt-ni');if(!it)return;go(it.dataset.s);});
  var openJobsBtn=document.getElementById('tt-btn-open-jobs');
  if(openJobsBtn)openJobsBtn.addEventListener('click',function(){go('jobs');});
  var jbRef=document.getElementById('tt-jobs-refresh');
  if(jbRef)jbRef.addEventListener('click',function(){loadDriverJobs();tT('Jobs refreshed','success');});
  var djTabs=document.getElementById('drv-job-tabs');
  if(djTabs)djTabs.addEventListener('click',function(e){
    var b=e.target.closest('.tt-mgr-tab');if(!b||!b.dataset.jf)return;
    drvJobFilter=b.dataset.jf;
    document.querySelectorAll('#drv-job-tabs .tt-mgr-tab').forEach(function(t){t.classList.remove('on');});
    b.classList.add('on');
    renderDriverJobsList();
  });
  document.getElementById('tt-ptabs').addEventListener('click',function(e){var b=e.target.closest('.tt-pt');if(!b)return;histPeriod=b.dataset.p;document.querySelectorAll('#tt-ptabs .tt-pt').forEach(function(t){t.classList.remove('on');});b.classList.add('on');rH();});
  document.getElementById('tt-btn-ss').addEventListener('click',function(){var name=document.getElementById('tt-set-n').value.trim();if(!name){tT('Name cannot be empty','warning');return;}ttD.driverName=name;sv();tT('Name saved!','success');rD();});
  document.getElementById('tt-btn-pw').addEventListener('click',async function(){
    var cur=document.getElementById('tt-pw-current').value;
    var next=document.getElementById('tt-pw-new').value;
    if(!cur||!next){tT('Enter your current and new password','warning');return;}
    if(next.length<6){tT('New password must be at least 6 characters','warning');return;}
    var btn=document.getElementById('tt-btn-pw');
    btn.disabled=true;btn.textContent='Updating…';
    try{
      var user=fbAuth.currentUser;
      var cred=firebase.auth.EmailAuthProvider.credential(user.email,cur);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(next);
      document.getElementById('tt-pw-current').value='';
      document.getElementById('tt-pw-new').value='';
      tT('Password updated!','success');
    }catch(e){
      tT('Could not update password: '+(e&&(e.code||e.message)||'unknown error'),'error');
    }finally{
      btn.disabled=false;btn.textContent='Update Password';
    }
  });
  document.getElementById('tt-btn-email').addEventListener('click',function(){var cur=cp();var txt=rptT('Current Period',cur);var subj='TowTrack Report — '+ttD.driverName+' — '+fD(cur.s.getTime())+' to '+fD(cur.e.getTime());window.location.href='mailto:'+COMPANY_EMAIL+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(txt);});
  document.getElementById('tt-btn-excel').addEventListener('click',downloadExcel);
  document.getElementById('tt-btn-copy').addEventListener('click',function(){var cur=cp();var txt=rptT('Current Period',cur);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){tT('Report copied!','success');}).catch(function(){fbCopy(txt);});}else{fbCopy(txt);}});
  function fbCopy(txt){var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);tT('Report copied!','success');}

  // Init
  window._ttFinishCheckIn = finishCheckIn; // for checklist confirmChecklist()
  window.capPhoto = capPhoto;             // for onclick="capPhoto()" on capture button
  oDB().catch(function(){});ld();startClk();
  if(ttD.driverName){document.getElementById('tt-nav').style.display='block';go('dash');}
}
