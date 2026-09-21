// Customer live-tracking page (/track.html?t=TOKEN).
// Reads /tracking/{token} from Firebase (public read of that single record only — the token
// is unguessable and the record holds no name, phone or email) and redraws the map every 15s.
(function(){
  var FIREBASE_DB='https://corridortowing-default-rtdb.firebaseio.com';
  var token=new URLSearchParams(location.search).get('t')||'';
  var errEl=document.getElementById('trk-error'),mainEl=document.getElementById('trk-main');
  if(!/^[A-Za-z0-9]{10,64}$/.test(token)){errEl.style.display='block';return;}

  var MESSAGES={
    pending:['Request received','We’re confirming your request and will assign a driver shortly.'],
    assigned:['Driver assigned','A driver has been assigned and will head your way soon.'],
    enroute:['Driver is on the way','Your driver is heading to you now.'],
    on_location:['Driver has arrived','Your driver is on location.'],
    picked_up:['Vehicle picked up','Your vehicle is on the truck and heading to the drop-off location.'],
    done:['Completed','Thank you for choosing Corridor Towing.'],
    dropped_off:['Completed','Thank you for choosing Corridor Towing.'],
    cancelled:['Request cancelled','This request was cancelled. Call us if that’s a surprise.']
  };
  var map=null,timer=null,firstLoad=true;
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function placeRow(icon,label,p){
    if(!p)return '';
    var main=(p.kind==='biz'&&p.name)?p.name:(p.address||'');
    var sub=(p.kind==='biz'&&p.name)?(p.address||''):'';
    return '<div class="trk-place"><div class="ico">'+icon+'</div><div><div class="lbl">'+label+'</div><div style="font-weight:700">'+esc(main)+'</div>'+(sub?'<div style="font-size:.9rem;color:#555">'+esc(sub)+'</div>':'')+'</div></div>';
  }

  async function load(){
    var rec=null;
    try{
      var res=await fetch(FIREBASE_DB+'/tracking/'+token+'.json');
      if(res.ok)rec=await res.json();
    }catch(e){}
    if(!rec||!rec.pickup){
      if(firstLoad){errEl.style.display='block';mainEl.style.display='none';}
      return;
    }
    mainEl.style.display='block';errEl.style.display='none';
    var status=rec.status||'pending';
    var msg=MESSAGES[status]||[status,''];
    var isTow=rec.jobType==='tow';
    document.getElementById('trk-status').textContent=msg[0];
    document.getElementById('trk-detail').textContent=msg[1]+(rec.driver&&rec.driver.name?' Driver: '+rec.driver.name+'.':'');

    if(!map){
      map=CTMap.create('trk-map');
      document.getElementById('trk-legend').innerHTML=CTMap.legendHtml();
      setTimeout(function(){map.invalidate();},60);
    }
    var finished=(status==='done'||status==='dropped_off'||status==='cancelled');
    var driver=(rec.driver&&rec.driver.lat!=null&&rec.driver.lng!=null)?rec.driver:null;
    var stats=await map.setTrip({status:status,jobType:rec.jobType,pickup:rec.pickup,dest:rec.dest,driver:driver,showShop:false},{refit:firstLoad});
    firstLoad=false;

    var etaEl=document.getElementById('trk-eta'),eta='';
    if(stats&&!finished&&driver){
      var secs=null,what='';
      if(status==='picked_up'&&stats.toDest){secs=stats.toDest.seconds;what='to drop-off';}
      else if(stats.toPickup){secs=stats.toPickup.seconds;what='away';}
      if(secs!=null){eta='About '+CTMap.fmtDuration(secs)+' '+what+' (estimate)';}
      var ageMin=driver.at?Math.round((Date.now()-driver.at)/60000):null;
      if(ageMin!=null&&ageMin>10)eta+=(eta?' · ':'')+'location last updated '+ageMin+' min ago';
    }
    etaEl.textContent=eta;

    document.getElementById('trk-places').innerHTML=
      placeRow(isTow?'🚗':'📍',isTow?'Vehicle pickup':'Service location',rec.pickup)+
      (isTow?placeRow(rec.dest&&rec.dest.kind==='biz'?'🏢':(rec.dest&&rec.dest.kind==='house'?'🏠':'🏁'),'Drop-off'+(rec.dest&&rec.dest.kind==='house'?' (home)':''),rec.dest):'');

    if(finished){clearInterval(timer);timer=null;}
  }
  load();
  timer=setInterval(load,15000);
})();
