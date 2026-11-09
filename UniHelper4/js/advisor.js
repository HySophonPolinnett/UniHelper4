/* UniHelper advisor – three fixed questions (no free typing), two filters (Coursework, Time).
 * Rule-based and works offline, using the student's real degree audit and semester schedule.
 * Suggestions are shuffled a little each time (required courses still come first) so asking again gives fresh ideas. */
(function () {
  "use strict";
  const UH = window.UH, P = window.UHParse;
  const term = () => { const s = UH.S.schedule; return s && s.term ? s.term : "semester"; };
  const nice = (n) => String(Math.round(n * 10) / 10);
  const labelOf = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];

  UH.QUESTIONS = [["next", "What should I take next semester?"], ["graduate", "What do I need to graduate?"], ["plan", "Build my plan"]];

  function filterText(f) {
    const bits = [];
    if (f.group && f.group !== "all") bits.push(labelOf(UH.COURSEWORK, f.group));
    if (f.time && f.time !== "both") bits.push(labelOf(UH.TIMES, f.time).toLowerCase());
    return bits.length ? " (" + bits.join(", ") + ")" : "";
  }

  /* kind: "next" | "graduate" | "plan";  f: { group, time } */
  UH.advise = function (kind, f) {
    const S = UH.S; f = Object.assign({ group: "all", time: "both" }, f || {});
    if (!S.audit && !S.major) return { text: "I need your degree audit first. Go to the Start tab and upload it – then I can answer exactly.", goStart: true };
    const base = S.audit ? "Based on your degree audit" : "Based on " + UH.MAJORS[S.major].n + " (an estimate – upload your degree audit for exact results)";
    const sched = S.schedule ? " and the " + term() + " schedule" : "";
    if (f.time !== "both" && !S.schedule) return { text: "To filter by morning or afternoon I need the semester schedule. Upload it on the Start tab, or set Time to “Morning & afternoon”.", goStart: true };

    if (kind === "graduate") {
      if (!S.audit) return { text: "Upload your degree audit (Start tab) and I'll show exactly what you still need to graduate.", goStart: true };
      const a = S.audit, lines = [];
      P.GROUP_ORDER.forEach((k) => {
        const o = a.groups[k]; if (!o || k === "none") return;
        if (f.group !== "all" && k !== f.group) return;
        const rem = UH.groupRem(k);
        lines.push((P.GROUP_LABEL[k] || k) + ": " + (o.required != null ? (rem <= 0 ? "complete ✓ (" + nice(o.required) + " cr)" : nice(rem) + " of " + nice(o.required) + " credits to go") : nice(o.done) + " cr done (requirement not listed)"));
      });
      const done = a.totalCompleted != null ? a.totalCompleted : a.checks ? a.checks.earnedSum : 0;
      const head = "Here's where you stand" + (a.totalRequired ? " (" + nice(done) + " of " + nice(a.totalRequired) + " credits completed)" : "") + ":";
      if (!lines.length) return { text: head + "\nNothing listed for " + labelOf(UH.COURSEWORK, f.group) + " on your audit." };
      return { text: head + "\n" + lines.join("\n") };
    }

    if (kind === "plan") {
      const plan = UH.autoPlan(f); UH.save();
      if (!plan.length) return { text: base + sched + filterText(f) + ": I couldn't fit any eligible courses without a time clash. Try a different filter." };
      const short = plan.length < UH.PLAN_COURSES ? " Only " + plan.length + " eligible course" + (plan.length === 1 ? "" : "s") + " fit without a time clash" + (f.group !== "all" || f.time !== "both" ? " with these filters – try loosening them" : "") + "." : "";
      const again = UH._planRepeated ? " There are no new courses left for these filters, so this is the earlier plan again." : "";
      return { text: "Here is a plan of " + plan.length + " courses (" + UH.planCredits() + " credits)" + filterText(f) + " with no time clashes. Press “Build my plan” again for different courses." + short + again, codes: plan.map((p) => p.code), goPlan: true };
    }

    // "next"
    const rec = UH.recommend(f, UH.RECS), c = UH.candidates();
    if (!rec.items.length) {
      let why = "I found no matching courses.";
      if (f.group !== "all" && S.audit && (!S.audit.groups[f.group] || UH.groupRem(f.group) <= 0) && !c.all.some((x) => x.group === f.group)) why = "Good news: nothing is left to take in " + labelOf(UH.COURSEWORK, f.group) + ", so you don't need more courses there.";
      else if (f.group !== "all" && c.gone.some((x) => x.group === f.group)) why = "The " + labelOf(UH.COURSEWORK, f.group).toLowerCase() + " course(s) you still need aren't offered in the " + term() + " schedule.";
      else if (f.group !== "all" && c.locked.some((x) => x.group === f.group)) why = "The " + labelOf(UH.COURSEWORK, f.group).toLowerCase() + " course(s) you still need require a prerequisite first – see “Not yet eligible” in the Courses tab.";
      else if (f.time !== "both") why = "No eligible course has a section in that time window. Try another time or coursework filter.";
      else if (c.locked.length) why = "Everything left needs a prerequisite first – see “Not yet eligible” in the Courses tab.";
      return { text: base + sched + filterText(f) + ": " + why };
    }
    const cr = rec.items.reduce((n, x) => n + x.c.cr, 0);
    let text = (rec.repeated ? "There are no new courses left for these filters, so here are the earlier ones again:\n" : "") + base + sched + filterText(f) + ", here " + (rec.items.length === 1 ? "is the best match" : "are " + rec.items.length + " courses to choose from") + " (required courses first, electives last). You can pick from them – the same list is under Recommended in the Courses tab:";
    if (!S.schedule) text += "\nUpload the semester schedule to see which of these are actually offered.";
    return { text, codes: rec.items.map((x) => x.code), note: rec.pool <= UH.RECS ? "Only " + rec.pool + " course" + (rec.pool === 1 ? "" : "s") + " match right now, so there is nothing else to show." : "" };
  };
})();
