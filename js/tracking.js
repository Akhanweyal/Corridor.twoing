// Conversion tracking for ads: phone-call clicks and completed service requests.
//
// Fill in the IDs below from Google Ads / Google Analytics and every public page starts
// reporting. Left empty, nothing loads and nothing is sent.
//   ga4         GA4 measurement ID              e.g. 'G-ABC123XYZ'
//   adsId       Google Ads account tag ID       e.g. 'AW-123456789'
//   leadLabel   label of the "Request form" conversion action   (Ads → Goals → Conversions)
//   callLabel   label of the "Click to call" conversion action
//   forwardLabel  label of a "Calls from website" conversion action. When set, Google swaps the
//                 phone number shown on the page for a Google forwarding number for ad visitors,
//                 so real phone calls (not just taps) are counted. Optional.
var CT_TRACKING={ga4:'',adsId:'',leadLabel:'',callLabel:'',forwardLabel:''};
var CT_PHONE='(804) 292-8414';

(function(){
  var C=CT_TRACKING;
  // Initialize on the ad landing page and request form to preserve attribution.
  var openAIPath=window.location.pathname;
  var trackOpenAI=openAIPath==='/'||openAIPath==='/index.html'||
    openAIPath==='/request'||openAIPath==='/request.html'||openAIPath==='/request/';
  if(trackOpenAI){
    if(!window.oaiq){
      var queue=function(){queue.q.push(arguments);};
      queue.q=[];
      window.oaiq=queue;
      var pixelScript=document.createElement('script');
      pixelScript.async=true;
      pixelScript.src='https://bzrcdn.openai.com/sdk/oaiq.min.js';
      document.head.appendChild(pixelScript);
    }
    window.oaiq('init',{pixelId:'LGPsB2KcuxV1ooWjCVADYJ'});
  }
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){dataLayer.push(arguments);};
  var on=!!(C.ga4||C.adsId);
  if(on){
    var s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(C.ga4||C.adsId);
    document.head.appendChild(s);
    gtag('js',new Date());
    if(C.ga4)gtag('config',C.ga4);
    if(C.adsId)gtag('config',C.adsId);
    if(C.adsId&&C.forwardLabel)gtag('config',C.adsId+'/'+C.forwardLabel,{phone_conversion_number:CT_PHONE});
  }
  function adsConversion(label,extra){
    if(C.adsId&&label)gtag('event','conversion',Object.assign({send_to:C.adsId+'/'+label},extra||{}));
  }

  // Every tel: link on every page, including ones added later (event delegation).
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href^="tel:"]');
    if(!a||!on)return;
    gtag('event','phone_call_click',{link_url:a.getAttribute('href'),page_path:location.pathname});
    adsConversion(C.callLabel);
  },true);

  // Called by js/request.js once a request has actually been saved.
  window.ctTrackLead=function(info){
    if(trackOpenAI)window.oaiq('measure','lead_created',{type:'customer_action'});
    if(!on)return;
    info=info||{};
    var value=Number(info.value)||0;
    gtag('event','generate_lead',{currency:'USD',value:value,service:info.service||'',job_type:info.jobType||''});
    adsConversion(C.leadLabel,{value:value,currency:'USD',transaction_id:info.id||''});
  };
})();
