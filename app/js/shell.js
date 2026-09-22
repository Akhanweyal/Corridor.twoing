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
// Logging out (or cancelling sign-in) sends people back to the one real front door
// (/login.html) instead of this old two-button "Driver Portal / Manager Portal" chooser —
// that chooser used to be the only way in, but now /login.html decides where someone
// belongs from their actual account, so showing it again after logout would undercut the
// whole point of having a single login page.
function closeDP(){
  initTT_done=false;mgrAuth=false;
  if(ttCS){ttCS.getTracks().forEach(function(t){t.stop()});ttCS=null;}
  var goLogin=function(){window.location.href='/login.html';};
  if(window.fbAuth&&fbAuth.currentUser)fbAuth.signOut().then(goLogin).catch(goLogin);
  else goLogin();
}
// Deep-link support: /app/?mode=mgr or /app/?mode=driver jumps straight past the chooser
// (this is how /login.html itself arrives here after resolving someone's real role). A bare
// visit to /app/ with no mode — an old bookmark, or landing here with nothing else to do —
// goes to /login.html instead of showing the retired chooser (see closeDP above).
(function(){
  var mode=new URLSearchParams(location.search).get('mode');
  if(mode==='mgr')enterApp('mgr');
  else if(mode==='driver')enterApp();
  else window.location.href='/login.html';
})();
