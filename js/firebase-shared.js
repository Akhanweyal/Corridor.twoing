// Firebase init shared by every PUBLIC page that needs auth (login.html, account.html,
// request.html — signed-in customers get their own request linked to their account).
// Same project/config as app/js/auth.js (this key is public by Firebase's own design —
// it identifies the project, it isn't a secret; every real permission check happens in
// database.rules.json, not here).
var FIREBASE_URL='https://corridortowing-default-rtdb.firebaseio.com';
var firebaseConfig={
  apiKey:'AIzaSyCF_tvhK5awT5YK-bOjC6xrlNYjoFDD3Ak',
  authDomain:'corridortowing.firebaseapp.com',
  databaseURL:FIREBASE_URL,
  projectId:'corridortowing'
};
firebase.initializeApp(firebaseConfig);
var fbAuth=firebase.auth();

// Attaches the signed-in user's Firebase ID token to a Database REST call so rules can
// verify who's asking. Anonymous callers (no one signed in) just hit the plain URL.
async function fbFetch(url,opts){
  opts=opts||{};
  var user=fbAuth.currentUser;
  if(user){
    var token=await user.getIdToken();
    url+=(url.indexOf('?')>-1?'&':'?')+'auth='+encodeURIComponent(token);
  }
  return fetch(url,opts);
}

// Resolves once with the current Firebase user (or null) — onAuthStateChanged's first
// callback fires exactly once whether or not a session exists, so callers never have to
// guess whether fbAuth.currentUser has finished loading yet.
function fbWhoAmI(){
  return new Promise(function(resolve){
    var unsub=fbAuth.onAuthStateChanged(function(user){unsub();resolve(user);});
  });
}

// A signed-in user is staff (admin or driver) iff they have an /employees record; the
// bootstrap owner email always counts as admin even with no such record. Every real
// authorization decision still happens in database.rules.json — this is only used to
// decide which page to show, matching the roles the rules already enforce.
var BOOTSTRAP_ADMIN_EMAIL='ajmal@corridortowing.org';
async function fbLookupRole(user){
  if(!user)return null;
  if(String(user.email||'').toLowerCase()===BOOTSTRAP_ADMIN_EMAIL)return 'admin';
  try{
    var res=await fbFetch(FIREBASE_URL+'/employees/'+user.uid+'.json');
    if(!res.ok)return 'customer';
    var rec=await res.json();
    if(!rec)return 'customer';
    if(rec.active===false)return 'disabled';
    return rec.role==='admin'?'admin':'driver';
  }catch(e){return 'customer';}
}
// Where a signed-in user belongs, based on their role.
function roleHome(role){
  if(role==='admin')return '/app/?mode=mgr';
  if(role==='driver')return '/app/?mode=driver';
  return '/account.html';
}
