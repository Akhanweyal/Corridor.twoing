// ---- App shell: standalone entry/exit (no marketing site to toggle back to) ----
function enterApp(mode){
  document.getElementById('app-landing').style.display='none';
  document.getElementById('driver-app').style.display='block';
  // Firebase Auth persists a session across page loads/refreshes by default, but
  // it resolves that asynchronously — fbAuth.currentUser is unreliable to read
  // synchronously right after load, even when a valid session exists. Wait for
  // onAuthStateChanged's first callback (fires once either way: with a user, or
  // definitively with none) before deciding whether to prompt for sign-in at all.
  // Previously this always called showLoginGate() unconditionally, which is why
  // every refresh looked like it had logged the user out even though the
  // underlying Firebase session was still there the whole time.
  var unsub=fbAuth.onAuthStateChanged(async function(user){
    unsub();
    if(user){
      if(await mustChangePassword()){showForcePasswordChange(mode);}
      else{enterPortal(mode);}
    }else{
      showLoginGate(mode);
    }
  });
}
function closeDP(){
  document.getElementById('driver-app').style.display='none';
  document.getElementById('app-landing').style.display='flex';
  initTT_done=false;mgrAuth=false;
  document.getElementById('mgr-badge').style.display='none';
  document.getElementById('tt-nav').style.display='none';
  if(ttCS){ttCS.getTracks().forEach(function(t){t.stop()});ttCS=null;}
  if(window.fbAuth&&fbAuth.currentUser)fbAuth.signOut().catch(function(){});
}
// Deep-link support: /app/?mode=mgr or /app/?mode=driver jumps straight past the chooser
(function(){
  var mode=new URLSearchParams(location.search).get('mode');
  if(mode==='mgr')enterApp('mgr');
  else if(mode==='driver')enterApp();
})();
