// One login page for everyone. After sign-in we look up the account's role (admin /
// driver / customer — see fbLookupRole in firebase-shared.js) and send them to the right
// place; the UI never asks "are you staff or a customer", the account itself decides.
(function(){
  var loading=document.getElementById('auth-loading'),body=document.getElementById('auth-body');
  var errEl=document.getElementById('auth-err'),okEl=document.getElementById('auth-ok');
  var nextParam=new URLSearchParams(location.search).get('next');

  function showErr(msg){errEl.textContent=msg;errEl.style.display='block';okEl.style.display='none';}
  function showOk(msg){okEl.textContent=msg;okEl.style.display='block';errEl.style.display='none';}
  function clearMsgs(){errEl.style.display='none';okEl.style.display='none';}

  window.setAuthTab=function(tab){
    document.getElementById('tab-signin').classList.toggle('on',tab==='signin');
    document.getElementById('tab-signup').classList.toggle('on',tab==='signup');
    document.getElementById('form-signin').style.display=tab==='signin'?'block':'none';
    document.getElementById('form-signup').style.display=tab==='signup'?'block':'none';
    document.getElementById('staff-note').style.display=tab==='signin'?'block':'none';
    document.getElementById('auth-title').textContent=tab==='signin'?'Sign In':'Create Your Account';
    document.getElementById('auth-sub').textContent=tab==='signin'?'Customers, drivers and staff all sign in here.':'For customers — to save and revisit your requests and receipts.';
    clearMsgs();
  };

  async function goHome(role){
    if(nextParam&&(role==='customer'))
    {window.location.href=nextParam;return;}
    window.location.href=roleHome(role);
  }
  window.goHome=goHome; // exposed like setAuthTab above, for the same reason: nothing outside this file calls it today, but keeping it reachable costs nothing and matches this file's existing pattern

  // Already signed in (e.g. a bookmark, or came back after a redirect) — skip straight past
  // the form instead of asking them to type their password again.
  fbWhoAmI().then(async function(user){
    if(user){
      var role=await fbLookupRole(user);
      if(role==='disabled'){
        await fbAuth.signOut();
        loading.style.display='none';body.style.display='block';
        showErr('This account has been disabled. Contact an administrator.');
        return;
      }
      window.goHome(role);
      return;
    }
    loading.style.display='none';body.style.display='block';
  });

  document.getElementById('form-signin').addEventListener('submit',async function(e){
    e.preventDefault();
    clearMsgs();
    var btn=document.getElementById('si-btn');btn.disabled=true;btn.textContent='Signing in…';
    try{
      var cred=await fbAuth.signInWithEmailAndPassword(document.getElementById('si-email').value.trim(),document.getElementById('si-pass').value);
      var role=await fbLookupRole(cred.user);
      if(role==='disabled'){await fbAuth.signOut();showErr('This account has been disabled. Contact an administrator.');return;}
      showOk('Signed in — redirecting…');
      window.goHome(role);
    }catch(err){
      showErr('Sign-in failed: '+(err&&(err.code==='auth/invalid-credential'||err.code==='auth/wrong-password'||err.code==='auth/user-not-found'?'incorrect email or password.':err.message)||'unknown error'));
    }finally{btn.disabled=false;btn.textContent='Sign In';}
  });

  document.getElementById('form-signup').addEventListener('submit',async function(e){
    e.preventDefault();
    clearMsgs();
    var name=document.getElementById('su-name').value.trim();
    var email=document.getElementById('su-email').value.trim();
    var phone=document.getElementById('su-phone').value.trim();
    var pass=document.getElementById('su-pass').value;
    if(!name||!email||pass.length<6){showErr('Please fill in your name, email and a password of at least 6 characters.');return;}
    var btn=document.getElementById('su-btn');btn.disabled=true;btn.textContent='Creating account…';
    try{
      var cred=await fbAuth.createUserWithEmailAndPassword(email,pass);
      try{await cred.user.updateProfile({displayName:name});}catch(e2){}
      // Self-service accounts created here are ALWAYS plain customers — database.rules.json
      // only lets an admin write into /employees, so there is no way this form (or anyone
      // using it) can grant themselves staff access.
      var res=await fbFetch(FIREBASE_URL+'/customers/'+cred.user.uid+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        name:name,email:email,phone:phone||null,createdAt:Date.now()
      })});
      if(!res.ok)console.warn('Customer profile save failed (HTTP '+res.status+') — sign-in still works, just no saved name/phone.');
      showOk('Account created — redirecting…');
      window.goHome("customer");
    }catch(err){
      var msg=err&&err.code==='auth/email-already-in-use'?'That email already has an account — try Sign In instead.':(err&&err.message||'Could not create account.');
      showErr(msg);
    }finally{btn.disabled=false;btn.textContent='Create Account';}
  });
})();
