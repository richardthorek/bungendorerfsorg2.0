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
    signoutBtn: document.getElementById("signoutBtn"),
    navItems: Array.prototype.slice.call(document.querySelectorAll(".nav__item")),
    membersBody: document.getElementById("membersBody"),
    addMemberForm: document.getElementById("addMemberForm"),
    newEmail: document.getElementById("newEmail"),
    newName: document.getElementById("newName"),
    newPhone: document.getElementById("newPhone"),
    newRole: document.getElementById("newRole"),
    membersMsg: document.getElementById("membersMsg"),
    dutyDot: document.getElementById("dutyDot"),
    dutyState: document.getElementById("dutyState"),
    dutyNumber: document.getElementById("dutyNumber"),
    dutyMeta: document.getElementById("dutyMeta"),
    dutyForm: document.getElementById("dutyForm"),
    dutyInput: document.getElementById("dutyInput"),
    dutyName: document.getElementById("dutyName"),
    dutyMsg: document.getElementById("dutyMsg"),
    dutyContacts: document.getElementById("dutyContacts"),
    enqList: document.getElementById("enqList"),
    enqMsg: document.getElementById("enqMsg"),
    enqBadge: document.getElementById("enqBadge"),
    enqFilter: document.getElementById("enqFilter"),
  };

  const state = { me: null, enqFilter: "all", enquiries: [] };

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
        enterApp(r.data.member);
      }
    );
  });

  /* -------------------------------------------------------------- dashboard */

  function enterApp(me) {
    state.me = me;
    el.signinView.hidden = true;
    el.appView.hidden = false;
    el.whoami.textContent = me.email;
    el.navItems.forEach(function (b) {
      if (b.hasAttribute("data-admin")) b.hidden = me.role !== "admin";
    });
    switchView(currentViewFromHash() || "duty");
    if (currentViewFromHash() !== "enquiries") loadEnquiries(); // for the nav badge
  }

  function currentViewFromHash() {
    const h = (location.hash || "").replace("#", "");
    return ["duty", "enquiries", "events", "members"].indexOf(h) >= 0 ? h : null;
  }

  function switchView(name) {
    if (name === "members" && (!state.me || state.me.role !== "admin")) name = "duty";
    el.navItems.forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    ["duty", "enquiries", "events", "members"].forEach(function (v) {
      const section = document.getElementById("view-" + v);
      if (section) section.hidden = v !== name;
    });
    if (location.hash.replace("#", "") !== name) history.replaceState(null, "", "#" + name);
    if (name === "members") loadMembers();
    if (name === "duty") loadDuty();
    if (name === "events") loadAllContent();
    if (name === "enquiries") loadEnquiries();
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

  /* ------------------------------------------------------------- members UI */

  function loadMembers() {
    el.membersBody.innerHTML = "";
    const loading = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
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
    td.colSpan = 6;
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

    tr.appendChild(cell(m.phone || "—"));

    const roleCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "role-pill" + (m.role === "admin" ? " is-admin" : "");
    pill.textContent = m.role;
    roleCell.appendChild(pill);
    tr.appendChild(roleCell);

    tr.appendChild(cell(m.lastLoginAt ? relTime(m.lastLoginAt) : "never"));

    const actionCell = document.createElement("td");
    actionCell.className = "members-table__actions";

    const editBtn = document.createElement("button");
    editBtn.className = "row-edit";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      tr.replaceWith(memberEditRow(m));
    });
    actionCell.appendChild(editBtn);

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

  function memberEditRow(m) {
    const tr = document.createElement("tr");
    tr.className = "members-table__edit-row";

    tr.appendChild(cell(m.email));

    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = m.displayName || "";
    nameInput.setAttribute("aria-label", "Name");
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    const phoneTd = document.createElement("td");
    const phoneInput = document.createElement("input");
    phoneInput.type = "tel";
    phoneInput.value = m.phone || "";
    phoneInput.setAttribute("aria-label", "Mobile");
    phoneTd.appendChild(phoneInput);
    tr.appendChild(phoneTd);

    const roleTd = document.createElement("td");
    const roleSelect = document.createElement("select");
    roleSelect.setAttribute("aria-label", "Role");
    ["member", "admin"].forEach(function (r) {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r === "admin" ? "Admin" : "Member";
      if (m.role === r) opt.selected = true;
      roleSelect.appendChild(opt);
    });
    roleTd.appendChild(roleSelect);
    tr.appendChild(roleTd);

    tr.appendChild(cell(m.lastLoginAt ? relTime(m.lastLoginAt) : "never"));

    const actionCell = document.createElement("td");
    actionCell.className = "members-table__actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn--primary btn--small";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      setMsg(el.membersMsg, "");
      const body = {
        email: m.email,
        displayName: nameInput.value.trim(),
        phone: phoneInput.value.trim(),
        role: roleSelect.value === "admin" ? "admin" : "member",
      };
      api("/api/members", { method: "POST", body: body }).then(function (r) {
        if (!r) return;
        if (!r.ok) {
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          setMsg(el.membersMsg, (r.data && r.data.error) || "Could not save changes.", "err");
          return;
        }
        setMsg(el.membersMsg, "Saved " + body.email + ".", "ok");
        loadMembers();
      });
    });
    actionCell.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "row-remove";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function () {
      tr.replaceWith(memberRow(m));
    });
    actionCell.appendChild(cancelBtn);

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
      phone: el.newPhone.value.trim(),
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

  /* ----------------------------------------------------------------- enquiries */

  const ENQ_STATUS = ["new", "in-progress", "resolved"];
  const ENQ_LABEL = { new: "New", "in-progress": "In progress", resolved: "Resolved" };

  function loadEnquiries() {
    setMsg(el.enqMsg, "");
    api("/api/enquiries").then(function (r) {
      if (!r) return;
      if (!r.ok) {
        setMsg(el.enqMsg, (r.data && r.data.error) || "Could not load enquiries.", "err");
        return;
      }
      state.enquiries = (r.data && r.data.enquiries) || [];
      updateEnqBadge();
      renderEnquiries();
    });
  }

  function updateEnqBadge() {
    const n = state.enquiries.filter(function (e) {
      return e.status === "new";
    }).length;
    if (n > 0) {
      el.enqBadge.hidden = false;
      el.enqBadge.textContent = String(n);
    } else {
      el.enqBadge.hidden = true;
    }
  }

  function renderEnquiries() {
    el.enqList.innerHTML = "";
    const rows = state.enquiries.filter(function (e) {
      return state.enqFilter === "all" || e.status === state.enqFilter;
    });
    if (!rows.length) {
      const p = document.createElement("p");
      p.className = "editor__empty";
      p.textContent = "Nothing here.";
      el.enqList.appendChild(p);
      return;
    }
    rows.forEach(function (e) {
      el.enqList.appendChild(enquiryCard(e));
    });
  }

  function enquiryCard(e) {
    const box = document.createElement("details");
    box.className = "enq";
    if (e.status === "new") box.open = true;

    const sum = document.createElement("summary");
    sum.className = "enq__sum";
    const nm = document.createElement("span");
    nm.className = "enq__name";
    nm.textContent = e.name + (e.legacyRef ? "  #" + e.legacyRef : "");
    const when = document.createElement("span");
    when.className = "enq__when";
    when.textContent = e.receivedAt ? relTime(e.receivedAt) : "";
    const chip = document.createElement("span");
    chip.className = "enq__chip is-" + e.status;
    chip.textContent = ENQ_LABEL[e.status] || e.status;
    sum.appendChild(chip);
    sum.appendChild(nm);
    sum.appendChild(when);
    box.appendChild(sum);

    const body = document.createElement("div");
    body.className = "enq__body";

    const contact = document.createElement("p");
    contact.className = "enq__contact";
    if (e.email) {
      const a = document.createElement("a");
      a.href = "mailto:" + e.email;
      a.textContent = e.email;
      contact.appendChild(a);
    }
    if (e.phone) {
      contact.appendChild(document.createTextNode(e.email ? "  ·  " : ""));
      const a = document.createElement("a");
      a.href = "tel:" + e.phone.replace(/[^\d+]/g, "");
      a.textContent = e.phone;
      contact.appendChild(a);
    }
    body.appendChild(contact);

    const msg = document.createElement("div");
    msg.className = "enq__msg";
    msg.textContent = e.message;
    body.appendChild(msg);

    if (e.notes && e.notes.length) {
      const notes = document.createElement("ul");
      notes.className = "enq__notes";
      e.notes.forEach(function (n) {
        const li = document.createElement("li");
        const meta = document.createElement("span");
        meta.className = "enq__note-meta";
        meta.textContent = n.by + " · " + relTime(n.at);
        li.appendChild(meta);
        li.appendChild(document.createTextNode(" " + n.text));
        notes.appendChild(li);
      });
      body.appendChild(notes);
    }

    // actions
    const actions = document.createElement("div");
    actions.className = "enq__actions";
    ENQ_STATUS.forEach(function (st) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "enq__set" + (e.status === st ? " is-current" : "");
      b.textContent = ENQ_LABEL[st];
      b.disabled = e.status === st;
      b.addEventListener("click", function () {
        patchEnquiry(e.id, { status: st });
      });
      actions.appendChild(b);
    });
    if (state.me && state.me.role === "admin") {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "enq__del";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        if (window.confirm("Delete this enquiry permanently?")) deleteEnquiry(e.id);
      });
      actions.appendChild(del);
    }
    body.appendChild(actions);

    const noteForm = document.createElement("form");
    noteForm.className = "enq__noteform";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add a note…";
    input.className = "editor__input";
    const send = document.createElement("button");
    send.type = "submit";
    send.className = "btn btn--ghost";
    send.textContent = "Add note";
    noteForm.appendChild(input);
    noteForm.appendChild(send);
    noteForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const text = input.value.trim();
      if (text) patchEnquiry(e.id, { note: text });
    });
    body.appendChild(noteForm);

    box.appendChild(body);
    return box;
  }

  function patchEnquiry(id, patch) {
    setMsg(el.enqMsg, "");
    api("/api/enquiries/" + encodeURIComponent(id), { method: "PATCH", body: patch }).then(
      function (r) {
        if (!r) return;
        if (!r.ok) {
          setMsg(el.enqMsg, (r.data && r.data.error) || "Could not update.", "err");
          return;
        }
        const idx = state.enquiries.findIndex(function (x) {
          return x.id === id;
        });
        if (idx >= 0) state.enquiries[idx] = r.data.enquiry;
        updateEnqBadge();
        renderEnquiries();
      }
    );
  }

  function deleteEnquiry(id) {
    api("/api/enquiries/" + encodeURIComponent(id), { method: "DELETE", body: {} }).then(
      function (r) {
        if (!r) return;
        if (!r.ok) {
          setMsg(el.enqMsg, (r.data && r.data.error) || "Could not delete.", "err");
          return;
        }
        state.enquiries = state.enquiries.filter(function (x) {
          return x.id !== id;
        });
        updateEnqBadge();
        renderEnquiries();
      }
    );
  }

  el.enqFilter.addEventListener("click", function (e) {
    const btn = e.target.closest(".enq-filter__btn");
    if (!btn) return;
    state.enqFilter = btn.dataset.filter;
    Array.prototype.forEach.call(el.enqFilter.children, function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    renderEnquiries();
  });

  /* --------------------------------------------------------- brigade phone UI */

  function loadDuty() {
    api("/api/duty/status").then(function (r) {
      if (!r) return;
      if (!r.ok) {
        el.dutyState.textContent = r.data.error || "Could not load the brigade phone.";
        return;
      }
      renderDuty(r.data);
    });
  }

  function renderDuty(d) {
    const has = !!d.number;
    el.dutyDot.className = "duty-dot " + (has ? "is-ok" : "is-warn");
    el.dutyState.textContent = has
      ? d.label
        ? d.label + "’s phone"
        : "Brigade phone active"
      : "No number set";
    el.dutyNumber.textContent = d.number || "—";
    el.dutyMeta.textContent = has
      ? "Set " +
        (d.setAt ? relTime(d.setAt) : "—") +
        (d.setByName || d.setBy ? " by " + (d.setByName || d.setBy) : "") +
        (d.method === "sms" ? " by text" : "")
      : "Calls fall through to the Twilio backup number.";

    el.dutyContacts.innerHTML = "";
    const rows = d.contacts || [];
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "duty-contacts__empty";
      li.textContent = "No previous numbers yet.";
      el.dutyContacts.appendChild(li);
      return;
    }
    rows.forEach(function (c) {
      const li = document.createElement("li");
      const info = document.createElement("span");
      info.className = "duty-contacts__info";
      const nm = document.createElement("strong");
      nm.textContent = c.label || c.number;
      const num = document.createElement("span");
      num.className = "duty-contacts__num";
      num.textContent = c.label ? c.number : "";
      info.appendChild(nm);
      info.appendChild(num);
      const set = document.createElement("button");
      set.type = "button";
      set.className = "btn btn--ghost duty-contacts__set";
      set.textContent = "Set";
      set.addEventListener("click", function () {
        submitDuty({ number: c.number, label: c.label }, set);
      });
      li.appendChild(info);
      li.appendChild(set);
      el.dutyContacts.appendChild(li);
    });
  }

  function submitDuty(body, btn) {
    setMsg(el.dutyMsg, "");
    if (btn) btn.disabled = true;
    api("/api/duty", { method: "POST", body: body }).then(function (r) {
      if (btn) btn.disabled = false;
      if (!r) return;
      if (!r.ok) {
        setMsg(el.dutyMsg, (r.data && r.data.error) || "Could not set the number.", "err");
        return;
      }
      setMsg(
        el.dutyMsg,
        "Brigade phone is now " + (r.data.label ? r.data.label + " — " : "") + r.data.number + ".",
        "ok"
      );
      el.dutyForm.reset();
      loadDuty();
    });
  }

  el.dutyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const number = el.dutyInput.value.trim();
    if (!number) {
      setMsg(el.dutyMsg, "Enter a phone number.", "err");
      return;
    }
    submitDuty(
      { number: number, label: el.dutyName.value.trim() },
      el.dutyForm.querySelector("button")
    );
  });

  /* --------------------------------------------------------- events + training */

  const ORDINALS = ["every", "first", "second", "third", "fourth", "last"];
  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  const CONTENT = {
    events: {
      list: document.getElementById("eventList"),
      meta: document.getElementById("eventMeta"),
      msg: document.getElementById("eventMsg"),
      fields: [
        { key: "name", placeholder: "Event name", type: "text" },
        { key: "timing", placeholder: "Timing, e.g. Date TBC", type: "text" },
        { key: "description", placeholder: "Short description", type: "textarea" },
      ],
    },
    training: {
      list: document.getElementById("trainList"),
      meta: document.getElementById("trainMeta"),
      msg: document.getElementById("trainMsg"),
      fields: [
        { key: "title", placeholder: "Session title", type: "text" },
        { key: "recurrence", type: "recurrence" },
        { key: "time", placeholder: "Time, e.g. 7:00 PM – 8:00 PM", type: "text" },
        { key: "location", placeholder: "Location", type: "text" },
      ],
    },
  };

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Next occurrence of a "<ordinal>-<weekday>" rule — mirrors calendar.js so the
  // editor shows the same date the public Membership page will.
  function isoWeekday(d) {
    return d.getDay() === 0 ? 7 : d.getDay();
  }
  function nthWeekday(year, month1, weekday, ordinal) {
    if (ordinal === -1) {
      const d = new Date(year, month1, 0);
      while (isoWeekday(d) !== weekday) d.setDate(d.getDate() - 1);
      return d;
    }
    const d = new Date(year, month1 - 1, 1);
    let count = 0;
    while (d.getMonth() === month1 - 1) {
      if (isoWeekday(d) === weekday && ++count === ordinal) return new Date(d);
      d.setDate(d.getDate() + 1);
    }
    return null;
  }
  function nextRecurrenceDate(ordName, dayName) {
    const weekday = WEEKDAYS.indexOf(dayName) + 1;
    if (!weekday) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (ordName === "every") {
      const d = new Date(today);
      while (isoWeekday(d) !== weekday) d.setDate(d.getDate() + 1);
      return d;
    }
    const ords = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };
    const ordinal = ords[ordName];
    if (!ordinal) return null;
    let cand = nthWeekday(today.getFullYear(), today.getMonth() + 1, weekday, ordinal);
    if (!cand || cand < today) {
      const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      cand = nthWeekday(nm.getFullYear(), nm.getMonth() + 1, weekday, ordinal);
    }
    return cand;
  }
  function fmtNext(d) {
    return d
      ? "next " +
          d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
      : "";
  }

  function makeField(field, value) {
    if (field.type === "recurrence") {
      const wrap = document.createElement("div");
      wrap.className = "recur";
      const parts = String(value || "every-friday").split("-");
      const ord = document.createElement("select");
      ord.className = "recur__ord";
      ORDINALS.forEach(function (o) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o === "every" ? "Every" : cap(o);
        if (o === parts[0]) opt.selected = true;
        ord.appendChild(opt);
      });
      const day = document.createElement("select");
      day.className = "recur__day";
      WEEKDAYS.forEach(function (d) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = cap(d);
        if (d === parts[1]) opt.selected = true;
        day.appendChild(opt);
      });
      const next = document.createElement("span");
      next.className = "recur__next";
      const refresh = function () {
        next.textContent = fmtNext(nextRecurrenceDate(ord.value, day.value));
      };
      ord.addEventListener("change", refresh);
      day.addEventListener("change", refresh);
      refresh();
      wrap.appendChild(ord);
      wrap.appendChild(day);
      wrap.appendChild(next);
      return wrap;
    }
    const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
    if (field.type !== "textarea") input.type = "text";
    input.className = "editor__input";
    input.placeholder = field.placeholder || "";
    input.value = value || "";
    input.dataset.key = field.key;
    return input;
  }

  function contentRow(key, data) {
    const cfg = CONTENT[key];
    const row = document.createElement("div");
    row.className = "editor__row";
    cfg.fields.forEach(function (field) {
      const el2 = makeField(field, data ? data[field.key] : "");
      el2.dataset.field = field.key;
      row.appendChild(el2);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "row-remove";
    del.textContent = "Remove";
    del.addEventListener("click", function () {
      row.remove();
    });
    row.appendChild(del);
    return row;
  }

  function renderContent(key, items) {
    const cfg = CONTENT[key];
    cfg.list.innerHTML = "";
    (items || []).forEach(function (it) {
      cfg.list.appendChild(contentRow(key, it));
    });
    if (!items || !items.length) {
      const empty = document.createElement("p");
      empty.className = "editor__empty";
      empty.textContent = "Nothing listed. Add an entry below.";
      cfg.list.appendChild(empty);
    }
  }

  function collectContent(key) {
    const cfg = CONTENT[key];
    const rows = Array.prototype.slice.call(cfg.list.querySelectorAll(".editor__row"));
    return rows.map(function (row) {
      const obj = {};
      cfg.fields.forEach(function (field) {
        const holder = row.querySelector(`[data-field="${field.key}"]`);
        if (field.type === "recurrence") {
          obj[field.key] =
            holder.querySelector(".recur__ord").value +
            "-" +
            holder.querySelector(".recur__day").value;
        } else {
          obj[field.key] = holder.value.trim();
        }
      });
      return obj;
    });
  }

  function loadContent(key) {
    const cfg = CONTENT[key];
    setMsg(cfg.msg, "");
    api("/api/content/" + key).then(function (r) {
      if (!r) return;
      if (!r.ok) {
        setMsg(cfg.msg, (r.data && r.data.error) || "Could not load this list.", "err");
        return;
      }
      renderContent(key, Array.isArray(r.data) ? r.data : []);
    });
  }

  function loadAllContent() {
    loadContent("events");
    loadContent("training");
  }

  function saveContent(key, btn) {
    const cfg = CONTENT[key];
    setMsg(cfg.msg, "");
    btn.disabled = true;
    api("/api/content/" + key, { method: "PUT", body: { items: collectContent(key) } }).then(
      function (r) {
        btn.disabled = false;
        if (!r) return;
        if (!r.ok) {
          setMsg(cfg.msg, (r.data && r.data.error) || "Could not save.", "err");
          return;
        }
        setMsg(cfg.msg, "Saved. Live within a few minutes.", "ok");
        cfg.meta.textContent = "Updated just now by you";
        renderContent(key, r.data.items);
      }
    );
  }

  document.getElementById("eventAdd").addEventListener("click", function () {
    const empty = CONTENT.events.list.querySelector(".editor__empty");
    if (empty) empty.remove();
    CONTENT.events.list.appendChild(contentRow("events", null));
  });
  document.getElementById("trainAdd").addEventListener("click", function () {
    const empty = CONTENT.training.list.querySelector(".editor__empty");
    if (empty) empty.remove();
    CONTENT.training.list.appendChild(contentRow("training", null));
  });
  document.getElementById("eventSave").addEventListener("click", function (e) {
    saveContent("events", e.currentTarget);
  });
  document.getElementById("trainSave").addEventListener("click", function (e) {
    saveContent("training", e.currentTarget);
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
      enterApp({ email: r.data.email, name: r.data.name, role: r.data.role });
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
