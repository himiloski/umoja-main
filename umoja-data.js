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
    spring2027: { "U12 Evolution": 825, "U12 Premier": 988, "U14 Premier": 1218,
                  "U17 Elite": 1465, "U23 UPSL": 1252 },
    foundations:  { "U6-U8": 415 },
    rec:          { "per 12-week season": 190, "both seasons": 380 },
    momentum:     { "U9-U19": 1335 },
    evolution:    { "U9-U19": 1650 },
    juniorPremier:{ "U11-U12": 1975, "U13-U14": 2435 },
    seniorPremier:{ "U15-U19": 2125 },
    juniorElite:  { "U11-U12": 2200, "U13-U14": 3115 },
    seniorElite:  { "U15-U19": 2930 }
  },

/* ===================================================================
   3. TEAMS
   Actual team records. Keep empty until real teams are published.

   Example shape:
   { id:"u15-boys-evolution", displayName:"U15 Boys Evolution",
     ageGroup:"U15", gender:"Boys", tier:"evolution",
     competition:"...", competitionDivision:"...",
     programFee:1275, active:true }
   =================================================================== */
  teams: [],

/* ===================================================================
   4. TEST TEAMS — QA ONLY
   Never shown unless useTestTeams is true.
   =================================================================== */
  useTestTeams: false,
  testTeams: [
    { id:"test-u14-boys-elite", displayName:"TEST — U14 Boys Elite",
      ageGroup:"U14", gender:"Boys", tier:"juniorElite", programFee:3115, active:true }
  ],

/* ===================================================================
   5. SEASON TRAVEL

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
   6. WHERE SUBMISSIONS GO
   =================================================================== */
  submit: {
    email: "office@umojasoka.com",
    refundEmail: "finance@umojasoka.com",
    endpoints: {
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

UMOJA.reference = function(prefix){
  return prefix + '-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' +
         Math.random().toString(36).slice(2,6).toUpperCase();
};
