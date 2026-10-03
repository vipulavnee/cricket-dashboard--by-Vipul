const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server-cricket.js"), "utf8");
class ScheduleDate extends Date {
  static now() { return Date.parse("2026-10-03T10:00:00Z"); }
}
const server = vm.createContext({ require, __dirname: root, process, console, Date: ScheduleDate });
vm.runInContext(serverSource.slice(0, serverSource.lastIndexOf("app.listen(")), server);
const html = fs.readFileSync(path.join(root, "public/cricket-dashboard.html"), "utf8");
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");
const dashboard = vm.createContext({ console, Date: ScheduleDate });
vm.runInContext(script.slice(0, script.lastIndexOf("try{")), dashboard);
const evaluate = (context, code) => vm.runInContext(code, context);

// The ODI page also contains the T20 result in navigation and page scripts.
const liveHtml = `<html><head><meta name="description" content="Follow WI 138/1 (18) vs IND 351/7 (Amir Jangoo 62(51) Shai Hope 55(51)) | India vs West Indies, 3rd ODI"></head><body>
  <nav>India won by 19 runs IND 211/6 (20) PAK 192/6 (20)</nav>
  <div id="miniscore-branding-container"><div>IND <span>351</span><span>-</span><span>7</span><span>( 50 )</span></div>
  <div>WI <span>138</span><span>-</span><span>1</span><span>( 18 )</span></div>
  <div>CRR: 7.67 REQ: 6.69</div><div class="text-cbTxtLive">West Indies need 214 runs</div></div>
  <script>India won by 19 runs IND 211/6 PAK 192/6</script></body></html>`;
const finishedHtml = `<body><nav>WI 138/1 (18) West Indies need 214 runs</nav>
  <div id="sticky-mcomplete"><div class="text-cbTextLink">India won by 19 runs</div>
  <div>IND 211 / 6 ( 20 )</div><div>PAK 192 / 6 ( 20 )</div></div></body>`;

async function main() {
  server.liveHtml = liveHtml;
  server.finishedHtml = finishedHtml;
  evaluate(server, "fetchHtml = async url => url.includes('151554') ? liveHtml : finishedHtml");
  const live = await evaluate(server, "fetchMatchDetail('https://www.cricbuzz.com/live-cricket-scores/151554/ind-vs-wi-3rd-odi', ['India', 'West Indies'], 'Live')");
  assert.equal(live.result, "");
  assert.equal(live.structuredStatus, "West Indies need 214 runs");
  assert.equal(evaluate(server, `classifyState(${JSON.stringify(live.structuredStatus)})`), "Live");
  assert.deepEqual(JSON.parse(JSON.stringify(live.scores.map(row => [row.team, row.score, row.overs]))), [["IND", "351/7", "50"], ["WI", "138/1", "18"]]);
  assert.equal(live.liveDetails.requiredRR, "6.69");
  assert.equal(live.liveDetails.currentBatters.length, 2);
  assert.ok(!live.rawText.includes("19 runs"));
  const finished = await evaluate(server, "fetchMatchDetail('https://www.cricbuzz.com/live-cricket-scores/171070/ind-vs-pak', ['India', 'Pakistan'], 'Finished')");
  assert.equal(finished.result, "India won by 19 runs");
  assert.deepEqual(JSON.parse(JSON.stringify(finished.scores.map(row => [row.team, row.score, row.overs]))), [["IND", "211/6", "20"], ["PAK", "192/6", "20"]]);

  dashboard.match = { ...live, state: "Live", name: "India vs West Indies", matchNo: "3rd ODI", teams: ["India", "West Indies"], status: live.structuredStatus };
  assert.equal(evaluate(dashboard, "inningsOvers(match)"), 50);
  assert.equal(evaluate(dashboard, "inningsBalls(match)"), 300);
  assert.equal(evaluate(dashboard, "currentScore(match).team"), "WI");
  assert.equal(evaluate(dashboard, "phase(match)[0]"), "Middle Overs");
  assert.ok(evaluate(dashboard, "winPredictor(match)[0]").startsWith("WI "));
  assert.ok(!evaluate(dashboard, "winPredictor(match)[0]").includes("100%"));
  dashboard.match = { state: "Live", matchNo: "1st T20I", teams: ["India", "Pakistan"], status: "Pakistan need 51 runs", scores: [{ team: "IND", score: "210/7", overs: "20" }, { team: "PAK", score: "160/4", overs: "18" }] };
  assert.equal(evaluate(dashboard, "inningsOvers(match)"), 20);
  assert.equal(evaluate(dashboard, "phase(match)[0]"), "Death Overs");
  assert.equal(evaluate(dashboard, "requiredRR(match)"), "25.50");
  dashboard.match = { state: "Live", matchFormat: "ODI", teams: ["India", "West Indies"], scores: [{ team: "IND", score: "80/10", overs: "15" }, { team: "WI", score: "60/3", overs: "20", isCurrent: true }] };
  assert.equal(evaluate(dashboard, "currentScore(match).team"), "WI");
  assert.ok(evaluate(dashboard, "winPredictor(match)[0]").startsWith("WI "));
  delete dashboard.match.scores[1].isCurrent;
  assert.equal(evaluate(dashboard, "currentScore(match).team"), "WI");

  for (const context of [server, dashboard]) {
    context.fixtures = [{ category: "Indian Men", teams: ["India", "England"], startISO: "2026-10-03T00:00:00Z", matchNo: "1st ODI" }, { category: "Indian Men", teams: ["India", "England"], startISO: "2026-10-03T00:00:00Z", matchNo: "1st T20I" }];
    assert.equal(evaluate(context, "dedupeDashboardMatches(fixtures).length"), 2);
    assert.equal(evaluate(context, "fixtureFormatKey({matchFormat:'T20', url:'/odi-series/1st-t20i'})"), "t20i");
    assert.equal(evaluate(context, "fixtureFormatKey({matchNo:'3rd ODI'})"), "odi");
  }
  assert.equal(evaluate(server, "hasSameScheduledMatch([fixtures[0]], fixtures[1], 'Indian Men')"), false);
  assert.equal(evaluate(server, "extractEmbeddedMatchData('<script>{\"matchInfo\":{\"matchId\":171070},\"matchId\":151554,\"matchScore\":{}}</script>', 'https://www.cricbuzz.com/live-cricket-scores/151554/ind-vs-wi')"), null);
  server.listHtml = '<a href="/live-cricket-scores/151554/ind-vs-wi-3rd-odi" title="India vs West Indies, 3rd ODI - Need 214 to win"></a><a href="/live-cricket-scores/171070/ind-vs-pak-gold-medal-match" title="India vs Pakistan - Complete"></a>';
  evaluate(server, "fetchHtml = async url => url.includes('/cricket-match/live-scores') ? listHtml : url.includes('151554') ? liveHtml : finishedHtml");
  const aggregated = await evaluate(server, "scrapeWomensT20WorldCup()");
  const odi = aggregated.find(match => match.id === "151554");
  const t20 = aggregated.find(match => match.id === "171070");
  assert.equal(odi.state, "Live");
  assert.equal(odi.status, "West Indies need 214 runs");
  assert.equal(odi.matchFormat, "ODI");
  assert.equal(t20.state, "Finished");
  assert.equal(t20.status, "India won by 19 runs");
  assert.equal(evaluate(dashboard, "getMatchNumber({url:'https://www.cricbuzz.com/live-cricket-scores/171070/ind-vs-pak-gold-medal-match-asian-games-2026'})"), "Asian Games · T20I · Final");
  assert.equal(evaluate(dashboard, "getMatchNumber({url:'https://www.cricbuzz.com/live-cricket-scores/171060/ind-vs-sl-2nd-semi-final-asian-games-2026'})"), "Asian Games · T20I · 2nd Semi-final");
  const wtc = aggregated.filter(match => match.category === "Test Championship");
  assert.equal(wtc.length, 64);
  assert.equal(wtc.filter(match => match.state === "Finished").length, 40);
  assert.equal(wtc.filter(match => match.state === "Upcoming").length, 24);
  const upcomingTests = wtc.filter(match => match.state === "Upcoming").sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  assert.equal(upcomingTests[0].startISO, "2026-10-09T07:30:00.000Z");
  assert.equal(upcomingTests[0].venue, "Durban");
  assert.equal(upcomingTests[upcomingTests.length - 1].matchNo, "Final");
  assert.equal(upcomingTests[upcomingTests.length - 1].startISO, "2027-06-09T09:30:00.000Z");
  dashboard.allTestMatches = JSON.parse(JSON.stringify(wtc));
  const testViews = evaluate(dashboard, "withLocalSchedule(allTestMatches).filter(match=>match.category==='Test Championship')");
  assert.equal(testViews.length, 64);
  dashboard.testViews = testViews;
  evaluate(dashboard, "allMatches=testViews; activeCompetition='Test Championship'");
  assert.equal(evaluate(dashboard, "getUpcomingMatch().venue"), "Durban");
  assert.equal(evaluate(dashboard, "getTournamentMatches().filter(match=>match.state==='Finished')[0].status"), "England won by 8 wickets");
  const india = aggregated.filter(match => match.category === "Indian Men");
  for (const test of wtc.filter(match => match.teams.includes("India"))) {
    const copies = india.filter(match => match.id === test.id || (match.matchNo === test.matchNo && [...match.teams].sort().join('|') === [...test.teams].sort().join('|') && match.startISO.slice(0, 10) === test.startISO.slice(0, 10)));
    assert.equal(copies.length, 1);
    assert.equal(copies[0].status, test.status);
  }
  assert.equal(india.find(match => match.id === 'india-result-1529227').status, 'India won by 8 wickets (with 50 balls remaining)');
  assert.equal(india.find(match => match.id === 'india-result-1529228').scores[1].score, '406/2');
  assert.equal(india.find(match => match.id === 'india-result-1552773').scores.length, 0);
  assert.equal(india.filter(match => match.id.startsWith('india-wc-')).length, 5);
  for (const match of india.filter(match => match.id.startsWith('india-wc-'))) {
    dashboard.worldCupMatch = JSON.parse(JSON.stringify(match));
    assert.equal(evaluate(dashboard, "inningsOvers(worldCupMatch)"), 50);
  }
  const allIds = wtc.map(match => match.id);
  assert.equal(new Set(allIds).size, 64);
  console.log("Passed: match isolation, ODI/T20 logic, Asian Games labels, 64 unique WTC matches, India schedule and chronology.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
