/* The Vespers — the grid and the circle. Static data + client-side JS only;
   salted sha256 checks per layer (courtesy gating, not security). */

(function () {
  "use strict";

  var ORDINALS = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth",
    "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth",
    "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth",
    "Eighteenth", "Nineteenth", "Twentieth"];

  // rope positions on the circle face (rope 1 at the top, clockwise)
  var SPOT = {
    1: [50, 10], 2: [86, 30], 3: [86, 70], 4: [50, 90], 5: [14, 70], 6: [14, 30]
  };

  var puzzle = null;
  var castById = {};
  var grid = [];                 // rows of arrays; grid[r][p] = 1..6 or 0
  var ropes = {};                // rope -> person id | null
  var selectedToken = null;
  var rowsSolved = false, ropesSolved = false;

  function $(id) { return document.getElementById(id); }

  function sha256hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function canonicalRows() {
    return grid.map(function (row) { return row.join(""); }).join(";");
  }

  function canonicalRopes() {
    return [1, 2, 3, 4, 5, 6].map(function (r) {
      return r + "=" + ropes[r];
    }).join(";");
  }

  /* ---------------- the row grid ---------------- */
  function buildGrid(targetId, rowsData, interactive, blueBell) {
    var el = $(targetId);
    el.innerHTML = "";
    rowsData.forEach(function (row, r) {
      var lab = document.createElement("div");
      lab.className = "rowlabel";
      lab.textContent = r === 0 ? "rounds" : String(r);
      el.appendChild(lab);
      row.forEach(function (v, p) {
        var c = document.createElement("div");
        c.className = "cell" + (r === 0 ? " locked" : "") +
          (v === 0 ? " blank" : "") +
          (blueBell && v === blueBell ? " blue" : "");
        c.textContent = v === 0 ? "·" : String(v);
        if (interactive && r > 0) {
          c.addEventListener("click", function () {
            if (rowsSolved) { return; }
            grid[r][p] = (grid[r][p] % 6) + 1;
            c.textContent = String(grid[r][p]);
            c.classList.remove("blank");
          });
        }
        el.appendChild(c);
      });
    });
  }

  function layLine() {
    if (rowsSolved) { return; }
    puzzle.method.prescribed.forEach(function (rowStr, r) {
      if (r === 0) { return; }
      grid[r] = rowStr.split("").map(Number);
    });
    buildGrid("rowgrid", grid, true);
  }

  /* ---------------- the circle ---------------- */
  function buildCircle(targetId, assignment, interactive, flawRope) {
    var el = $(targetId);
    el.innerHTML = "";
    [1, 2, 3, 4, 5, 6].forEach(function (r) {
      var spot = document.createElement("div");
      spot.className = "ropespot" + (r === 6 ? " fixedrope" : "") +
        (flawRope === r ? " deviant" : "");
      spot.style.left = SPOT[r][0] + "%";
      spot.style.top = SPOT[r][1] + "%";
      var name = document.createElement("div");
      name.className = "ropename";
      name.textContent = ORDINALS[r].toLowerCase() + " rope";
      var who = document.createElement("div");
      who.className = "who2";
      var pid = assignment[r];
      if (pid) {
        var c = castById[pid];
        who.textContent = c ? c.display_name : pid;
      } else {
        who.innerHTML = '<span class="empty">unmanned</span>';
      }
      if (interactive && r !== 6) {
        who.addEventListener("click", function () {
          if (ropesSolved) { return; }
          if (selectedToken) {
            [1, 2, 3, 4, 5].forEach(function (rr) {
              if (ropes[rr] === selectedToken) { ropes[rr] = null; }
            });
            ropes[r] = selectedToken;
            selectedToken = null;
          } else if (ropes[r]) {
            ropes[r] = null;
          }
          renderTray();
          buildCircle("circle", ropes, true);
        });
      }
      spot.appendChild(name);
      spot.appendChild(who);
      el.appendChild(spot);
    });
  }

  function renderTray() {
    var tray = $("tray");
    tray.innerHTML = "";
    puzzle.attendance.ringers.forEach(function (p) {
      var placed = [1, 2, 3, 4, 5].some(function (r) {
        return ropes[r] === p.id;
      });
      if (placed) { return; }
      var t = document.createElement("div");
      t.className = "token" + (selectedToken === p.id ? " selected" : "");
      var c = castById[p.id];
      if (c && c.portrait) {
        var img = document.createElement("img");
        img.src = c.portrait;
        img.alt = "";
        t.appendChild(img);
      }
      t.appendChild(document.createTextNode(p.display_name));
      t.addEventListener("click", function () {
        selectedToken = (selectedToken === p.id) ? null : p.id;
        renderTray();
      });
      tray.appendChild(t);
    });
    if (!tray.children.length) {
      tray.innerHTML = '<span class="check-word">every rope is taken</span>';
    }
  }

  /* ---------------- checks ---------------- */
  function checkRows() {
    var word = $("rows-word");
    if (grid.some(function (row) { return row.some(function (v) { return !v; }); })) {
      word.textContent = "The grid wants filling before it can be proven.";
      word.className = "check-word wrong";
      return;
    }
    for (var r = 0; r < grid.length; r++) {
      var seen = {};
      for (var p = 0; p < 6; p++) { seen[grid[r][p]] = true; }
      if (Object.keys(seen).length !== 6) {
        word.textContent = "A row rings every bell once; one of these does not.";
        word.className = "check-word wrong";
        return;
      }
    }
    sha256hex(puzzle.answer_hashes.salt + canonicalRows()).then(function (h) {
      if (h === puzzle.answer_hashes.rows) {
        rowsSolved = true;
        word.textContent = "So the touch was rung.";
        word.className = "check-word right";
        maybeMurder();
      } else {
        word.textContent = "The tower begs to differ; the rows were not so rung.";
        word.className = "check-word wrong";
      }
    });
  }

  function checkRopes() {
    var word = $("ropes-word");
    if ([1, 2, 3, 4, 5].some(function (r) { return !ropes[r]; })) {
      word.textContent = "The circle wants its full band.";
      word.className = "check-word wrong";
      return;
    }
    sha256hex(puzzle.answer_hashes.salt + canonicalRopes()).then(function (h) {
      if (h === puzzle.answer_hashes.ropes) {
        ropesSolved = true;
        word.textContent = "So the ropes were held.";
        word.className = "check-word right";
        maybeMurder();
      } else {
        word.textContent = "The tower begs to differ; the ropes were not so held.";
        word.className = "check-word wrong";
      }
    });
  }

  function maybeMurder() {
    if (!(rowsSolved && ropesSolved)) { return; }
    var panel = $("murder-panel");
    panel.classList.remove("hidden");
    $("murder-question").textContent =
      "The touch and the circle are proven. Say now: whose hands were free " +
      "when " + (castById[puzzle.victim] || {}).display_name +
      " met their end?";
    var pick = $("killer-pick");
    pick.innerHTML = "";
    puzzle.attendance.ringers.forEach(function (p) {
      var t = document.createElement("div");
      t.className = "token";
      t.appendChild(document.createTextNode(p.display_name));
      t.addEventListener("click", function () { checkKiller(p.id); });
      pick.appendChild(t);
    });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function checkKiller(id) {
    var word = $("killer-word");
    sha256hex(puzzle.answer_hashes.salt + id).then(function (h) {
      if (h === puzzle.answer_hashes.killer) {
        word.textContent = "";
        showReveal();
      } else {
        word.textContent = "The tower kept that pair of hands honest.";
        word.className = "check-word wrong";
      }
    });
  }

  function showReveal() {
    var panel = $("reveal-panel");
    panel.classList.remove("hidden");
    var briefEl = $("brief");
    briefEl.innerHTML = "";
    String(puzzle.reveal.brief_voiced || "").split(/\n\n+/).forEach(function (p) {
      if (!p.trim()) { return; }
      var el = document.createElement("p");
      el.textContent = p.trim();
      briefEl.appendChild(el);
    });
    var dg = puzzle.reveal.diagram;
    var solved = dg.rows.map(function (s) { return s.split("").map(Number); });
    buildGrid("solution-grid", solved, false);
    // outline the flawed row
    var cells = $("solution-grid").children;
    var perRow = 7;                                   // label + six cells
    for (var i = 0; i < 6; i++) {
      var idx = dg.flaw_row * perRow + 1 + i;
      if (cells[idx]) {
        cells[idx].style.outline = "2px solid #6e2c1f";
        cells[idx].style.outlineOffset = "-2px";
      }
    }
    var solvedRopes = {};
    Object.keys(dg.ropes).forEach(function (k) {
      solvedRopes[Number(k)] = dg.ropes[k];
    });
    // the culprit's rope: the bell the method wanted at the flawed place —
    // the one that hung late — pulls the rope of her own number
    var lateBellNumber =
      Number(puzzle.method.prescribed[dg.flaw_row][dg.flaw_place - 1]);
    buildCircle("solution-circle", solvedRopes, false, lateBellNumber);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- boot ---------------- */
  function renderStatic(idx) {
    var ord = ORDINALS[idx + 1] || String(idx + 1);
    var victim = castById[puzzle.victim];
    $("frame").innerHTML =
      '<div class="masthead-kicker" style="letter-spacing:0.24em; ' +
      'font-style:normal; font-family:\'IM Fell English SC\',serif; ' +
      'color:#6e2c1f">Touch the ' + ord + "</div>" +
      "<p>When the touch was done and the office read, " +
      (victim ? victim.display_name : "one of the parish") +
      " was found beyond the reach of any bell. The parish swears to what " +
      "follows; the reader is asked to set down the rows as they were truly " +
      "rung, to place every hand upon its rope, and then to say whose hands " +
      "were, for a minute, nowhere at all.</p>";

    var ring = $("ring-list");
    ring.innerHTML = "";
    var bells = ((puzzle.ring && puzzle.ring.bells) || []).slice()
      .sort(function (a, b) { return a.number - b.number; });
    var lastNo = bells.length ? bells[bells.length - 1].number : 0;
    bells.forEach(function (b) {
      var li = document.createElement("li");
      li.textContent = b.name +
        (b.number === 1 ? " — the treble" :
         (b.number === lastNo ? " — the tenor" : ""));
      ring.appendChild(li);
    });

    $("method-note").textContent =
      "The method is " + puzzle.method.name + ": from rounds, every bell " +
      "hunts — one place at a time, out to the back and home again — for " +
      puzzle.method.changes + " changes, until the ring comes round. The " +
      "line below is the method as the captain would have it; the treble's " +
      "path is marked.";
    var prescribed = puzzle.method.prescribed.map(function (s) {
      return s.split("").map(Number);
    });
    buildGrid("method-diagram", prescribed, false, 1);

    var cl = $("customs-list");
    cl.innerHTML = "";
    puzzle.customs.forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = c.text;
      cl.appendChild(li);
    });
    var ringers = puzzle.attendance.ringers.map(function (p) {
      return p.display_name;
    });
    $("particulars").textContent =
      "The band, this week: " + ringers.join("; ") + " — with " +
      (castById[puzzle.attendance.captain] || {display_name: "the captain"}).display_name +
      " at his own rope, as always. The greenest hand among them: " +
      (castById[puzzle.attendance.greenest] || {}).display_name + ".";

    var clues = $("clue-list");
    clues.innerHTML = "";
    puzzle.clues.forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = c.voiced;
      clues.appendChild(li);
    });
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    fetch("puzzles/manifest.json").then(function (r) { return r.json(); })
      .then(function (manifest) {
        var id = params.get("d") ? "vespers-" + params.get("d")
                                 : manifest.latest;
        var idx = manifest.all.slice().reverse().indexOf(id);
        return fetch("puzzles/" + id + ".json")
          .then(function (r) {
            if (!r.ok) { throw new Error("no such touch"); }
            return r.json();
          })
          .then(function (p) {
            puzzle = p;
            p.cast.forEach(function (c) { castById[c.id] = c; });
            renderStatic(idx < 0 ? 0 : idx);
            var changes = p.method.changes;
            grid = [];
            for (var r = 0; r <= changes; r++) {
              grid.push(r === 0
                ? p.method.prescribed[0].split("").map(Number)
                : [0, 0, 0, 0, 0, 0]);
            }
            buildGrid("rowgrid", grid, true);
            ropes = {1: null, 2: null, 3: null, 4: null, 5: null,
                     6: "bellamy"};
            renderTray();
            buildCircle("circle", ropes, true);
            $("lay-line").addEventListener("click", layLine);
            $("check-rows").addEventListener("click", checkRows);
            $("check-ropes").addEventListener("click", checkRopes);
          });
      })
      .catch(function () {
        $("frame").innerHTML =
          "<p>The office is not yet rung. Return presently.</p>";
      });
  }

  boot();
})();
