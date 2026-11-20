/* =========================================================
   삐삐의 살롱 · 페이스북 아카이브
   데이터(archive-data.js)를 읽어 기록·사진첩을 그립니다.
   ========================================================= */
(function () {
  "use strict";

  var DATA = window.ARCHIVE_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  if (!DATA || !Array.isArray(DATA.posts)) {
    var feedEl = $("#feed");
    if (feedEl) {
      feedEl.innerHTML = "";
      var msg = document.createElement("p");
      msg.className = "empty";
      msg.textContent = "기록 데이터를 불러오지 못했습니다. data/archive-data.js 파일이 index.html 옆에 있는지 확인해 주세요.";
      feedEl.appendChild(msg);
    }
    return;
  }

  var POSTS = DATA.posts;
  var PHOTOS = DATA.photos || [];
  var POSTPHOTOS = DATA.postPhotos || [];
  var TOPICS = DATA.topics || [];
  var META = DATA.meta || {};

  var ALL = "전체";
  var GALLERY_STEP = 60;
  var TEXT_LIMIT = 560;

  var state = {
    view: "timeline",
    topic: ALL,
    q: "",
    sort: "desc",
    gq: "",
    gsource: "archive",
    galleryShown: 0
  };
  var galleryList = [];

  /* ---------- 작은 도우미 ---------- */
  function num(n) { return Number(n).toLocaleString("ko-KR"); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function linkify(text) {
    var frag = document.createDocumentFragment();
    var re = /(https?:\/\/[^\s<>"']+)/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement("a");
      a.href = m[1];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = m[1];
      frag.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function normalize(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function dateLabel(p) {
    var d = p.date.split("-");
    return Number(d[0]) + "년 " + Number(d[1]) + "월 " + Number(d[2]) + "일 (" + p.weekday + ")";
  }

  function monthLabel(ym) {
    var d = ym.split("-");
    return Number(d[0]) + "년 " + Number(d[1]) + "월";
  }

  function shortText(text, limit) {
    if (text.length <= limit) return text;
    var cut = text.slice(0, limit);
    var sp = cut.lastIndexOf(" ");
    if (sp > limit * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s,.;:!?~-]+$/, "");
  }

  /* ---------- 주제 목록 ---------- */
  function buildTopics() {
    var list = $("#topic-list");
    list.innerHTML = "";

    var allItem = document.createElement("li");
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "topic-btn";
    allBtn.dataset.topic = ALL;
    allBtn.innerHTML = '<span class="t-icon" aria-hidden="true">◦</span>';
    allBtn.appendChild(el("span", "t-name", "전체 기록"));
    allBtn.appendChild(el("span", "t-count", num(POSTS.length)));
    allItem.appendChild(allBtn);
    list.appendChild(allItem);

    TOPICS.forEach(function (t) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "topic-btn";
      btn.dataset.topic = t.name;
      btn.innerHTML = '<span class="t-icon" aria-hidden="true"></span>';
      btn.firstChild.textContent = t.icon;
      btn.appendChild(el("span", "t-name", t.name));
      btn.appendChild(el("span", "t-count", num(t.count)));
      li.appendChild(btn);
      list.appendChild(li);
    });

    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".topic-btn");
      if (!btn) return;
      setTopic(btn.dataset.topic);
    });
  }

  function syncTopicButtons() {
    $$(".topic-btn").forEach(function (btn) {
      var on = btn.dataset.topic === state.topic;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ---------- 월 바로가기 ---------- */
  function buildMonths() {
    var list = $("#month-list");
    list.innerHTML = "";
    var counts = {};
    POSTS.forEach(function (p) { counts[p.month] = (counts[p.month] || 0) + 1; });
    Object.keys(counts).sort().reverse().forEach(function (ym) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "month-btn";
      btn.dataset.month = ym;
      btn.appendChild(document.createTextNode(ym.replace("-", ".")));
      btn.appendChild(el("span", "", String(counts[ym])));
      btn.addEventListener("click", function () {
        var target = $('.month-head[data-month="' + ym + '"]');
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          // 현재 필터에 그 달이 없으면 전체 보기로 되돌린 뒤 이동
          state.topic = ALL;
          state.q = "";
          $("#q").value = "";
          syncTopicButtons();
          renderFeed();
          var t2 = $('.month-head[data-month="' + ym + '"]');
          if (t2) t2.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  /* ---------- 기록(피드) ---------- */
  function setTopic(topic) {
    state.topic = topic;
    syncTopicButtons();
    renderFeed();
    syncHash();
    if (window.scrollY > 420) {
      var feedTop = $(".feed-toolbar");
      if (feedTop) {
        var y = feedTop.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    }
  }

  function filteredPosts() {
    var terms = normalize(state.q).split(" ").filter(Boolean);
    var list = POSTS.filter(function (p) {
      if (state.topic !== ALL && p.topic !== state.topic) return false;
      if (!terms.length) return true;
      var hay = normalize([p.text, p.topic, p.date, p.year + "년", p.type].join(" "));
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    list.sort(function (a, b) {
      return state.sort === "asc" ? a.sortKey.localeCompare(b.sortKey) : b.sortKey.localeCompare(a.sortKey);
    });
    return list;
  }

  function buildCard(p) {
    var card = el("article", "card");
    card.dataset.no = p.no;

    var top = el("header", "card-top");
    var timeEl = document.createElement("time");
    timeEl.className = "card-date";
    timeEl.dateTime = p.sortKey;
    timeEl.textContent = dateLabel(p);
    top.appendChild(timeEl);
    top.appendChild(el("span", "card-time", p.time));

    if (p.type === "릴스" || p.type === "링크") {
      top.appendChild(el("span", "type-flag", p.type));
    }

    var badge = el("span", "topic-badge", p.topic);
    badge.dataset.topic = p.topic;
    top.appendChild(badge);
    card.appendChild(top);

    // 본문
    var full = (p.text || "").trim();
    var textBox = null;
    if (full) {
      textBox = el("div", "card-text");
      var shortened = full.length > TEXT_LIMIT;
      var short = shortened ? shortText(full, TEXT_LIMIT) : full;
      textBox.appendChild(linkify(short));
      if (shortened) textBox.classList.add("is-shortened");
      else if (p.truncated) textBox.appendChild(el("span", "text-ellipsis", "…"));
      card.appendChild(textBox);

      if (shortened) {
        var more = el("button", "read-more", "이어 읽기");
        more.type = "button";
        more.setAttribute("aria-expanded", "false");
        var open = false;
        more.addEventListener("click", function () {
          open = !open;
          textBox.replaceChildren(linkify(open ? full : short));
          textBox.classList.toggle("is-shortened", !open);
          more.textContent = open ? "접기" : "이어 읽기";
          more.setAttribute("aria-expanded", open ? "true" : "false");
        });
        card.appendChild(more);
      }
    }

    // 사진
    if (p.images && p.images.length) {
      var wrap = el("div", "card-images");
      wrap.dataset.n = String(Math.min(p.images.length, 8));
      p.images.forEach(function (src, i) {
        var btn = el("button", "card-img-btn");
        btn.type = "button";
        btn.setAttribute("aria-label", "사진 " + (i + 1) + " 크게 보기");
        var img = document.createElement("img");
        img.src = src;
        img.alt = p.text ? shortText(p.text, 60) + " (사진 " + (i + 1) + ")" : "사진 " + (i + 1);
        img.loading = "lazy";
        img.decoding = "async";
        btn.appendChild(img);
        btn.addEventListener("click", function () { openLightbox(cardLightboxItems(p), i); });
        wrap.appendChild(btn);
      });
      card.appendChild(wrap);
    }

    // 하단
    var metricParts = [];
    ["조회", "반응", "댓글", "공유"].forEach(function (k) {
      var v = p.metrics && p.metrics[k];
      if (v && v !== "0") metricParts.push(k + " " + v);
    });

    if (metricParts.length || p.url) {
      var foot = el("footer", "card-foot");
      if (metricParts.length) {
        foot.appendChild(el("p", "card-metrics", metricParts.join(" · ")));
      }
      if (p.url) {
        var a = document.createElement("a");
        a.className = "card-link" + (p.truncated ? " is-primary" : "");
        a.href = p.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = p.truncated ? "페이스북 원문 보기 ↗" : "원문 ↗";
        foot.appendChild(a);
      }
      card.appendChild(foot);
    }

    return card;
  }

  function cardLightboxItems(p) {
    return (p.images || []).map(function (src, i) {
      return {
        src: src,
        caption: p.text ? shortText(p.text, 160) : "",
        sub: dateLabel(p) + (p.images.length > 1 ? " · 사진 " + (i + 1) : ""),
        link: p.url
      };
    });
  }

  function renderFeed() {
    var feed = $("#feed");
    var list = filteredPosts();
    var frag = document.createDocumentFragment();
    var lastMonth = null;
    var group = null;

    list.forEach(function (p, i) {
      if (p.month !== lastMonth) {
        group = el("section", "month-group");
        group.dataset.month = p.month;
        group.setAttribute("aria-label", monthLabel(p.month));
        var head = el("h2", "month-head");
        head.dataset.month = p.month;
        head.appendChild(el("span", "", monthLabel(p.month)));
        var monthCount = list.filter(function (x) { return x.month === p.month; }).length;
        head.appendChild(el("span", "m-count", num(monthCount) + "편"));
        group.appendChild(head);
        frag.appendChild(group);
        lastMonth = p.month;
      }
      group.appendChild(buildCard(p));
    });

    feed.replaceChildren(frag);

    $("#feed-count").textContent = num(list.length);
    $("#feed-empty").hidden = list.length !== 0;

    // 활성 필터
    var chips = $("#active-filters");
    chips.innerHTML = "";
    if (state.topic !== ALL) {
      chips.appendChild(makeChip("주제 · " + state.topic, function () { setTopic(ALL); }));
    }
    if (state.q) {
      chips.appendChild(makeChip('검색 · "' + state.q + '"', function () {
        state.q = "";
        $("#q").value = "";
        $("#q-clear").hidden = true;
        renderFeed();
        syncHash();
      }));
    }
  }

  function makeChip(label, onRemove) {
    var chip = el("span", "filter-chip");
    chip.appendChild(document.createTextNode(label));
    var btn = el("button", "", "×");
    btn.type = "button";
    btn.setAttribute("aria-label", label + " 해제");
    btn.addEventListener("click", onRemove);
    chip.appendChild(btn);
    return chip;
  }

  /* ---------- 사진첩 ---------- */
  function gallerySourcePhotos() {
    if (state.gsource === "post") return POSTPHOTOS;
    if (state.gsource === "all") return PHOTOS.concat(POSTPHOTOS);
    return PHOTOS;
  }

  function sourceLabel() {
    return state.gsource === "post" ? "글 속 사진" : state.gsource === "all" ? "사진 전체" : "사진첩";
  }

  function buildGallery() {
    galleryList = gallerySourcePhotos().filter(function (ph) {
      if (!state.gq) return true;
      var terms = normalize(state.gq).split(" ").filter(Boolean);
      var hay = normalize(ph.alt + " " + (ph.id || "") + " " + (ph.topic || "") + " " + (ph.date || ""));
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    state.galleryShown = 0;
    $("#gallery").innerHTML = "";
    appendGallery();
    $("#gallery-empty").hidden = galleryList.length !== 0;
    $("#gallery-more").hidden = state.galleryShown >= galleryList.length;
  }

  function appendGallery() {
    var grid = $("#gallery");
    var end = Math.min(state.galleryShown + GALLERY_STEP, galleryList.length);
    if (state.galleryShown === 0 && galleryList.length === 0) {
      updateGalleryStatus();
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = state.galleryShown; i < end; i++) {
      var ph = galleryList[i];
      var btn = el("button", "gallery-item");
      btn.type = "button";
      btn.dataset.index = String(i);
      btn.setAttribute("aria-label", (ph.alt || "사진") + " — 크게 보기");
      var img = document.createElement("img");
      img.src = ph.file;
      img.alt = ph.alt || "";
      img.loading = "lazy";
      img.decoding = "async";
      btn.appendChild(img);
      if (ph.alt) {
        btn.appendChild(el("span", "gallery-cap", ph.alt));
      }
      frag.appendChild(btn);
    }
    grid.appendChild(frag);
    state.galleryShown = end;
    updateGalleryStatus();
    $("#gallery-more").hidden = state.galleryShown >= galleryList.length;
    $("#gallery-empty").hidden = galleryList.length !== 0;
  }

  function updateGalleryStatus() {
    var status = $("#gallery-status");
    if (!galleryList.length) {
      status.textContent = "0장";
      return;
    }
    if (state.gq) {
      status.textContent = sourceLabel() + ' · "' + state.gq + '" ' + num(galleryList.length) + "장 중 " + num(state.galleryShown) + "장";
    } else {
      status.textContent = sourceLabel() + " " + num(galleryList.length) + "장 중 " + num(state.galleryShown) + "장 보기";
    }
  }

  function galleryItems() {
    return galleryList.map(function (ph) {
      var sub = "";
      if (ph.date) {
        var d = ph.date.split("-");
        sub = Number(d[0]) + "년 " + Number(d[1]) + "월 " + Number(d[2]) + "일" + (ph.topic ? " · " + ph.topic : "");
      }
      return {
        src: ph.file,
        caption: ph.alt || "",
        sub: sub,
        link: ph.page
      };
    });
  }

  /* ---------- 라이트박스 ---------- */
  var lb = {
    root: $("#lightbox"),
    img: $("#lb-img"),
    alt: $("#lb-alt"),
    link: $("#lb-link"),
    counter: $("#lb-counter"),
    items: [],
    index: 0,
    opener: null
  };

  function openLightbox(items, index) {
    if (!items || !items.length) return;
    lb.items = items;
    lb.index = index || 0;
    lb.opener = document.activeElement;
    lb.root.hidden = false;
    document.body.style.overflow = "hidden";
    showLightboxItem(lb.index);
    $("#lb-close").focus();
  }

  function showLightboxItem(i) {
    var n = lb.items.length;
    lb.index = (i + n) % n;
    var item = lb.items[lb.index];
    lb.img.src = item.src;
    lb.img.alt = item.caption || "";
    var caption = item.caption || "설명이 없는 사진입니다";
    if (item.sub) caption = item.sub + " — " + caption;
    lb.alt.textContent = caption;
    lb.counter.textContent = (lb.index + 1) + " / " + n;
    if (item.link) {
      lb.link.href = item.link;
      lb.link.hidden = false;
    } else {
      lb.link.hidden = true;
    }
    // 이웃 사진 미리 받기
    if (n > 1) {
      [lb.items[(lb.index + 1) % n], lb.items[(lb.index - 1 + n) % n]].forEach(function (it) {
        var pre = new Image();
        pre.src = it.src;
      });
    }
  }

  function closeLightbox() {
    lb.root.hidden = true;
    document.body.style.overflow = "";
    lb.img.removeAttribute("src");
    if (lb.opener && typeof lb.opener.focus === "function") lb.opener.focus();
  }

  function trapFocus(e) {
    if (lb.root.hidden || e.key !== "Tab") return;
    var focusables = $$("button, a[href]", lb.root).filter(function (node) {
      return node.getClientRects().length > 0;
    });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- 보기 전환 ---------- */
  function setView(view, opts) {
    opts = opts || {};
    if (["timeline", "photos", "about"].indexOf(view) === -1) view = "timeline";
    state.view = view;

    $$(".view").forEach(function (section) {
      section.hidden = section.id !== "view-" + view;
    });
    $$(".tab").forEach(function (tab) {
      var on = tab.dataset.view === view;
      tab.classList.toggle("is-active", on);
      if (on) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });

    if (view === "photos" && !$("#gallery").childElementCount) {
      buildGallery();
    }
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: opts.smooth ? "smooth" : "auto" });

    var titles = { timeline: "삐삐의 살롱 · 페이스북 아카이브", photos: "사진첩 · 삐삐의 살롱", about: "안내 · 삐삐의 살롱" };
    document.title = titles[view];
    if (!opts.skipHash) syncHash();
  }

  /* ---------- 주소(hash) ---------- */
  function syncHash(push) {
    var params = new URLSearchParams();
    if (state.topic !== ALL) params.set("topic", state.topic);
    if (state.q) params.set("q", state.q);
    if (state.sort !== "desc") params.set("sort", state.sort);
    var hash = "#/" + state.view + (params.toString() ? "?" + params.toString() : "");
    if (push) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
  }

  function readHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    if (!raw) return null;
    var parts = raw.split("?");
    var view = parts[0] || "timeline";
    var params = new URLSearchParams(parts[1] || "");
    return {
      view: view,
      topic: params.get("topic") || ALL,
      q: params.get("q") || "",
      sort: params.get("sort") === "asc" ? "asc" : "desc"
    };
  }

  function applyHash() {
    var h = readHash();
    if (!h) return false;
    if (h.topic !== ALL && !TOPICS.some(function (t) { return t.name === h.topic; })) h.topic = ALL;
    state.q = h.q;
    state.sort = h.sort;
    $("#q").value = h.q;
    $("#q-clear").hidden = !h.q;
    $$(".sort-btn").forEach(function (b) {
      var on = b.dataset.sort === h.sort;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    state.topic = h.topic;
    syncTopicButtons();
    renderFeed();
    setView(h.view, { keepScroll: true, skipHash: true });
    return true;
  }

  /* ---------- 이벤트 ---------- */
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function bindEvents() {
    // 보기 탭
    $$(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () { setView(tab.dataset.view, { smooth: false }); });
    });

    // 검색
    var qInput = $("#q");
    var onSearch = debounce(function () {
      state.q = qInput.value.trim();
      $("#q-clear").hidden = !state.q;
      renderFeed();
      syncHash();
    }, 150);
    qInput.addEventListener("input", onSearch);
    qInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        qInput.value = "";
        state.q = "";
        $("#q-clear").hidden = true;
        renderFeed();
        syncHash();
      }
    });
    $("#q-clear").addEventListener("click", function () {
      qInput.value = "";
      state.q = "";
      $("#q-clear").hidden = true;
      qInput.focus();
      renderFeed();
      syncHash();
    });

    // 정렬
    $$(".sort-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sort = btn.dataset.sort;
        $$(".sort-btn").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderFeed();
        syncHash();
      });
    });

    $("#reset-filters").addEventListener("click", function () {
      state.topic = ALL;
      state.q = "";
      $("#q").value = "";
      $("#q-clear").hidden = true;
      syncTopicButtons();
      renderFeed();
      syncHash();
    });

    // 사진첩
    var gqInput = $("#gq");
    var gqSearch = debounce(function () {
      state.gq = gqInput.value.trim();
      $("#gq-clear").hidden = !state.gq;
      buildGallery();
    }, 180);
    gqInput.addEventListener("input", gqSearch);
    $("#gq-clear").addEventListener("click", function () {
      gqInput.value = "";
      state.gq = "";
      $("#gq-clear").hidden = true;
      gqInput.focus();
      buildGallery();
    });
    $("#gallery-reset").addEventListener("click", function () {
      gqInput.value = "";
      state.gq = "";
      $("#gq-clear").hidden = true;
      buildGallery();
    });
    $("#gallery-more").addEventListener("click", appendGallery);

    $$(".source-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.gsource = btn.dataset.source;
        $$(".source-btn").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        buildGallery();
      });
    });

    $("#gallery").addEventListener("click", function (e) {
      var btn = e.target.closest(".gallery-item");
      if (!btn) return;
      openLightbox(galleryItems(), Number(btn.dataset.index));
    });

    // 라이트박스
    $("#lb-close").addEventListener("click", closeLightbox);
    $("#lb-prev").addEventListener("click", function () { showLightboxItem(lb.index - 1); });
    $("#lb-next").addEventListener("click", function () { showLightboxItem(lb.index + 1); });
    lb.root.addEventListener("click", function (e) {
      if (e.target === lb.root || e.target.id === "lb-stage") closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (lb.root.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); showLightboxItem(lb.index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); showLightboxItem(lb.index + 1); }
      else trapFocus(e);
    });

    // 키보드: / 로 검색
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (state.view !== "timeline") return;
      e.preventDefault();
      qInput.focus();
    });

    // 맨 위로
    var toTop = $("#to-top");
    var onScroll = function () {
      toTop.hidden = window.scrollY < 700;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      $("#main").focus({ preventScroll: true });
    });

    // 뒤로/앞으로
    window.addEventListener("hashchange", function () {
      if (!readHash()) return;
      applyHash();
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    $("#stat-posts").textContent = num(META.postCount || POSTS.length);
    $("#stat-photos").textContent = num(META.photoCount || PHOTOS.length);
    $("#gallery-total").textContent = num(META.photoCount || PHOTOS.length);
    if ($("#src-archive-count")) $("#src-archive-count").textContent = num(PHOTOS.length);
    if ($("#src-post-count")) $("#src-post-count").textContent = num(POSTPHOTOS.length);

    buildTopics();
    buildMonths();
    bindEvents();

    if (!applyHash()) {
      syncTopicButtons();
      renderFeed();
      setView("timeline", { keepScroll: true, skipHash: true });
      syncHash();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
