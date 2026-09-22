/** Send notification via Formspree (same form as website requests). Uses _cc so driver/customer get a copy when enabled on your Formspree plan. */
function formspreeNotify(payload){
  return fetch(FORMSPREE_URL,{
    method:'POST',
    headers:{'Accept':'application/json','Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).then(function(res){
    if(!res.ok)return res.json().then(function(d){throw new Error((d&&d.error)||('HTTP '+res.status));});
    return res.json().catch(function(){return {};});
  }).catch(function(err){console.warn('Formspree notify:',err);return null;});
}

function notifyDriverChannels(job,driver,action){
  action=action||'assigned';
  var detail=buildJobDetailText(job);
  var pickupMap=mapsLink(job.pickupAddress);
  var destMap=job.destinationAddress&&job.destinationAddress!=='N/A'?mapsLink(job.destinationAddress):'';
  var subj=(action==='unassigned'
    ?('Job REMOVED — '+(job.customerName||'')+' — Corridor Towing')
    :('New Job ASSIGNED — '+(job.customerName||'')+' — Corridor Towing'));
  var msg=(action==='unassigned'
    ?('You have been UNASSIGNED from this job.\n\n')
    :('You have been ASSIGNED a new job.\n\n'))+
    detail+'\n\n'+
    'Pickup Maps: '+(pickupMap||'N/A')+'\n'+
    'Destination Maps: '+(destMap||'N/A')+'\n\n'+
    'Open Driver Portal → Jobs to update status.\n'+
    'https://corridortowing.org/app/?mode=driver\n\n'+
    buildCustomerStatusHint(job);

  // Automatic email via Formspree (company inbox + CC driver when supported)
  var fsBody={
    _subject:subj,
    message:msg,
    notification_type:action==='unassigned'?'driver_unassigned':'driver_assigned',
    driver_name:driver.name||'',
    driver_phone:driver.phone||'',
    driver_email:driver.email||'',
    customer_name:job.customerName||'',
    customer_phone:job.customerPhone||'',
    customer_email:job.customerEmail||'',
    pickup:job.pickupAddress||'',
    destination:job.destinationAddress||'',
    service:job.service||'',
    vehicle:job.vehicle||'',
    amount:job.amount!=null?String(job.amount):'',
    email:driver.email||'corridor.towing.services@gmail.com',
    _replyto:driver.email||'corridor.towing.services@gmail.com'
  };
  if(driver.email)fsBody._cc=driver.email;
  formspreeNotify(fsBody);

  // Manual SMS popup to driver (until Twilio)
  if(driver.phone){
    setTimeout(function(){
      var smsBody=(action==='unassigned'?'JOB REMOVED\n\n':'NEW JOB\n\n')+detail+
        '\nPickup map: '+(pickupMap||'')+
        '\nCustomer phone: '+(job.customerPhone||'');
      window.location.href='sms:'+String(driver.phone).replace(/\s/g,'')+'?&body='+encodeURIComponent(smsBody);
    },400);
  }
}

async function notifyCustomerStatusEmail(job,status,extra){
  var custEmail=(job.customerEmail||job.email||'').trim();
  if(!custEmail){console.warn('No customer email on job');return Promise.resolve(null);}

  var driverName=job.assignedDriverName||'Your driver';
  var driverPhone=job.assignedDriverPhone||'(804) 292-8414';
  var isTow=(job.jobType==='tow')||/tow/i.test(job.service||'');
  // "dropped_off" is kept as a synonym for "done" here (not something the app
  // still creates) purely so any older job record that already has that raw
  // status value still gets a correct, tow-aware label instead of a blank one.
  var labels=isTow?{
    enroute:'Driver is en route',
    picked_up:'Vehicle picked up',
    dropped_off:'Vehicle delivered',
    done:'Vehicle delivered'
  }:{
    enroute:'Driver is en route',
    on_location:'Driver is on location',
    dropped_off:'Service complete',
    done:'Service complete'
  };
  var label=labels[status]||status;

  // Short, clean customer message (only this is emailed — avoids crowded Formspree field dump)
  var body='Corridor Towing update\n\n'+
    'Hi '+(job.customerName||'there')+',\n\n'+
    label+'.\n\n'+
    'Driver: '+driverName+'\n'+
    'Driver phone: '+driverPhone+'\n'+
    'Service: '+(job.service||'')+'\n';
  if(isTow){
    if(status==='enroute')body+='\nWe are on the way to pick up your vehicle.\n';
    else if(status==='picked_up')body+='\nYour vehicle is on the truck and heading to the destination.\n';
    else if(status==='done'||status==='dropped_off')body+='\nYour vehicle has been delivered. Thank you!\n';
  }else{
    if(status==='enroute')body+='\nWe are on the way to your location.\n';
    else if(status==='on_location')body+='\nOur driver has arrived and is working on your vehicle.\n';
    else if(status==='done'||status==='dropped_off')body+='\nYour service is complete. Thank you!\n';
  }
  if((status==='enroute'||status==='on_location'||status==='picked_up')&&trackUrl(job)){
    body+='\nTrack your driver live on the map:\n'+trackUrl(job)+'\n';
  }
  if((status==='dropped_off'||status==='done')&&job.id){
    body+='\nYour receipt:\n'+(await buildReceiptUrl(job))+'\n';
    if(job.feedbackToken){
      body+='\nRate your experience:\nhttps://corridortowing.org/feedback.html?job='+encodeURIComponent(job.id)+'&t='+encodeURIComponent(job.feedbackToken)+'\n';
    }
  }
  body+='\nCall us: (804) 292-8414\n— Corridor Towing';

  // Minimal fields only → cleaner email in Formspree
  return formspreeNotify({
    _subject:'Corridor Towing: '+label,
    email:custEmail,
    _replyto:'corridor.towing.services@gmail.com',
    _cc:custEmail,
    message:body
  });
}

// Keeps /driverJobs/{uid}/{jobId} in sync with a job's assignment — this index (not the
// job's own assignedDriverId field) is what database.rules.json actually checks before
// letting a driver's account read that job at all, so every assign/reassign/unassign
// below has to write it, not just the human-readable fields on the job.
function setDriverJobPointer(uid,jobId,present){
  if(!uid||!isSafeId(uid)||!isSafeId(jobId))return Promise.resolve(false);
  return fbFetch(FIREBASE_URL+'/driverJobs/'+uid+'/'+jobId+'.json',present?{method:'PUT',headers:{'Content-Type':'application/json'},body:'true'}:{method:'DELETE'})
    .then(function(r){return r.ok;}).catch(function(){return false;});
}

// One-time (but safe to re-run anytime — it only ever ADDS pointers, never removes one) catch-up
// for jobs that were assigned to a driver BEFORE the driverJobs index existed. Without this, a
// driver whose job was assigned by the old code would have that job's data itself untouched, but
// no /driverJobs pointer to it — and since database.rules.json now requires that pointer to read
// the job at all, the job would silently vanish from their app instead of just failing loudly.
// Every driver added or (re)assigned through this session's own code already gets the pointer
// written at the time — this is only for whatever existed before this session's changes.
async function backfillJobIndexes(){
  if(!confirm('Scan every job and rebuild any missing driver/customer index pointers? Safe to run any time — this only adds pointers that should already be there, never removes or changes anything else.'))return;
  var btn=document.getElementById('mgr-btn-backfill');
  if(btn){btn.disabled=true;btn.textContent='Scanning…';}
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    var uidByDriverId={};
    mgrDrivers.forEach(function(d){if(d.uid)uidByDriverId[d.id]=d.uid;});
    var writes=[],driverCount=0,customerCount=0;
    if(data){
      for(var id in data){
        var j=data[id];
        if(!j||!isSafeId(id))continue;
        var duid=j.assignedDriverUid||uidByDriverId[j.assignedDriverId];
        if(duid&&isSafeId(duid)){driverCount++;writes.push(setDriverJobPointer(duid,id,true));}
        if(j.customerUid&&isSafeId(j.customerUid)){
          customerCount++;
          writes.push(fbFetch(FIREBASE_URL+'/customerJobs/'+j.customerUid+'/'+id+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:'true'}).catch(function(){}));
        }
      }
    }
    await Promise.all(writes);
    logAction('index_backfilled',{driverPointers:driverCount,customerPointers:customerCount});
    tT('Index rebuilt — checked '+driverCount+' driver-assigned and '+customerCount+' customer-linked job(s)','success');
  }catch(e){alert('Backfill failed: '+(e&&e.message||e));}
  finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-rotate"></i> Backfill Job Index';}}
}

async function assignJobToDriver(jobId,driverId){
  var driver=mgrDrivers.find(function(d){return d.id===driverId;});
  if(!driver)return;
  var job=mgrJobs.find(function(j){return j.id===jobId;})||{};
  var prevDriverUid=job.assignedDriverUid||null;
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      status:'assigned',
      assignedDriverId:driverId,
      assignedDriverUid:driver.uid||null,
      assignedDriverName:driver.name,
      assignedDriverEmail:driver.email||null,
      assignedDriverPhone:driver.phone||null,
      assignedAt:Date.now(),
      updatedAt:Date.now()
    })});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(driver.uid)await setDriverJobPointer(driver.uid,jobId,true);
    if(prevDriverUid&&prevDriverUid!==driver.uid)setDriverJobPointer(prevDriverUid,jobId,false); // reassigned away from someone
    document.getElementById('mgr-assign-modal').classList.remove('active');
    job.assignedDriverName=driver.name;
    syncTracking(job,{status:'assigned',driver:{name:firstName(driver.name)}});
    notifyDriverChannels(job,driver,'assigned');
    logAction('job_assigned',{jobId:jobId,driverName:driver.name});
    await loadMgrJobs();
  }catch(e){alert('Assign failed: '+e.message);}
}

async function unassignJob(jobId){
  if(!confirm('Remove this job from the current driver and return it to Pending?'))return;
  var job=mgrJobs.find(function(j){return j.id===jobId;})||{};
  var driver=mgrDrivers.find(function(d){return d.id===job.assignedDriverId;})||
    mgrDrivers.find(function(d){return d.name===job.assignedDriverName;})||
    {name:job.assignedDriverName||'Driver',phone:job.assignedDriverPhone||'',email:job.assignedDriverEmail||''};
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      status:'pending',
      assignedDriverId:null,
      assignedDriverUid:null,
      assignedDriverName:null,
      assignedDriverEmail:null,
      assignedDriverPhone:null,
      assignedAt:null,
      updatedAt:Date.now()
    })});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(job.assignedDriverUid)setDriverJobPointer(job.assignedDriverUid,jobId,false);
    syncTracking(job,{status:'pending',driver:null});
    if(driver&&(driver.email||driver.phone))notifyDriverChannels(job,driver,'unassigned');
    logAction('job_unassigned',{jobId:jobId});
    await loadMgrJobs();
  }catch(e){alert('Unassign failed: '+e.message);}
}

async function resendJobNotify(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!job||!job.assignedDriverId){alert('No driver assigned');return;}
  var driver=mgrDrivers.find(function(d){return d.id===job.assignedDriverId;});
  if(!driver)driver=mgrDrivers.find(function(d){return d.name===job.assignedDriverName;});
  if(!driver)driver={name:job.assignedDriverName||'',phone:job.assignedDriverPhone||'',email:job.assignedDriverEmail||''};
  if(!driver.phone&&!driver.email){alert('Driver contact not found. Reassign to refresh.');return;}
  notifyDriverChannels(job,driver,'assigned');
}

async function addMgrDriver(){
  var name=(document.getElementById('mgr-drv-name').value||'').trim();
  var phone=(document.getElementById('mgr-drv-phone').value||'').trim();
  var email=(document.getElementById('mgr-drv-email').value||'').trim();
  if(!name||!phone||!email){alert('Name, phone, and email are all required — email is used to create their login.');return;}
  var btn=document.getElementById('mgr-btn-add-driver');
  btn.disabled=true;btn.textContent='Creating…';
  var tempPassword=genTempPassword();
  try{
    // Create the login first (separate Firebase App instance so this doesn't sign
    // the manager out), then approve that account, then add the dispatch roster entry.
    var sAuth=secondaryAuth();
    var cred=await sAuth.createUserWithEmailAndPassword(email,tempPassword);
    var uid=cred.user.uid;
    await sAuth.signOut();
    var empRes=await fbFetch(FIREBASE_URL+'/employees/'+uid+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      email:email,role:'driver',active:true,mustChangePassword:true,createdAt:Date.now()
    })});
    if(!empRes.ok)throw new Error('Approval record rejected (HTTP '+empRes.status+') — has the current database.rules.json been published to Firebase? The login was created but is not yet approved.');
    var id=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'_'+Date.now().toString(36);
    var drvRes=await fbFetch(FIREBASE_URL+'/drivers/'+id+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:name,phone:phone,email:email,active:true,createdAt:Date.now(),uid:uid
    })});
    if(!drvRes.ok)throw new Error('Roster entry rejected (HTTP '+drvRes.status+').');
    document.getElementById('mgr-drv-name').value='';
    document.getElementById('mgr-drv-phone').value='';
    document.getElementById('mgr-drv-email').value='';
    logAction('driver_added',{driverName:name,email:email});
    await loadMgrDrivers();
    showNewDriverModal(name,email,tempPassword);
  }catch(e){
    alert('Could not create driver account: '+(e&&e.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Save Driver';
  }
}

// A second (or third...) admin — invite-only, same as a driver: only an already-signed-in
// admin can reach this button, and only an admin can write role:'admin' into /employees
// (database.rules.json), so there is no path to self-promote from anywhere else on the site.
async function addMgrAdmin(){
  var name=(prompt('Full name of the new admin:')||'').trim();
  if(!name)return;
  var email=(prompt('Their email address (used to sign in):')||'').trim();
  if(!email)return;
  if(!confirm('Make '+name+' ('+email+') a full admin? They will be able to see and manage everything you can, including other staff.'))return;
  var tempPassword=genTempPassword();
  try{
    var sAuth=secondaryAuth();
    var cred=await sAuth.createUserWithEmailAndPassword(email,tempPassword);
    var uid=cred.user.uid;
    await sAuth.signOut();
    var empRes=await fbFetch(FIREBASE_URL+'/employees/'+uid+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      email:email,role:'admin',active:true,mustChangePassword:true,createdAt:Date.now()
    })});
    if(!empRes.ok)throw new Error('Approval record rejected (HTTP '+empRes.status+') — has the current database.rules.json been published to Firebase?');
    logAction('admin_added',{email:email});
    showNewDriverModal(name+' (Admin)',email,tempPassword);
  }catch(e){
    alert('Could not create admin account: '+(e&&e.message||e));
  }
}

function njGetJobType(){
  var s=document.getElementById('nj-service');
  var o=s.options[s.selectedIndex];
  return (o&&o.dataset&&o.dataset.jobtype)?o.dataset.jobtype:'';
}
function njOnServiceChange(){
  var isTow=njGetJobType()==='tow';
  document.getElementById('nj-dest').style.display=isTow?'block':'none';
  njCalcTotal();
}
function njCalcTotal(){
  var s=document.getElementById('nj-service');
  var o=s.options[s.selectedIndex];
  var b=(o&&o.dataset&&o.dataset.base)?parseFloat(o.dataset.base):0;
  var en=parseFloat(document.getElementById('nj-enroute').value)||0;
  var tw=njGetJobType()==='tow'?(parseFloat(document.getElementById('nj-tow').value)||0):0;
  document.getElementById('nj-amount').value=(b+en*RATES.enroute+tw*RATES.tow).toFixed(2);
}
function njTogglePayMethod(){
  document.getElementById('nj-paymethod').style.display=document.getElementById('nj-payment').value==='pay-now'?'block':'none';
}
var _editJobId=null;
function njResetForm(){
  _editJobId=null;
  document.getElementById('nj-modal-title').textContent='New Job (Phone-In)';
  document.getElementById('nj-modal-sub').textContent='For a customer who called instead of using the website form. Saves the same way — assign, status updates, feedback and receipt all work normally.';
  document.getElementById('nj-submit').textContent='Save Job';
  document.getElementById('nj-status').style.display='none';
  document.getElementById('nj-amount').readOnly=true;
  document.getElementById('nj-amount').style.background='#1a1a1a';
  ['nj-name','nj-phone','nj-email','nj-vehicle','nj-pickup','nj-dest'].forEach(function(id){var el=document.getElementById(id);el.value='';el._place=null;});
  document.getElementById('nj-service').value='';
  document.getElementById('nj-enroute').value='0';
  document.getElementById('nj-tow').value='0';
  document.getElementById('nj-payment').value='pay-later';
  document.getElementById('nj-enroute-status').textContent='Enter a pickup location for an automatic enroute estimate.';
  njTogglePayMethod();
  njOnServiceChange();
}
// Opens the same modal used for phone-in jobs, pre-filled with an existing job's
// details, so the manager can correct/update anything — including forcing the
// status directly (e.g. a driver forgot to mark something done).
function openEditJobModal(jobId){
  var job=mgrJobs.find(function(j){return j.id===jobId;});
  if(!job){alert('Job not found.');return;}
  njResetForm();
  _editJobId=jobId;
  document.getElementById('nj-modal-title').textContent='Edit Job';
  document.getElementById('nj-modal-sub').textContent='Updating an existing job — changes save directly to this job, nothing new is created.';
  document.getElementById('nj-submit').textContent='Save Changes';
  document.getElementById('nj-name').value=job.customerName||'';
  document.getElementById('nj-phone').value=job.customerPhone||'';
  document.getElementById('nj-email').value=job.customerEmail||'';
  document.getElementById('nj-service').value=job.serviceCode||'';
  document.getElementById('nj-vehicle').value=job.vehicle||'';
  document.getElementById('nj-pickup').value=job.pickupAddress||'';
  document.getElementById('nj-dest').value=(job.destinationAddress&&job.destinationAddress!=='N/A')?job.destinationAddress:'';
  // Re-use the coordinates already saved on the job so the map/driver route don't need re-geocoding
  // unless the manager actually changes the address text.
  var pp=jobPickupPlace(job),dpl=jobDestPlace(job);
  if(pp){pp.text=job.pickupAddress||'';pp.title=pp.name||pp.address;pp.sub='';document.getElementById('nj-pickup')._place=pp;}
  if(dpl&&job.destinationAddress&&job.destinationAddress!=='N/A'){dpl.text=job.destinationAddress;dpl.title=dpl.name||dpl.address;dpl.sub='';document.getElementById('nj-dest')._place=dpl;}
  document.getElementById('nj-enroute').value=Number(job.enrouteMiles)||0;
  document.getElementById('nj-tow').value=Number(job.towMiles)||0;
  njOnServiceChange(); // shows/hides the destination field based on the loaded service's job type
  document.getElementById('nj-amount').value=job.amount!=null?Number(job.amount).toFixed(2):'0.00';
  document.getElementById('nj-amount').readOnly=false; // editable here, unlike New Job's auto-calculated field
  document.getElementById('nj-amount').style.background='#141414';
  document.getElementById('nj-payment').value=job.paymentPref||'pay-later';
  njTogglePayMethod();
  document.getElementById('nj-paymethod').value=job.payMethod||'';
  document.getElementById('nj-status').style.display='block';
  document.getElementById('nj-status').value=(job.status==='dropped_off'?'done':job.status)||'pending';
  document.getElementById('nj-enroute-status').textContent='Auto-estimate available if you change the pickup location.';
  document.getElementById('mgr-newjob-modal').classList.add('active');
}

// Shop's fixed location (same coordinates as the LocalBusiness JSON-LD on the
// public site) — the "enroute" leg always runs from here to the pickup location.
var NJ_BASE_LAT=37.6331, NJ_BASE_LNG=-77.5026;
async function njRouteMiles(lat1,lon1,lat2,lon2){
  var r=await fetch('https://router.project-osrm.org/route/v1/driving/'+lon1+','+lat1+';'+lon2+','+lat2+'?overview=false');
  var j=await r.json();
  return (j.routes&&j.routes[0])?(j.routes[0].distance/1000*0.621371):null;
}
async function njAutoCalcEnroute(){
  var l=(document.getElementById('nj-pickup').value||'').trim();
  var status=document.getElementById('nj-enroute-status');
  if(!l){status.textContent='Enter a pickup location for an automatic enroute estimate.';return;}
  status.textContent='Calculating distance from our shop…';
  try{
    var lp=await CTAddr.resolve(document.getElementById('nj-pickup'));
    if(!lp)throw 0;
    var miles=await njRouteMiles(NJ_BASE_LAT,NJ_BASE_LNG,lp.lat,lp.lng);
    if(miles==null)throw 0;
    document.getElementById('nj-enroute').value=miles.toFixed(1);
    status.textContent='Estimated enroute: '+miles.toFixed(1)+' miles from our shop';
    njCalcTotal();
  }catch(e){status.textContent='Auto estimate failed — enter enroute miles manually.';}
}
async function njAutoCalcTowMiles(){
  if(njGetJobType()!=='tow')return;
  var l=(document.getElementById('nj-pickup').value||'').trim();
  var d=(document.getElementById('nj-dest').value||'').trim();
  if(!l||!d)return;
  try{
    var lp=await CTAddr.resolve(document.getElementById('nj-pickup'));if(!lp)return;
    var dp=await CTAddr.resolve(document.getElementById('nj-dest'));if(!dp)return;
    var miles=await njRouteMiles(lp.lat,lp.lng,dp.lat,dp.lng);
    if(miles==null)return;
    document.getElementById('nj-tow').value=miles.toFixed(1);
    njCalcTotal();
  }catch(e){/* leave tow miles for manual entry */}
}

// Lets a manager enter a job that came in by phone call (e.g. a customer who was
// redirected to call instead of using the website form). Saves via the same
// authenticated write path as everything else the dispatch app does, using the
// identical job schema the public website writes — so assignment, driver status
// updates, the customer feedback link, and the receipt link all work exactly the
// same afterward regardless of how the job was created.
async function createManualJob(){
  var name=(document.getElementById('nj-name').value||'').trim();
  var phone=(document.getElementById('nj-phone').value||'').trim();
  var email=(document.getElementById('nj-email').value||'').trim();
  var jobType=njGetJobType();
  var pickup=(document.getElementById('nj-pickup').value||'').trim();
  var dest=(document.getElementById('nj-dest').value||'').trim();
  if(!name||!phone){alert('Customer name and phone are required.');return;}
  if(!jobType){alert('Please select a service.');return;}
  if(!pickup){alert('Please enter a pickup / service location.');return;}
  if(jobType==='tow'&&!dest){alert('Please enter a drop-off destination for towing jobs.');return;}
  var editing=!!_editJobId;
  // Exact points for the map / driver route / customer tracking (never blocks saving if lookup fails).
  var pickupPlace=null,destPlace=null;
  try{pickupPlace=await CTAddr.resolve(document.getElementById('nj-pickup'));}catch(e){}
  try{if(jobType==='tow')destPlace=await CTAddr.resolve(document.getElementById('nj-dest'));}catch(e){}
  var pickupRec=placeRec(pickupPlace,pickup),destRec=jobType==='tow'?placeRec(destPlace,dest):null;
  if(!editing)njCalcTotal(); // editing allows a manually-typed amount — don't clobber it with the auto-calc
  var svcSel=document.getElementById('nj-service');
  var svcText=svcSel.options[svcSel.selectedIndex].text;
  var btn=document.getElementById('nj-submit');
  btn.disabled=true;btn.textContent='Saving…';

  if(editing){
    var editPayload={
      jobType:jobType,serviceCode:svcSel.value,service:svcText,updatedAt:Date.now(),
      customerName:name,customerPhone:phone,customerEmail:email||null,
      vehicle:document.getElementById('nj-vehicle').value||'Not provided',
      pickupAddress:pickup,destinationAddress:jobType==='tow'?dest:'N/A',
      enrouteMiles:Number(document.getElementById('nj-enroute').value)||0,
      towMiles:jobType==='tow'?(Number(document.getElementById('nj-tow').value)||0):0,
      amount:Number(document.getElementById('nj-amount').value)||0,
      paymentPref:document.getElementById('nj-payment').value,
      payMethod:document.getElementById('nj-payment').value==='pay-now'?(document.getElementById('nj-paymethod').value||null):null,
      status:document.getElementById('nj-status').value,
      pickupLat:pickupRec?pickupRec.lat:null,pickupLng:pickupRec?pickupRec.lng:null,pickupName:pickupRec?pickupRec.name:null,pickupKind:pickupRec?pickupRec.kind:null,
      destLat:destRec?destRec.lat:null,destLng:destRec?destRec.lng:null,destName:destRec?destRec.name:null,destKind:destRec?destRec.kind:null
    };
    var editedJob=mgrJobs.find(function(x){return x.id===_editJobId;})||{};
    var trackToken=editedJob.trackToken&&isSafeId(editedJob.trackToken)?editedJob.trackToken:null;
    if(!trackToken&&pickupRec){trackToken=secureToken(20);editPayload.trackToken=trackToken;} // older job: start tracking now
    try{
      var editRes=await fbFetch(FIREBASE_URL+'/jobs/'+_editJobId+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editPayload)});
      if(!editRes.ok)throw new Error('HTTP '+editRes.status);
      if(trackToken&&pickupRec){
        var tj={trackToken:trackToken};
        var tPatch={status:trackStatus(editPayload.status),jobType:jobType,pickup:pickupRec,dest:destRec};
        if(editedJob.trackToken)await syncTracking(tj,tPatch);
        else await putTracking(trackToken,Object.assign({driver:null},tPatch));
      }
      document.getElementById('mgr-newjob-modal').classList.remove('active');
      njResetForm();
      await loadMgrJobs();
      tT('Job updated','success');
    }catch(e){
      alert('Could not save changes: '+(e&&e.message||e));
    }finally{
      btn.disabled=false;btn.textContent='Save Changes';
    }
    return;
  }

  var jobId='job_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  var feedbackToken=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
  var now=Date.now();
  var payload={
    status:'pending',jobType:jobType,serviceCode:svcSel.value,createdAt:now,updatedAt:now,
    customerName:name,customerPhone:phone,customerEmail:email||null,
    service:svcText,vehicle:document.getElementById('nj-vehicle').value||'Not provided',
    starts:'unknown',neutral:'unknown',attended:'yes',
    towMethod:null,pickupAddress:pickup,destinationAddress:jobType==='tow'?dest:'N/A',
    enrouteMiles:Number(document.getElementById('nj-enroute').value)||0,
    towMiles:jobType==='tow'?(Number(document.getElementById('nj-tow').value)||0):0,
    amount:Number(document.getElementById('nj-amount').value)||0,
    paymentPref:document.getElementById('nj-payment').value,
    payMethod:document.getElementById('nj-payment').value==='pay-now'?(document.getElementById('nj-paymethod').value||null):null,
    source:'phone',
    assignedDriverId:null,assignedDriverName:null,assignedDriverPhone:null,assignedAt:null,
    pickedUpAt:null,droppedOffAt:null,dropoffLat:null,dropoffLng:null,
    feedbackToken:feedbackToken,feedbackSubmitted:false,feedbackRating:null,feedbackComment:null,
    pickupLat:pickupRec?pickupRec.lat:null,pickupLng:pickupRec?pickupRec.lng:null,pickupName:pickupRec?pickupRec.name:null,pickupKind:pickupRec?pickupRec.kind:null,
    destLat:destRec?destRec.lat:null,destLng:destRec?destRec.lng:null,destName:destRec?destRec.name:null,destKind:destRec?destRec.kind:null,
    trackToken:pickupRec?secureToken(20):null
  };
  try{
    var res=await fbFetch(FIREBASE_URL+'/jobs/'+jobId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    if(payload.trackToken)await putTracking(payload.trackToken,{status:'pending',jobType:jobType,pickup:pickupRec,dest:destRec});
    document.getElementById('mgr-newjob-modal').classList.remove('active');
    njResetForm();
    await loadMgrJobs();
    tT('Job saved — assign a driver when ready','success');
  }catch(e){
    alert('Could not save job: '+(e&&e.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Save Job';
  }
}

function switchMgrMainTab(tab){
  mgrMainTab=tab;
  document.querySelectorAll('#mgr-maintabs .tt-mgr-tab').forEach(function(t){t.classList.toggle('on',t.dataset.m===tab);});
  document.getElementById('mgr-panel-dispatch').style.display=tab==='dispatch'?'block':'none';
  document.getElementById('mgr-panel-drivers').style.display=tab==='drivers'?'block':'none';
  document.getElementById('mgr-panel-timelogs').style.display=tab==='timelogs'?'block':'none';
  document.getElementById('mgr-panel-business').style.display=tab==='business'?'block':'none';
  if(tab==='timelogs')renderMgrDash();
  if(tab==='dispatch')renderMgrJobs();
  if(tab==='drivers')renderMgrDrivers();
  if(tab==='business'){
    if(!mgrJobs.length)loadMgrJobs();
    if(!mgrReleaseForms.length)loadMgrReleaseForms();
    renderMgrBusiness();
  }
}
