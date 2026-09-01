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
    socialTemplates: document.getElementById("socialTemplates"),
    socialCanvas: document.getElementById("socialCanvas"),
    socialLayerPanel: document.getElementById("socialLayerPanel"),
    socialExport: document.getElementById("socialExport"),
    socialCanvasMeta: document.getElementById("socialCanvasMeta"),
    socialStarters: document.getElementById("socialStarters"),
    socialChat: document.getElementById("socialChat"),
    socialAiMsg: document.getElementById("socialAiMsg"),
    socialAttachPreview: document.getElementById("socialAttachPreview"),
    socialAttachThumb: document.getElementById("socialAttachThumb"),
    socialAttachRemove: document.getElementById("socialAttachRemove"),
    socialChatForm: document.getElementById("socialChatForm"),
    socialChatInput: document.getElementById("socialChatInput"),
    socialAttachBtn: document.getElementById("socialAttachBtn"),
    socialAttachInput: document.getElementById("socialAttachInput"),
    socialChatSend: document.getElementById("socialChatSend"),
    socialDraftEmpty: document.getElementById("socialDraftEmpty"),
    socialAiResult: document.getElementById("socialAiResult"),
    socialFlags: document.getElementById("socialFlags"),
    socialHeadlineOut: document.getElementById("socialHeadlineOut"),
    socialCaptionOut: document.getElementById("socialCaptionOut"),
    socialHashtagsOut: document.getElementById("socialHashtagsOut"),
    socialUseHeadline: document.getElementById("socialUseHeadline"),
    socialReviewGate: document.getElementById("socialReviewGate"),
    socialReviewCheck: document.getElementById("socialReviewCheck"),
    socialCopyCaption: document.getElementById("socialCopyCaption"),
    socialPromptCfg: document.getElementById("socialPromptCfg"),
    socialPromptText: document.getElementById("socialPromptText"),
    socialPromptSave: document.getElementById("socialPromptSave"),
    socialPromptReset: document.getElementById("socialPromptReset"),
    socialPromptMeta: document.getElementById("socialPromptMeta"),
    socialPromptMsg: document.getElementById("socialPromptMsg"),
    clarityRefresh: document.getElementById("clarityRefresh"),
    clarityMsg: document.getElementById("clarityMsg"),
    clarityBody: document.getElementById("clarityBody"),
    clarityMeta: document.getElementById("clarityMeta"),
    clarityStats: document.getElementById("clarityStats"),
    clarityPages: document.getElementById("clarityPages"),
    claritySignals: document.getElementById("claritySignals"),
    clarityHistory: document.getElementById("clarityHistory"),
    alertBannerMessage: document.getElementById("alertBannerMessage"),
    alertBannerSeverity: document.getElementById("alertBannerSeverity"),
    alertBannerCount: document.getElementById("alertBannerCount"),
    alertBannerMeta: document.getElementById("alertBannerMeta"),
    alertBannerSave: document.getElementById("alertBannerSave"),
    alertBannerClear: document.getElementById("alertBannerClear"),
    alertBannerMsg: document.getElementById("alertBannerMsg"),
    cardList: document.getElementById("cardList"),
    cardAdd: document.getElementById("cardAdd"),
    cardSave: document.getElementById("cardSave"),
    cardMeta: document.getElementById("cardMeta"),
    cardMsg: document.getElementById("cardMsg"),
  };

  const state = {
    me: null,
    enqFilter: "all",
    enquiries: [],
    socialDraft: null,
    socialMessages: [],
    socialDefaultPrompt: "",
  };

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
    resetSocialSession();
    el.appView.hidden = true;
    el.signinView.hidden = false;
    el.verifyForm.hidden = true;
    el.requestForm.hidden = false;
    el.requestForm.reset();
    el.verifyForm.reset();
    setMsg(el.signinMsg, message || "", message ? "err" : null);
  }

  /**
   * Wipe per-user Social Studio state on sign-out so the next person on a
   * shared station device can't see — or unknowingly re-send — the previous
   * user's draft chat. Keeps `social.started` true: the one-time event wiring
   * in initSocialStudio stays bound and must not be double-added.
   */
  function resetSocialSession() {
    state.socialMessages = [];
    state.socialDraft = null;
    social.pendingImage = null;
    if (el.socialChat) el.socialChat.innerHTML = "";
    if (el.socialAiResult) el.socialAiResult.hidden = true;
    if (el.socialDraftEmpty) el.socialDraftEmpty.hidden = false;
    if (el.socialAttachPreview) el.socialAttachPreview.hidden = true;
    if (el.socialAttachThumb) el.socialAttachThumb.src = "";
    if (el.socialAttachInput) el.socialAttachInput.value = "";
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

  // The code email prints the digits with a gap for readability, so a paste
  // can arrive as "123 456" (or with thin spaces). Keep only the digits, and
  // don't let a longer paste be rejected before we've stripped it.
  el.code.addEventListener("input", function () {
    const digits = el.code.value.replace(/\D/g, "").slice(0, 6);
    if (digits !== el.code.value) el.code.value = digits;
  });

  el.verifyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = el.verifyEmailLabel.textContent;
    const code = el.code.value.replace(/\D/g, "");
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
    Array.prototype.forEach.call(document.querySelectorAll("[data-admin]"), function (n) {
      n.hidden = me.role !== "admin";
    });
    switchView(currentViewFromHash() || "duty");
    if (currentViewFromHash() !== "enquiries") loadEnquiries(); // for the nav badge
  }

  const VIEWS = [
    "duty",
    "alertBanner",
    "enquiries",
    "events",
    "awarenessCards",
    "social",
    "analytics",
    "members",
  ];

  function currentViewFromHash() {
    const h = (location.hash || "").replace("#", "");
    return VIEWS.indexOf(h) >= 0 ? h : null;
  }

  function switchView(name) {
    if (name === "members" && (!state.me || state.me.role !== "admin")) name = "duty";
    el.navItems.forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === name);
    });
    VIEWS.forEach(function (v) {
      const section = document.getElementById("view-" + v);
      if (section) section.hidden = v !== name;
    });
    if (location.hash.replace("#", "") !== name) history.replaceState(null, "", "#" + name);
    if (name === "members") loadMembers();
    if (name === "duty") loadDuty();
    if (name === "alertBanner") loadAlertBanner();
    if (name === "events") loadAllContent();
    if (name === "awarenessCards") loadAwarenessCards();
    if (name === "enquiries") loadEnquiries();
    if (name === "social") initSocialStudio();
    if (name === "analytics") loadClarity();
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
        { key: "timing", placeholder: "Timing, e.g. Saturday 14 March, 10am", type: "text" },
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

  /* -------------------------------------------------------- awareness cards */
  // Homepage Prepare/Membership/Events carousel (roadmap Bet 1 narrowing).
  // Mirrored client-side icon allow-list — keep in sync with
  // api/shared/contentSchema.js's AWARENESS_ICONS; it's the server's source
  // of truth and re-validates regardless of what this picker offers.
  const CARD_ICONS = [
    "fa-shield-alt",
    "fa-fire",
    "fa-fire-alt",
    "fa-door-open",
    "fa-clock",
    "fa-clipboard-list",
    "fa-exclamation-triangle",
    "fa-triangle-exclamation",
    "fa-map-marked-alt",
    "fa-map-pin",
    "fa-route",
    "fa-paw",
    "fa-dog",
    "fa-horse",
    "fa-users",
    "fa-user-plus",
    "fa-handshake",
    "fa-hand-holding-heart",
    "fa-home",
    "fa-warehouse",
    "fa-truck",
    "fa-hard-hat",
    "fa-tint",
    "fa-wind",
    "fa-sun",
    "fa-cloud-rain",
    "fa-radio",
    "fa-phone",
    "fa-envelope",
    "fa-calendar-alt",
    "fa-calendar-check",
    "fa-graduation-cap",
    "fa-book",
    "fa-pen",
    "fa-file-signature",
    "fa-check-circle",
    "fa-campground",
    "fa-tree",
    "fa-seedling",
    "fa-first-aid",
    "fa-heartbeat",
    "fa-bullhorn",
    "fa-star",
    "fa-circle-info",
    "fa-image",
  ];
  const CARD_PILLARS = ["prepare", "membership", "events"];
  const cardState = { cards: [] };

  function newCard() {
    return {
      pillar: "prepare",
      icon: "fa-circle-info",
      title: "",
      body: "",
      photo: "",
      caution: false,
      eventDate: "",
      active: true,
    };
  }

  /** Downscale to a small max edge before storing — these render at well
   * under 320px in every carousel layout, and the whole card set has to fit
   * in one Table Storage string property (see contentSchema.js). */
  function resizeImageForCard(file, cb, onErr) {
    const fail = typeof onErr === "function" ? onErr : function () {};
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = function () {
      const img = new Image();
      img.onerror = fail;
      img.onload = function () {
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(c.toDataURL("image/jpeg", 0.6));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function buildIconPicker(card, iconPreviewEl) {
    const wrap = document.createElement("div");
    wrap.className = "icon-picker";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "icon-picker__trigger";
    trigger.innerHTML =
      "<i class=\"fas " + card.icon + "\" aria-hidden=\"true\"></i><span>Change icon</span>";
    const grid = document.createElement("div");
    grid.className = "icon-picker__grid";
    grid.hidden = true;
    CARD_ICONS.forEach(function (icon) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-picker__opt" + (icon === card.icon ? " is-selected" : "");
      btn.innerHTML = "<i class=\"fas " + icon + "\" aria-hidden=\"true\"></i>";
      btn.title = icon.replace("fa-", "");
      btn.addEventListener("click", function () {
        card.icon = icon;
        iconPreviewEl.className = "fas " + icon;
        trigger.querySelector("i").className = "fas " + icon;
        grid.querySelectorAll(".icon-picker__opt").forEach(function (o) {
          o.classList.toggle("is-selected", o === btn);
        });
        grid.hidden = true;
      });
      grid.appendChild(btn);
    });
    trigger.addEventListener("click", function () {
      grid.hidden = !grid.hidden;
    });
    wrap.appendChild(trigger);
    wrap.appendChild(grid);
    return wrap;
  }

  function cardRowEl(card, index) {
    const row = document.createElement("div");
    row.className = "card-editor__row";

    const head = document.createElement("div");
    head.className = "card-editor__row-head";

    const iconPreview = document.createElement("i");
    iconPreview.className = "fas " + card.icon + " card-editor__icon-preview";
    head.appendChild(iconPreview);

    const pillarSelect = document.createElement("select");
    pillarSelect.className = "editor__input card-editor__pillar";
    CARD_PILLARS.forEach(function (p) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = cap(p);
      if (p === card.pillar) opt.selected = true;
      pillarSelect.appendChild(opt);
    });
    pillarSelect.addEventListener("change", function () {
      card.pillar = pillarSelect.value;
    });
    head.appendChild(pillarSelect);

    const spacer = document.createElement("span");
    spacer.className = "card-editor__spacer";
    head.appendChild(spacer);

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "icon-btn";
    upBtn.setAttribute("aria-label", "Move card up");
    upBtn.innerHTML = "<i class=\"fas fa-arrow-up\" aria-hidden=\"true\"></i>";
    upBtn.addEventListener("click", function () {
      if (index === 0) return;
      const tmp = cardState.cards[index - 1];
      cardState.cards[index - 1] = cardState.cards[index];
      cardState.cards[index] = tmp;
      renderCardList();
    });
    head.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "icon-btn";
    downBtn.setAttribute("aria-label", "Move card down");
    downBtn.innerHTML = "<i class=\"fas fa-arrow-down\" aria-hidden=\"true\"></i>";
    downBtn.addEventListener("click", function () {
      if (index === cardState.cards.length - 1) return;
      const tmp = cardState.cards[index + 1];
      cardState.cards[index + 1] = cardState.cards[index];
      cardState.cards[index] = tmp;
      renderCardList();
    });
    head.appendChild(downBtn);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "row-remove";
    del.textContent = "Remove";
    del.addEventListener("click", function () {
      cardState.cards.splice(index, 1);
      renderCardList();
    });
    head.appendChild(del);

    row.appendChild(head);
    row.appendChild(buildIconPicker(card, iconPreview));

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "editor__input";
    titleInput.placeholder = "Card title";
    titleInput.maxLength = 120;
    titleInput.value = card.title || "";
    titleInput.addEventListener("input", function () {
      card.title = titleInput.value;
    });
    row.appendChild(titleInput);

    const bodyInput = document.createElement("textarea");
    bodyInput.className = "editor__input";
    bodyInput.rows = 4;
    bodyInput.maxLength = 2000;
    bodyInput.placeholder = "Body — plain text, or markdown for bullet lists / bold / links";
    bodyInput.value = card.body || "";
    bodyInput.addEventListener("input", function () {
      card.body = bodyInput.value;
    });
    row.appendChild(bodyInput);

    // Photo: shows the current photo (uploaded data: URL or a bundled
    // /Images/ path) with a swap/remove control, matching the resize+compress
    // pattern already used for Social Studio's chat attachment.
    const photoWrap = document.createElement("div");
    photoWrap.className = "card-editor__photo";
    const photoThumb = document.createElement("img");
    photoThumb.className = "card-editor__photo-thumb";
    photoThumb.hidden = !card.photo;
    if (card.photo) photoThumb.src = card.photo;
    const photoInput = document.createElement("input");
    photoInput.type = "file";
    photoInput.accept = "image/*";
    photoInput.className = "sr-only";
    const photoLabel = document.createElement("label");
    photoLabel.className = "btn btn--ghost";
    photoLabel.textContent = card.photo ? "Change photo" : "Add photo";
    photoLabel.appendChild(photoInput);
    const photoRemove = document.createElement("button");
    photoRemove.type = "button";
    photoRemove.className = "row-remove";
    photoRemove.textContent = "Remove photo";
    photoRemove.hidden = !card.photo;
    photoInput.addEventListener("change", function () {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setMsg(el.cardMsg, "That photo is too large (max 8MB).", "err");
        photoInput.value = "";
        return;
      }
      resizeImageForCard(
        file,
        function (dataUrl) {
          card.photo = dataUrl;
          photoThumb.src = dataUrl;
          photoThumb.hidden = false;
          photoRemove.hidden = false;
          photoLabel.textContent = "Change photo";
        },
        function () {
          setMsg(el.cardMsg, "That photo couldn't be read. Try a different image.", "err");
        }
      );
    });
    photoRemove.addEventListener("click", function () {
      card.photo = "";
      photoInput.value = "";
      photoThumb.hidden = true;
      photoRemove.hidden = true;
      photoLabel.textContent = "Add photo";
    });
    photoWrap.appendChild(photoThumb);
    photoWrap.appendChild(photoLabel);
    photoWrap.appendChild(photoRemove);
    row.appendChild(photoWrap);

    const metaRow = document.createElement("div");
    metaRow.className = "card-editor__meta-row";

    const cautionLabel = document.createElement("label");
    cautionLabel.className = "card-editor__check";
    const cautionInput = document.createElement("input");
    cautionInput.type = "checkbox";
    cautionInput.checked = !!card.caution;
    cautionInput.addEventListener("change", function () {
      card.caution = cautionInput.checked;
    });
    cautionLabel.appendChild(cautionInput);
    cautionLabel.appendChild(
      document.createTextNode(" Show as caution (amber, last-resort style)")
    );
    metaRow.appendChild(cautionLabel);

    const activeLabel = document.createElement("label");
    activeLabel.className = "card-editor__check";
    const activeInput = document.createElement("input");
    activeInput.type = "checkbox";
    activeInput.checked = card.active !== false;
    activeInput.addEventListener("change", function () {
      card.active = activeInput.checked;
    });
    activeLabel.appendChild(activeInput);
    activeLabel.appendChild(document.createTextNode(" Active"));
    metaRow.appendChild(activeLabel);

    row.appendChild(metaRow);
    return row;
  }

  function renderCardList() {
    el.cardList.innerHTML = "";
    if (!cardState.cards.length) {
      const empty = document.createElement("p");
      empty.className = "editor__empty";
      empty.textContent = "No cards yet. Add one below.";
      el.cardList.appendChild(empty);
      return;
    }
    cardState.cards.forEach(function (card, i) {
      el.cardList.appendChild(cardRowEl(card, i));
    });
  }

  function loadAwarenessCards() {
    setMsg(el.cardMsg, "");
    api("/api/content/awarenessCards").then(function (r) {
      if (!r) return;
      if (!r.ok) {
        setMsg(el.cardMsg, (r.data && r.data.error) || "Could not load cards.", "err");
        return;
      }
      cardState.cards = Array.isArray(r.data) ? r.data : [];
      renderCardList();
    });
  }

  function saveAwarenessCards() {
    setMsg(el.cardMsg, "");
    el.cardSave.disabled = true;
    const items = cardState.cards.map(function (c, i) {
      return { ...c, order: i };
    });
    api("/api/content/awarenessCards", { method: "PUT", body: { items: items } }).then(
      function (r) {
        el.cardSave.disabled = false;
        if (!r) return;
        if (!r.ok) {
          setMsg(el.cardMsg, (r.data && r.data.error) || "Could not save.", "err");
          return;
        }
        setMsg(el.cardMsg, "Saved. Live within a few minutes.", "ok");
        el.cardMeta.textContent = "Updated just now by you";
        cardState.cards = r.data.items;
        renderCardList();
      }
    );
  }

  el.cardAdd.addEventListener("click", function () {
    cardState.cards.push(newCard());
    renderCardList();
  });
  el.cardSave.addEventListener("click", saveAwarenessCards);

  /* ------------------------------------------------------------ alert banner */
  // Roadmap Bet 3: one admin-published banner shown on the public homepage.
  // Uses the same generic /api/content/:key contract as events/training, but
  // as a single-item (0 or 1) form rather than a repeatable-rows list.

  function fmtPostedAt(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderAlertBanner(items) {
    const current = Array.isArray(items) && items.length ? items[0] : null;
    el.alertBannerMessage.value = current ? current.message : "";
    el.alertBannerSeverity.value = current && current.severity ? current.severity : "info";
    el.alertBannerCount.textContent = el.alertBannerMessage.value.length + " / 280";
    el.alertBannerMeta.textContent = current
      ? "Live now" + (current.postedAt ? " — posted " + fmtPostedAt(current.postedAt) : "")
      : "No banner currently live.";
  }

  function loadAlertBanner() {
    setMsg(el.alertBannerMsg, "");
    api("/api/content/alertBanner").then(function (r) {
      if (!r) return;
      if (!r.ok) {
        setMsg(el.alertBannerMsg, (r.data && r.data.error) || "Could not load the banner.", "err");
        return;
      }
      renderAlertBanner(Array.isArray(r.data) ? r.data : []);
    });
  }

  function saveAlertBanner(items, btn, successMsg) {
    setMsg(el.alertBannerMsg, "");
    btn.disabled = true;
    api("/api/content/alertBanner", { method: "PUT", body: { items: items } }).then(function (r) {
      btn.disabled = false;
      if (!r) return;
      if (!r.ok) {
        setMsg(el.alertBannerMsg, (r.data && r.data.error) || "Could not save.", "err");
        return;
      }
      setMsg(el.alertBannerMsg, successMsg, "ok");
      renderAlertBanner(r.data.items);
    });
  }

  el.alertBannerMessage.addEventListener("input", function () {
    el.alertBannerCount.textContent = el.alertBannerMessage.value.length + " / 280";
  });

  el.alertBannerSave.addEventListener("click", function (e) {
    const message = el.alertBannerMessage.value.trim();
    if (!message) {
      setMsg(el.alertBannerMsg, "Write a message before publishing.", "err");
      return;
    }
    saveAlertBanner(
      [{ message: message, severity: el.alertBannerSeverity.value }],
      e.currentTarget,
      "Published. Live on the homepage within a few minutes."
    );
  });

  el.alertBannerClear.addEventListener("click", function (e) {
    saveAlertBanner([], e.currentTarget, "Banner cleared.");
  });

  /* ------------------------------------------------------------ social studio */

  const SOCIAL_BRAND = {
    red: "#e5281b",
    ink: "#22201f",
    inkSoft: "#5c5651",
    cream: "#f5f3f0",
    white: "#ffffff",
    dark: "#1f1e1c",
  };

  const SOCIAL_TEMPLATES = [
    {
      id: "alert",
      label: "Community update",
      width: 1080,
      height: 1080,
      layers: [
        {
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          fill: SOCIAL_BRAND.red,
          locked: true,
        },
        {
          id: "panel",
          type: "rect",
          x: 50,
          y: 50,
          w: 980,
          h: 980,
          fill: SOCIAL_BRAND.white,
          locked: true,
        },
        {
          id: "headline",
          type: "text",
          role: "headline",
          x: 110,
          y: 130,
          w: 860,
          h: 240,
          text: "Community update",
          size: 72,
          weight: "800",
          color: SOCIAL_BRAND.ink,
          align: "left",
        },
        {
          id: "body",
          type: "text",
          role: "body",
          x: 110,
          y: 400,
          w: 860,
          h: 420,
          text: "Add the detail of your update here. Keep it factual and calm.",
          size: 36,
          weight: "400",
          color: SOCIAL_BRAND.inkSoft,
          align: "left",
        },
        { id: "logo", type: "image", x: 110, y: 900, w: 160, h: 96, src: "/Images/logo.png" },
      ],
    },
    {
      id: "event",
      label: "Event promo",
      width: 1080,
      height: 1080,
      layers: [
        {
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          fill: SOCIAL_BRAND.dark,
          locked: true,
        },
        { id: "photo", type: "image", x: 60, y: 60, w: 960, h: 600, src: "" },
        {
          id: "badge",
          type: "text",
          role: "badge",
          x: 60,
          y: 690,
          w: 500,
          h: 70,
          text: "Date · Time",
          size: 32,
          weight: "700",
          color: SOCIAL_BRAND.white,
          align: "left",
          bg: SOCIAL_BRAND.red,
        },
        {
          id: "headline",
          type: "text",
          role: "headline",
          x: 60,
          y: 780,
          w: 960,
          h: 160,
          text: "Event name",
          size: 66,
          weight: "800",
          color: SOCIAL_BRAND.white,
          align: "left",
        },
        { id: "logo", type: "image", x: 880, y: 960, w: 140, h: 84, src: "/Images/logo-dark.png" },
      ],
    },
    {
      id: "recruit",
      label: "Recruitment",
      width: 1080,
      height: 1350,
      layers: [
        {
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          w: 1080,
          h: 1350,
          fill: SOCIAL_BRAND.dark,
          locked: true,
        },
        {
          id: "headline",
          type: "text",
          role: "headline",
          x: 90,
          y: 160,
          w: 900,
          h: 300,
          text: "Join Bungendore RFS",
          size: 80,
          weight: "800",
          color: SOCIAL_BRAND.white,
          align: "left",
        },
        {
          id: "body",
          type: "text",
          role: "body",
          x: 90,
          y: 500,
          w: 900,
          h: 500,
          text: "We're always looking for new volunteers. No experience needed — training provided.",
          size: 40,
          weight: "400",
          color: "#d8d3cc",
          align: "left",
        },
        { id: "logo", type: "image", x: 90, y: 1170, w: 170, h: 102, src: "/Images/logo-dark.png" },
      ],
    },
    {
      id: "announcement",
      label: "General announcement",
      width: 1080,
      height: 1080,
      layers: [
        {
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          fill: SOCIAL_BRAND.cream,
          locked: true,
        },
        {
          id: "accent",
          type: "rect",
          x: 0,
          y: 0,
          w: 1080,
          h: 18,
          fill: SOCIAL_BRAND.red,
          locked: true,
        },
        {
          id: "headline",
          type: "text",
          role: "headline",
          x: 90,
          y: 150,
          w: 900,
          h: 260,
          text: "Announcement",
          size: 72,
          weight: "800",
          color: SOCIAL_BRAND.ink,
          align: "left",
        },
        {
          id: "body",
          type: "text",
          role: "body",
          x: 90,
          y: 440,
          w: 900,
          h: 460,
          text: "Add your message here.",
          size: 38,
          weight: "400",
          color: SOCIAL_BRAND.inkSoft,
          align: "left",
        },
        { id: "logo", type: "image", x: 850, y: 940, w: 140, h: 84, src: "/Images/logo.png" },
      ],
    },
    {
      id: "fblink",
      label: "Facebook link card",
      width: 1200,
      height: 630,
      layers: [
        {
          id: "bg",
          type: "rect",
          x: 0,
          y: 0,
          w: 1200,
          h: 630,
          fill: SOCIAL_BRAND.white,
          locked: true,
        },
        { id: "photo", type: "image", x: 0, y: 0, w: 1200, h: 420, src: "" },
        {
          id: "headline",
          type: "text",
          role: "headline",
          x: 50,
          y: 450,
          w: 1100,
          h: 130,
          text: "Headline goes here",
          size: 52,
          weight: "800",
          color: SOCIAL_BRAND.ink,
          align: "left",
        },
        { id: "logo", type: "image", x: 1030, y: 540, w: 120, h: 72, src: "/Images/logo.png" },
      ],
    },
  ];

  const SOCIAL_STARTERS = {
    event: "Help me write a post promoting an upcoming community event.",
    training: "Help me write a reminder post about our next training night.",
    recruit: "Help me write a recruitment post encouraging people to join the brigade.",
    update: "Help me write a general community update post.",
  };

  const social = {
    started: false,
    template: null,
    layers: [],
    selectedId: null,
    ctx: null,
    drag: null, // {mode:'move'|'resize', layerId, startX, startY, orig:{x,y,w,h}}
    images: {}, // src -> HTMLImageElement (cache)
    pendingImage: null, // dataURL of a photo attached to the next chat message
  };

  function initSocialStudio() {
    if (social.started) return;
    social.started = true;

    renderSocialTemplateList();
    social.ctx = el.socialCanvas.getContext("2d");
    wireSocialCanvasEvents();
    el.socialExport.addEventListener("click", exportSocialCanvas);
    selectSocialTemplate(SOCIAL_TEMPLATES[0]);

    el.socialStarters.addEventListener("click", function (e) {
      const btn = e.target.closest(".social__starter");
      if (!btn) return;
      el.socialChatInput.value = SOCIAL_STARTERS[btn.dataset.starter] || "";
      el.socialChatInput.focus();
    });

    el.socialChatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      sendSocialChatMessage();
    });
    el.socialAttachBtn.addEventListener("click", function () {
      el.socialAttachInput.click();
    });
    el.socialAttachInput.addEventListener("change", onSocialAttachChange);
    el.socialAttachRemove.addEventListener("click", clearSocialAttachment);
    el.socialUseHeadline.addEventListener("click", useSocialHeadline);
    el.socialCopyCaption.addEventListener("click", copySocialCaption);
    el.socialReviewCheck.addEventListener("change", function () {
      el.socialCopyCaption.disabled = !el.socialReviewCheck.checked;
    });

    el.socialPromptSave.addEventListener("click", saveSocialPrompt);
    el.socialPromptReset.addEventListener("click", function () {
      el.socialPromptText.value = state.socialDefaultPrompt;
    });
    if (state.me && state.me.role === "admin") loadSocialPromptConfig();
  }

  /* ----------------------------------------------------------- canvas editor */

  function renderSocialTemplateList() {
    el.socialTemplates.innerHTML = "";
    SOCIAL_TEMPLATES.forEach(function (t) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "social__template";
      btn.textContent = t.label;
      btn.dataset.id = t.id;
      btn.addEventListener("click", function () {
        selectSocialTemplate(t);
      });
      el.socialTemplates.appendChild(btn);
    });
  }

  function selectSocialTemplate(t) {
    social.template = t;
    social.layers = t.layers.map(function (l) {
      return Object.assign({}, l);
    });
    social.selectedId = null;
    Array.prototype.forEach.call(el.socialTemplates.children, function (b) {
      b.classList.toggle("is-active", b.dataset.id === t.id);
    });
    el.socialCanvas.width = t.width;
    el.socialCanvas.height = t.height;
    el.socialCanvas.style.aspectRatio = t.width + " / " + t.height;
    el.socialCanvasMeta.textContent = t.width + " × " + t.height + "px";
    el.socialExport.disabled = false;
    preloadSocialImages(function () {
      drawSocialScene();
    });
    renderSocialLayerPanel();
  }

  function preloadSocialImages(done) {
    const srcs = social.layers.filter((l) => l.type === "image" && l.src).map((l) => l.src);
    const unique = Array.from(new Set(srcs));
    let remaining = unique.length;
    if (!remaining) return done();
    unique.forEach(function (src) {
      if (social.images[src]) {
        remaining -= 1;
        if (remaining <= 0) done();
        return;
      }
      const img = new Image();
      img.onload = function () {
        social.images[src] = img;
        remaining -= 1;
        if (remaining <= 0) done();
      };
      img.onerror = function () {
        remaining -= 1;
        if (remaining <= 0) done();
      };
      img.src = src;
    });
  }

  function wrapSocialText(ctx, text, maxWidth) {
    const words = String(text || "")
      .split(/\s+/)
      .filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach(function (word) {
      const attempt = line ? line + " " + word : word;
      if (ctx.measureText(attempt).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawSocialLayer(ctx, layer) {
    if (layer.type === "rect") {
      ctx.fillStyle = layer.fill;
      ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
      return;
    }
    if (layer.type === "image") {
      const img = layer.src && social.images[layer.src];
      if (img) {
        const scale = Math.max(layer.w / img.width, layer.h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(layer.x, layer.y, layer.w, layer.h);
        ctx.clip();
        ctx.drawImage(img, layer.x + (layer.w - dw) / 2, layer.y + (layer.h - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#c8c2b8";
        ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
        ctx.fillStyle = "#5c5651";
        ctx.font = "28px 'Public Sans', sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText("Add a photo", layer.x + layer.w / 2, layer.y + layer.h / 2);
      }
      return;
    }
    if (layer.type === "text") {
      const padX = layer.bg ? 24 : 0;
      const padY = layer.bg ? 10 : 0;
      ctx.font = (layer.weight || "400") + " " + layer.size + "px 'Public Sans', sans-serif";
      const lineHeight = Math.round(layer.size * 1.22);
      const lines = wrapSocialText(ctx, layer.text, layer.w - padX * 2);
      if (layer.bg) {
        const h = lineHeight * lines.length + padY * 2;
        ctx.fillStyle = layer.bg;
        ctx.fillRect(layer.x, layer.y, layer.w, Math.min(h, layer.h));
      }
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align === "center" ? "center" : "left";
      ctx.textBaseline = "top";
      const tx = layer.align === "center" ? layer.x + layer.w / 2 : layer.x + padX;
      lines.forEach(function (line, i) {
        ctx.fillText(line, tx, layer.y + padY + i * lineHeight);
      });
    }
  }

  function drawSocialScene() {
    const ctx = social.ctx;
    if (!ctx || !social.template) return;
    ctx.clearRect(0, 0, el.socialCanvas.width, el.socialCanvas.height);
    social.layers.forEach(function (layer) {
      drawSocialLayer(ctx, layer);
    });
    const sel = social.layers.find((l) => l.id === social.selectedId);
    if (sel) {
      ctx.save();
      ctx.strokeStyle = "#1f6feb";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      ctx.setLineDash([]);
      if (!sel.locked) {
        ctx.fillStyle = "#1f6feb";
        const s = 18;
        ctx.fillRect(sel.x + sel.w - s / 2, sel.y + sel.h - s / 2, s, s);
      }
      ctx.restore();
    }
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function canvasPoint(evt) {
    const rect = el.socialCanvas.getBoundingClientRect();
    const scaleX = el.socialCanvas.width / rect.width;
    const scaleY = el.socialCanvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  function hitSocialLayer(pt) {
    for (let i = social.layers.length - 1; i >= 0; i -= 1) {
      const l = social.layers[i];
      if (l.locked) continue;
      if (pt.x >= l.x && pt.x <= l.x + l.w && pt.y >= l.y && pt.y <= l.y + l.h) return l;
    }
    return null;
  }

  function onSocialResizeHandle(pt, layer) {
    if (!layer || layer.locked) return false;
    const s = 22;
    return (
      pt.x >= layer.x + layer.w - s &&
      pt.x <= layer.x + layer.w + s / 2 &&
      pt.y >= layer.y + layer.h - s &&
      pt.y <= layer.y + layer.h + s / 2
    );
  }

  function wireSocialCanvasEvents() {
    el.socialCanvas.addEventListener("pointerdown", function (evt) {
      const pt = canvasPoint(evt);
      const selected = social.layers.find((l) => l.id === social.selectedId);
      if (selected && onSocialResizeHandle(pt, selected)) {
        social.drag = {
          mode: "resize",
          layerId: selected.id,
          startX: pt.x,
          startY: pt.y,
          orig: { w: selected.w, h: selected.h },
        };
        el.socialCanvas.setPointerCapture(evt.pointerId);
        return;
      }
      const hit = hitSocialLayer(pt);
      social.selectedId = hit ? hit.id : null;
      renderSocialLayerPanel();
      if (hit) {
        social.drag = {
          mode: "move",
          layerId: hit.id,
          startX: pt.x,
          startY: pt.y,
          orig: { x: hit.x, y: hit.y },
        };
        el.socialCanvas.setPointerCapture(evt.pointerId);
      }
      drawSocialScene();
    });

    el.socialCanvas.addEventListener("pointermove", function (evt) {
      if (!social.drag) return;
      const pt = canvasPoint(evt);
      const layer = social.layers.find((l) => l.id === social.drag.layerId);
      if (!layer) return;
      const dx = pt.x - social.drag.startX;
      const dy = pt.y - social.drag.startY;
      if (social.drag.mode === "move") {
        layer.x = clamp(social.drag.orig.x + dx, -layer.w + 20, el.socialCanvas.width - 20);
        layer.y = clamp(social.drag.orig.y + dy, -layer.h + 20, el.socialCanvas.height - 20);
      } else {
        layer.w = clamp(social.drag.orig.w + dx, 40, el.socialCanvas.width - layer.x);
        layer.h = clamp(social.drag.orig.h + dy, 30, el.socialCanvas.height - layer.y);
      }
      drawSocialScene();
    });

    ["pointerup", "pointercancel"].forEach(function (evtName) {
      el.socialCanvas.addEventListener(evtName, function () {
        social.drag = null;
      });
    });
  }

  function renderSocialLayerPanel() {
    el.socialLayerPanel.innerHTML = "";
    const layer = social.layers.find((l) => l.id === social.selectedId);
    if (!layer) {
      const p = document.createElement("p");
      p.className = "social__hint";
      p.textContent =
        "Click a layer on the image to edit it. Drag to move, use the corner handle to resize.";
      el.socialLayerPanel.appendChild(p);
      return;
    }

    const title = document.createElement("h4");
    title.className = "social__panel-h";
    title.textContent = cap(layer.role || layer.type);
    el.socialLayerPanel.appendChild(title);

    if (layer.type === "text") {
      const textarea = document.createElement("textarea");
      textarea.className = "editor__input";
      textarea.rows = 3;
      textarea.value = layer.text;
      textarea.addEventListener("input", function () {
        layer.text = textarea.value;
        drawSocialScene();
      });
      el.socialLayerPanel.appendChild(socialLabelWrap("Text", textarea));

      const sizeInput = document.createElement("input");
      sizeInput.type = "number";
      sizeInput.className = "editor__input";
      sizeInput.min = "16";
      sizeInput.max = "160";
      sizeInput.value = layer.size;
      sizeInput.addEventListener("input", function () {
        layer.size = Number(sizeInput.value) || layer.size;
        drawSocialScene();
      });
      el.socialLayerPanel.appendChild(socialLabelWrap("Font size", sizeInput));
    }

    if (layer.type === "image") {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg";
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          layer.src = reader.result;
          preloadSocialImages(function () {
            drawSocialScene();
          });
        };
        reader.readAsDataURL(file);
      });
      el.socialLayerPanel.appendChild(socialLabelWrap("Replace image", fileInput));
    }
  }

  function socialLabelWrap(text, node) {
    const wrap = document.createElement("label");
    wrap.className = "social__panel-field";
    const span = document.createElement("span");
    span.textContent = text;
    wrap.appendChild(span);
    wrap.appendChild(node);
    return wrap;
  }

  function exportSocialCanvas() {
    el.socialCanvas.toBlob(function (blob) {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (social.template ? social.template.id : "post") + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /* --------------------------------------------------------- AI chat assist */

  function addSocialChatBubble(msg) {
    const wrap = document.createElement("div");
    wrap.className =
      "social__bubble social__bubble--" + msg.role + (msg.pending ? " is-pending" : "");
    if (msg.image) {
      const img = document.createElement("img");
      img.src = msg.image;
      img.alt = "Attached photo";
      img.className = "social__bubble-img";
      wrap.appendChild(img);
    }
    const p = document.createElement("p");
    p.textContent = msg.text;
    wrap.appendChild(p);
    el.socialChat.appendChild(wrap);
    el.socialChat.scrollTop = el.socialChat.scrollHeight;
    return wrap;
  }

  function socialTranscript() {
    return state.socialMessages.slice(-24).map(function (m) {
      return { role: m.role, text: m.text, image: m.image };
    });
  }

  function sendSocialChatMessage() {
    const text = el.socialChatInput.value.trim();
    const image = social.pendingImage;
    if (!text && !image) return;

    const userMsg = { role: "user", text: text, image: image || undefined };
    state.socialMessages.push(userMsg);
    addSocialChatBubble(userMsg);
    el.socialChatInput.value = "";
    clearSocialAttachment();
    setMsg(el.socialAiMsg, "");
    el.socialChatSend.disabled = true;

    const thinking = addSocialChatBubble({ role: "assistant", text: "…", pending: true });
    api("/api/social/chat", {
      method: "POST",
      body: { messages: socialTranscript() },
    }).then(function (r) {
      el.socialChatSend.disabled = false;
      thinking.remove();
      if (!r) return;
      if (!r.ok) {
        setMsg(el.socialAiMsg, (r.data && r.data.error) || "Could not reach the assistant.", "err");
        return;
      }
      const assistantMsg = { role: "assistant", text: r.data.message };
      state.socialMessages.push(assistantMsg);
      addSocialChatBubble(assistantMsg);
      if (r.data.draft) renderSocialAiResult(r.data.draft);
    });
  }

  function onSocialAttachChange() {
    const file = el.socialAttachInput.files && el.socialAttachInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMsg(el.socialAiMsg, "That photo is too large (max 8MB).", "err");
      el.socialAttachInput.value = "";
      return;
    }
    resizeImageForChat(
      file,
      function (dataUrl) {
        social.pendingImage = dataUrl;
        el.socialAttachThumb.src = dataUrl;
        el.socialAttachPreview.hidden = false;
      },
      function () {
        setMsg(el.socialAiMsg, "That photo couldn't be read. Try a different image.", "err");
        el.socialAttachInput.value = "";
      }
    );
  }

  function clearSocialAttachment() {
    social.pendingImage = null;
    el.socialAttachInput.value = "";
    el.socialAttachPreview.hidden = true;
    el.socialAttachThumb.src = "";
  }

  /** Downscale to a max 1024px edge before sending, to keep payloads small. */
  function resizeImageForChat(file, cb, onErr) {
    const fail = typeof onErr === "function" ? onErr : function () {};
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = function () {
      const img = new Image();
      img.onerror = fail;
      img.onload = function () {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function renderSocialAiResult(draft) {
    state.socialDraft = draft;
    if (el.socialDraftEmpty) el.socialDraftEmpty.hidden = true;
    el.socialHeadlineOut.textContent = draft.headline;
    el.socialCaptionOut.textContent = draft.caption;
    el.socialHashtagsOut.textContent = (draft.hashtags || []).map((h) => "#" + h).join(" ");

    el.socialFlags.innerHTML = "";
    const flags = draft.flags || [];
    if (flags.length) {
      el.socialFlags.hidden = false;
      const h = document.createElement("p");
      h.className = "social__flags-h";
      h.textContent = "Check before posting:";
      el.socialFlags.appendChild(h);
      const ul = document.createElement("ul");
      flags.forEach(function (f) {
        const li = document.createElement("li");
        li.textContent = f;
        ul.appendChild(li);
      });
      el.socialFlags.appendChild(ul);
      el.socialReviewGate.hidden = false;
      el.socialReviewCheck.checked = false;
      el.socialCopyCaption.disabled = true;
    } else {
      el.socialFlags.hidden = true;
      el.socialReviewGate.hidden = true;
      el.socialCopyCaption.disabled = false;
    }
    el.socialAiResult.hidden = false;
  }

  function useSocialHeadline() {
    if (!state.socialDraft) return;
    const layer = social.layers.find((l) => l.role === "headline");
    if (!layer) return;
    layer.text = state.socialDraft.headline;
    drawSocialScene();
    if (social.selectedId === layer.id) renderSocialLayerPanel();
  }

  function copySocialCaption() {
    if (!state.socialDraft) return;
    const text =
      state.socialDraft.caption +
      (state.socialDraft.hashtags && state.socialDraft.hashtags.length
        ? "\n\n" + state.socialDraft.hashtags.map((h) => "#" + h).join(" ")
        : "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setMsg(el.socialAiMsg, "Copied to clipboard.", "ok");
      });
    }
  }

  /* ------------------------------------------------- AI guidelines (admin) */

  function loadSocialPromptConfig() {
    api("/api/social/prompt").then(function (r) {
      if (!r || !r.ok) return;
      state.socialDefaultPrompt = r.data.defaultPrompt;
      el.socialPromptText.value = r.data.prompt;
      el.socialPromptMeta.textContent = r.data.isDefault
        ? "Using the built-in default."
        : "Updated " +
          relTime(r.data.updatedAt) +
          (r.data.updatedBy ? " by " + r.data.updatedBy : "");
    });
  }

  function saveSocialPrompt() {
    setMsg(el.socialPromptMsg, "");
    el.socialPromptSave.disabled = true;
    api("/api/social/prompt", { method: "PUT", body: { prompt: el.socialPromptText.value } }).then(
      function (r) {
        el.socialPromptSave.disabled = false;
        if (!r) return;
        if (!r.ok) {
          setMsg(el.socialPromptMsg, (r.data && r.data.error) || "Could not save.", "err");
          return;
        }
        setMsg(el.socialPromptMsg, "Saved.", "ok");
        el.socialPromptMeta.textContent = "Updated just now by you";
      }
    );
  }

  /* --------------------------------------------------------------- analytics */

  let clarityLoaded = false;

  function loadClarity(opts) {
    const refresh = opts && opts.refresh;
    if (!clarityLoaded && !refresh) setMsg(el.clarityMsg, "Loading…");
    if (refresh) {
      el.clarityRefresh.disabled = true;
      el.clarityRefresh.textContent = "Refreshing…";
    }
    api("/api/clarity/insights" + (refresh ? "?refresh=1" : "")).then(function (r) {
      el.clarityRefresh.disabled = false;
      el.clarityRefresh.textContent = "Refresh";
      if (!r) return;
      if (!r.ok) {
        setMsg(el.clarityMsg, (r.data && r.data.error) || "Could not load analytics.", "err");
        return;
      }
      clarityLoaded = true;
      renderClarity(r.data);
    });
  }

  function fmtDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s <= 0) return "0s";
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? m + "m " + rem + "s" : m + "m";
  }

  function statCard(value, label, opts) {
    const div = document.createElement("div");
    div.className = "stat" + (opts && opts.flag ? " stat--flag" : "");
    if (opts && opts.flag && (!value || value === "0")) div.classList.add("is-zero");
    const v = document.createElement("div");
    v.className = "stat__value";
    v.textContent = value;
    const l = document.createElement("div");
    l.className = "stat__label";
    l.textContent = label;
    div.appendChild(v);
    div.appendChild(l);
    return div;
  }

  function renderClarity(data) {
    if (!data.configured) {
      setMsg(
        el.clarityMsg,
        "Analytics isn’t connected yet — the Clarity API token hasn’t been set on the server.",
        "err"
      );
      el.clarityBody.hidden = true;
      return;
    }

    const snap = data.snapshot;
    if (!snap || !snap.totals || (!snap.hasData && !(data.history && data.history.length))) {
      setMsg(
        el.clarityMsg,
        data.fetchedAt
          ? "Connected — no visitor data yet. Clarity needs a day or so of traffic after going live."
          : "Connected — waiting for the first data pull.",
        null
      );
      el.clarityBody.hidden = true;
      return;
    }
    setMsg(el.clarityMsg, "");
    el.clarityBody.hidden = false;

    const t = snap.totals;
    el.clarityMeta.textContent =
      "Last " +
      (snap.windowDays || 3) +
      " days · pulled " +
      relTime(data.fetchedAt) +
      (data.lastSuccessAt && data.lastSuccessAt !== data.fetchedAt
        ? " · last change " + relTime(data.lastSuccessAt)
        : "");

    el.clarityStats.replaceChildren(
      statCard(String(t.sessions || 0), "Sessions"),
      statCard(String(t.distinctUsers || 0), "Distinct visitors"),
      statCard(String(t.pagesPerSession || 0), "Pages / session"),
      statCard(String(t.avgScrollDepth || 0) + "%", "Avg scroll depth"),
      statCard(fmtDuration(t.avgEngagementTime), "Avg time on page"),
      statCard(String(t.botSessions || 0), "Bot sessions")
    );

    const pages = snap.pages || [];
    el.clarityPages.replaceChildren();
    if (!pages.length) {
      el.clarityPages.appendChild(clarityEmptyRow(5, "No page data in this window."));
    } else {
      pages.forEach(function (p) {
        const tr = document.createElement("tr");
        tr.appendChild(clarityCell(p.url || "(unknown)", "clarity-url"));
        tr.appendChild(clarityCell(String(p.sessions || 0), "num"));
        tr.appendChild(clarityCell(String(p.pageViews || 0), "num"));
        tr.appendChild(clarityCell((p.scrollDepth || 0) + "%", "num"));
        tr.appendChild(clarityCell(fmtDuration(p.engagementTime), "num"));
        el.clarityPages.appendChild(tr);
      });
    }

    const sig = snap.signals || {};
    el.claritySignals.replaceChildren(
      statCard(String(sig.rageClicks || 0), "Rage clicks", { flag: true }),
      statCard(String(sig.deadClicks || 0), "Dead clicks", { flag: true }),
      statCard(String(sig.quickbacks || 0), "Quick backs", { flag: true }),
      statCard(String(sig.excessiveScroll || 0), "Excessive scroll", { flag: true }),
      statCard(String(sig.scriptErrors || 0), "Script errors", { flag: true }),
      statCard(String(sig.errorClicks || 0), "Error clicks", { flag: true })
    );

    const history = (data.history || []).filter(function (h) {
      return h.sessions || h.pagesPerSession || h.avgScrollDepth;
    });
    el.clarityHistory.replaceChildren();
    if (!history.length) {
      el.clarityHistory.appendChild(clarityEmptyRow(5, "The daily trend builds up from here."));
    } else {
      history.forEach(function (h) {
        const tr = document.createElement("tr");
        tr.appendChild(clarityCell(h.date || "—"));
        tr.appendChild(clarityCell(String(h.sessions || 0), "num"));
        tr.appendChild(clarityCell(String(h.pagesPerSession || 0), "num"));
        tr.appendChild(clarityCell((h.avgScrollDepth || 0) + "%", "num"));
        tr.appendChild(clarityCell(fmtDuration(h.avgEngagementTime), "num"));
        el.clarityHistory.appendChild(tr);
      });
    }
  }

  function clarityCell(text, cls) {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }

  function clarityEmptyRow(span, text) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = span;
    td.className = "clarity-table__empty";
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  el.clarityRefresh.addEventListener("click", function () {
    loadClarity({ refresh: true });
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
