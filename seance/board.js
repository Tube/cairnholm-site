/* The Séance — three rotation modes on one premise: every account is sworn
   true, and one is an invention. Static data + client-side JS only; salted
   sha256 checks per layer (courtesy gating, not security). */

(function () {
  "use strict";

  var ORDINALS = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth",
    "Seventh", "Eighth", "Ninth", "Tenth"];

  var puzzle = null;
  var castById = {};
  var order = [];                // item ids in the player's current order
  var matches = {};              // item id -> means id | "none" | ""
  var solutionSolved = false;

  function $(id) { return document.getElementById(id); }

  function sha256hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function itemDisplay(id) {
    var it = puzzle.sitting.items.filter(function (x) { return x.id === id; });
    return it.length ? it[0].display : id;
  }

  function canonicalSolution() {
    if (puzzle.mode === "testimony") { return order.join(";"); }
    if (puzzle.mode === "message") { return order.join(""); }
    var ids = puzzle.sitting.items.map(function (x) { return x.id; })
      .slice().sort();
    return ids.map(function (m) {
      return m + "=" + (matches[m] || "none");
    }).join(";");
  }

  /* ---------------- the work board ---------------- */
  function renderOrderBoard() {
    var el = $("workboard");
    el.innerHTML = "";
    var list = document.createElement("div");
    list.className = "orderlist" +
      (puzzle.mode === "message" ? " lettertiles" : "");
    order.forEach(function (id, i) {
      var card = document.createElement("div");
      card.className = "ordercard";
      var no = document.createElement("span");
      no.className = "ord-no";
      no.textContent = String(i + 1);
      var lab = document.createElement("span");
      lab.className = "ord-label";
      lab.textContent = puzzle.mode === "message" ? id : itemDisplay(id);
      var up = document.createElement("button");
      up.className = "ordbtn";
      up.textContent = "▲";
      up.addEventListener("click", function () { move(i, -1); });
      var down = document.createElement("button");
      down.className = "ordbtn";
      down.textContent = "▼";
      down.addEventListener("click", function () { move(i, 1); });
      card.appendChild(no);
      card.appendChild(lab);
      card.appendChild(up);
      card.appendChild(down);
      list.appendChild(card);
    });
    el.appendChild(list);
    if (puzzle.mode === "message" && puzzle.sitting.word_lengths) {
      var note = document.createElement("p");
      note.className = "wordnote";
      note.textContent = "The message fell in words of " +
        puzzle.sitting.word_lengths.join(" and ") + " letters.";
      el.appendChild(note);
    }
  }

  function move(i, d) {
    if (solutionSolved) { return; }
    var j = i + d;
    if (j < 0 || j >= order.length) { return; }
    var t = order[i]; order[i] = order[j]; order[j] = t;
    renderOrderBoard();
  }

  function renderMatchBoard() {
    var el = $("workboard");
    el.innerHTML = "";
    puzzle.sitting.items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "matchrow";
      var lab = document.createElement("label");
      lab.textContent = it.display;
      var sel = document.createElement("select");
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "—";
      sel.appendChild(opt0);
      var optN = document.createElement("option");
      optN.value = "none";
      optN.textContent = "nothing of hers";
      sel.appendChild(optN);
      puzzle.sitting.means.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.display;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        if (solutionSolved) { sel.value = matches[it.id] || ""; return; }
        matches[it.id] = sel.value;
      });
      row.appendChild(lab);
      row.appendChild(sel);
      el.appendChild(row);
    });
  }

  /* ---------------- checks ---------------- */
  function checkSolution() {
    var word = $("solution-word");
    if (puzzle.mode === "debunker") {
      var ids = puzzle.sitting.items.map(function (x) { return x.id; });
      if (ids.some(function (m) { return !matches[m]; })) {
        word.textContent = "Every manifestation wants an accounting.";
        word.className = "check-word wrong";
        return;
      }
      var used = {};
      var residues = 0;
      var double = false;
      ids.forEach(function (m) {
        if (matches[m] === "none") { residues += 1; return; }
        if (used[matches[m]]) { double = true; }
        used[matches[m]] = true;
      });
      if (residues !== 1 || double) {
        word.textContent = "Each apparatus served once; one manifestation " +
          "was nothing of hers.";
        word.className = "check-word wrong";
        return;
      }
    }
    sha256hex(puzzle.answer_hashes.salt + canonicalSolution())
      .then(function (h) {
        if (h === puzzle.answer_hashes.solution) {
          solutionSolved = true;
          word.textContent = "So the sitting ran.";
          word.className = "check-word right";
          showMurder();
        } else {
          word.textContent = "The circle begs to differ; it did not run so.";
          word.className = "check-word wrong";
        }
      });
  }

  function showMurder() {
    var panel = $("murder-panel");
    panel.classList.remove("hidden");
    $("murder-question").textContent =
      "The sitting is proven. Say now: whose account of the dark was an " +
      "invention? " +
      ((castById[puzzle.victim] || {}).display_name || "One of the company") +
      " did not live to dispute it.";
    var pick = $("killer-pick");
    pick.innerHTML = "";
    puzzle.sitters.forEach(function (s) {
      if (s.medium) { return; }        // the medium is not doubted
      var t = document.createElement("div");
      t.className = "token";
      t.appendChild(document.createTextNode(s.display_name));
      t.addEventListener("click", function () { checkKiller(s.id); });
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
        word.textContent = "That account stands with the others.";
        word.className = "check-word wrong";
      }
    });
  }

  function showReveal() {
    var panel = $("reveal-panel");
    panel.classList.remove("hidden");
    var el = $("ledger");
    el.innerHTML = "";
    String(puzzle.reveal.ledger_voiced || "").split(/\n\n+/).forEach(
      function (p) {
        if (!p.trim()) { return; }
        var q = document.createElement("p");
        q.textContent = p.trim();
        el.appendChild(q);
      });
    var disp = $("solution-display");
    disp.innerHTML = "";
    var t = puzzle.reveal.truth || {};
    if (t.order) {
      var ol = document.createElement("ol");
      t.order.forEach(function (d) {
        var li = document.createElement("li");
        li.textContent = d;
        ol.appendChild(li);
      });
      disp.appendChild(ol);
    } else if (t.message) {
      var p = document.createElement("p");
      p.style.letterSpacing = "0.3em";
      p.textContent = t.message;
      disp.appendChild(p);
    } else if (t.pairs) {
      var ul = document.createElement("ul");
      t.pairs.forEach(function (pair) {
        var li = document.createElement("li");
        li.textContent = pair[0] + " — " +
          (pair[1] || "nothing of hers");
        ul.appendChild(li);
      });
      disp.appendChild(ul);
    }
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- boot ---------------- */
  function renderStatic(idx) {
    var ord = ORDINALS[idx + 1] || String(idx + 1);
    var victim = castById[puzzle.victim];
    var frames = {
      testimony:
        "When the lamps were relit, " +
        (victim ? victim.display_name : "one of the company") +
        " was found beyond any spirit's reach, apart from the circle. The " +
        "sitters swore, each on their oath, to what the dark produced and " +
        "in what order. The reader is asked to set the manifestations in " +
        "their true succession, and then to say whose account could not " +
        "have been given by anyone who sat the sitting through.",
      message:
        "The glass spelled a message that evening, letter by letter, and " +
        "when the lamps were relit " +
        (victim ? victim.display_name : "one of the company") +
        " was found beyond any spirit's reach. The sitters swore to the " +
        "letters and their order. The reader is asked to set the letters " +
        "as the glass truly went, and then to say whose account is the " +
        "dark's invention. What the message says is the medium's own " +
        "affair; it means nothing, and it never has.",
      debunker:
        "When the lamps were relit, " +
        (victim ? victim.display_name : "one of the company") +
        " was found beyond any spirit's reach. What the dark produced, " +
        "apparatus produced — save one thing only, which was nothing of " +
        "the medium's. The sitters swore to what they felt of wire and " +
        "wind. The reader is asked to give every manifestation its means, " +
        "to find the one that had none, and to say whose account is the " +
        "dark's invention."
    };
    $("frame").innerHTML =
      '<div class="masthead-kicker" style="letter-spacing:0.24em; ' +
      'font-style:normal; font-family:\'IM Fell English SC\',serif; ' +
      'color:#6e2c1f">Sitting the ' + ord + "</div>" +
      "<p>" + frames[puzzle.mode] + "</p>";

    var noteByMode = {
      testimony: "The manifestations of the evening, in no order at all:",
      message: "The letters the glass visited, in no order at all:",
      debunker: "The manifestations of the evening, and the medium's " +
        "known apparatus:"
    };
    $("sitting-note").textContent = noteByMode[puzzle.mode];
    var sl = $("sitting-list");
    sl.innerHTML = "";
    puzzle.sitting.items.forEach(function (it) {
      var li = document.createElement("li");
      li.textContent = puzzle.mode === "message" ? it.id : it.display;
      sl.appendChild(li);
    });
    if (puzzle.mode === "debunker") {
      puzzle.sitting.means.forEach(function (t) {
        var li = document.createElement("li");
        li.style.color = "#6e2c1f";
        li.textContent = t.display;
        sl.appendChild(li);
      });
    }

    var al = $("attest-list");
    al.innerHTML = "";
    puzzle.sitters.forEach(function (s) {
      var g = document.createElement("div");
      g.className = "attest-group";
      var name = document.createElement("div");
      name.className = "attest-name";
      name.textContent = s.display_name +
        (s.medium ? " (the medium) allows:" : " attests:");
      g.appendChild(name);
      var ul = document.createElement("ul");
      s.claims.forEach(function (c) {
        var li = document.createElement("li");
        li.textContent = c.voiced;
        ul.appendChild(li);
      });
      g.appendChild(ul);
      al.appendChild(g);
    });

    var workNotes = {
      testimony: "Set the manifestations in their true order, first to last.",
      message: "Set the letters as the glass went, first to last.",
      debunker: "Give each manifestation its apparatus; mark the one that " +
        "had none."
    };
    $("work-note").textContent = workNotes[puzzle.mode];
    $("work-title").textContent = {
      testimony: "The Reconstruction",
      message: "The Message",
      debunker: "The Accounting"
    }[puzzle.mode];
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    fetch("puzzles/manifest.json").then(function (r) { return r.json(); })
      .then(function (manifest) {
        var id = params.get("d") ? "seance-" + params.get("d")
                                 : manifest.latest;
        var idx = manifest.all.slice().reverse().indexOf(id);
        return fetch("puzzles/" + id + ".json")
          .then(function (r) {
            if (!r.ok) { throw new Error("no such sitting"); }
            return r.json();
          })
          .then(function (p) {
            puzzle = p;
            p.cast.forEach(function (c) { castById[c.id] = c; });
            renderStatic(idx < 0 ? 0 : idx);
            if (p.mode === "debunker") {
              matches = {};
              renderMatchBoard();
            } else {
              order = p.sitting.items.map(function (x) { return x.id; });
              renderOrderBoard();
            }
            $("check-solution").addEventListener("click", checkSolution);
          });
      })
      .catch(function () {
        $("frame").innerHTML =
          "<p>The sitting is not yet held. Return presently.</p>";
      });
  }

  boot();
})();
