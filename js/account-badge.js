// Swaps the header "Sign In" link for "My Account" / "Staff Portal" once we know who (if
// anyone) is signed in. Cosmetic only — every real permission check lives in
// database.rules.json, this just makes the link point somewhere useful.
(function(){
  var link=document.getElementById('hdr-signin');
  if(!link)return;
  var label=link.querySelector('.btn-text'); // the icon <i> stays put; only this text swaps
  fbWhoAmI().then(async function(user){
    if(!user)return; // stays "Sign In"
    var role=await fbLookupRole(user);
    if(role==='disabled')return; // stays "Sign In" — the account can't actually go anywhere
    link.href=roleHome(role);
    if(label)label.textContent=(role==='admin'||role==='driver')?'Staff Portal':'My Account';
  }).catch(function(){});
})();
