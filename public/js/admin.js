/**
 * Bungendore RFS members' area — sign-in + dashboard shell.
 * Plain ES6, no framework. All sensitive data comes from guarded APIs;
 * this script only decides which view to show.
 */

(function () {
  "use strict";

  const CSRF = { "Content-Type": "application/json", "X-BRFS-Auth": "1" };

  const el = {
    signinView: document.getElementById("signinView"),
    appView: document.getElementById("appView"),
    requestForm: document.getElementById("requestForm"),
    verifyForm: document.getElementById("verifyForm"),
    email: document.getElementById("email"),
    code: document.getElementById("code"),
    requestBtn: document.getElementById("requestBtn"),
    verifyBtn: document.getElementById("verifyBtn"),
    restartBtn: document.getElementById("restartBtn"),
    verifyEmailLabel: document.getElementById("verifyEmailLabel"),
    signinMsg: document.getElementById("signinMsg"),
    whoami: document.getElementById("whoami"),
    sessionTimer: document.getElementById("sessionTimer"),
    signoutBtn: document.getElementById("signoutBtn"),
    navItems: Array.prototype.slice.call(document.querySelectorAll(".nav__item")),
    membersBody: document.getElementById("membersBody"),
    addMemberForm: document.getElementById("addMemberForm"),
    newEmail: document.getElementById("newEmail"),
    newName: document.getElementById("newName"),
    newRole: document.getElementById("newRole"),
    membersMsg: document.getElementById("membersMsg"),
  };

  const state = { me: null, expiresAt: null, timer: null };

  /* ---------------------------------------------------------------- helpers */

  function api(path, options) {
    options = options || {};
    return fetch(path, {
      method: options.method || "GET",
      headers: options.body ? CSRF : { "X-BRFS-Auth": "1" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    }).then(function (res) {
      if (res.status === 401 && state.me) {
        // session ended mid-use
        return showSignin("Your session ended. Please sign in again.");
      }
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
    });
  }

  function setMsg(node, text, kind) {
    if (!text) {
      node.hidden = true;
      node.textContent = "";
      return;
    }
    node.hidden = false;
    node.textContent = text;
    node.className = "msg" + (kind ? " is-" + kind : "");
  }

  function busy(btn, on) {
    btn.disabled = on;
  }

  /* ---------------------------------------------------------------- sign-in */

  function showSignin(message) {
    stopTimer();
    state.me = null;
    el.appView.hidden = true;
    el.signinView.hidden = false;
    el.verifyForm.hidden = true;
    el.requestForm.hidden = false;
    el.requestForm.reset();
    el.verifyForm.reset();
    setMsg(el.signinMsg, message || "", message ? "err" : null);
  }

  el.requestForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = el.email.value.trim().toLowerCase();
    setMsg(el.signinMsg, "");
    busy(el.requestBtn, true);
    api("/api/auth/request", { method: "POST", body: { email: email } }).then(function (r) {
      busy(el.requestBtn, false);
      if (!r) return;
      if (r.status === 429) {
        setMsg(el.signinMsg, r.data.error || "Too many requests. Try again shortly.", "err");
        return;
      }
      if (!r.ok) {
        setMsg(el.signinMsg, r.data.error || "Could not send a code.", "err");
        return;
      }
      el.verifyEmailLabel.textContent = email;
      el.requestForm.hidden = true;
      el.verifyForm.hidden = false;
      setMsg(el.signinMsg, "If " + email + " is a brigade member, a code is on its way.", "ok");
      el.code.focus();
    });
  });

  el.restartBtn.addEventListener("click", function () {
    el.verifyForm.hidden = true;
    el.requestForm.hidden = false;
    setMsg(el.signinMsg, "");
    el.email.focus();
  });

  el.verifyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = el.verifyEmailLabel.textContent;
    const code = el.code.value.trim();
    if (!/^\d{6}$/.test(code)) {
      setMsg(el.signinMsg, "Enter the 6-digit code from the email.", "err");
      return;
    }
    setMsg(el.signinMsg, "");
    busy(el.verifyBtn, true);
    api("/api/auth/verify", { method: "POST", body: { email: email, code: code } }).then(
      function (r) {
        busy(el.verifyBtn, false);
        if (!r) return;
        if (!r.ok) {
          setMsg(el.signinMsg, r.data.error || "That code didn't work.", "err");
          return;
        }
        enterApp(r.data.member, r.data.expiresInMinutes);
      }
    );
  });

  /* -------------------------------------------------------------- dashboard */

  function enterApp(me, expiresInMinutes) {
    state.me = me;
    if (expiresInMinutes) {
      state.expiresAt = Date.now() + expiresInMinutes * 60000;
    }
    el.signinView.hidden = true;
    el.appView.hidden = false;
    el.whoami.textContent = me.email;
    el.navItems.forEach(function (b) {
      if (b.dataset.admin) b.hidden = me.role !== "admin";
    });
    startTimer();
    switchView(currentViewFromHash() || "duty");
  }

  function currentViewFromHash() {
    const h = (location.hash || "").replace("#", "");
    return ["duty", "events", "members"].indexOf(h) >= 0 ? h : null;
  }

  function switchView(name) {
    if (name === "members" && (!state.me || state.me.role !== "admin")) name = "duty";
    el.navItems.forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    ["duty", "events", "members"].forEach(function (v) {
      const section = document.getElementById("view-" + v);
      if (section) section.hidden = v !== name;
    });
    if (location.hash.replace("#", "") !== name) history.replaceState(null, "", "#" + name);
    if (name === "members") loadMembers();
  }

  el.navItems.forEach(function (b) {
    b.addEventListener("click", function () {
      switchView(b.dataset.view);
    });
  });

  el.signoutBtn.addEventListener("click", function () {
    api("/api/auth/logout", { method: "POST", body: {} }).then(function () {
      showSignin("Signed out.");
    });
  });

  /* --------------------------------------------------------- session timer */

  function startTimer() {
    stopTimer();
    if (!state.expiresAt) {
      el.sessionTimer.textContent = "";
      return;
    }
    tick();
    state.timer = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }
  function tick() {
    const left = Math.round((state.expiresAt - Date.now()) / 1000);
    if (left <= 0) {
      stopTimer();
      showSignin("Your 1-hour session has expired. Please sign in again.");
      return;
    }
    const m = Math.floor(left / 60);
    const s = left % 60;
    el.sessionTimer.textContent = m + ":" + (s < 10 ? "0" : "") + s + " left";
    el.sessionTimer.classList.toggle("is-low", left < 300);
  }

  /* ------------------------------------------------------------- members UI */

  function loadMembers() {
    el.membersBody.innerHTML = "";
    const loading = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "members-table__empty";
    td.textContent = "Loading…";
    loading.appendChild(td);
    el.membersBody.appendChild(loading);

    api("/api/members").then(function (r) {
      if (!r) return;
      if (!r.ok) {
        renderMembersError(r.data.error || "Could not load the member list.");
        return;
      }
      renderMembers(r.data.members || []);
    });
  }

  function renderMembersError(text) {
    el.membersBody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "members-table__empty";
    td.textContent = text;
    tr.appendChild(td);
    el.membersBody.appendChild(tr);
  }

  function renderMembers(members) {
    el.membersBody.innerHTML = "";
    if (!members.length) {
      renderMembersError("No members yet.");
      return;
    }
    members.forEach(function (m) {
      el.membersBody.appendChild(memberRow(m));
    });
  }

  function memberRow(m) {
    const tr = document.createElement("tr");
    const isSelf = state.me && m.email === state.me.email;

    tr.appendChild(cell(m.email));

    const nameCell = cell(m.displayName || "—");
    if (isSelf) {
      const you = document.createElement("span");
      you.className = "you-tag";
      you.textContent = "you";
      nameCell.appendChild(you);
    }
    tr.appendChild(nameCell);

    const roleCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "role-pill" + (m.role === "admin" ? " is-admin" : "");
    pill.textContent = m.role;
    roleCell.appendChild(pill);
    tr.appendChild(roleCell);

    tr.appendChild(cell(m.lastLoginAt ? relTime(m.lastLoginAt) : "never"));

    const actionCell = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "row-remove";
    btn.type = "button";
    btn.textContent = "Remove";
    btn.addEventListener("click", function () {
      removeMember(m, btn);
    });
    actionCell.appendChild(btn);
    tr.appendChild(actionCell);

    return tr;
  }

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function removeMember(m, btn) {
    const label = m.displayName ? m.displayName + " (" + m.email + ")" : m.email;
    if (!window.confirm("Remove " + label + "? Any active session ends immediately.")) return;
    btn.disabled = true;
    setMsg(el.membersMsg, "");
    api("/api/members/" + encodeURIComponent(m.email), { method: "DELETE" }).then(function (r) {
      if (!r) return;
      if (!r.ok) {
        btn.disabled = false;
        setMsg(el.membersMsg, r.data.error || "Could not remove that member.", "err");
        return;
      }
      setMsg(el.membersMsg, "Removed " + m.email + ".", "ok");
      loadMembers();
    });
  }

  el.addMemberForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const body = {
      email: el.newEmail.value.trim().toLowerCase(),
      displayName: el.newName.value.trim(),
      role: el.newRole.value === "admin" ? "admin" : "member",
    };
    setMsg(el.membersMsg, "");
    api("/api/members", { method: "POST", body: body }).then(function (r) {
      if (!r) return;
      if (!r.ok) {
        setMsg(el.membersMsg, r.data.error || "Could not add that member.", "err");
        return;
      }
      setMsg(el.membersMsg, "Saved " + body.email + ".", "ok");
      el.addMemberForm.reset();
      loadMembers();
    });
  });

  /* --------------------------------------------------------------- utility */

  function relTime(iso) {
    const then = Date.parse(iso);
    if (!then) return "—";
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + " h ago";
    const days = Math.round(hrs / 24);
    if (days < 30) return days + " d ago";
    return new Date(then).toLocaleDateString();
  }

  /* ----------------------------------------------------------------- start */

  api("/api/auth/me").then(function (r) {
    if (r && r.ok) {
      const mins = r.data.expiresAt
        ? Math.max(0, Math.round((Date.parse(r.data.expiresAt) - Date.now()) / 60000))
        : null;
      enterApp({ email: r.data.email, name: r.data.name, role: r.data.role }, mins);
    } else {
      showSignin();
      el.email.focus();
    }
  });

  window.addEventListener("hashchange", function () {
    if (!state.me) return;
    const v = currentViewFromHash();
    if (v) switchView(v);
  });
})();
