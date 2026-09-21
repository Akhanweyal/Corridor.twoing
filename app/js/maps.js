// ===== Trip maps for the dispatch app =====
// Uses the shared CTMap (js/tripmap.js) + CTAddr (js/address.js).
//  - Manager: "Map" button on each job -> modal showing vehicle pickup, drop-off (home / business by
//    name), and the driver's live position with route + ETA. Refreshes every 20s while open.
//  - Driver: "Show route map" on each job card (defined inside initTT in driver.js) reuses
//    tripFromJob() below.

// Build the CTMap trip object for a job record. Jobs saved before coordinates existed are
// geocoded from their saved address text on the fly.
async function tripFromJob(job){
  var isTow=(job.jobType==='tow')||/tow/i.test(job.service||'');
  var pickup=jobPickupPlace(job),dest=jobDestPlace(job);
  try{
    if(!pickup&&job.pickupAddress){
      var g=await CTAddr.geocode(job.pickupAddress);
      if(g)pickup={lat:g.lat,lng:g.lng,name:g.name||'',kind:g.kind,address:job.pickupAddress};
    }
    if(!dest&&isTow&&job.destinationAddress&&job.destinationAddress!=='N/A'){
      var g2=await CTAddr.geocode(job.destinationAddress);
      if(g2)dest={lat:g2.lat,lng:g2.lng,name:g2.name||'',kind:g2.kind,address:job.destinationAddress};
    }
  }catch(e){}
  var hasDriver=job.driverLat!=null&&job.driverLng!=null&&isFinite(job.driverLat)&&isFinite(job.driverLng);
  return {
    status:trackStatus(job.status),
    jobType:isTow?'tow':'roadside',
    pickup:pickup,
    dest:isTow?dest:null,
    driver:hasDriver?{lat:Number(job.driverLat),lng:Number(job.driverLng),at:job.driverLocationAt||0,name:firstName(job.assignedDriverName)}:null,
    showShop:false
  };
}

function kindText(p){return !p?'':(p.kind==='biz'?'Business':(p.kind==='house'?'Home':''));}

var _mgrTripMap=null,_mgrTripJobId=null,_mgrTripTimer=null;
async function openTripMap(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!job){alert('Job not found.');return;}
  _mgrTripJobId=jobId;
  document.getElementById('mgr-map-title').textContent=(job.customerName||'Customer')+' — '+(job.service||'Job');
  document.getElementById('mgr-map-info').innerHTML='<span style="color:#6b6b6b">Loading map…</span>';
  document.getElementById('mgr-map-modal').classList.add('active');
  if(!_mgrTripMap)_mgrTripMap=CTMap.create('mgr-trip-map');
  setTimeout(function(){_mgrTripMap.invalidate();},80);
  await refreshMgrTripMap(true);
  clearInterval(_mgrTripTimer);
  _mgrTripTimer=setInterval(function(){refreshMgrTripMap(false);},20000);
}
async function refreshMgrTripMap(refit){
  var jobId=_mgrTripJobId;if(!jobId)return;
  var job=mgrJobs.find(function(j){return j.id===jobId;});if(!job)return;
  try{ // fresh copy so the driver's live position is current
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json');
    if(res.ok){var fresh=await res.json();if(fresh){fresh.id=jobId;job=Object.assign(job,fresh);}}
  }catch(e){}
  if(_mgrTripJobId!==jobId)return; // modal closed / switched while loading
  var trip=await tripFromJob(job);
  var stats=await _mgrTripMap.setTrip(trip,{refit:refit});
  if(_mgrTripJobId!==jobId)return;

  var rows=[];
  function row(ico,label,html){rows.push('<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #262626"><div style="font-size:18px;width:24px;text-align:center">'+ico+'</div><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b6b">'+label+'</div><div style="font-size:13px;color:#f0f0f0">'+html+'</div></div></div>');}
  var isTow=trip.jobType==='tow';
  if(trip.pickup)row(isTow?'🚗':'📍',isTow?'Vehicle pickup':'Service location',(trip.pickup.kind==='biz'&&trip.pickup.name?'<b>'+esc(trip.pickup.name)+'</b><br>':'')+esc(job.pickupAddress||trip.pickup.address));
  else row('⚠️','Pickup','<span style="color:#f59e0b">Could not place this address on the map — use Edit and pick a suggestion.</span>');
  if(isTow&&trip.dest)row(trip.dest.kind==='biz'?'🏢':(trip.dest.kind==='house'?'🏠':'🏁'),'Drop-off'+(kindText(trip.dest)?' · '+kindText(trip.dest):''),(trip.dest.kind==='biz'&&trip.dest.name?'<b>'+esc(trip.dest.name)+'</b><br>':'')+esc(job.destinationAddress||trip.dest.address));
  var finished=(trip.status==='done'||trip.status==='cancelled');
  if(job.assignedDriverName){
    var txt='<b>'+esc(job.assignedDriverName)+'</b>';
    if(trip.driver&&!finished){
      var age=trip.driver.at?Math.round((Date.now()-trip.driver.at)/60000):null;
      txt+=' · location '+(age==null?'':(age<2?'just now':age+' min ago'));
      if(stats){
        if(trip.status==='picked_up'&&stats.toDest&&stats.toDest.seconds!=null)txt+='<br>About '+CTMap.fmtDuration(stats.toDest.seconds)+' to drop-off ('+CTMap.fmtMiles(stats.toDest.meters)+')';
        else if(stats.toPickup&&stats.toPickup.seconds!=null)txt+='<br>About '+CTMap.fmtDuration(stats.toPickup.seconds)+' to pickup ('+CTMap.fmtMiles(stats.toPickup.meters)+')';
      }
    }else if(!finished){txt+=' · <span style="color:#f59e0b">no live location yet (driver app must be open)</span>';}
    row('🚚','Driver',txt);
  }else{row('🚚','Driver','<span style="color:#6b6b6b">Not assigned yet</span>');}
  var tu=trackUrl(job);
  if(tu)row('🔗','Customer tracking link','<input readonly onclick="this.select()" value="'+esc(tu)+'" style="width:100%;background:#111;border:1px solid #262626;border-radius:8px;color:#aaa;padding:6px 8px;font-size:11px;font-family:\'JetBrains Mono\',monospace">');
  document.getElementById('mgr-map-info').innerHTML=rows.join('');
}
function closeTripMap(){
  clearInterval(_mgrTripTimer);_mgrTripTimer=null;_mgrTripJobId=null;
  document.getElementById('mgr-map-modal').classList.remove('active');
}
