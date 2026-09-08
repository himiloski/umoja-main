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
    foundations:  { "U6-U10": 525 },
    rec:          { "U11-U19": 425 },
    development:  { "U11-U19": 1700 },
    evolution:    { "U11-U19": 1725 },
    premier:      { "U11-U12": 3250, "U13-U19": 3450 },
    elite:        { "U11-U12": 3550, "U13-U14": 4100, "U15-U18/19": 4325 }
  },

/* ===================================================================
   3. TEAMS
   Actual team records. Keep empty until real teams are published.

   Example shape:
   { id:"u15-girls-premier", displayName:"U15 Girls Premier",
     ageGroup:"U15", gender:"Girls", tier:"premier",
     competition:"ECRL", competitionDivision:"...",
     programFee:3450, active:true }
   =================================================================== */
  teams: [],

/* ===================================================================
   4. TEST TEAMS — QA ONLY
   Never shown unless useTestTeams is true.
   =================================================================== */
  useTestTeams: false,
  testTeams: [
    { id:"test-u12-development-p1", displayName:"TEST — U12 Boys Development (SCCL Premier 1)",
      ageGroup:"U12", gender:"Boys", tier:"development",
      competition:"SCCL", competitionDivision:"Premier 1", programFee:1700, active:true },
    { id:"test-u12-development-p2", displayName:"TEST — U12 Boys Development (SCCL Premier 2)",
      ageGroup:"U12", gender:"Boys", tier:"development",
      competition:"SCCL", competitionDivision:"Premier 2", programFee:1700, active:true },
    { id:"test-u12-evolution", displayName:"TEST — U12 Boys Evolution",
      ageGroup:"U12", gender:"Boys", tier:"evolution", programFee:1725, active:true },
    { id:"test-u14-girls-elite", displayName:"TEST — U14 Girls Elite",
      ageGroup:"U14", gender:"Girls", tier:"elite", programFee:4100, active:true },
    { id:"test-u8-foundations", displayName:"TEST — U8 Foundations",
      ageGroup:"U8", gender:"Coed", tier:"foundations", programFee:525, active:true }
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
    email: "hello@umojasoka.com",
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
