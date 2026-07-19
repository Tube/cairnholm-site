/* Dr. Quill's Cabinet — client logic. Static JSON + salted sha256 hashes
   (courtesy gating, not security). No accounts, no server.
   Canonical arrangement string MUST match quill/emit.py byte-for-byte:
     "Mon=<id>;Tue=<id>;Wed=<id>;Thu=<id>;Fri=<id>;Sat=<id>;Sun=<id>"  */

(function () {
  "use strict";

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
              "Saturday", "Sunday"];
  var DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var puzzle = null;
  var phialsById = {};
  var placement = {};          // day name -> phial id (or undefined)
  var selected = null;         // phial id picked up from the tray
  var solved = false;

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
    return DAYS.map(function (day, i) {
      return DAY_KEYS[i] + "=" + (placement[day] || "");
    }).join(";");
  }

  /* ---------------- rendering ---------------- */

  function phialToken(pid, opts) {
    var p = phialsById[pid];
    var el = document.createElement("span");
    el.className = "phial" + (opts && opts.small ? " small" : "");
    el.dataset.id = pid;
    el.innerHTML = "<span class='glyph'>" + p.symbol + "</span>" +
      "<span class='phial-name'>" + p.seal + "</span>" +
      "<span class='phial-sub'>" + p.planet + " &middot; " + p.metal +
      " &middot; " + p.temper + "</span>";
    return el;
  }

  function renderCards() {
    var wrap = $("phial-cards");
    wrap.innerHTML = "";
    puzzle.phials.forEach(function (p) {
      var el = document.createElement("div");
      el.className = "card temper-" + p.temper;
      el.innerHTML = "<div class='glyph big'>" + p.symbol + "</div>" +
        "<div class='card-title'>" + p.seal + "</div>" +
        "<div class='card-sub'>" + p.planet + " &middot; " + p.metal +
        "</div><div class='card-temper'>" + p.temper + "</div>";
      wrap.appendChild(el);
    });
  }

  function renderLists() {
    $("frame-list").innerHTML = "";
    puzzle.frame.forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      $("frame-list").appendChild(li);
    });
    $("clue-list").innerHTML = "";
    puzzle.clues.forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = c.text;
      $("clue-list").appendChild(li);
    });
    $("question").textContent = puzzle.question;
  }

  function renderTray() {
    var tray = $("tray");
    tray.innerHTML = "";
    puzzle.phials.forEach(function (p) {
      var placedDay = null;
      DAYS.forEach(function (day) {
        if (placement[day] === p.id) { placedDay = day; }
      });
      if (placedDay) { return; }
      var el = phialToken(p.id);
      if (selected === p.id) { el.className += " selected"; }
      el.addEventListener("click", function () {
        if (solved) { return; }
        selected = (selected === p.id) ? null : p.id;
        renderTray();
      });
      tray.appendChild(el);
    });
    if (!tray.childNodes.length) {
      tray.innerHTML = "<span class='tray-empty'>The shelf is bare; the " +
        "drawers hold all seven.</span>";
    }
  }

  function renderBoard() {
    var board = $("board");
    board.innerHTML = "";
    DAYS.forEach(function (day) {
      var row = document.createElement("div");
      row.className = "drawer";
      row.dataset.day = day;
      var label = document.createElement("span");
      label.className = "drawer-label";
      label.textContent = day;
      row.appendChild(label);
      var slot = document.createElement("span");
      slot.className = "drawer-slot";
      if (placement[day]) {
        var tok = phialToken(placement[day], { small: true });
        slot.appendChild(tok);
      } else {
        slot.innerHTML = "<span class='slot-empty'>&mdash;</span>";
      }
      row.appendChild(slot);
      row.addEventListener("click", function () {
        if (solved) { return; }
        if (selected) {
          placement[day] = selected;
          selected = null;
        } else if (placement[day]) {
          delete placement[day];
        }
        renderTray();
        renderBoard();
      });
      board.appendChild(row);
    });
  }

  function renderReveal() {
    $("note").textContent = puzzle.reveal.note;
    var tbl = document.createElement("table");
    tbl.className = "solution";
    DAYS.forEach(function (day) {
      var r = puzzle.reveal.arrangement[day];
      var tr = document.createElement("tr");
      if (day === puzzle.reveal.asked_day) { tr.className = "asked"; }
      tr.innerHTML = "<td>" + day + "</td><td>" + r.seal + "</td><td>" +
        r.planet + " &middot; " + r.metal + "</td>";
      tbl.appendChild(tr);
    });
    $("solution-table").innerHTML = "";
    $("solution-table").appendChild(tbl);
    $("reveal-panel").className = "panel reveal";
  }

  /* ---------------- checking ---------------- */

  function check() {
    var word = $("check-word");
    var complete = DAYS.every(function (day) { return placement[day]; });
    if (!complete) {
      word.textContent = "The cabinet does not close on an empty drawer.";
      word.className = "check-word wrong";
      return;
    }
    sha256hex(puzzle.answer_hashes.salt + canonicalArrangement())
      .then(function (hex) {
        if (hex === puzzle.answer_hashes.arrangement) {
          solved = true;
          word.textContent = "The cabinet closes with a small, satisfied click.";
          word.className = "check-word right";
          renderReveal();
        } else {
          word.textContent = "Quill regards the arrangement, and says nothing.";
          word.className = "check-word wrong";
        }
      });
  }

  /* ---------------- boot ---------------- */

  function bootEmpty() {
    $("frame").innerHTML = "<p class='board-note'>The shelf is up and the " +
      "drawers are labelled; the first arrangement is set out on Monday " +
      "morning. The Club asks the reader's patience until then.</p>";
    ["phials-panel", "ledger-panel", "reveal-panel"].forEach(function (id) {
      $(id).className = "panel hidden";
    });
    document.querySelector(".boardwrap").className = "boardwrap hidden";
  }

  function ordinal(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) { return n + "st"; }
    if (m10 === 2 && m100 !== 12) { return n + "nd"; }
    if (m10 === 3 && m100 !== 13) { return n + "rd"; }
    return n + "th";
  }

  function archiveNav(manifest, id) {
    var all = manifest.all.slice().reverse();      // oldest first
    var idx = all.indexOf(id);
    var bits = ["<p class='board-note archive'>Arrangement the " +
                ordinal(idx + 1) + "."];
    if (idx > 0) {
      bits.push(" <a href='?d=" + all[idx - 1].slice(6) + "'>&larr; earlier</a>");
    }
    if (idx < all.length - 1) {
      bits.push(" <a href='?d=" + all[idx + 1].slice(6) + "'>later &rarr;</a>");
    }
    bits.push("</p>");
    $("frame").innerHTML = bits.join("");
  }

  var params = new URLSearchParams(window.location.search);
  fetch("puzzles/manifest.json").then(function (r) { return r.json(); })
    .then(function (manifest) {
      if (!manifest.latest && !params.get("d")) { bootEmpty(); return null; }
      var id = params.get("d") ? "quill-" + params.get("d") : manifest.latest;
      return fetch("puzzles/" + id + ".json")
        .then(function (r) {
          if (!r.ok) { throw new Error("no such arrangement"); }
          return r.json();
        })
        .then(function (p) {
          puzzle = p;
          p.phials.forEach(function (ph) { phialsById[ph.id] = ph; });
          archiveNav(manifest, id);
          renderCards();
          renderLists();
          renderTray();
          renderBoard();
          $("check").addEventListener("click", check);
        });
    })
    .catch(function () {
      $("frame").innerHTML = "<p class='board-note'>The cabinet is locked " +
        "just now; call again presently.</p>";
    });
})();
