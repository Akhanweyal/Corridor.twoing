// Shared trip map (Leaflet + OpenStreetMap tiles + OSRM routing), used by:
//   - the request form (customer sees pickup / drop-off / route as they type)
//   - track.html (customer watches the driver live)
//   - the dispatch app (manager overview + driver route map)
//
// CTMap.create(el) -> { setTrip(trip, opts), invalidate(), destroy() }
// trip = {
//   status:   'pending'|'assigned'|'enroute'|'on_location'|'picked_up'|'done'|'cancelled',
//   jobType:  'tow'|'roadside',
//   pickup:   { lat, lng, name, kind, address }   // where the vehicle / customer is
//   dest:     { lat, lng, name, kind, address }   // drop-off (tow only) - kind 'house' | 'biz' | ...
//   driver:   { lat, lng, at, name }               // live driver position (optional)
//   showShop: true to draw our shop -> pickup leg when no driver is assigned yet
// }
// setTrip resolves to { toPickup, toDest, trip } each { meters, seconds } so callers can show an ETA.
var CTMap=(function(){
  var SHOP={lat:37.6331,lng:-77.5026};
  var routeCache={};
  var cssDone=false;

  function injectCss(){
    if(cssDone)return;cssDone=true;
    var s=document.createElement('style');
    s.textContent='.ct-pin{background:none;border:none}'+
      '.ct-pin-i{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.45);border:2px solid #fff}'+
      '.ct-tip{font:700 12px/1.2 Arial,sans-serif;color:#111;background:#fff;border:none;border-radius:6px;padding:4px 7px;box-shadow:0 1px 6px rgba(0,0,0,.35);white-space:normal;max-width:180px}'+
      '.ct-tip:before{display:none}'+
      '.ct-legend{display:flex;flex-wrap:wrap;gap:10px 16px;font-size:12px;margin-top:8px;color:inherit;opacity:.85}';
    document.head.appendChild(s);
  }
  function pin(emoji,bg){
    return L.divIcon({className:'ct-pin',html:'<div class="ct-pin-i" style="background:'+bg+'">'+emoji+'</div>',iconSize:[34,34],iconAnchor:[17,17]});
  }
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function ok(p){return p&&isFinite(p.lat)&&isFinite(p.lng)&&p.lat!=null&&p.lng!=null;}

  // Driving route through the given points. Falls back to a straight line if routing is unavailable.
  async function route(pts){
    var key=pts.map(function(p){return Number(p.lat).toFixed(4)+','+Number(p.lng).toFixed(4);}).join('|');
    if(routeCache[key])return routeCache[key];
    var out;
    try{
      var url='https://router.project-osrm.org/route/v1/driving/'+pts.map(function(p){return p.lng+','+p.lat;}).join(';')+'?overview=full&geometries=geojson';
      var r=await fetch(url);var j=await r.json();
      var rt=j.routes&&j.routes[0];
      if(!rt)throw new Error('no route');
      out={latlngs:rt.geometry.coordinates.map(function(c){return [c[1],c[0]];}),meters:rt.distance,seconds:rt.duration};
    }catch(e){
      out={latlngs:pts.map(function(p){return [p.lat,p.lng];}),meters:null,seconds:null,straight:true};
    }
    routeCache[key]=out;return out;
  }

  // Short label shown permanently next to a pin; the full text is in the popup.
  function placeLabel(p,role){
    if(p.kind==='biz'&&p.name)return p.name;
    if(role==='dest'&&p.kind==='house')return 'Home';
    return role==='pickup'?'Vehicle':'Drop-off';
  }
  function placeFull(p){return p.kind==='biz'&&p.name?(p.name+(p.address?' — '+p.address:'')):(p.address||'');}

  function create(el){
    if(typeof el==='string')el=document.getElementById(el);
    injectCss();
    var map=L.map(el,{scrollWheelZoom:false}).setView([SHOP.lat,SHOP.lng],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
    var layer=L.layerGroup().addTo(map);
    var seq=0,fitted=false;

    async function setTrip(t,opts){
      opts=opts||{};
      var my=++seq;
      var status=t.status||'pending';
      var finished=(status==='done'||status==='dropped_off'||status==='cancelled');
      var driver=(!finished&&ok(t.driver))?t.driver:null;
      var pickup=ok(t.pickup)?t.pickup:null;
      var dest=ok(t.dest)?t.dest:null;
      var pickedUp=(status==='picked_up');

      // Legs to draw: {pts, color, dash, key}
      var legs=[];
      if(driver&&pickup&&!pickedUp&&status!=='on_location'){
        legs.push({key:'toPickup',pts:[driver,pickup],color:'#2563eb',dash:'8 8'});
        if(dest)legs.push({key:'trip',pts:[pickup,dest],color:'#ea580c'});
      }else if(driver&&pickedUp&&dest){
        legs.push({key:'toDest',pts:[driver,dest],color:'#ea580c'});
      }else if(!driver){
        if(t.showShop&&pickup)legs.push({key:'toPickup',pts:[SHOP,pickup],color:'#6b7280',dash:'8 8'});
        if(pickup&&dest)legs.push({key:'trip',pts:[pickup,dest],color:'#ea580c'});
      }else if(driver&&pickup&&dest&&status==='on_location'){
        legs.push({key:'trip',pts:[pickup,dest],color:'#ea580c'});
      }
      var routes=await Promise.all(legs.map(function(l){return route(l.pts);}));
      if(my!==seq)return null; // a newer update superseded this one

      layer.clearLayers();
      var bounds=[];
      var stats={};
      legs.forEach(function(l,i){
        var r=routes[i];
        L.polyline(r.latlngs,{color:'#fff',weight:8,opacity:.85}).addTo(layer);
        L.polyline(r.latlngs,{color:l.color,weight:5,opacity:.95,dashArray:l.dash||null}).addTo(layer);
        r.latlngs.forEach(function(ll){bounds.push(ll);});
        stats[l.key]={meters:r.meters,seconds:r.seconds};
      });

      function mark(p,emoji,bg,label,full,open){
        var m=L.marker([p.lat,p.lng],{icon:pin(emoji,bg)}).addTo(layer);
        m.bindTooltip(esc(label),{permanent:true,direction:'top',offset:[0,-16],className:'ct-tip'});
        if(full)m.bindPopup(esc(full));
        bounds.push([p.lat,p.lng]);
        return m;
      }
      if(t.showShop&&!driver&&pickup)mark(SHOP,'🏭','#6b7280','Corridor Towing','Corridor Towing — 8607 Oakview Avenue, Henrico, VA');
      if(pickup){
        var isTow=t.jobType==='tow';
        mark(pickup,isTow?'🚗':(pickup.kind==='biz'?'🏢':'📍'),'#f59e0b',
             isTow?(pickup.kind==='biz'&&pickup.name?'Vehicle @ '+pickup.name:'Vehicle'):(pickup.kind==='biz'&&pickup.name?pickup.name:'Service location'),
             (isTow?'Vehicle pickup: ':'Service location: ')+placeFull(pickup));
      }
      if(dest){
        var em=dest.kind==='biz'?'🏢':(dest.kind==='house'?'🏠':'🏁');
        mark(dest,em,'#10b981',placeLabel(dest,'dest'),'Drop-off'+(dest.kind==='house'?' (home)':'')+': '+placeFull(dest));
      }
      if(driver){
        var age=driver.at?Math.max(0,Math.round((Date.now()-driver.at)/60000)):null;
        mark(driver,'🚚','#2563eb','Driver'+(driver.name?' '+driver.name:''),'Driver'+(driver.name?' '+driver.name:'')+(age!=null?' — updated '+(age<2?'just now':age+' min ago'):''));
      }

      if(bounds.length&&(!fitted||opts.refit)){
        if(bounds.length===1)map.setView(bounds[0],15);
        else map.fitBounds(bounds,{padding:[40,40],maxZoom:16});
        fitted=true;
      }
      return stats;
    }
    return {
      map:map,
      setTrip:setTrip,
      invalidate:function(){map.invalidateSize();},
      destroy:function(){seq++;map.remove();}
    };
  }

  function fmtDuration(sec){
    if(sec==null||!isFinite(sec))return '';
    var m=Math.max(1,Math.round(sec/60));
    if(m<60)return m+' min';
    return Math.floor(m/60)+' hr '+(m%60)+' min';
  }
  function fmtMiles(meters){return (meters==null||!isFinite(meters))?'':(meters/1609.344).toFixed(1)+' mi';}
  function legendHtml(){
    return '<div class="ct-legend"><span>🚚 Driver</span><span>🚗 Vehicle pickup</span><span>🏠 Home drop-off</span><span>🏢 Business drop-off</span></div>';
  }
  return {create:create,route:route,fmtDuration:fmtDuration,fmtMiles:fmtMiles,legendHtml:legendHtml,SHOP:SHOP};
})();
