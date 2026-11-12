/* ========== ADMIN EDITING: driver info, shifts, storage releases ==========
   Everything here writes to nodes database.rules.json already lets an admin write
   (/drivers, /employees, /driverLogs, /releaseForms) — no rule changes needed. */

function mgrJsonReq(method,body){return {method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}

/* ---- Edit driver ---- */
var _editDriverId=null;
// The email a driver signs in with can't be changed from the browser (only Firebase itself
// can change a login), so editing "email" here changes where job emails go and keeps the
// original sign-in email on record as loginEmail.
function driverLoginEmail(d){return (d&&(d.loginEmail||d.email))||'';}
function openEditDriverModal(driverId){
  var d=mgrDrivers.find(function(x){return x.id===driverId;});
  if(!d)return;
  _editDriverId=driverId;
  document.getElementById('md-name').value=d.name||'';
  document.getElementById('md-phone').value=d.phone||'';
  document.getElementById('md-email').value=d.email||'';
  document.getElementById('md-login').textContent=driverLoginEmail(d)||'no login on file';
  document.getElementById('md-reset').style.display=(d.uid&&driverLoginEmail(d))?'block':'none';
  document.getElementById('mgr-driver-modal').classList.add('active');
}
function closeEditDriverModal(){document.getElementById('mgr-driver-modal').classList.remove('active');}
async function saveDriverEdit(){
  var d=mgrDrivers.find(function(x){return x.id===_editDriverId;});
  if(!d)return;
  var name=document.getElementById('md-name').value.trim();
  var phone=document.getElementById('md-phone').value.trim();
  var email=document.getElementById('md-email').value.trim();
  if(!name||!phone){alert('Name and phone are required.');return;}
  if(email&&!/^\S+@\S+\.\S+$/.test(email)){alert('That email address doesn\'t look right.');return;}
  var btn=document.getElementById('md-save');
  btn.disabled=true;btn.textContent='Saving…';
  var oldName=d.name||'';
  try{
    var patch={name:name,phone:phone,email:email||null,updatedAt:Date.now()};
    if(email!==(d.email||'')&&!d.loginEmail&&d.email)patch.loginEmail=d.email;
    var res=await fbFetch(FIREBASE_URL+'/drivers/'+d.id+'.json',mgrJsonReq('PATCH',patch));
    if(!res.ok)throw new Error('HTTP '+res.status);
    var warn=[];
    if(d.uid&&isSafeId(d.uid)){
      // employees/{uid}.name is what the driver's own app reads at sign-in, so a rename
      // here follows them onto their phone (see syncFromCloud in driver.js).
      var empRes=await fbFetch(FIREBASE_URL+'/employees/'+d.uid+'.json',mgrJsonReq('PATCH',{name:name}));
      if(!empRes.ok)warn.push('their app name');
      if(name!==oldName&&!(await renameDriverLogs(d.uid,name)))warn.push('their past shifts');
    }
    // Open jobs carry a copy of the driver's name/phone/email for notifications and receipts.
    var jobWrites=mgrJobs.filter(function(j){return j.assignedDriverId===d.id&&!isJobComplete(j.status);}).map(function(j){
      return fbFetch(FIREBASE_URL+'/jobs/'+j.id+'.json',mgrJsonReq('PATCH',{assignedDriverName:name,assignedDriverPhone:phone,assignedDriverEmail:email||null})).then(function(r){return r.ok;}).catch(function(){return false;});
    });
    if((await Promise.all(jobWrites)).indexOf(false)>-1)warn.push('their open jobs');
    if(name!==oldName){var saved=ps_store('drv_'+oldName);if(saved&&!ps_store('drv_'+name))ps_store('drv_'+name,saved);}
    logAction('driver_edited',{driverId:d.id,driverName:name});
    closeEditDriverModal();
    await Promise.all([loadMgrDrivers(),loadMgrJobs(),loadMgrData()]);
    if(warn.length)alert('Driver saved, but these could not be updated: '+warn.join(', ')+'. Try saving again.');
    else tT(name+' updated','success');
  }catch(e){alert('Could not save driver: '+(e&&e.message||e));}
  finally{btn.disabled=false;btn.textContent='Save Changes';}
}
// Shift records each store the driver's name as a label; keep them in step with a rename so
// the Time Logs cards and pay stubs don't split one driver into two names.
async function renameDriverLogs(uid,name){
  try{
    var res=await fbFetch(FIREBASE_URL+'/driverLogs/'+uid+'.json?shallow=true');
    if(!res.ok)return false;
    var keys=await res.json();
    if(!keys)return true;
    var patch={};
    Object.keys(keys).forEach(function(k){if(isSafeId(k))patch[k+'/driverName']=name;});
    if(!Object.keys(patch).length)return true;
    var w=await fbFetch(FIREBASE_URL+'/driverLogs/'+uid+'.json',mgrJsonReq('PATCH',patch));
    return w.ok;
  }catch(e){return false;}
}
async function sendDriverPasswordReset(){
  var d=mgrDrivers.find(function(x){return x.id===_editDriverId;});
  var email=driverLoginEmail(d);
  if(!email)return;
  if(!confirm('Email a password reset link to '+email+'?'))return;
  try{
    await fbAuth.sendPasswordResetEmail(email);
    logAction('driver_pw_reset',{driverName:d.name||'',email:email});
    tT('Reset link sent to '+email,'success');
  }catch(e){alert('Could not send the reset email: '+(e&&(e.code||e.message)||e));}
}

/* ---- Add / edit / delete a shift ---- */
var _editShift=null; // {uid,id} when editing, null when adding
function shiftPad(n){return String(n).padStart(2,'0');}
function shiftTimeValue(ts){if(!ts)return '';var d=new Date(Number(ts));return shiftPad(d.getHours())+':'+shiftPad(d.getMinutes());}
// Drivers an admin can add a shift for: every roster driver with a login, plus anyone who
// already has shifts on record (a removed driver still has history worth correcting).
function shiftDriverOptions(){
  var opts=[],seen={};
  mgrDrivers.forEach(function(d){if(d.uid&&isSafeId(d.uid)&&!seen[d.uid]){seen[d.uid]=1;opts.push({uid:d.uid,name:d.name||'Driver'});}});
  mgrAllRecords.forEach(function(r){if(r.uid&&isSafeId(r.uid)&&!seen[r.uid]){seen[r.uid]=1;opts.push({uid:r.uid,name:r.driverName||'Driver'});}});
  return opts.sort(function(a,b){return a.name.localeCompare(b.name);});
}
function openShiftModal(uid,id){
  var rec=(uid&&id)?mgrAllRecords.find(function(r){return r.uid===uid&&r.id===id;}):null;
  if(uid&&id&&!rec)return;
  _editShift=rec?{uid:uid,id:id}:null;
  var sel=document.getElementById('ms-driver'),opts=shiftDriverOptions();
  if(!rec&&!opts.length){alert('Add a driver on the Drivers tab first.');return;}
  sel.innerHTML=rec?'<option>'+esc(rec.driverName||'Driver')+'</option>':opts.map(function(o){return '<option value="'+o.uid+'">'+esc(o.name)+'</option>';}).join('');
  sel.disabled=!!rec;
  document.getElementById('ms-title').textContent=rec?'Edit Shift':'Add Shift';
  document.getElementById('ms-date').value=rec?rec.date:mgr_dK(Date.now());
  document.getElementById('ms-in').value=rec&&rec.checkIn?shiftTimeValue(rec.checkIn.time):'';
  document.getElementById('ms-out').value=rec&&rec.checkOut?shiftTimeValue(rec.checkOut.time):'';
  document.getElementById('ms-delete').style.display=rec?'block':'none';
  document.getElementById('mgr-shift-modal').classList.add('active');
}
function closeShiftModal(){document.getElementById('mgr-shift-modal').classList.remove('active');}
async function saveShift(){
  var date=document.getElementById('ms-date').value;
  var tin=document.getElementById('ms-in').value,tout=document.getElementById('ms-out').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!tin){alert('Date and check-in time are required.');return;}
  var inTs=new Date(date+'T'+tin).getTime();
  var outTs=tout?new Date(date+'T'+tout).getTime():null;
  if(isNaN(inTs)||(tout&&isNaN(outTs))){alert('Please enter valid times.');return;}
  if(outTs!=null&&outTs<=inTs)outTs+=86400000; // checked out after midnight
  var hours=outTs!=null?outTs-inTs:null,now=Date.now();
  if(hours!=null&&hours>16*3600000&&!confirm('This shift is '+msToHM(hours)+' long. Save it anyway?'))return;
  var btn=document.getElementById('ms-save');
  btn.disabled=true;btn.textContent='Saving…';
  try{
    var res;
    if(_editShift){
      // Multi-path PATCH so the check-in/out photos already on the record are left alone.
      var patch={date:date,'checkIn/time':inTs,hours:hours,updatedAt:now,adminEditedAt:now};
      if(outTs!=null)patch['checkOut/time']=outTs;else patch.checkOut=null;
      res=await fbFetch(FIREBASE_URL+'/driverLogs/'+_editShift.uid+'/'+_editShift.id+'.json',mgrJsonReq('PATCH',patch));
    }else{
      var uid=document.getElementById('ms-driver').value;
      if(!isSafeId(uid))throw new Error('Pick a driver.');
      // Reuse the name already on this driver's shifts so the new one lands on the same card.
      var prior=mgrAllRecords.find(function(r){return r.uid===uid&&r.driverName;});
      var opt=shiftDriverOptions().find(function(o){return o.uid===uid;});
      var id=now.toString(36)+secureToken(6);
      res=await fbFetch(FIREBASE_URL+'/driverLogs/'+uid+'/'+id+'.json',mgrJsonReq('PUT',{
        driverName:prior?prior.driverName:(opt?opt.name:'Driver'),date:date,checkIn:{time:inTs},checkOut:outTs!=null?{time:outTs}:null,
        hours:hours,updatedAt:now,adminEditedAt:now,addedByAdmin:true
      }));
    }
    if(!res.ok)throw new Error('HTTP '+res.status);
    logAction(_editShift?'shift_edited':'shift_added',{date:date});
    closeShiftModal();
    await loadMgrData();
    tT(_editShift?'Shift updated':'Shift added','success');
  }catch(e){alert('Could not save shift: '+(e&&e.message||e));}
  finally{btn.disabled=false;btn.textContent='Save Shift';}
}
async function deleteShift(){
  if(!_editShift)return;
  if(!confirm('Delete this shift? Its hours come off the driver\'s totals and pay stub. This cannot be undone.'))return;
  try{
    var res=await fbFetch(FIREBASE_URL+'/driverLogs/'+_editShift.uid+'/'+_editShift.id+'.json',{method:'DELETE'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    logAction('shift_deleted',{});
    closeShiftModal();
    await loadMgrData();
    tT('Shift deleted','success');
  }catch(e){alert('Could not delete shift: '+(e&&e.message||e));}
}

/* ---- Storage releases in the Business tab: open, correct the amount, delete ---- */
function renderMgrReleaseList(){
  var box=document.getElementById('mgr-biz-releases');if(!box)return;
  var list=mgrBizReleaseFormsCache||[];
  if(!list.length){box.innerHTML='<div style="color:#6b6b6b;font-size:13px;padding:12px 0;text-align:center">No storage releases in this period</div>';return;}
  var btn='width:32px;height:32px;border-radius:8px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;';
  var html='';
  list.forEach(function(r){
    var t=r.signedAt||r.createdAt;
    var when=t?new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
    var sub=[when,r.company,r.name].filter(Boolean).join(' · ');
    html+='<div class="tt-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px">';
    html+='<div style="min-width:0"><p style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.veh||'Vehicle not entered')+'</p>';
    html+='<p style="font-size:11px;color:#6b6b6b">'+esc(sub)+'</p></div>';
    html+='<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">';
    html+='<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;font-size:13px;color:#10b981;margin-right:2px">$'+(Number(r.paid)||0).toFixed(2)+'</span>';
    html+='<a href="/release-form.html?r='+r.id+'" target="_blank" rel="noopener" title="Open form" style="'+btn+'border:1px solid #262626;background:#1a1a1a;color:#aaa"><i class="fas fa-arrow-up-right-from-square"></i></a>';
    html+='<button data-rel-edit="'+r.id+'" title="Edit amount paid" style="'+btn+'border:1px solid rgba(96,165,250,.35);background:rgba(96,165,250,.1);color:#60a5fa"><i class="fas fa-pen"></i></button>';
    html+='<button data-rel-del="'+r.id+'" title="Delete release" style="'+btn+'border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#fca5a5"><i class="fas fa-trash"></i></button>';
    html+='</div></div>';
  });
  box.innerHTML=html;
}
async function editReleasePaid(id){
  var r=mgrReleaseForms.find(function(x){return x.id===id;});
  if(!r)return;
  var v=prompt('Amount actually paid for this release ($). This is what counts toward revenue.',(Number(r.paid)||0).toFixed(2));
  if(v==null)return;
  var n=parseFloat(String(v).replace(/[$,\s]/g,''));
  if(isNaN(n)||n<0){alert('Enter an amount like 150 or 150.00.');return;}
  try{
    var res=await fbFetch(FIREBASE_URL+'/releaseForms/'+id+'.json',mgrJsonReq('PATCH',{paid:Math.round(n*100)/100}));
    if(!res.ok)throw new Error('HTTP '+res.status);
    logAction('release_edited',{releaseId:id});
    await loadMgrReleaseForms();
    tT('Release updated','success');
  }catch(e){alert('Could not update release: '+(e&&e.message||e));}
}
async function deleteRelease(id){
  var r=mgrReleaseForms.find(function(x){return x.id===id;});
  if(!r)return;
  if(!confirm('Delete the release for '+(r.veh||'this vehicle')+'? Its link stops working and it comes out of your revenue totals. This cannot be undone.'))return;
  try{
    var res=await fbFetch(FIREBASE_URL+'/releaseForms/'+id+'.json',{method:'DELETE'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    logAction('release_deleted',{releaseId:id});
    await loadMgrReleaseForms();
    tT('Release deleted','success');
  }catch(e){alert('Could not delete release: '+(e&&e.message||e));}
}

document.getElementById('mgr-logs-tb').addEventListener('click',function(e){
  var b=e.target.closest('[data-shift-id]');if(b)openShiftModal(b.dataset.shiftUid,b.dataset.shiftId);
});
document.getElementById('tt-btn-add-shift').addEventListener('click',function(){openShiftModal();});
document.getElementById('mgr-biz-releases').addEventListener('click',function(e){
  var ed=e.target.closest('[data-rel-edit]'),del=e.target.closest('[data-rel-del]');
  if(ed)editReleasePaid(ed.dataset.relEdit);else if(del)deleteRelease(del.dataset.relDel);
});
