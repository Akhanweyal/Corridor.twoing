// Shared behaviour for every public page: mobile menu + legacy-link handling.
var mT=document.querySelector('.menu-toggle'),nM=document.getElementById('nav-menu');
function toggleMenu(){nM.classList.toggle('show')}
document.addEventListener('click',function(e){if(!mT.contains(e.target)&&!nM.contains(e.target)&&!e.target.closest('.driver-portal-btn')&&!e.target.closest('.manager-portal-btn'))nM.classList.remove('show')});
nM.querySelectorAll('a').forEach(function(l){l.addEventListener('click',function(){nM.classList.remove('show')})});
nM.addEventListener('touchmove',function(e){e.stopPropagation()},{passive:true});
nM.addEventListener('wheel',function(e){e.stopPropagation()},{passive:true});
// In-page anchors (if any) scroll smoothly, offset for the fixed header.
document.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener('click',function(e){var t=document.querySelector(this.getAttribute('href'));if(!t)return;e.preventDefault();var h=document.querySelector('header').offsetHeight;window.scrollTo({top:t.offsetTop-h-20,behavior:'smooth'})})});

// Old links from when this was a single page (/#forms, /#pricing ...) and old bookmarks
// to the embedded driver/manager portals now go to the right page/app.
(function(){
  var h=window.location.hash.replace('#','');
  if(!h)return;
  var map={forms:'/request.html',pricing:'/services.html',gallery:'/services.html',payment:'/pay.html',contact:'/contact.html',
           driverPortal:'/app/?mode=driver',driverlog:'/app/?mode=driver',managerPortal:'/app/?mode=mgr'};
  var p=window.location.pathname;
  if((p==='/'||p==='/index.html')&&map[h])window.location.replace(map[h]);
})();
