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
    createdAt:Date.now(),
    sigToken:Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)
  };
  try{
    var shortId=randomShortId(8);
    var res=await fbFetch(FIREBASE_URL+'/releaseForms/'+shortId+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    var url;
    if(res.ok){
      url='https://corridortowing.org/release-form.html?r='+shortId;
    }else{
      console.warn('Release form shortlink save failed, using long-form link instead: HTTP '+res.status);
      url='https://corridortowing.org/release-form.html?d='+b64urlEncode(JSON.stringify(d));
    }
    closeReleaseModal();
    document.getElementById('rf-result-link').value=url;
    document.getElementById('rf-result-print').href=url;
    document.getElementById('rf-send-phone').value=document.getElementById('rf-phone').value?document.getElementById('rf-phone').value:'';
    document.getElementById('rf-send-email').value='';
    document.getElementById('mgr-release-result-modal').classList.add('active');
  }catch(e){
    alert('Could not generate release form: '+(e&&e.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Generate Form';
  }
}
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
  var text='Corridor Towing: Here\'s your vehicle release form — '+url;
  window.location.href='sms:'+phone.replace(/\s/g,'')+'?&body='+encodeURIComponent(text);
}
function sendReleaseEmail(){
  var email=(document.getElementById('rf-send-email').value||'').trim();
  if(!email){alert('Enter an email address first.');return;}
  var url=document.getElementById('rf-result-link').value;
  var text='Corridor Towing: Here\'s your vehicle release form — '+url;
  window.location.href='mailto:'+email+'?subject='+encodeURIComponent('Your Corridor Towing Vehicle Release Form')+'&body='+encodeURIComponent(text);
}

