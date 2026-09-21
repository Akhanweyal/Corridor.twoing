// Request-service form: pricing, address suggestions, route map, mileage estimates, submission.
// RATES must match RATES in /app/js/auth.js and the prices shown on services.html / the form's <option data-base>.
var RATES={enroute:2,tow:6};
// Private ntfy.sh topic for instant new-request push alerts. Install the ntfy app
// (ntfy.sh) and subscribe to this exact topic name to get notified on your phone.
var NTFY_TOPIC='corridor-towing-b2e5e69500315953';
var FIREBASE_DB='https://corridortowing-default-rtdb.firebaseio.com';

var pickupInput=document.getElementById('vehicleLocation');
var destInput=document.getElementById('towDestination');

function togglePayMethod(){document.getElementById('payMethodGroup').style.display=document.getElementById('paymentPreference').value==='pay-now'?'block':'none';}
function getSelectedJobType(){
  var s=document.getElementById('req_service');
  var o=s.options[s.selectedIndex];
  return (o&&o.dataset&&o.dataset.jobtype)?o.dataset.jobtype:'';
}
function onServiceChange(){
  var jt=getSelectedJobType();
  var isTow=jt==='tow';
  var destGroup=document.getElementById('destGroup');
  var towMiles=document.getElementById('towMilesGroup');
  var towOnly=document.getElementById('towOnlyFields');
  var neutralGroup=document.getElementById('neutralGroup');
  var est=document.getElementById('estimateBar');
  var locLabel=document.getElementById('locLabel');
  var locHelp=document.getElementById('locHelp');
  var payNote=document.getElementById('paymentNote');
  if(destGroup)destGroup.style.display=isTow?'block':'none';
  if(towMiles)towMiles.style.display=isTow?'block':'none';
  if(towOnly)towOnly.style.display=isTow?'block':'none';
  // Whether it can shift into neutral only matters when a truck is actually towing
  // it (wheel-lift needs rolling wheels; flatbed doesn't) — irrelevant for a
  // lockout/jumpstart/tire/fuel/winch call, so don't ask and don't submit a stale
  // answer left over from a previous tow selection.
  if(neutralGroup){neutralGroup.style.display=isTow?'block':'none';if(!isTow)document.getElementById('req_neutral').value='unknown';}
  if(est)est.style.display=isTow?'block':'none';
  destInput.required=isTow;
  if(!isTow){destInput.value='';destInput._place=null;}
  if(locLabel)locLabel.textContent=isTow?'Pickup Location *':'Service Location *';
  if(locHelp)locHelp.textContent=isTow?'Where is the vehicle now? Start typing an address or business name and pick a suggestion.':'Where should we meet you for this service? Start typing and pick a suggestion.';
  if(payNote){
    payNote.innerHTML=isTow
      ?'<strong>Payment Info:</strong> Enroute $2/mile. Tow (loaded) $6/mile. No free miles.'
      :'<strong>Payment Info:</strong> Flat service rate + enroute $2/mile if applicable.';
  }
  if(!isTow)document.getElementById('req_tow').value='0';
  calculateTotal();
  if(pickupInput.value.trim())refreshTripMap();
}
function calculateTotal(){
  var s=document.getElementById('req_service');
  var o=s.options[s.selectedIndex];
  var b=(o&&o.dataset&&o.dataset.base)?parseFloat(o.dataset.base):0;
  var en=parseFloat(document.getElementById('req_enroute').value)||0;
  var tw=getSelectedJobType()==='tow'?(parseFloat(document.getElementById('req_tow').value)||0):0;
  document.getElementById('req_amount').value=(b+en*RATES.enroute+tw*RATES.tow).toFixed(2);
}

// Shop's fixed location (matches the LocalBusiness geo coordinates in the JSON-LD on the
// home page) — the fixed end of every "enroute" leg, since that's the distance from us to
// the customer before any tow/service even starts.
var BASE_LAT=37.6331, BASE_LNG=-77.5026;

async function routeMiles(lat1,lon1,lat2,lon2){
  var r=await fetch('https://router.project-osrm.org/route/v1/driving/'+lon1+','+lat1+';'+lon2+','+lat2+'?overview=false');
  var j=await r.json();
  return (j.routes&&j.routes[0])?(j.routes[0].distance/1000*0.621371):null;
}

// ---- Route map -------------------------------------------------------------
var tripMap=null,mapSeq=0;
function ensureTripMap(){
  document.getElementById('tripMapWrap').style.display='block';
  if(!tripMap)tripMap=CTMap.create('tripMap');
  setTimeout(function(){tripMap.invalidate();},60);
  return tripMap;
}
async function refreshTripMap(){
  var my=++mapSeq;
  var isTow=getSelectedJobType()==='tow';
  var pl=null,dl=null;
  try{pl=await CTAddr.resolve(pickupInput);}catch(e){}
  try{if(isTow)dl=await CTAddr.resolve(destInput);}catch(e){}
  if(my!==mapSeq)return;
  var note=document.getElementById('tripMapNote');
  if(!pl){note.textContent='';return;}
  var m=ensureTripMap();
  var stats=await m.setTrip({status:'pending',jobType:isTow?'tow':'roadside',pickup:pl,dest:dl,showShop:true},{refit:true});
  if(my!==mapSeq||!stats)return;
  var bits=[];
  if(stats.toPickup&&stats.toPickup.meters!=null)bits.push('Our shop → you: '+CTMap.fmtMiles(stats.toPickup.meters)+' (dashed grey)');
  if(stats.trip&&stats.trip.meters!=null)bits.push('Tow route: '+CTMap.fmtMiles(stats.trip.meters)+' (orange)');
  note.textContent=bits.join('  ·  ');
}

// ---- Mileage estimates (use the picked suggestion's coordinates — no re-geocoding) ----
async function autoCalcMiles(){
  var b=document.getElementById('estimateBar');
  b.style.display='block';
  if(!pickupInput.value.trim()||!destInput.value.trim()){b.textContent='Enter both addresses for auto tow-miles estimate.';return;}
  b.textContent='Estimating...';
  try{
    var lp=await CTAddr.resolve(pickupInput);if(!lp)throw 0;
    var dp=await CTAddr.resolve(destInput);if(!dp)throw 0;
    var miles=await routeMiles(lp.lat,lp.lng,dp.lat,dp.lng);
    if(miles==null)throw 0;
    document.getElementById('req_tow').value=miles.toFixed(1);
    b.textContent='Estimated tow distance: '+miles.toFixed(1)+' miles';
    calculateTotal();
  }catch(e){b.textContent='Auto estimate failed — enter tow miles manually.';}
}
// Enroute = distance from OUR shop to the customer's pickup/service location — this
// always applies (tow or roadside), unlike tow miles which only applies to tow jobs.
async function autoCalcEnroute(){
  var b=document.getElementById('enrouteBar');
  b.style.display='block';
  if(!pickupInput.value.trim()){b.textContent='Enter your pickup/service location above for an automatic enroute estimate.';return;}
  b.textContent='Calculating distance from our shop…';
  try{
    var lp=await CTAddr.resolve(pickupInput);
    if(!lp)throw 0;
    var miles=await routeMiles(BASE_LAT,BASE_LNG,lp.lat,lp.lng);
    if(miles==null)throw 0;
    document.getElementById('req_enroute').value=miles.toFixed(1);
    b.textContent='Estimated enroute: '+miles.toFixed(1)+' miles from our shop';
    calculateTotal();
  }catch(e){b.textContent='Auto estimate failed — enter enroute miles manually.';}
}

// Pickup/destination can change via a suggestion click AND a blur a moment later — merge
// those into one recalculation.
var locTimer=null;
function onLocationsChanged(){
  clearTimeout(locTimer);
  locTimer=setTimeout(async function(){
    await autoCalcEnroute();
    if(getSelectedJobType()==='tow')await autoCalcMiles();
    refreshTripMap();
  },250);
}

document.getElementById('req_service').addEventListener('change',onServiceChange);
document.getElementById('req_enroute').addEventListener('input',calculateTotal);
document.getElementById('req_tow').addEventListener('input',calculateTotal);
pickupInput.addEventListener('blur',function(){if(pickupInput.value.trim())onLocationsChanged();});
destInput.addEventListener('blur',function(){if(destInput.value.trim())onLocationsChanged();});
CTAddr.attach(pickupInput,onLocationsChanged);
CTAddr.attach(destInput,onLocationsChanged);
onServiceChange();

function getCurrentLocation(){
  if(!navigator.geolocation){alert('Not supported.');return;}
  navigator.geolocation.getCurrentPosition(async function(p){
    var lat=p.coords.latitude,lng=p.coords.longitude;
    var pl=await CTAddr.reverse(lat,lng);
    if(!pl)pl={lat:lat,lng:lng,kind:'place',name:'',address:'',text:'Lat: '+lat.toFixed(6)+', Lon: '+lng.toFixed(6),title:'My location',sub:''};
    CTAddr.setPlace(pickupInput,pl);
    onLocationsChanged();
  },function(e){
    var m='Location error: ';
    if(e.code===1)m+='Permission denied.';else if(e.code===2)m+='Unavailable.';else m+='Unknown.';
    alert(m);
  },{timeout:10000,enableHighAccuracy:true});
}

// Unguessable token from the browser's CSPRNG (the feedback / tracking links' proof of ownership; Math.random is predictable).
function secureToken(n){var a=new Uint8Array(n);(window.crypto||window.msCrypto).getRandomValues(a);var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<n;i++)s+=c[a[i]%c.length];return s;}
// Firebase rejects `undefined`, so flatten a resolved place to plain storable fields.
function placeRecord(pl,fallbackText){
  return pl?{lat:pl.lat,lng:pl.lng,name:pl.name||'',kind:pl.kind||'place',address:pl.text||fallbackText||''}:null;
}

var formRenderedAt=Date.now();
async function handleRequestSubmit(e){e.preventDefault();
// Spam guard: a real visitor never fills the hidden "website" field, and never
// submits an 8+ field form within 1.5s of it appearing — bots commonly do both.
if(document.getElementById('req_website').value){return;}
if(Date.now()-formRenderedAt<1500){return;}
var jobType=getSelectedJobType();
if(!jobType){alert('Please select a service.');return;}
if(jobType==='tow'){
  var destVal=(destInput.value||'').trim();
  if(!destVal){alert('Please enter a drop-off destination for towing jobs.');return;}
}
if(document.getElementById('paymentPreference').value==='pay-now'&&!document.getElementById('payMethod').value){
  alert('Please select how you\'d like to pay now.');return;
}
var btn=document.getElementById('submitBtn');btn.disabled=true;btn.textContent='Sending...';
// Exact coordinates for the driver's + customer's map. Never blocks the request if lookup fails.
var pickupPlace=null,destPlace=null;
try{pickupPlace=await CTAddr.resolve(pickupInput);}catch(err){}
try{if(jobType==='tow')destPlace=await CTAddr.resolve(destInput);}catch(err){}
var fd={name:document.getElementById('req_name').value,phone:document.getElementById('req_phone').value,email:document.getElementById('req_email').value,vehicle:document.getElementById('req_vehicle').value||'Not provided',towmethod:document.getElementById('req_towmethod').value,starts:document.getElementById('req_starts').value,neutral:document.getElementById('req_neutral').value,attended:document.getElementById('req_attended').value,location:pickupInput.value,destination:jobType==='tow'?(destInput.value||'N/A'):'N/A — roadside on-site',service:document.getElementById('req_service').options[document.getElementById('req_service').selectedIndex].text,serviceCode:document.getElementById('req_service').value,jobType:jobType,enroute:document.getElementById('req_enroute').value,tow:jobType==='tow'?document.getElementById('req_tow').value:'0',amount:document.getElementById('req_amount').value,payment:document.getElementById('paymentPreference').value,payMethod:document.getElementById('payMethod')?document.getElementById('payMethod').value:'N/A'};
var msg='New Service Request!\n\nType: '+(jobType==='tow'?'TOWING':'ROADSIDE')+'\nCustomer: '+fd.name+'\nPhone: '+fd.phone+'\nEmail: '+fd.email+'\n\nVehicle: '+fd.vehicle+'\nStarts: '+fd.starts+' | Neutral: '+fd.neutral+' | Attended: '+fd.attended+'\n'+(jobType==='tow'?'Tow Method: '+fd.towmethod+'\n':'')+'\nService: '+fd.service+'\nLocation: '+fd.location+'\n'+(jobType==='tow'?'Destination: '+fd.destination+'\n':'')+'Enroute: '+fd.enroute+' mi\n'+(jobType==='tow'?'Tow miles: '+fd.tow+'\n':'')+'\nTotal: $'+fd.amount+'\nPayment: '+(fd.payment==='pay-now'?'Pay now via '+fd.payMethod:'Pay on arrival')+'\n\nPlease call to confirm!';
/* 1) Formspree email (existing) */
var formspreePromise=fetch('https://formspree.io/f/xdkyonjb',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({_subject:'New '+(jobType==='tow'?'Tow':'Roadside')+' Request - '+fd.name,email:fd.email,_replyto:fd.email,name:fd.name,phone:fd.phone,service:fd.service,location:fd.location,destination:fd.destination,enroute:fd.enroute,tow_miles:fd.tow,amount:fd.amount,payment:fd.payment==='pay-now'?'Pay now via '+fd.payMethod:'Pay on arrival',vehicle:fd.vehicle,job_type:jobType,message:msg})}).then(function(res){if(!res.ok)return res.json().then(function(data){throw new Error((data&&data.error)||('HTTP '+res.status));});return res.json();});
/* 2) Save job to Firebase for Manager Dispatch dashboard */
var jobId='job_'+Date.now().toString(36)+secureToken(5);
var feedbackToken=secureToken(24);
var now=Date.now();
var pickupRec=placeRecord(pickupPlace,fd.location),destRec=jobType==='tow'?placeRecord(destPlace,fd.destination):null;
// Public live-tracking record (separate from the job, which anonymous visitors can never read): the
// unguessable token in the link is the only way to open it, and it holds no name/phone/email.
var trackToken=pickupRec?secureToken(20):null;
var jobPayload={status:'pending',jobType:jobType,serviceCode:fd.serviceCode,createdAt:now,updatedAt:now,customerName:fd.name,customerPhone:fd.phone,customerEmail:fd.email,service:fd.service,vehicle:fd.vehicle,starts:fd.starts,neutral:fd.neutral,attended:fd.attended,towMethod:jobType==='tow'?fd.towmethod:null,pickupAddress:fd.location,destinationAddress:fd.destination,enrouteMiles:Number(fd.enroute)||0,towMiles:Number(fd.tow)||0,amount:Number(fd.amount)||0,paymentPref:fd.payment,payMethod:fd.payment==='pay-now'?(fd.payMethod||null):null,source:'website',assignedDriverId:null,assignedDriverName:null,assignedDriverPhone:null,assignedAt:null,pickedUpAt:null,droppedOffAt:null,dropoffLat:null,dropoffLng:null,feedbackToken:feedbackToken,feedbackSubmitted:false,feedbackRating:null,feedbackComment:null,
  pickupLat:pickupRec?pickupRec.lat:null,pickupLng:pickupRec?pickupRec.lng:null,pickupName:pickupRec?pickupRec.name:null,pickupKind:pickupRec?pickupRec.kind:null,
  destLat:destRec?destRec.lat:null,destLng:destRec?destRec.lng:null,destName:destRec?destRec.name:null,destKind:destRec?destRec.kind:null,
  trackToken:trackToken};
var jobPromise=fetch(FIREBASE_DB+'/jobs/'+jobId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(jobPayload)}).then(function(res){if(!res.ok)throw new Error('HTTP '+res.status);return true;}).catch(function(err){console.warn('Job save failed (check Firebase rules):',err);return false;});
var trackPromise=trackToken?fetch(FIREBASE_DB+'/tracking/'+trackToken+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({createdAt:now,updatedAt:now,status:'pending',jobType:jobType,pickup:pickupRec,dest:destRec})}).then(function(res){return res.ok;}).catch(function(){return false;}):Promise.resolve(false);
/* 3) Instant push notification to owner's phone via ntfy.sh (free, no account) — fire-and-forget so a failure here never blocks the customer's confirmation */
fetch('https://ntfy.sh/'+NTFY_TOPIC,{method:'POST',headers:{'Title':'New '+(jobType==='tow'?'Tow':'Roadside')+' Request','Priority':'urgent','Tags':'rotating_light'},body:fd.name+' — '+fd.phone+'\n'+fd.service+'\n'+fd.location+(jobType==='tow'?' → '+fd.destination:'')+'\n$'+fd.amount}).catch(function(err){console.warn('Push notify failed:',err);});
// Formspree (the owner's email copy) and the Firebase job save are independent
// systems, and Formspree is the one known to silently fail (e.g. hitting its
// free-plan monthly submission cap) — that must never block the customer's
// confirmation as long as the job actually made it into Dispatch. Both branches
// below resolve to true/false instead of rejecting, so only a TOTAL failure
// (neither system captured the request) falls through to the "call us" alert.
var formspreeStatus=formspreePromise.then(function(){return true;}).catch(function(err){console.warn('Formspree email failed (owner will not get an email copy of this request — check formspree.io dashboard/plan limits):',err);return false;});
Promise.all([formspreeStatus,jobPromise,trackPromise]).then(function(results){
  var emailOk=results[0],jobOk=results[1],trackOk=results[2];
  if(!emailOk&&!jobOk){
    btn.disabled=false;btn.textContent='Send Request';
    alert('Error sending request. Please call (804) 292-8414 directly.');
    return;
  }
  var c=document.getElementById('confirmation');c.style.display='block';c.innerHTML='<strong>Thank you!</strong> Request sent. We\'ll call shortly.';
  if(trackOk&&jobOk){
    var trackUrl='/track.html?t='+encodeURIComponent(trackToken);
    c.innerHTML+='<br><br><a href="'+trackUrl+'" style="color:#0b3d91;text-decoration:underline"><i class="fas fa-location-dot"></i> Track your driver live on the map</a><br><span style="font-weight:400;font-size:.85rem">Bookmark this link — it shows where your driver is once one is assigned.</span>';
    try{localStorage.setItem('ct_last_track',trackUrl);}catch(err){}
  }
  if(fd.payment==='pay-now'){c.innerHTML+='<br><br><strong>Payment:</strong> <a href="/pay.html?amt='+encodeURIComponent(fd.amount)+'" style="color:#0b3d91;text-decoration:underline">Continue to payment</a>';if(!(trackOk&&jobOk))setTimeout(function(){window.location.href='/pay.html?amt='+encodeURIComponent(fd.amount);},1500);}
  btn.textContent='Request Sent ✓';
});
}
window.addEventListener('load',function(){calculateTotal();});
