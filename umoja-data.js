/* ===================================================================
   UMOJA — CENTRAL CLUB DATA
   One file. Every family-facing tool reads from it.

   Loaded with <script src="umoja-data.js"> before a page's own script.
   It is a .js file rather than .json on purpose so local previews work.

   TO CHANGE THE CLUB: edit this file only. Never edit calculation logic
   inside a page.
   =================================================================== */
var UMOJA = {

/* ===================================================================
   1. SEASON
   =================================================================== */
  season: {
    label: "2026–27",
    start: "2026-08-01",
    end:   "2027-07-31"
  },

/* ===================================================================
   2. PUBLISHED PROGRAM FEES — reference
   =================================================================== */
  fees: {
    evolution:    { "U11-U14": 2500, "U15-U19": 2350 },
    elite:        { "U11-U19": 3500 }
  },

/* ===================================================================
   3. TEAMS
   Actual team records. Keep empty until real teams are published.

   Example shape:
   { id:"u15-boys-evolution", displayName:"U15 Boys Evolution",
     ageGroup:"U15", gender:"Boys", tier:"evolution",
     competition:"...", competitionDivision:"...",
     programFee:2350, active:true }
   =================================================================== */
  teams: [],

/* ===================================================================
   4. TEST TEAMS — QA ONLY
   Never shown unless useTestTeams is true.
   =================================================================== */
  useTestTeams: false,
  testTeams: [
    { id:"test-u14-boys-elite", displayName:"TEST — U14 Boys Elite",
      ageGroup:"U14", gender:"Boys", tier:"elite", programFee:3500, active:true }
  ],

/* ===================================================================
   5. KIT
   =================================================================== */
  kit: { price: 350, cycleYears: 2 },

/* ===================================================================
   6. SEASON-ENDING INJURY REFUND
   =================================================================== */
  seiRefund: {
    processingDays: "3–5 business days"
  },

/* ===================================================================
   7. SEASON TRAVEL

   Per-team travel data, keyed by team id. A team with no entry here
   shows a "not published yet" state rather than a guess.

   lodging[]
     One row per overnight event. Family-facing lodging estimates use
     ONE FULL HOTEL ROOM so the number shown is a conservative maximum,
     not a shared-room assumption.

     { event, short, hotel, nightlyRate, nights,
       estimatedTaxesFees, estimatedRoomTotal }

     estimatedRoomTotal is optional. If omitted, the travel page
     calculates nightlyRate × nights + estimatedTaxesFees.

   optional[]
     Estimated season costs for Umoja transportation and/or travel meals.
     Final charges are reconciled to actual cost. Unused money can be
     refunded or credited to the family's Umoja account.

     { label, note, amount }

   events[]
     Calendar display only.
     { name, place, dates, type }

   Keep production travel empty until actual roster, event calendar,
   hotel blocks/rates and transportation estimates exist.
   =================================================================== */
  travel: {},

/* ===================================================================
   8. WHERE SUBMISSIONS GO
   =================================================================== */
  submit: {
    email: "office@umojasoka.com",
    refundEmail: "finance@umojasoka.com",
    endpoints: {
      seiRefund:    "https://formspree.io/f/mrpgavbe",
      seasonTravel: "https://formspree.io/f/mnpqbynd"
    }
  }
};

/* ===================================================================
   HELPERS — shared by every tool.
   =================================================================== */
UMOJA.activeTeams = function(){
  var list = (this.useTestTeams ? this.testTeams : this.teams) || [];
  return list.filter(function(t){ return t.active; });
};

UMOJA.teamById = function(id){
  var list = this.activeTeams();
  for (var i=0; i<list.length; i++) if (list[i].id === id) return list[i];
  return null;
};

UMOJA.seasonRefund = function(programFee, injuryISO){
  var s = new Date(this.season.start + 'T00:00:00'),
      e = new Date(this.season.end   + 'T00:00:00'),
      d = new Date(injuryISO         + 'T00:00:00');
  var share = (e - d) / (e - s);
  if (share > 1) share = 1;
  if (share < 0) share = 0;
  return { share: share, refund: Math.round(programFee * share) };
};

UMOJA.reference = function(prefix){
  return prefix + '-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' +
         Math.random().toString(36).slice(2,6).toUpperCase();
};
