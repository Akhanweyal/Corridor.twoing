var mgrAuth=false,mgrAllRecords=[],mgrPeriod='current';
var FIREBASE_URL='https://corridortowing-default-rtdb.firebaseio.com';

// ---- Shared helpers (used by every portal file) ----
// Single source of truth for pricing math used by the New Job / Edit Job and Release Form
// screens. The public site (js/request.js) has its own copy; keep them in sync.
var RATES={enroute:2,tow:6,storagePerNight:100};

// Everything that came from the database (customer names, addresses, driver names, feedback
// comments...) can be written by an anonymous visitor through the public request form, so it
// must be escaped before being placed in innerHTML — otherwise a customer name like
// <img src=x onerror=...> would run inside the manager's signed-in session.
function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Record keys are interpolated into onclick="fn('KEY')" attributes. Anonymous visitors can choose
// their own job key when writing to /jobs, so only keys made of harmless characters are accepted.
function isSafeId(id){return /^[A-Za-z0-9_-]+$/.test(String(id));}
// Only genuine base64 image data URLs are ever allowed into src="" / onclick="" attributes.
function safePhoto(p){return (typeof p==='string'&&/^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+\/=]+$/.test(p))?p:'';}


// ---- Live tracking (customer map at /track.html?t=TOKEN) ----
// Each job gets an unguessable trackToken; /tracking/{token} is a small PUBLIC-readable copy of
// only what the customer's map needs (status, pickup/drop-off points, driver position - no
// name/phone/email). Staff keep it in sync as the job moves.
function secureToken(n){var b=new Uint8Array(n);crypto.getRandomValues(b);var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<n;i++)s+=c[b[i]%c.length];return s;}
function placeRec(pl,fallbackText){
  return pl?{lat:pl.lat,lng:pl.lng,name:pl.name||'',kind:pl.kind||'place',address:pl.text||fallbackText||''}:null;
}
function trackUrl(job){return (job&&job.trackToken&&isSafeId(job.trackToken))?'https://corridortowing.org/track.html?t='+encodeURIComponent(job.trackToken):'';}
function trackStatus(s){return s==='dropped_off'?'done':s;}
function firstName(n){return String(n||'').trim().split(/\s+/)[0]||'';}
async function syncTracking(job,patch){
  if(!job||!job.trackToken||!isSafeId(job.trackToken))return false;
  try{
    var body=Object.assign({updatedAt:Date.now()},patch);
    var res=await fbFetch(FIREBASE_URL+'/tracking/'+job.trackToken+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return true;
  }catch(e){console.warn('Tracking sync failed (has the latest database.rules.json been published?):',e);return false;}
}
async function putTracking(token,rec){
  try{
    var res=await fbFetch(FIREBASE_URL+'/tracking/'+token+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({createdAt:Date.now(),updatedAt:Date.now()},rec))});
    return res.ok;
  }catch(e){return false;}
}
// The stored place fields on a job -> a place object usable by CTMap / trackers.
function jobPickupPlace(job){
  if(job&&job.pickupLat!=null&&job.pickupLng!=null)return {lat:Number(job.pickupLat),lng:Number(job.pickupLng),name:job.pickupName||'',kind:job.pickupKind||'place',address:job.pickupAddress||''};
  return null;
}
function jobDestPlace(job){
  if(job&&job.destLat!=null&&job.destLng!=null)return {lat:Number(job.destLat),lng:Number(job.destLng),name:job.destName||'',kind:job.destKind||'place',address:job.destinationAddress||''};
  return null;
}

// Toast notification. Previously this only existed inside initTT() (driver portal), so every
// manager-side call (cancel/delete/save job, copy link) threw "tT is not defined" AFTER the
// action had already succeeded and showed a misleading error alert.
function tT(msg,type){
  type=type||'info';
  var ic={success:'fa-check-circle',error:'fa-circle-exclamation',warning:'fa-triangle-exclamation',info:'fa-circle-info'};
  var clr={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#60a5fa'};
  var box=document.getElementById('tt-tbox');if(!box)return;
  var el=document.createElement('div');el.className='tt-ti';
  var i=document.createElement('i');i.className='fas '+(ic[type]||ic.info);i.style.color=clr[type]||clr.info;
  var span=document.createElement('span');span.textContent=msg;
  el.appendChild(i);el.appendChild(span);
  box.appendChild(el);
  setTimeout(function(){if(el.parentNode)el.remove();},3200);
}

// ---- Firebase Auth (gates driver/manager portal access) ----
// TODO: replace with the values from Firebase console > Project settings > General > Your apps > Web app
var firebaseConfig={
  apiKey:'AIzaSyCF_tvhK5awT5YK-bOjC6xrlNYjoFDD3Ak',
  authDomain:'corridortowing.firebaseapp.com',
  databaseURL:FIREBASE_URL,
  projectId:'corridortowing'
};
firebase.initializeApp(firebaseConfig);
var fbAuth=firebase.auth();
window.fbAuth=fbAuth;
// TODO: replace with your real manager email(s), lowercase. Any other signed-in account gets driver-only access.
var MANAGER_EMAILS=['ajmal@corridortowing.org'];
function isManagerEmail(email){return !!email&&MANAGER_EMAILS.indexOf(String(email).toLowerCase())!==-1;}

// Attaches the signed-in employee's Firebase ID token to every internal Firebase Database
// request so the (now locked-down) database rules can verify the caller is authenticated.
async function fbFetch(url,opts){
  opts=opts||{};
  var user=fbAuth.currentUser;
  if(user){
    var token=await user.getIdToken();
    url+=(url.indexOf('?')>-1?'&':'?')+'auth='+encodeURIComponent(token);
  }
  return fetch(url,opts);
}

// A second, separately-named Firebase App instance used ONLY for creating driver
// accounts. Firebase's client SDK signs you in as whatever account you just created —
// using the primary fbAuth for that would kick the manager out of their own session.
// This instance is signed out again immediately after each use.
function secondaryAuth(){
  var app=firebase.apps.find(function(a){return a.name==='Secondary';})||firebase.initializeApp(firebaseConfig,'Secondary');
  return app.auth();
}
function genTempPassword(){
  var chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/I/l
  var s='';
  for(var i=0;i<10;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ---- CORE TIME MATH ----
// All times stored as Unix ms timestamps in checkIn.time / checkOut.time
// hours field = elapsed milliseconds (integer) — exact, never rounded wrong
// Display always uses msToHM()

function msToHM(ms){
  // ms = milliseconds of work time
  if(ms==null||ms===''||isNaN(ms))return'--';
  ms=Math.max(0,Math.round(Number(ms)));
  if(ms===0)return'0m';
  var totalMins=Math.round(ms/60000);
  if(totalMins===0)return'<1m';
  var h=Math.floor(totalMins/60),m=totalMins%60;
  if(h===0)return m+'m';
  if(m===0)return h+'h';
  return h+'h '+m+'m';
}

function msToHrsDecimal(ms){
  if(!ms||isNaN(ms))return 0;
  return Math.round((ms/3600000)*100)/100;
}

// Safely get ms from a record — handles 3 legacy formats:
// 1. New format: hours = ms (large integer e.g. 3720000)
// 2. Legacy minutes: hours = small integer e.g. 62
// 3. Legacy decimal hours: hours = e.g. 1.03
function getMs(r){
  if(!r||r.hours==null)return null;
  var v=Number(r.hours);
  if(isNaN(v)||v<0)return null;
  if(v===0)return 0;
  // If we have both checkIn.time and checkOut.time, always compute directly — most accurate
  if(r.checkIn&&r.checkIn.time&&r.checkOut&&r.checkOut.time){
    var diff=Number(r.checkOut.time)-Number(r.checkIn.time);
    if(diff>0)return diff;
  }
  // Fallback: interpret stored value
  if(v>86400000)return v; // already ms (>24hrs in ms)
  if(v>1440)return v; // ms < 24hrs but > 1440 (more than 1440 minutes = impossible, so ms)
  if(v>24&&Number.isInteger(v))return v*60000; // legacy minutes
  if(v<=24)return Math.round(v*3600000); // legacy decimal hours
  return v;
}

var pendingPortalMode=null;
function showLoginGate(mode){
  pendingPortalMode=mode||null;
  document.getElementById('tt-logout-btn').innerHTML='Exit';
  document.getElementById('tt-login-title').textContent=mode==='mgr'?'Manager Sign In':'Driver Sign In';
  document.getElementById('tt-login-email').value='';
  document.getElementById('tt-login-pass').value='';
  document.getElementById('tt-login-error').style.display='none';
  document.getElementById('tt-mgr-modal').classList.add('active');
  setTimeout(function(){document.getElementById('tt-login-email').focus();},200);
}
function closeMgrModal(){document.getElementById('tt-mgr-modal').classList.remove('active');}
function cancelLoginGate(){closeMgrModal();closeDP();}
async function signInEmployee(){
  var email=document.getElementById('tt-login-email').value.trim();
  var pass=document.getElementById('tt-login-pass').value;
  var errEl=document.getElementById('tt-login-error');
  var btn=document.getElementById('tt-login-btn');
  errEl.style.display='none';
  if(!email||!pass){errEl.textContent='Enter your email and password.';errEl.style.display='block';return;}
  btn.disabled=true;btn.textContent='Signing in…';
  try{
    await fbAuth.signInWithEmailAndPassword(email,pass);
    closeMgrModal();
    if(await mustChangePassword()){showForcePasswordChange(pendingPortalMode);}
    else{enterPortal(pendingPortalMode);}
  }catch(e){
    errEl.textContent='Sign-in failed: '+(e&&(e.code||e.message)||'unknown error');
    errEl.style.display='block';
  }finally{
    btn.disabled=false;btn.textContent='Sign In';
  }
}
async function mustChangePassword(){
  try{
    var res=await fbFetch(FIREBASE_URL+'/employees/'+fbAuth.currentUser.uid+'.json');
    if(!res.ok)return false;
    var data=await res.json();
    return !!(data&&data.mustChangePassword);
  }catch(e){return false;}
}
function showForcePasswordChange(mode){
  pendingPortalMode=mode;
  document.getElementById('tt-forcepw-new').value='';
  document.getElementById('tt-forcepw-confirm').value='';
  document.getElementById('tt-forcepw-error').style.display='none';
  document.getElementById('tt-forcepw-modal').classList.add('active');
}
async function submitForcePasswordChange(){
  var p1=document.getElementById('tt-forcepw-new').value;
  var p2=document.getElementById('tt-forcepw-confirm').value;
  var errEl=document.getElementById('tt-forcepw-error');
  errEl.style.display='none';
  if(!p1||p1.length<6){errEl.textContent='Password must be at least 6 characters.';errEl.style.display='block';return;}
  if(p1!==p2){errEl.textContent='Passwords do not match.';errEl.style.display='block';return;}
  var btn=document.getElementById('tt-forcepw-btn');
  btn.disabled=true;btn.textContent='Saving…';
  try{
    await fbAuth.currentUser.updatePassword(p1);
    var clearRes=await fbFetch(FIREBASE_URL+'/employees/'+fbAuth.currentUser.uid+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({mustChangePassword:false})});
    if(!clearRes.ok)throw new Error('Password changed, but HTTP '+clearRes.status+' clearing the flag — you may be asked again next sign-in.');
    document.getElementById('tt-forcepw-modal').classList.remove('active');
    enterPortal(pendingPortalMode);
  }catch(e){
    errEl.textContent='Could not update password: '+(e&&(e.code||e.message)||'unknown error');
    errEl.style.display='block';
  }finally{
    btn.disabled=false;btn.textContent='Set Password & Continue';
  }
}
function enterPortal(mode){
  document.getElementById('tt-logout-btn').innerHTML='<i class="fas fa-right-from-bracket"></i> Log Out';
  if(mode==='mgr'){
    var email=fbAuth.currentUser&&fbAuth.currentUser.email;
    if(!isManagerEmail(email)){
      alert('This account is signed in but is not authorized for Manager access.');
      closeDP();
      return;
    }
    mgrAuth=true;
    document.getElementById('mgr-badge').style.display='inline-flex';
    document.getElementById('tt-nav').style.display='none';
    document.querySelectorAll('.tt-screen').forEach(function(s){s.classList.remove('active');});
    document.getElementById('tt-scr-mgr').classList.add('active');
    switchMgrMainTab('dispatch');
    loadMgrData();loadMgrJobs();loadMgrDrivers();loadMgrReleaseForms();
  }else{
    initTT();
  }
}

