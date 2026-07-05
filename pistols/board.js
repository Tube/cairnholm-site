/* The Pistols — interactive board. Static data + client-side JS only: the
   puzzle JSON is fetched from puzzles/, answers are checked against salted
   sha256 hashes (courtesy gating, not security). No accounts, no server. */

(function () {
  "use strict";

  var LEFT = ["L1", "L2", "L3", "L4", "L5", "L6"];
  var RIGHT = ["R1", "R2", "R3", "R4", "R5"];
  var SIDE_SEATS = LEFT.concat(RIGHT);
  var GUN_ORDER = ["HEAD"].concat(SIDE_SEATS).concat(["FOOT"]);
  var ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth",
    "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth",
    "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth",
    "Eighteenth", "Nineteenth", "Twentieth"];

  var puzzle = null;
  var castById = {};
  var occupant = {};              // seat -> guest id | null
  var gun = {};                   // seat -> 'c' | 'u' | 'x'
  var selectedToken = null;       // guest id picked up from the tray
  var arrangementSolved = false;

  SIDE_SEATS.forEach(function (s) { occupant[s] = null; gun[s] = "c"; });
  gun.HEAD = "c";
  gun.FOOT = "u";                 // the memorial pistol: laid, never loaded

  function $(id) { return document.getElementById(id); }

  function sha256hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function canonicalArrangement() {
    var seating = SIDE_SEATS.map(function (s) {
      return s + "=" + occupant[s];
    }).join(";");
    var guns = GUN_ORDER.map(function (s) {
      return s + "=" + gun[s];
    }).join(";");
    return seating + "|" + guns;
  }

  /* ------------------------------------------------------------------ */
  function pistolSvg(state) {
    // a small flintlock silhouette; body fill carries the state
    return '<svg viewBox="0 0 30 20" aria-hidden="true">' +
      '<path class="body" d="M2 7 L24 7 L24 11 L14 11 L13 15 L8 15 L9 11 L5 11 L5 9 L2 9 Z"/>' +
      '<line class="barrel" x1="24" y1="9" x2="29" y2="9"/></svg>';
  }

  function pistolTitle(state) {
    return state === "c" ? "charged" : (state === "u" ? "laid, uncharged" : "gone");
  }

  function renderPistol(el, seat, locked) {
    var st = gun[seat];
    el.className = "pistol " +
      (st === "c" ? "charged" : (st === "u" ? "uncharged" : "absent")) +
      (locked ? " locked" : "");
    el.innerHTML = pistolSvg(st);
    el.title = pistolTitle(st);
  }

  function seatEl(seat) {
    return document.querySelector('[data-seat="' + seat + '"]');
  }

  function renderSeat(seat) {
    var el = seatEl(seat);
    var who = el.querySelector(".who");
    var img = el.querySelector("img.plate");
    var id = seat === "HEAD" ? puzzle.table.head : occupant[seat];
    if (seat === "FOOT") {
      who.innerHTML = '<span class="empty">&nbsp;</span>';
    } else if (id) {
      var c = castById[id];
      who.textContent = c.short_name || c.display_name;
      if (img && c.portrait) { img.src = c.portrait; img.style.display = "block"; }
    } else {
      who.innerHTML = '<span class="empty">an empty chair</span>';
      if (img) { img.style.display = "none"; }
    }
    renderPistol(el.querySelector(".pistol"), seat,
      seat === "FOOT" || arrangementSolved);
  }

  function renderTray() {
    var tray = $("tray");
    tray.innerHTML = "";
    puzzle.cast.forEach(function (c) {
      if (c.id === puzzle.table.head) { return; }
      var placed = SIDE_SEATS.some(function (s) { return occupant[s] === c.id; });
      if (placed) { return; }
      tray.appendChild(tokenEl(c, false));
    });
    if (!tray.children.length) {
      tray.innerHTML = '<span class="check-word">the company is seated</span>';
    }
  }

  function tokenEl(c, small) {
    var t = document.createElement("div");
    t.className = "token" + (small ? " small" : "") +
      (selectedToken === c.id ? " selected" : "");
    t.setAttribute("data-guest", c.id);
    if (c.portrait) {
      var img = document.createElement("img");
      img.src = c.portrait;
      img.alt = "";
      t.appendChild(img);
    }
    t.appendChild(document.createTextNode(c.short_name || c.display_name));
    t.draggable = true;
    t.addEventListener("click", function () {
      selectedToken = (selectedToken === c.id) ? null : c.id;
      renderTray();
    });
    t.addEventListener("dragstart", function (ev) {
      ev.dataTransfer.setData("text/plain", c.id);
      selectedToken = c.id;
    });
    return t;
  }

  function placeGuest(seat, id) {
    if (arrangementSolved || seat === "HEAD" || seat === "FOOT") { return; }
    SIDE_SEATS.forEach(function (s) {
      if (occupant[s] === id) { occupant[s] = null; }
    });
    occupant[seat] = id;
    selectedToken = null;
    renderTray();
    SIDE_SEATS.forEach(renderSeat);
  }

  function seatClicked(seat) {
    if (arrangementSolved || seat === "HEAD" || seat === "FOOT") { return; }
    if (selectedToken) {
      placeGuest(seat, selectedToken);
    } else if (occupant[seat]) {
      occupant[seat] = null;            // hand the guest back to the tray
      renderTray();
      renderSeat(seat);
    }
  }

  function buildBoard(target, small) {
    var board = $(target);
    board.innerHTML = "";
    function colhead(text, col, row) {
      var d = document.createElement("div");
      d.className = "colhead";
      d.textContent = text;
      d.style.gridColumn = col;
      d.style.gridRow = row;
      board.appendChild(d);
    }
    // The host faces the foot; his LEFT hand is the reader's right column.
    colhead("upon his right hand", "1", "1");
    colhead("upon his left hand", "3", "1");

    function seatBox(seat, col, row, cls) {
      var d = document.createElement("div");
      d.className = "seat " + cls;
      d.setAttribute("data-seat", seat);
      d.style.gridColumn = col;
      d.style.gridRow = row;
      var img = document.createElement("img");
      img.className = "plate";
      img.alt = "";
      img.style.display = "none";
      var who = document.createElement("div");
      who.className = "who";
      var p = document.createElement("div");
      p.className = "pistol";
      d.appendChild(img);
      d.appendChild(who);
      d.appendChild(p);
      if (!small) {
        who.addEventListener("click", function () { seatClicked(seat); });
        d.addEventListener("dragover", function (ev) {
          if (seat !== "HEAD" && seat !== "FOOT") {
            ev.preventDefault();
            d.classList.add("droptarget");
          }
        });
        d.addEventListener("dragleave", function () {
          d.classList.remove("droptarget");
        });
        d.addEventListener("drop", function (ev) {
          ev.preventDefault();
          d.classList.remove("droptarget");
          var id = ev.dataTransfer.getData("text/plain");
          if (id) { placeGuest(seat, id); }
        });
        p.addEventListener("click", function () {
          if (seat === "FOOT" || arrangementSolved) { return; }
          // charged <-> uncharged only: a pistol is laid at every place, never
          // absent, in these puzzles (no moved/missing pistols this week).
          gun[seat] = gun[seat] === "c" ? "u" : "c";
          renderPistol(p, seat, false);
        });
      }
      board.appendChild(d);
    }

    seatBox("HEAD", "2", "2", "fixed head-seat");
    RIGHT.forEach(function (s, i) { seatBox(s, "1", String(i + 3), ""); });
    LEFT.forEach(function (s, i) { seatBox(s, "3", String(i + 3), ""); });
    seatBox("FOOT", "2", "9", "memorial foot-seat");
  }

  /* ------------------------------------------------------------------ */
  function checkArrangement() {
    var word = $("check-word");
    var unfilled = SIDE_SEATS.filter(function (s) { return !occupant[s]; });
    if (unfilled.length) {
      word.textContent = "The table wants its full company.";
      word.className = "check-word wrong";
      return;
    }
    sha256hex(puzzle.answer_hashes.salt + canonicalArrangement())
      .then(function (hex) {
        if (hex === puzzle.answer_hashes.arrangement) {
          arrangementSolved = true;
          word.textContent = "So the table stood. One question remains.";
          word.className = "check-word right";
          GUN_ORDER.forEach(function (s) {
            renderPistol(seatEl(s).querySelector(".pistol"), s, true);
          });
          showMurderPanel();
        } else {
          word.textContent =
            "The Inspector begs to differ; the table was not so laid.";
          word.className = "check-word wrong";
        }
      });
  }

  function showMurderPanel() {
    var panel = $("murder-panel");
    panel.classList.remove("hidden");
    $("murder-question").textContent =
      "The arrangement is proven. Say now: who was placed, and armed, to " +
      "shoot " + (castById[puzzle.victim].short_name ||
                  castById[puzzle.victim].display_name) + "?";
    var pick = $("killer-pick");
    pick.innerHTML = "";
    puzzle.cast.forEach(function (c) {
      if (c.id === puzzle.victim) { return; }
      // clone strips the tray-selection handler; the pick is its own gesture
      var clone = tokenEl(c, true).cloneNode(true);
      clone.addEventListener("click", function () { checkKiller(c.id); });
      pick.appendChild(clone);
    });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function checkKiller(id) {
    var word = $("killer-word");
    sha256hex(puzzle.answer_hashes.salt + id).then(function (hex) {
      if (hex === puzzle.answer_hashes.killer) {
        word.textContent = "";
        showReveal();
      } else {
        word.textContent = "The Inspector shakes his head, once.";
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
    // the solution diagram
    var dg = puzzle.reveal.diagram;
    buildBoard("solution-diagram", true);
    var host = castById[puzzle.table.head];
    GUN_ORDER.forEach(function (seat) {
      var el = document.querySelector(
        '#solution-diagram [data-seat="' + seat + '"]');
      var who = el.querySelector(".who");
      if (seat === "HEAD") {
        who.textContent = host.short_name || host.display_name;
      } else if (seat === "FOOT") {
        who.innerHTML = '<span class="empty">&nbsp;</span>';
      } else {
        var g = dg.seating[seat];
        var c = castById[g.id];
        who.textContent = (c && c.short_name) || g.display_name;
      }
      var p = el.querySelector(".pistol");
      var st = dg.guns[seat];
      p.className = "pistol locked " +
        (st === "c" ? "charged" : (st === "u" ? "uncharged" : "absent"));
      p.innerHTML = pistolSvg(st);
      if (seat === dg.deviation_seat) { el.classList.add("deviant"); }
    });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------------ */
  function renderStatic(observanceIndex) {
    var ord = ORDINALS[observanceIndex] || String(observanceIndex + 1);
    var victim = castById[puzzle.victim];
    $("frame").innerHTML =
      '<div class="masthead-kicker" style="letter-spacing:0.24em; ' +
      'font-style:normal; font-family:\'IM Fell English SC\',serif; ' +
      'color:#6e2c1f">Observance the ' + ord + "</div>" +
      "<p>When the company rose from the table, " +
      (victim.short_name || victim.display_name) +
      " did not rise with them. The household swears to what follows; " +
      "the reader is asked to lay the table exactly as it stood, and then " +
      "to say what the laying was for.</p>";

    var proto = $("protocol-list");
    proto.innerHTML = "";
    puzzle.protocol.forEach(function (r) {
      if (!r.restate) { return; }
      var li = document.createElement("li");
      li.textContent = r.text;
      proto.appendChild(li);
    });

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
        var id = params.get("d") ? "pistols-" + params.get("d")
                                 : manifest.latest;
        var idx = manifest.all.slice().reverse().indexOf(id); // oldest = 0
        return fetch("puzzles/" + id + ".json")
          .then(function (r) {
            if (!r.ok) { throw new Error("no such observance"); }
            return r.json();
          })
          .then(function (p) {
            puzzle = p;
            p.cast.forEach(function (c) { castById[c.id] = c; });
            renderStatic(idx < 0 ? 0 : idx);
            buildBoard("board", false);
            GUN_ORDER.forEach(renderSeat);
            renderTray();
            $("check-arrangement").addEventListener("click", checkArrangement);
          });
      })
      .catch(function (e) {
        $("frame").innerHTML =
          "<p>The observance is not yet laid. Return presently.</p>";
      });
  }

  boot();
})();
