// Customer account portal. Everything shown here is scoped by database.rules.json to
// this signed-in user's own uid — /customerJobs/{my uid} is the only index a customer
// account can list, and each /jobs/{id} it points at is readable only because that
// pointer exists (see the rules file's "jobs"/"customerJobs" comments).
(function(){
  var STATUS_LABEL={pending:'Requested',assigned:'Driver Assigned',enroute:'Driver En Route',on_location:'Driver On Location',picked_up:'Vehicle Picked Up',done:'Completed',dropped_off:'Completed',cancelled:'Cancelled'};
  var STATUS_COLOR={pending:'#f59e0b',assigned:'#0b3d91',enroute:'#7c3aed',on_location:'#0d9488',picked_up:'#0d9488',done:'#1b5e20',dropped_off:'#1b5e20',cancelled:'#b3261e'};

  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function b64urlEncode(str){var b64=btoa(unescape(encodeURIComponent(str)));return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

  // A guest-equivalent long-form receipt link, built entirely from data this account is
  // already allowed to read — no Firebase write, so it needs no special privilege.
  function receiptUrl(job){
    var isTow=job.jobType==='tow';
    var d={id:job.id||'',n:job.customerName||'',s:job.service||'',v:job.vehicle||'',pu:job.pickupAddress||'',
      do:(isTow&&job.destinationAddress&&job.destinationAddress!=='N/A')?job.destinationAddress:'',
      em:Number(job.enrouteMiles)||0,tm:isTow?(Number(job.towMiles)||0):0,amt:Number(job.amount)||0,
      pp:job.paymentPref||'',pm:job.payMethod||'',dn:job.assignedDriverName||'',
      dt:job.droppedOffAt||job.updatedAt||Date.now(),jt:job.jobType||'',ft:job.feedbackToken||'',er:2,tr:6};
    return '/receipt.html?d='+b64urlEncode(JSON.stringify(d));
  }
  function trackHref(job){return (job.trackToken)?'/track.html?t='+encodeURIComponent(job.trackToken):'';}

  function renderJobs(jobs){
    var box=document.getElementById('acct-jobs');
    if(!jobs.length){box.innerHTML='<div class="empty-state">No requests yet. <a href="/request.html" style="color:#0b3d91;font-weight:700">Request service</a> while signed in and it will show up here.</div>';return;}
    jobs.sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
    var html='';
    jobs.forEach(function(j){
      var status=j.status||'pending';
      var label=STATUS_LABEL[status]||status;
      var color=STATUS_COLOR[status]||'#666';
      var when=j.createdAt?new Date(j.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      var live=(status==='assigned'||status==='enroute'||status==='on_location'||status==='picked_up')&&trackHref(j);
      html+='<div class="req-row"><div style="min-width:0;flex:1">'+
        '<p style="font-weight:700;color:#222">'+esc(j.service||'Service request')+'</p>'+
        '<p style="font-size:.85rem;color:#666;margin-top:.15rem">'+esc(when)+(j.vehicle&&j.vehicle!=='Not provided'?' · '+esc(j.vehicle):'')+'</p>'+
        '<p style="font-size:.85rem;color:#666">'+esc(j.pickupAddress||'')+(j.destinationAddress&&j.destinationAddress!=='N/A'?' → '+esc(j.destinationAddress):'')+'</p>'+
        '<div class="req-links">'+
          (live?'<a href="'+trackHref(j)+'">Track live</a>':'')+
          ((status==='done'||status==='dropped_off')?'<a href="'+receiptUrl(j)+'">View receipt</a>':'')+
        '</div></div>'+
        '<div style="text-align:right;flex-shrink:0"><span class="req-badge" style="background:'+color+'22;color:'+color+'">'+esc(label)+'</span>'+
        (j.amount!=null?'<p style="font-weight:800;color:#222;margin-top:.4rem">$'+Number(j.amount).toFixed(2)+'</p>':'')+
        '</div></div>';
    });
    box.innerHTML=html;
  }

  async function loadJobs(uid){
    try{
      var idxRes=await fbFetch(FIREBASE_URL+'/customerJobs/'+uid+'.json');
      if(!idxRes.ok)throw new Error('HTTP '+idxRes.status);
      var idx=await idxRes.json();
      var ids=idx?Object.keys(idx).filter(function(id){return /^[A-Za-z0-9_-]+$/.test(id);}):[];
      var jobs=(await Promise.all(ids.map(async function(id){
        try{
          var r=await fbFetch(FIREBASE_URL+'/jobs/'+id+'.json');
          if(!r.ok)return null;
          var j=await r.json();
          if(j)j.id=id;
          return j;
        }catch(e){return null;}
      }))).filter(Boolean);
      renderJobs(jobs);
    }catch(e){
      document.getElementById('acct-jobs').innerHTML='<div class="empty-state" style="color:#b3261e">Could not load your requests. Check your connection and refresh.</div>';
    }
  }

  window.acctSignOut=function(){fbAuth.signOut().then(function(){window.location.href='/';});};

  fbWhoAmI().then(async function(user){
    if(!user){window.location.href='/login.html?next='+encodeURIComponent('/account.html');return;}
    var role=await fbLookupRole(user);
    if(role==='disabled'){await fbAuth.signOut();window.location.href='/login.html';return;}
    if(role==='admin'||role==='driver'){window.location.href=roleHome(role);return;} // staff belong in the app, not here
    document.getElementById('acct-loading').style.display='none';
    document.getElementById('acct-body').style.display='block';
    document.getElementById('acct-name').textContent=user.displayName||(user.email||'').split('@')[0];
    document.getElementById('acct-email').textContent=user.email||'';
    loadJobs(user.uid);
  });
})();
