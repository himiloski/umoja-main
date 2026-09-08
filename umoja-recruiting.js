/* ===================================================================
   UMOJA — RECRUITING DATA AND THE UNIVERSAL COACH / SCOUT FORM

   One file. player-profiles.html, where-to-see-us.html,
   player-spotlights.html and recruiting.html all read from it, so a
   player, an event or the form endpoint is edited in exactly one place.

   ── SAMPLE CONTENT ────────────────────────────────────────────────
   Anything with  sample: true  is fictional demonstration content and
   renders with a visible SAMPLE badge. It is here so the templates can
   be judged with realistic content in them.

   TO GO LIVE: set SHOW_SAMPLES to false, or delete the sample records.
   Nothing else needs changing.
   =================================================================== */
var SHOW_SAMPLES = true;

var RECRUITING = {

/* ── WHERE SUBMISSIONS GO ─────────────────────────────────────────
   Every coach/scout enquiry on the site posts here — the hub form, the
   event check-in and every "ask about this player" button. One inbox.
   While endpoint is null the form opens a prefilled email so nothing is
   lost, and no submission is ever faked.
   ================================================================== */
  form: {
    endpoint: "https://formspree.io/f/xnpqogod",
    email: "hello@umojasoka.com",
    replyLine: "Thanks — we received your message. Umoja Recruiting will follow up with the information you requested."
  },

/* ── PLAYERS ──────────────────────────────────────────────────────
   Publish only what a player and family have chosen to make public.
   There are deliberately no fields for home address, personal phone,
   personal email, household finances, immigration status, medical
   information or private school records. Do not add them.
   ================================================================== */
  players: [
    {
      sample: true,
      id: "maya-johnson",
      name: "Maya Johnson",
      gradYear: 2028,
      gender: "Girls",
      positions: ["CM","AM"],
      positionLabel: "Midfielder",
      team: "U17 Girls",
      height: "5'6\"",
      foot: "Right",
      status: "Open",
      gpa: "3.7",
      statement: "I love playing in the midfield because I get to connect everything — winning the ball, helping us build forward, and creating chances for my teammates. I'm working on becoming faster in my decisions and more confident using both feet.",
      snapshot: [
        ["Favourite player", "Aitana Bonmatí"],
        ["Favourite part of soccer", "Creating chances for teammates"],
        ["Current focus", "Faster decision-making and weaker-foot development"],
        ["Long-term goal", "Play college soccer while pursuing a strong academic program"]
      ],
      coachNote: "Maya is a composed midfielder who sees the game early, competes consistently, and is eager to improve.",
      coachNoteBy: "Umoja coaching staff",
      /* left empty on purpose — no invented links, results or awards */
      highlight: "", resume: "", photo: ""
    }
  ],

/* ── EVENTS ───────────────────────────────────────────────────────
   Feeds the board on where-to-see-us.html AND the event dropdown in the
   universal form, so the two can never disagree.
   ================================================================== */
  events: [
    {
      sample: true,
      id: "southeast-showcase",
      name: "Southeast Showcase",
      dates: "March 12–14",
      year: "2027",
      city: "Atlanta, Georgia",
      teams: ["U17 Girls"],
      roster: "", schedule: "", video: ""   /* no invented URLs */
    }
  ],

/* ── SPOTLIGHTS ───────────────────────────────────────────────────
   Editorial features, roughly two a month. Deliberately NOT a second
   recruiting record — no height, foot, graduation year or status here.
   ================================================================== */
  spotlights: [
    {
      sample: true,
      name: "Maya",
      team: "U17 Girls",
      position: "Midfielder",
      published: "Sample post",
      photo: "", gallery: [],
      intro: "Maya likes being in the middle of everything. Give her a choice between scoring the goal and slipping the final pass through to a teammate, and she'll probably choose the assist.",
      qa: [
        ["What do you love most about soccer?", "That there's always something new to learn. Even when you play well, there's another part of your game you can improve."],
        ["Favourite player?", "Aitana Bonmatí."],
        ["What are you working on right now?", "Using my left foot more and playing faster under pressure."],
        ["Favourite thing about your team?", "Everybody wants each other to get better."],
        ["What would you tell a younger Umoja player?", "Don't be afraid to make mistakes when you're learning something new."]
      ],
      supportingQuote: "", supportingQuoteBy: ""
    }
  ]
};

/* ─────────────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────────── */
RECRUITING.visible = function(list){
  return (list||[]).filter(function(r){ return SHOW_SAMPLES || !r.sample; });
};
RECRUITING.playerById = function(id){
  var l=this.visible(this.players);
  for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i];
  return null;
};
RECRUITING.esc = function(s){
  return String(s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
};

/* ─────────────────────────────────────────────────────────────────
   THE UNIVERSAL COACH / SCOUT FORM
   Rendered by calling  RECRUITING.mountForm('element-id', defaults)
   defaults may set { topic, event, player } to pre-fill the form when a
   coach arrives from an event card or a player profile.
   ────────────────────────────────────────────────────────────── */
RECRUITING.TOPICS = [
  { v:"event",     t:"I'm planning to watch Umoja at an event" },
  { v:"player",    t:"I'm interested in a specific player" },
  { v:"info",      t:"I'd like information about Umoja players" },
  { v:"materials", t:"I need video / recruiting materials" },
  { v:"question",  t:"General recruiting question" },
  { v:"other",     t:"Other" }
];

RECRUITING.mountForm = function(mountId, defaults){
  var R=this, esc=R.esc, mount=document.getElementById(mountId);
  if(!mount) return;
  defaults = defaults || {};

  var events=R.visible(R.events);
  var eventOptions = events.map(function(e){
      return '<option value="'+esc(e.name)+'">'+esc(e.name+' — '+e.dates+' '+e.year)+'</option>'; }).join('')+
    '<option value="Other">Other / event not listed</option>';

  mount.innerHTML =
  '<form id="rf-form" novalidate>'+
    '<label class="fld"><span class="lb">What can we help you with? <i>*</i></span>'+
      '<select id="rf-topic" required><option value="">Choose one</option>'+
      R.TOPICS.map(function(o){ return '<option value="'+o.v+'">'+esc(o.t)+'</option>'; }).join('')+
      '</select></label>'+

    '<div id="rf-when" hidden>'+
      '<label class="fld"><span class="lb">Which event? <i>*</i></span>'+
        '<select id="rf-event"><option value="">Choose one</option>'+eventOptions+'</select></label>'+
      '<label class="fld"><span class="lb">Which team or player(s) are you planning to watch?</span>'+
        '<input type="text" id="rf-watching" autocomplete="off"></label>'+
    '</div>'+

    '<label class="fld" id="rf-player-wrap" hidden><span class="lb">Player name(s)</span>'+
      '<input type="text" id="rf-player" autocomplete="off"></label>'+

    '<label class="fld" id="rf-materials-wrap" hidden><span class="lb">Player or team</span>'+
      '<input type="text" id="rf-materials" autocomplete="off"></label>'+

    '<div class="rx-two">'+
      '<label class="fld"><span class="lb">Name <i>*</i></span>'+
        '<input type="text" id="rf-name" autocomplete="name" required></label>'+
      '<label class="fld"><span class="lb">School / club / organization <i>*</i></span>'+
        '<input type="text" id="rf-org" autocomplete="organization" required></label>'+
    '</div>'+
    '<div class="rx-two">'+
      '<label class="fld"><span class="lb">Role / title</span>'+
        '<input type="text" id="rf-role" autocomplete="organization-title"></label>'+
      '<label class="fld"><span class="lb">Email <i>*</i></span>'+
        '<input type="email" id="rf-email" autocomplete="email" required></label>'+
    '</div>'+
    '<label class="fld"><span class="lb">Phone <span style="color:var(--gray-2)">— optional</span></span>'+
      '<input type="tel" id="rf-phone" autocomplete="tel"></label>'+
    '<label class="fld"><span class="lb">Anything else we should know?</span>'+
      '<textarea id="rf-notes" rows="3"></textarea></label>'+
    '<span class="err" id="rf-err" hidden></span>'+
    '<div style="margin-top:18px">'+
      '<button type="submit" class="btn btn-gold" id="rf-send">Send to Umoja Recruiting <span class="a">&rarr;</span></button>'+
    '</div>'+
  '</form>'+
  '<div id="rf-done" hidden><div class="conf">'+
    '<span class="tick" aria-hidden="true"></span>'+
    '<h3>Message received.</h3>'+
    '<p>'+esc(R.form.replyLine)+'</p>'+
    '<p style="margin-top:12px">You can also reach us directly at '+
      '<a href="mailto:'+esc(R.form.email)+'" style="color:var(--gold)">'+esc(R.form.email)+'</a>.</p>'+
    '<span class="ref" id="rf-ref"></span>'+
  '</div></div>';

  var $=function(id){ return document.getElementById(id); };
  var topic=$('rf-topic');

  function showConditional(){
    var v=topic.value;
    $('rf-when').hidden           = v!=='event';
    $('rf-player-wrap').hidden    = v!=='player';
    $('rf-materials-wrap').hidden = v!=='materials';
  }
  topic.addEventListener('change', showConditional);

  /* pre-fill from an event card or a player profile */
  if(defaults.topic){ topic.value=defaults.topic; }
  showConditional();
  if(defaults.event){
    var ev=$('rf-event'), found=false;
    [].slice.call(ev.options).forEach(function(o){ if(o.value===defaults.event){ ev.value=o.value; found=true; } });
    if(!found) ev.value='Other';
  }
  if(defaults.player){
    if(topic.value==='player') $('rf-player').value=defaults.player;
    else if(topic.value==='materials') $('rf-materials').value=defaults.player;
    else $('rf-watching').value=defaults.player;
  }

  $('rf-form').addEventListener('submit', function(e){
    e.preventDefault();
    var err=$('rf-err'); err.hidden=true;
    function fail(m,id){ err.textContent=m; err.hidden=false; if(id) $(id).focus(); }
    if(!topic.value) return fail('Please tell us what you need.','rf-topic');
    if(!$('rf-name').value.trim()) return fail('Please enter your name.','rf-name');
    if(!$('rf-org').value.trim())  return fail('Please enter your school, club or organization.','rf-org');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('rf-email').value.trim()))
      return fail('Please enter a valid email address.','rf-email');
    if(topic.value==='event' && !$('rf-event').value) return fail('Please choose an event.','rf-event');

    var label=(R.TOPICS.filter(function(o){return o.v===topic.value;})[0]||{}).t||topic.value;
    var ref='REC-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+
            Math.random().toString(36).slice(2,6).toUpperCase();
    var payload={
      _subject:'Recruiting enquiry — '+$('rf-name').value.trim()+' ('+ref+')',
      reference:ref, form:'Coach / scout recruiting enquiry',
      topic:label,
      event:$('rf-event')?$('rf-event').value:'',
      watching:$('rf-watching')?$('rf-watching').value.trim():'',
      player:$('rf-player')?$('rf-player').value.trim():'',
      materialsFor:$('rf-materials')?$('rf-materials').value.trim():'',
      name:$('rf-name').value.trim(), organization:$('rf-org').value.trim(),
      role:$('rf-role').value.trim(), email:$('rf-email').value.trim(),
      phone:$('rf-phone').value.trim(), notes:$('rf-notes').value.trim(),
      submitted:new Date().toISOString()
    };
    $('rf-send').disabled=true;
    function finish(){ $('rf-form').hidden=true; $('rf-done').hidden=false;
      $('rf-ref').textContent='Reference '+ref;
      try{ $('rf-done').scrollIntoView({behavior:'smooth',block:'center'}); }catch(x){} }
    function fallback(){
      var lines=Object.keys(payload).filter(function(k){ return k!=='_subject' && payload[k]; })
        .map(function(k){ return k+': '+payload[k]; });
      window.location.href='mailto:'+R.form.email+'?subject='+encodeURIComponent(payload._subject)+
        '&body='+encodeURIComponent(lines.join('\n'));
      finish();
    }
    if(!R.form.endpoint){ fallback(); return; }
    fetch(R.form.endpoint,{method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload)})
      .then(function(r){ if(!r.ok) throw 0; finish(); }).catch(fallback);
  });
};

/* read ?topic= / ?event= / ?player= off the URL so every CTA on the
   site can deep-link into the right pre-filled state */
RECRUITING.paramsFromUrl = function(){
  var q=new URLSearchParams(window.location.search);
  return { topic:q.get('topic')||'', event:q.get('event')||'', player:q.get('player')||'' };
};
