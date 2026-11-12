// Lets a customer cancel or ask to change their own request WITHOUT signing in.
// Used on the request form's confirmation box and on /track.html.
//
// Proof of ownership is the request's manageToken — a random string created with the request
// and only ever given to the person who made it (it's in their tracking link's record). The
// database rules (see "status" / "changeRequest" under jobs in database.rules.json) accept
// these two writes from a signed-out visitor only when that token is sent along as _proof.
//
// Dispatch is also alerted by push every time, so the request still reaches a person even if
// the database write is refused (e.g. the newest rules haven't been published yet).
var CTManage=(function(){
  var DB='https://corridortowing-default-rtdb.firebaseio.com';
  var NTFY='https://ntfy.sh/corridor-towing-b2e5e69500315953';
  var PHONE_HTML='<a href="tel:8042928414" style="color:#0b3d91;font-weight:700">(804) 292-8414</a>';
  function okId(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{6,80}$/.test(v);}
  function push(title,body,tags){
    return fetch(NTFY,{method:'POST',headers:{'Title':title,'Priority':'urgent','Tags':tags},body:body}).then(function(r){return r.ok;}).catch(function(){return false;});
  }
  // Plain fetch on purpose (no sign-in token): the _proof field is only writable signed-out.
  function patch(path,body){
    return fetch(DB+path+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.ok;}).catch(function(){return false;});
  }

  // o: {jobId, token, trackToken, status, summary, onChange}
  //   summary  - one line describing the request for the dispatcher's alert
  //   onChange - called after a successful cancel so the page can refresh
  function render(el,o){
    if(!el||!o||!okId(o.jobId)||!okId(o.token)){if(el)el.innerHTML='';return;}
    var status=o.status||'pending';
    if(status==='done'||status==='dropped_off'||status==='cancelled'){el.innerHTML='';el.style.display='none';return;}
    el.style.display='block';
    if(status!=='pending'&&status!=='assigned'){
      el.innerHTML='<p style="margin:0;font-size:.95rem;color:#555">Your driver is already on the way. To change or cancel now, please call '+PHONE_HTML+'.</p>';
      return;
    }
    // Re-rendered on every tracking refresh; don't wipe out a note the customer is typing.
    if(el.dataset.busy==='1')return;
    var btn='border:none;border-radius:50px;padding:.6rem 1.2rem;font-weight:700;font-size:.95rem;cursor:pointer;';
    el.innerHTML='<p style="margin:0 0 .6rem;font-weight:700;color:#0b3d91">Need to change or cancel?</p>'+
      '<div data-m="main" style="display:flex;flex-wrap:wrap;gap:.5rem">'+
        '<button type="button" data-m="change" style="'+btn+'background:#0b3d91;color:#fff">Change my request</button>'+
        '<button type="button" data-m="cancel" style="'+btn+'background:#fff;color:#b3261e;border:2px solid #b3261e">Cancel my request</button>'+
      '</div>'+
      '<div data-m="changebox" style="display:none">'+
        '<textarea data-m="note" maxlength="500" placeholder="What should we change? e.g. new pickup address, different vehicle, different time" style="height:80px"></textarea>'+
        '<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem">'+
          '<button type="button" data-m="send" style="'+btn+'background:#0b3d91;color:#fff">Send change</button>'+
          '<button type="button" data-m="back" style="'+btn+'background:#eee;color:#333">Never mind</button>'+
        '</div>'+
      '</div>'+
      '<div data-m="cancelbox" style="display:none">'+
        '<p style="margin:0 0 .5rem">Cancel this request? We won\'t send a driver.</p>'+
        '<div style="display:flex;flex-wrap:wrap;gap:.5rem">'+
          '<button type="button" data-m="yes" style="'+btn+'background:#b3261e;color:#fff">Yes, cancel it</button>'+
          '<button type="button" data-m="back" style="'+btn+'background:#eee;color:#333">Keep my request</button>'+
        '</div>'+
      '</div>'+
      '<p data-m="msg" style="display:none;margin:.6rem 0 0;font-size:.95rem"></p>';
    function q(n){return el.querySelector('[data-m="'+n+'"]');}
    function show(n){
      ['main','changebox','cancelbox'].forEach(function(k){q(k).style.display=(k===n)?(k==='main'?'flex':'block'):'none';});
      el.dataset.busy=(n==='main')?'':'1';
    }
    function say(text,good){
      var m=q('msg');m.style.display='block';m.style.color=good?'#1b5e20':'#b3261e';m.innerHTML=text;
    }
    el.onclick=async function(e){
      var b=e.target.closest('button[data-m]');if(!b)return;
      var act=b.dataset.m;
      if(act==='change'){q('msg').style.display='none';show('changebox');q('note').focus();return;}
      if(act==='cancel'){q('msg').style.display='none';show('cancelbox');return;}
      if(act==='back'){show('main');return;}
      var now=Date.now(),about=o.summary?('\n'+o.summary):'';
      if(act==='send'){
        var note=q('note').value.trim();
        if(!note){say('Please type what you\'d like changed.',false);return;}
        b.disabled=true;b.textContent='Sending…';
        var saved=await patch('/jobs/'+o.jobId,{changeRequest:note,changeRequestAt:now,_proof:o.token});
        var pushed=await push('Customer wants a CHANGE',note+about,'pencil2');
        b.disabled=false;b.textContent='Send change';
        if(!saved&&!pushed){say('We couldn\'t send that. Please call '+PHONE_HTML+'.',false);return;}
        q('note').value='';show('main');
        say('Sent. We\'ll update your request and call you if the price changes.',true);
        return;
      }
      if(act==='yes'){
        b.disabled=true;b.textContent='Cancelling…';
        var done=await patch('/jobs/'+o.jobId,{status:'cancelled',cancelledBy:'customer',cancelledAt:now,updatedAt:now,_proof:o.token});
        if(done&&okId(o.trackToken))await patch('/tracking/'+o.trackToken,{status:'cancelled'});
        var told=await push(done?'Customer CANCELLED a request':'Customer wants to CANCEL','Request '+(done?'was cancelled by the customer.':'— please cancel it in Dispatch.')+about,'x');
        el.dataset.busy='';
        if(done){
          el.innerHTML='<p style="margin:0;font-weight:700;color:#1b5e20">Your request is cancelled. No driver will be sent.</p>';
          el.onclick=null;
          if(o.onChange)o.onChange('cancelled');
        }else if(told){
          el.innerHTML='<p style="margin:0;font-weight:700;color:#1b5e20">We\'ve told dispatch to cancel your request.</p><p style="margin:.3rem 0 0;font-size:.95rem;color:#555">To be sure, you can also call '+PHONE_HTML+'.</p>';
          el.onclick=null;
        }else{
          b.disabled=false;b.textContent='Yes, cancel it';
          say('We couldn\'t cancel online. Please call '+PHONE_HTML+'.',false);
        }
      }
    };
  }
  return {render:render};
})();
