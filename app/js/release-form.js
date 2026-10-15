/* ========== VEHICLE RELEASE FORM ========== */
// Fully standalone from /jobs — most storage releases come from Agero, AAA, or
// Honk dispatches that never touch our own jobs list at all, so this never
// requires (or even offers) picking an existing job; everything is typed in
// fresh each time, same spirit as the New Job modal but a different real-world
// event (a vehicle leaving the storage yard, not a tow being dispatched).
var rfPaidManuallyEdited=false;
function rfDateInputValue(d){ // yyyy-mm-dd for a <input type=date>, local time
  var pad=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function openReleaseModal(){
  rfPaidManuallyEdited=false;
  document.getElementById('rf-source').value='website';
  ['rf-vehicle','rf-color','rf-plate','rf-vin','rf-dl','rf-notes'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('rf-state').value='VA';
  var today=new Date();
  document.getElementById('rf-in-date').value=rfDateInputValue(today);
  document.getElementById('rf-out-date').value=rfDateInputValue(today);
  document.getElementById('rf-nights').value='0';
  document.getElementById('rf-storage-fee').value='0.00';
  document.getElementById('rf-towin-miles').value='';
  document.getElementById('rf-towin-fee').value='';
  document.getElementById('rf-towout-miles').value='';
  document.getElementById('rf-towout-fee').value='';
  document.getElementById('rf-processing-fee').value='50.00';
  document.getElementById('rf-paid').value='';
  document.getElementById('rf-paymethod').value='cash';
  document.getElementById('rf-name').value='';
  document.getElementById('rf-phone').value='';
  document.getElementById('rf-relation').value='owner';
  try{document.getElementById('rf-releasedby').value=localStorage.getItem('rf_releasedBy')||'';}catch(e){}
  rfRecalcNights();
  document.getElementById('mgr-release-modal').classList.add('active');
}
function closeReleaseModal(){document.getElementById('mgr-release-modal').classList.remove('active');}
function rfRecalcNights(){
  var inD=new Date(document.getElementById('rf-in-date').value+'T00:00:00');
  var outD=new Date(document.getElementById('rf-out-date').value+'T00:00:00');
  var nights=Math.round((outD-inD)/86400000);
  if(!isFinite(nights)||nights<0)nights=0;
  document.getElementById('rf-nights').value=nights;
  rfRecalcStorageFee();
}
function rfRecalcStorageFee(){
  var nights=Number(document.getElementById('rf-nights').value)||0;
  document.getElementById('rf-storage-fee').value=(nights*RATES.storagePerNight).toFixed(2);
  rfRecalcTotal();
}
// Both tow legs are optional (most releases are just "customer drives off" —
// no additional tow to bill). Leaving the miles field blank leaves the fee
// blank too, and neither contributes to the total; typing miles fills in a
// suggested fee at $6/mi (same loaded-tow rate used sitewide) that's still
// freely editable, same pattern as the storage fee above.
function rfRecalcTowInFee(){
  var milesVal=document.getElementById('rf-towin-miles').value;
  document.getElementById('rf-towin-fee').value=milesVal===''?'':(Number(milesVal)*RATES.tow).toFixed(2);
  rfRecalcTotal();
}
function rfRecalcTowOutFee(){
  var milesVal=document.getElementById('rf-towout-miles').value;
  document.getElementById('rf-towout-fee').value=milesVal===''?'':(Number(milesVal)*RATES.tow).toFixed(2);
  rfRecalcTotal();
}
function rfRecalcTotal(){
  var storage=Number(document.getElementById('rf-storage-fee').value)||0;
  var towIn=Number(document.getElementById('rf-towin-fee').value)||0;
  var towOut=Number(document.getElementById('rf-towout-fee').value)||0;
  var processing=Number(document.getElementById('rf-processing-fee').value)||0;
  var total=storage+towIn+towOut+processing;
  document.getElementById('rf-total').value=total.toFixed(2);
  if(!rfPaidManuallyEdited)document.getElementById('rf-paid').value=total.toFixed(2);
}
async function generateReleaseForm(){
  var vehicle=(document.getElementById('rf-vehicle').value||'').trim();
  var name=(document.getElementById('rf-name').value||'').trim();
  if(!vehicle){alert('Enter the vehicle (year, make, model).');return;}
  if(!name){alert('Enter the name of the person picking up the vehicle.');return;}
  try{localStorage.setItem('rf_releasedBy',(document.getElementById('rf-releasedby').value||'').trim());}catch(e){}
  var btn=document.getElementById('rf-submit');
  btn.disabled=true;btn.textContent='Generating…';
  var d={
    src:document.getElementById('rf-source').value,
    veh:vehicle,
    color:document.getElementById('rf-color').value||'',
    plate:document.getElementById('rf-plate').value||'',
    state:document.getElementById('rf-state').value||'',
    vin:document.getElementById('rf-vin').value||'',
    inDate:new Date(document.getElementById('rf-in-date').value+'T00:00:00').getTime(),
    outDate:new Date(document.getElementById('rf-out-date').value+'T00:00:00').getTime(),
    nights:Number(document.getElementById('rf-nights').value)||0,
    storageFee:Number(document.getElementById('rf-storage-fee').value)||0,
    towInMiles:Number(document.getElementById('rf-towin-miles').value)||0,
    towInFee:Number(document.getElementById('rf-towin-fee').value)||0,
    towOutMiles:Number(document.getElementById('rf-towout-miles').value)||0,
    towOutFee:Number(document.getElementById('rf-towout-fee').value)||0,
    processingFee:Number(document.getElementById('rf-processing-fee').value)||0,
    total:Number(document.getElementById('rf-total').value)||0,
    paid:Number(document.getElementById('rf-paid').value)||0,
    payMethod:document.getElementById('rf-paymethod').value,
    name:name,
    phone:document.getElementById('rf-phone').value||'',
    relation:document.getElementById('rf-relation').value,
    dl:document.getElementById('rf-dl').value||'',
    notes:document.getElementById('rf-notes').value||'',
    releasedBy:(document.getElementById('rf-releasedby').value||'').trim(),
    createdAt:Date.now(),
    sigToken:Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)
  };
  try{
    await rfSaveAndShow(d);
    closeReleaseModal();
  }catch(e){
    alert('Could not generate release form: '+(e&&e.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Generate Form';
  }
}
// Saves a release form record and opens the link/print/send modal (shared by both forms)
var rfLastCompany='Corridor Towing';
async function rfSaveAndShow(d){
    rfLastCompany=d.company||'Corridor Towing';
    var shortId=randomShortId(8);
    var res=await fbFetch(FIREBASE_URL+'/releaseForms/'+shortId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    var url;
    if(res.ok){
      url='https://corridortowing.org/release-form.html?r='+shortId;
    }else{
      console.warn('Release form shortlink save failed, using long-form link instead: HTTP '+res.status);
      url='https://corridortowing.org/release-form.html?d='+b64urlEncode(JSON.stringify(d));
    }
    document.getElementById('rf-result-link').value=url;
    document.getElementById('rf-result-print').href=url;
    document.getElementById('rf-send-phone').value=d.phone||'';
    document.getElementById('rf-send-email').value='';
    document.getElementById('mgr-release-result-modal').classList.add('active');
}

/* ---- Other Company Release Form ----
   Kept separate and simple on purpose: every field starts empty and nothing is calculated
   except Total, which sums the fees typed in (and can still be typed over). Same yard address;
   Apex Towing carries its own phone number. Counted in the Business/tax totals like any release. */
var RFC_COMPANIES={apex:{name:'Apex Towing',phone:'(804) 944-6523'}};
var rfcTotalTyped=false;
function openReleaseCoModal(){
  ['rfc-company-name','rfc-company-phone','rfc-vehicle','rfc-plate','rfc-vin','rfc-in-date','rfc-out-date','rfc-towin-fee','rfc-towout-fee','rfc-admin-fee','rfc-total','rfc-name','rfc-phone','rfc-releasedby'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('rfc-company').value='';
  document.getElementById('rfc-typed-wrap').style.display='none';
  rfcTotalTyped=false;
  document.getElementById('mgr-release-co-modal').classList.add('active');
}
function closeReleaseCoModal(){document.getElementById('mgr-release-co-modal').classList.remove('active');}
function rfcRecalcTotal(){
  if(rfcTotalTyped)return;
  var any=false,sum=0;
  ['rfc-towin-fee','rfc-towout-fee','rfc-admin-fee'].forEach(function(id){var v=document.getElementById(id).value;if(v!==''){any=true;sum+=Number(v)||0;}});
  document.getElementById('rfc-total').value=any?sum.toFixed(2):'';
}
async function generateReleaseCoForm(){
  var sel=document.getElementById('rfc-company').value,company='',coPhone='';
  if(RFC_COMPANIES[sel]){company=RFC_COMPANIES[sel].name;coPhone=RFC_COMPANIES[sel].phone;}
  else if(sel==='typed'){company=(document.getElementById('rfc-company-name').value||'').trim().slice(0,100);coPhone=(document.getElementById('rfc-company-phone').value||'').trim();}
  var vehicle=(document.getElementById('rfc-vehicle').value||'').trim();
  var name=(document.getElementById('rfc-name').value||'').trim();
  if(!company){alert('Select or type the company name.');return;}
  if(!vehicle){alert('Enter the vehicle (year, make, model).');return;}
  if(!name){alert('Enter the name of the person picking up the vehicle.');return;}
  function dt(id){var v=document.getElementById(id).value;return v?new Date(v+'T00:00:00').getTime():null;}
  function num(id){return Number(document.getElementById(id).value)||0;}
  var total=num('rfc-total');
  var d={
    simple:true,company:company,companyPhone:coPhone,
    veh:vehicle,plate:(document.getElementById('rfc-plate').value||'').trim(),vin:(document.getElementById('rfc-vin').value||'').trim(),
    inDate:dt('rfc-in-date'),outDate:dt('rfc-out-date'),
    towInFee:num('rfc-towin-fee'),towOutFee:num('rfc-towout-fee'),processingFee:num('rfc-admin-fee'),
    total:total,paid:total,
    name:name,phone:(document.getElementById('rfc-phone').value||'').trim(),
    releasedBy:(document.getElementById('rfc-releasedby').value||'').trim(),
    createdAt:Date.now(),
    sigToken:Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)
  };
  var btn=document.getElementById('rfc-submit');
  btn.disabled=true;btn.textContent='Generating…';
  try{
    await rfSaveAndShow(d);
    closeReleaseCoModal();
  }catch(e){
    alert('Could not generate release form: '+(e&&e.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Generate Form';
  }
}
document.getElementById('rfc-company').addEventListener('change',function(){document.getElementById('rfc-typed-wrap').style.display=this.value==='typed'?'flex':'none';});
['rfc-towin-fee','rfc-towout-fee','rfc-admin-fee'].forEach(function(id){document.getElementById(id).addEventListener('input',rfcRecalcTotal);});
document.getElementById('rfc-total').addEventListener('input',function(){rfcTotalTyped=this.value!=='';if(!rfcTotalTyped)rfcRecalcTotal();});
function copyReleaseLink(){
  var input=document.getElementById('rf-result-link');
  input.select();
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(input.value).then(function(){tT('Release form link copied','success');}).catch(function(){mgrCopyFallback(input.value);});
  }else{
    mgrCopyFallback(input.value);
  }
}
function sendReleaseSms(){
  var phone=(document.getElementById('rf-send-phone').value||'').trim();
  if(!phone){alert('Enter a phone number first.');return;}
  var url=document.getElementById('rf-result-link').value;
  var text=rfLastCompany+': Here\'s your vehicle release form — '+url;
  window.location.href='sms:'+phone.replace(/\s/g,'')+'?&body='+encodeURIComponent(text);
}
function sendReleaseEmail(){
  var email=(document.getElementById('rf-send-email').value||'').trim();
  if(!email){alert('Enter an email address first.');return;}
  var url=document.getElementById('rf-result-link').value;
  var text=rfLastCompany+': Here\'s your vehicle release form — '+url;
  window.location.href='mailto:'+email+'?subject='+encodeURIComponent('Your '+rfLastCompany+' Vehicle Release Form')+'&body='+encodeURIComponent(text);
}

