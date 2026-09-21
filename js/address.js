// Shared address search used by the public request form AND the dispatch app.
//
// Suggestions come from Photon (an OpenStreetMap search built for type-ahead, and it knows
// business names), falling back to Nominatim. Every suggestion is normalised to a "place":
//   { lat, lng, kind: 'biz'|'house'|'place', name, address, text, title, sub }
// where `text` is what goes in the input box, e.g.
//   business -> "McDonald's, 2700 West Broad Street, Richmond, VA 23220"
//   house    -> "1204 Grove Avenue, Richmond, VA 23220"
// The chosen place is remembered on the input as input._place so coordinates never have to be
// re-geocoded from the text (and so the map / driver / customer all use the exact same point).
var CTAddr=(function(){
  var PHOTON='https://photon.komoot.io/api/';
  var NOMINATIM='https://nominatim.openstreetmap.org/';
  var BIAS={lat:37.54,lon:-77.43}; // Richmond, VA — ranks local results first, doesn't exclude others
  var NON_BIZ={highway:1,place:1,boundary:1,natural:1,waterway:1,railway:1,landuse:1,route:1};
  var HOUSE_VALUES={house:1,residential:1,apartments:1,detached:1,semidetached_house:1,terrace:1,townhouse:1,dormitory:1,bungalow:1,yes:1};
  var BIZ_CLASSES={amenity:1,shop:1,tourism:1,office:1,leisure:1,craft:1,healthcare:1,historic:1,man_made:1};
  var ST={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'};

  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // Build a place from already-split address parts.
  function build(lat,lng,o){
    var street=[o.housenumber,o.street].filter(Boolean).join(' ');
    var isBiz=!!(o.name&&o.isBiz);
    if(!street&&!isBiz&&o.name)street=o.name; // a bare street / city result
    var st=ST[o.state]||o.state||'';
    var tail=[o.city,[st,o.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var address=[street,tail].filter(Boolean).join(', ');
    var kind=isBiz?'biz':(o.housenumber?'house':'place');
    var text=isBiz?[o.name,address].filter(Boolean).join(', '):(address||o.name||'');
    return {lat:Number(lat),lng:Number(lng),kind:kind,name:isBiz?o.name:'',address:address,text:text,
            title:isBiz?o.name:(street||o.name||text),sub:isBiz?address:tail};
  }
  function fromPhoton(f){
    var p=f.properties||{},c=(f.geometry&&f.geometry.coordinates)||[];
    if(c.length<2)return null;
    if(p.countrycode&&p.countrycode!=='US')return null;
    var houseBuilding=p.osm_key==='building'&&HOUSE_VALUES[p.osm_value];
    var isBiz=!!(p.name&&p.osm_key&&!NON_BIZ[p.osm_key]&&!houseBuilding);
    return build(c[1],c[0],{name:p.name,housenumber:p.housenumber,street:p.street,
      city:p.city||p.town||p.village||p.district||p.county||'',state:p.state,postcode:p.postcode,isBiz:isBiz});
  }
  function fromNominatim(it){
    var a=it.address||{};
    var isBiz=!!(it.name&&BIZ_CLASSES[it.class]);
    return build(it.lat,it.lon,{name:it.name||a[it.type]||'',housenumber:a.house_number,street:a.road,
      city:a.city||a.town||a.village||a.hamlet||a.suburb||a.county||'',state:a.state,postcode:a.postcode,isBiz:isBiz});
  }

  async function searchPhoton(q){
    var r=await fetch(PHOTON+'?q='+encodeURIComponent(q)+'&limit=7&lang=en&lat='+BIAS.lat+'&lon='+BIAS.lon);
    if(!r.ok)throw new Error('photon '+r.status);
    var j=await r.json();
    return (j.features||[]).map(fromPhoton).filter(Boolean);
  }
  async function searchNominatim(q,limit){
    var r=await fetch(NOMINATIM+'search?format=json&addressdetails=1&limit='+(limit||6)+'&countrycodes=us&q='+encodeURIComponent(q));
    if(!r.ok)throw new Error('nominatim '+r.status);
    return (await r.json()).map(fromNominatim).filter(Boolean);
  }
  function dedupe(list){var seen={},out=[];list.forEach(function(p){var k=p.text.toLowerCase();if(!k||seen[k])return;seen[k]=1;out.push(p);});return out.slice(0,6);}
  async function search(q){
    try{var a=await searchPhoton(q);if(a.length)return dedupe(a);}catch(e){}
    try{return dedupe(await searchNominatim(q,6));}catch(e){return [];}
  }

  // Exact-text lookup (when the user typed an address and never picked a suggestion).
  async function geocode(q){
    q=String(q||'').trim();if(!q)return null;
    var hit=null;
    try{hit=(await searchNominatim(q,1))[0]||null;}catch(e){}
    if(!hit){try{hit=(await searchPhoton(q))[0]||null;}catch(e){}}
    if(hit)hit.text=q; // keep exactly what was typed
    return hit;
  }
  async function reverse(lat,lng){
    try{
      var r=await fetch(NOMINATIM+'reverse?format=json&addressdetails=1&zoom=18&lat='+lat+'&lon='+lng);
      var it=await r.json();
      if(!it||it.error)return null;
      var p=fromNominatim(it);
      if(p){p.lat=Number(lat);p.lng=Number(lng);} // keep the exact GPS fix
      return p;
    }catch(e){return null;}
  }
  // Coordinates for an input: the picked suggestion if the text still matches it, else geocode the text.
  async function resolve(input){
    var v=(input.value||'').trim();
    if(!v)return null;
    if(input._place&&input._place.text===v)return input._place;
    var p=await geocode(v);
    if(p)input._place=p;
    return p;
  }
  function setPlace(input,place){input.value=place.text;input._place=place;}

  function icon(kind){return kind==='biz'?'🏢':(kind==='house'?'🏠':'📍');}
  function kindLabel(kind){return kind==='biz'?'Business':(kind==='house'?'Home / address':'Place');}

  // Type-ahead dropdown. onSelect(place) fires when a suggestion is chosen.
  function attach(input,onSelect){
    var parent=input.parentElement;
    if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    var list=document.createElement('div');list.className='addr-ac-list';parent.appendChild(list);
    var timer=null,active=-1,items=[],seq=0;
    function hide(){list.classList.remove('show');list.innerHTML='';active=-1;items=[];}
    function paint(){list.querySelectorAll('.addr-ac-item').forEach(function(el,i){el.classList.toggle('active',i===active);});}
    function render(res){
      items=res;
      if(!res.length){hide();return;}
      list.innerHTML=res.map(function(p,i){
        return '<div class="addr-ac-item" data-i="'+i+'"><span class="ac-ico">'+icon(p.kind)+'</span><span class="ac-txt"><span class="ac-t">'+esc(p.title)+'</span><span class="ac-s">'+esc(p.sub)+'</span></span><span class="ac-k">'+kindLabel(p.kind)+'</span></div>';
      }).join('');
      list.classList.add('show');active=-1;
    }
    function choose(i){
      var p=items[i];if(!p)return;
      setPlace(input,p);hide();
      if(onSelect)onSelect(p);
    }
    list.addEventListener('mousedown',function(e){ // mousedown fires before the input's blur
      var it=e.target.closest('.addr-ac-item');if(!it)return;
      e.preventDefault();choose(Number(it.dataset.i));
    });
    input.addEventListener('input',function(){
      input._place=null; // typed by hand -> any earlier pick no longer applies
      clearTimeout(timer);
      var q=input.value.trim();
      if(q.length<3){hide();return;}
      var my=++seq;
      timer=setTimeout(async function(){
        var res=await search(q);
        if(my!==seq)return; // a newer keystroke superseded this request
        render(res);
      },350);
    });
    input.addEventListener('keydown',function(e){
      if(!list.classList.contains('show'))return;
      if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,items.length-1);paint();}
      else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);paint();}
      else if(e.key==='Enter'){if(active>=0){e.preventDefault();choose(active);}}
      else if(e.key==='Escape'){hide();}
    });
    input.addEventListener('blur',function(){setTimeout(hide,150);});
  }

  return {attach:attach,search:search,geocode:geocode,reverse:reverse,resolve:resolve,setPlace:setPlace,icon:icon};
})();
