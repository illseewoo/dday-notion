const STORAGE_KEY = "notion_dday_widget_config_v2";

    // URL 파라미터 분기 모드 상태 추적
    let urlParamInfo = {
      isActive: false,
      description: "",
      filterType: null
    };

    // 애플리케이션 상태 (localStorage 연동)
    let state = loadState();
    let currentNewDDayMode = 0; // 새 디데이 생성용 임시 모드 (0: +0, 1: +1)
    let selectedBadgeColor = "blue"; // 새 배지 추가 시 선택된 색상

    /* ==========================================================================
       [2. 상태 관리 (Storage & URL 파라미터)]
       ========================================================================== */
    function loadState() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            theme: parsed.theme ?? DEFAULT_CONFIG.theme ?? "light",
            fontSizeScale: parsed.fontSizeScale ?? DEFAULT_CONFIG.fontSizeScale,
            showHeaderArea: parsed.showHeaderArea ?? (parsed.showHeaderTitle !== false || parsed.showTodayDate !== false),
            showHeaderTitle: parsed.showHeaderTitle ?? DEFAULT_CONFIG.showHeaderTitle,
            headerTitle: parsed.headerTitle ?? DEFAULT_CONFIG.headerTitle,
            showTodayDate: parsed.showTodayDate ?? DEFAULT_CONFIG.showTodayDate,
            badges: Array.isArray(parsed.badges) ? parsed.badges : DEFAULT_CONFIG.badges,
            items: Array.isArray(parsed.items) ? parsed.items : DEFAULT_CONFIG.items
          };
        }
      } catch (e) {
        console.warn("설정 로드 실패, 기본값을 사용합니다.", e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    function saveState(forceSave = false) {
      if (urlParamInfo.isActive && !forceSave) {
        // URL 파라미터 분기 모드일 때는 기본 로컬스토리지 데이터를 덮어쓰지 않고 현재 뷰에만 적용
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error("설정 저장 실패", e);
      }
    }

    /* --- 테마 모드 제어 (시스템 설정 / 라이트 / 다크) --- */
    function getSystemTheme() {
      if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      return "light";
    }

    function getEffectiveTheme(themeSetting) {
      const mode = themeSetting || state.theme || "system";
      if (mode === "system") {
        return getSystemTheme();
      }
      return mode === "dark" ? "dark" : "light";
    }

    function applyTheme(theme) {
      const themeSetting = theme || state.theme || "system";
      const effectiveTheme = getEffectiveTheme(themeSetting);

      document.documentElement.setAttribute("data-theme", effectiveTheme);
      document.body.classList.toggle("dark-mode", effectiveTheme === "dark");

      const btnSystem = document.getElementById("btn-theme-system");
      const btnLight = document.getElementById("btn-theme-light");
      const btnDark = document.getElementById("btn-theme-dark");

      if (btnSystem) btnSystem.classList.toggle("active", themeSetting === "system");
      if (btnLight) btnLight.classList.toggle("active", themeSetting === "light");
      if (btnDark) btnDark.classList.toggle("active", themeSetting === "dark");

      const genThemeSelect = document.getElementById("gen-theme-mode");
      if (genThemeSelect) genThemeSelect.value = themeSetting;
    }

    function setTheme(theme) {
      state.theme = (theme === "dark" || theme === "light" || theme === "system") ? theme : "system";
      applyTheme(state.theme);
      saveState();
      renderDDayList();
      renderSettingsView();
      updateGeneratedUrl();

      let toastMsg = "기기 시스템 설정 모드가 적용되었습니다. 💻";
      if (state.theme === "dark") {
        toastMsg = "다크 모드가 적용되었습니다. 🌙";
      } else if (state.theme === "light") {
        toastMsg = "라이트 모드가 적용되었습니다. ☀️";
      }
      showToast(toastMsg);
    }

    function showToast(msg) {
      const toast = document.getElementById("toast-msg");
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => {
        toast.classList.remove("show");
      }, 2000);
    }

    /* 위젯 모드(?hideTabs=1)에서 비상 설정 진입 */
    function openSettingsFromWidget() {
      document.body.classList.remove("hide-tabs");
      switchTab("settings");
      showToast("설정 화면으로 전환되었습니다.");
    }


    /* ==========================================================================
       [2-1. URL 파라미터 분기 파서 및 적용 엔진]
       ========================================================================== */
    const GITHUB_PAGES_BASE_URL = "https://illseewoo.github.io/dday-notion/";

    // 유연한 날짜 문자열 정규화 (YYYYMMDD, MM-DD, YYYY.MM.DD 등 지원)
    function normalizeDateString(dateStr) {
      if (!dateStr) return "";
      const clean = String(dateStr).trim();

      // 1. YYYYMMDD (8자리 숫자 예: 20261231)
      if (/^\d{8}$/.test(clean)) {
        return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      }

      // 2. YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
      const ymdMatch = clean.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
      if (ymdMatch) {
        const y = ymdMatch[1];
        const m = String(ymdMatch[2]).padStart(2, "0");
        const d = String(ymdMatch[3]).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // 3. YY-MM-DD (2자리 연도 예: 26-12-31)
      const y2mdMatch = clean.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);
      if (y2mdMatch) {
        const y = "20" + y2mdMatch[1];
        const m = String(y2mdMatch[2]).padStart(2, "0");
        const d = String(y2mdMatch[3]).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // 4. MM-DD, MM.DD, MM/DD (연도 생략 시 현재 연도 기준 예: 12-25)
      const mdMatch = clean.match(/^(\d{1,2})[-./](\d{1,2})$/);
      if (mdMatch) {
        const currentYear = new Date().getFullYear();
        const m = String(mdMatch[1]).padStart(2, "0");
        const d = String(mdMatch[2]).padStart(2, "0");
        return `${currentYear}-${m}-${d}`;
      }

      return clean;
    }

    // 디데이 목록을 URL items 파라미터 문자열로 직렬화
    function serializeItemsToUrlParams(items, badges) {
      if (!items || items.length === 0) return "";
      return items.map(item => {
        const badge = badges ? badges.find(b => b.id === item.badgeId) : null;
        // 배지명과 색상을 함께 보존 (예: 기획^blue)
        const badgeName = badge ? (badge.color ? `${badge.name}^${badge.color}` : badge.name) : "";
        const mode = item.dayCountMode === 1 ? "1" : "0";
        const timer = item.showTimer === false ? "0" : "1";
        const countPast = item.countPast === false ? "0" : "1";

        // 타이머나 카운트업이 0(OFF)인 경우 명시적 6개 토큰 형식 사용
        if (timer === "0" || countPast === "0") {
          return `${item.title}:${item.target}:${badgeName || ""}:${mode}:${timer}:${countPast}`;
        } else if (mode === "1") {
          return `${item.title}:${item.target}:${badgeName || ""}:1`;
        } else if (badgeName) {
          return `${item.title}:${item.target}:${badgeName}`;
        } else {
          return `${item.title}:${item.target}`;
        }
      }).join(",");
    }

    // URL 파라미터로 불러온 목록을 현재 기기 로컬에 저장
    function saveCurrentUrlItemsToLocal() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        urlParamInfo.isActive = false;
        urlParamInfo.description = "";
        urlParamInfo.filterType = null;

        // 브라우저 주소창 파라미터 제거 (? 쿼리 정리)
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }

        // 탭 숨김 및 컴팩트 모드 해제
        document.body.classList.remove("hide-tabs", "compact-mode");

        renderUrlParamBanner();
        renderDDayList();
        renderSettingsView();
        showToast("현재 목록이 이 기기의 기본 디데이로 저장되었습니다! 💾");
      } catch (e) {
        console.error("로컬 저장 실패", e);
        showToast("저장에 실패했습니다.");
      }
    }

    // 기본 로컬 저장 목록으로 복귀
    function resetToLocalList() {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      urlParamInfo.isActive = false;
      urlParamInfo.description = "";
      urlParamInfo.filterType = null;
      document.body.classList.remove("hide-tabs", "compact-mode");
      state = loadState();
      renderUrlParamBanner();
      renderDDayList();
      renderSettingsView();
      showToast("기본 저장 목록으로 복귀했습니다.");
    }

    function parseUrlParamsAndApply() {
      const params = new URLSearchParams(window.location.search);
      if (!window.location.search || params.toString() === "") {
        return;
      }

      // 0. 실시간 타이머 및 지난 날짜 카운트업 전역 파라미터 (?timer=0, ?countPast=0)
      const timerParam = params.get("timer") ?? params.get("showTimer") ?? params.get("liveTimer");
      const countPastParam = params.get("countPast") ?? params.get("countUp") ?? params.get("past");

      let globalTimer = null;
      if (timerParam !== null) {
        globalTimer = timerParam !== "0" && timerParam !== "false" && timerParam !== "off";
      }

      let globalCountPast = null;
      if (countPastParam !== null) {
        globalCountPast = countPastParam !== "0" && countPastParam !== "false" && countPastParam !== "off";
      }

      // 1. 사전 정의 프리셋 분기 (?preset=... 또는 ?type=...)
      const presetParam = params.get("preset") || params.get("type");
      if (presetParam) {
        const queryKey = presetParam.trim().toLowerCase();
        const matchedPreset = Object.values(PRESETS).find(p =>
          p.key.toLowerCase() === queryKey ||
          (p.aliases && p.aliases.some(a => a.toLowerCase() === queryKey))
        );

        if (matchedPreset) {
          state.badges = JSON.parse(JSON.stringify(matchedPreset.badges));
          state.items = JSON.parse(JSON.stringify(matchedPreset.items));
          state.headerTitle = matchedPreset.title;
          urlParamInfo.isActive = true;
          urlParamInfo.filterType = "preset";
          urlParamInfo.description = `프리셋: ${matchedPreset.name}`;
        }
      }

      // 2. 직접 입력 양식 파라미터 분기 (?items=... 또는 ?i=... 또는 다중 ?item=...)
      // 형식 예: ?items=시험:2026-11-15,종강:2026-12-20
      // 세부 형식: 제목:날짜:배지명:계산모드(0또는1):타이머(0또는1):카운트업(0또는1)
      const rawItems = params.get("items") || params.get("i") || params.getAll("item");
      let itemsList = [];
      if (typeof rawItems === "string") {
        itemsList = rawItems.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(rawItems) && rawItems.length > 0) {
        itemsList = rawItems;
      }

      if (itemsList.length > 0) {
        const customItems = [];
        const colorKeys = Object.keys(NOTION_COLORS);
        let colorIdx = 0;

        itemsList.forEach((token, idx) => {
          // 구분자 ':' 또는 '@' 지원
          const parts = token.includes("@") ? token.split("@") : token.split(":");
          const title = parts[0]?.trim();
          const rawTarget = parts[1]?.trim();
          const target = normalizeDateString(rawTarget);
          const rawBadgeToken = parts[2]?.trim();
          let badgeName = rawBadgeToken;
          let badgeColor = null;
          if (rawBadgeToken && rawBadgeToken.includes("^")) {
            const bParts = rawBadgeToken.split("^");
            badgeName = bParts[0]?.trim();
            badgeColor = bParts[1]?.trim();
          }

          const rawMode = parts[3]?.trim();
          const mode = (rawMode === "1" || rawMode === "+1") ? 1 : 0;
          const rawTimer = parts[4]?.trim();
          const rawCountPast = parts[5]?.trim();

          const itemTimer = (rawTimer !== undefined && rawTimer !== "")
            ? (rawTimer === "1" || rawTimer === "true" || rawTimer === "on")
            : (globalTimer !== null ? globalTimer : true);

          const itemCountPast = (rawCountPast !== undefined && rawCountPast !== "")
            ? (rawCountPast === "1" || rawCountPast === "true" || rawCountPast === "on")
            : (globalCountPast !== null ? globalCountPast : true);

          if (title && target) {
            let badgeId = null;
            if (badgeName) {
              let foundBadge = state.badges.find(b => b.name.toLowerCase() === badgeName.toLowerCase());
              if (!foundBadge) {
                badgeId = "b_url_" + idx;
                const assignedColor = (badgeColor && NOTION_COLORS[badgeColor])
                  ? badgeColor
                  : colorKeys[colorIdx % colorKeys.length];
                colorIdx++;
                foundBadge = { id: badgeId, name: badgeName, color: assignedColor };
                state.badges.push(foundBadge);
              } else {
                badgeId = foundBadge.id;
              }
            }

            customItems.push({
              id: "item_url_" + idx,
              title,
              target,
              badgeId,
              dayCountMode: mode,
              showTimer: itemTimer,
              countPast: itemCountPast
            });
          }
        });

        if (customItems.length > 0) {
          state.items = customItems;
          urlParamInfo.isActive = true;
          urlParamInfo.filterType = "custom";
          urlParamInfo.description = `URL 지정 디데이 (${customItems.length}개 항목)`;
        }
      }

      // 2-1. 단일 항목 간편 지정 파라미터 (?title=...&date=...)
      const singleTitle = params.get("title");
      const singleDate = params.get("date");
      if (singleTitle && singleDate && itemsList.length === 0) {
        const target = normalizeDateString(singleDate);
        const singleBadge = params.get("badge");
        let badgeId = null;
        if (singleBadge) {
          let foundBadge = state.badges.find(b => b.name === singleBadge);
          if (!foundBadge) {
            badgeId = "b_single";
            state.badges.push({ id: badgeId, name: singleBadge, color: "blue" });
          } else {
            badgeId = foundBadge.id;
          }
        }
        const rawMode = params.get("mode");
        const mode = (rawMode === "1" || rawMode === "+1") ? 1 : 0;
        state.items = [{
          id: "item_single",
          title: singleTitle,
          target,
          badgeId,
          dayCountMode: mode,
          showTimer: globalTimer !== null ? globalTimer : true,
          countPast: globalCountPast !== null ? globalCountPast : true
        }];
        urlParamInfo.isActive = true;
        urlParamInfo.filterType = "custom";
        urlParamInfo.description = `단일 디데이: ${singleTitle}`;
      }

      // 3. 특정 배지 필터링 분기 (?badge=... 또는 ?tag=... 또는 ?filter=...)
      const filterBadgeParam = params.get("badge") || params.get("tag") || params.get("filter");
      if (filterBadgeParam && (!singleTitle || !singleDate)) {
        const filterNames = filterBadgeParam.split(",").map(s => s.trim().toLowerCase());
        const filtered = state.items.filter(item => {
          const badge = state.badges.find(b => b.id === item.badgeId);
          if (!badge) return false;
          return filterNames.includes(badge.name.toLowerCase()) || filterNames.includes(badge.id.toLowerCase());
        });

        if (filtered.length > 0) {
          state.items = filtered;
          urlParamInfo.isActive = true;
          urlParamInfo.filterType = "badge";
          urlParamInfo.description = `배지 필터: ${filterBadgeParam}`;
        }
      }

      // 4. 전역 타이머 및 카운트업 오버라이드 적용 (프리셋/배지/단일/기본 모든 항목 대상)
      if (globalTimer !== null) {
        state.items.forEach(it => { it.showTimer = globalTimer; });
        urlParamInfo.isActive = true;
      }
      if (globalCountPast !== null) {
        state.items.forEach(it => { it.countPast = globalCountPast; });
        urlParamInfo.isActive = true;
      }

      // 상태 설명에 옵션 표시 추가
      const extraOptions = [];
      if (globalTimer === false) extraOptions.push("타이머 OFF");
      else if (globalTimer === true) extraOptions.push("타이머 ON");
      if (globalCountPast === false) extraOptions.push("카운트업 OFF");
      else if (globalCountPast === true) extraOptions.push("카운트업 ON");

      if (extraOptions.length > 0) {
        urlParamInfo.description = urlParamInfo.description
          ? `${urlParamInfo.description} | ${extraOptions.join(", ")}`
          : extraOptions.join(", ");
      }

      // 5. 헤더 타이틀 및 표시 옵션 오버라이드
      const headerTitle = params.get("header") || params.get("headerTitle") || params.get("h");
      if (headerTitle) {
        state.headerTitle = headerTitle;
      }

      const showHeader = params.get("showHeader");
      if (showHeader !== null) {
        const isHeaderOn = showHeader !== "0" && showHeader !== "false";
        state.showHeaderArea = isHeaderOn;
        state.showHeaderTitle = isHeaderOn;
      }

      const showToday = params.get("showToday");
      if (showToday !== null) {
        state.showTodayDate = showToday !== "0" && showToday !== "false";
      }

      // 6. 글꼴 배율 (?scale=1.1 또는 ?scale=110 또는 ?font=1.1)
      const scaleParam = params.get("scale") || params.get("font");
      if (scaleParam) {
        let val = parseFloat(scaleParam);
        if (val > 2) val = val / 100;
        if (!isNaN(val) && val >= 0.5 && val <= 2.0) {
          state.fontSizeScale = val;
        }
      }

      // 7. 노션 위젯 임베드 전용 뷰 모드 (?hideTabs=1, ?compact=1, ?widget=1)
      const hideTabsParam = params.get("hideTabs") || params.get("noTabs") || params.get("widget");
      const compactParam = params.get("compact");
      if (hideTabsParam === "1" || hideTabsParam === "true") {
        document.body.classList.add("hide-tabs");
      }
      if (compactParam === "1" || compactParam === "true") {
        document.body.classList.add("compact-mode");
      }

      // 8. 테마 모드 파라미터 오버라이드 (?theme=system, ?theme=dark, ?theme=light, ?dark=1, ?dark=true)
      const themeParam = params.get("theme");
      const darkParam = params.get("dark");
      if (themeParam) {
        const cleanTheme = themeParam.trim().toLowerCase();
        if (cleanTheme === "dark" || cleanTheme === "light" || cleanTheme === "system") {
          state.theme = cleanTheme;
        }
      } else if (darkParam === "1" || darkParam === "true") {
        state.theme = "dark";
      }
    }

    function renderUrlParamBanner() {
      const banner = document.getElementById("url-param-banner");
      const badgeText = document.getElementById("url-param-badge-text");
      if (!banner || !badgeText) return;

      if (urlParamInfo.isActive) {
        banner.style.display = "flex";
        badgeText.textContent = `⚡ URL 분기 활성: ${urlParamInfo.description}`;
      } else {
        banner.style.display = "none";
      }
    }

    /* ==========================================================================
       [3. 탭 전환 UX & 하단 탭 네비게이션]
       ========================================================================== */
    let currentActiveTab = "dday";

    function switchTab(tabName) {
      currentActiveTab = tabName;
      const ddayView = document.getElementById("view-dday");
      const settingsView = document.getElementById("view-settings");
      const ddayBtn = document.getElementById("tab-btn-dday");
      const settingsBtn = document.getElementById("tab-btn-settings");

      if (ddayBtn) ddayBtn.classList.toggle("active", tabName === "dday");
      if (settingsBtn) settingsBtn.classList.toggle("active", tabName === "settings");

      if (tabName === "dday") {
        ddayView.classList.add("active");
        settingsView.classList.remove("active");
        renderDDayList();
      } else {
        ddayView.classList.remove("active");
        settingsView.classList.add("active");
        renderSettingsView();
      }
    }

    /* --- 터치 스와이프 제스처 지원 (오른쪽 -> 왼쪽: 설정 / 왼쪽 -> 오른쪽: 목록) --- */
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouchIgnored = false;

    document.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();

      // 슬라이더, 입력창, 버튼 조작 중에는 스와이프 트리거 제외
      const target = e.target;
      if (target.closest("input, textarea, select, .slider, .color-palette, .mode-btn, .icon-btn, .more-menu-btn, .nav-modal")) {
        isTouchIgnored = true;
      } else {
        isTouchIgnored = false;
      }
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      if (isTouchIgnored || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      // 500ms 이내의 제스처만 인식 (길게 누르기 방지)
      if (elapsed > 500) return;

      const minDistance = 50; // 최소 이동 거리 (px)
      // 세로 스크롤과의 혼동을 막기 위해 가로 이동이 세로 이동의 1.5배 이상일 때만 동작
      if (Math.abs(deltaX) >= minDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0 && currentActiveTab === "dday") {
          // 오른쪽에서 왼쪽으로 스와이프 (<-) : 설정 화면으로
          switchTab("settings");
        } else if (deltaX > 0 && currentActiveTab === "settings") {
          // 왼쪽에서 오른쪽으로 스와이프 (->) : 디데이 목록으로
          switchTab("dday");
        }
      }
    }, { passive: true });

    /* ==========================================================================
       [4. 디데이 및 카운트다운 계산 엔진 (+0 / +1 지원)]
       ========================================================================== */
    function formatTargetDate(dateObj) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getDate()).padStart(2, "0");
      return `${year}.${month}.${day}`;
    }

    function calculateDDay(targetDateStr, countPast, dayCountMode = 0) {
      const now = new Date();
      // targetDateStr가 "YYYY-MM-DD"일 경우 로컬 타임존 자정으로 파싱
      const parts = targetDateStr.split(/[-T :]/);
      const target = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
        parts[3] ? parseInt(parts[3], 10) : 0,
        parts[4] ? parseInt(parts[4], 10) : 0,
        parts[5] ? parseInt(parts[5], 10) : 0
      );

      // 날짜 단위 비교용 자정 기준 계산
      const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
      const dayDiff = Math.round((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));

      // 초 단위 실시간 계산
      const diffMs = target.getTime() - now.getTime();
      const hasTimeSpecified = Boolean(parts[3]);
      const isPast = hasTimeSpecified ? diffMs < 0 : dayDiff < 0;

      let ddayText = "";
      if (dayDiff > 0) {
        // 미래 목표 날짜
        ddayText = `D-${dayDiff}`;
      } else if (dayDiff === 0) {
        // 당일 (오늘)
        if (dayCountMode === 1) {
          ddayText = "D+1"; // +1 모드: 당일을 1일째로 계산
        } else {
          ddayText = "D-Day"; // +0 모드: 당일은 D-Day
        }
      } else {
        // 과거 날짜
        const elapsed = Math.abs(dayDiff);
        if (!countPast) {
          ddayText = "완료";
        } else {
          if (dayCountMode === 1) {
            // +1 모드: 당일(1일차) + 경과일
            ddayText = `D+${elapsed + 1}`;
          } else {
            // +0 모드: 순수 경과일수
            ddayText = `D+${elapsed}`;
          }
        }
      }

      // 정밀 카운트다운 계산 (초/분/시/일)
      const absMs = Math.abs(diffMs);
      const totalSec = Math.floor(absMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      const countdownText = isPast && !countPast
        ? "일정이 마감되었습니다"
        : `${days}일 ${String(hours).padStart(2, '0')}시간 ${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`;

      return { ddayText, countdownText, isPast };
    }

    /* ==========================================================================
       [5. 렌더링: 디데이 목록 화면]
       ========================================================================== */
    function applyFontScale() {
      document.documentElement.style.setProperty("--font-scale", state.fontSizeScale);
    }

    function renderHeader() {
      const headerArea = document.getElementById("header-area");
      const pageTitle = document.getElementById("page-title");
      const currentToday = document.getElementById("current-today");

      const headerAreaActive = state.showHeaderArea !== false;
      const titleActive = headerAreaActive && Boolean(state.showHeaderTitle);
      const todayActive = headerAreaActive && Boolean(state.showTodayDate);

      pageTitle.textContent = state.headerTitle || "목표 & 기념일";
      pageTitle.style.display = titleActive ? "block" : "none";

      const today = new Date();
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      currentToday.textContent = `Today ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')} (${days[today.getDay()]})`;
      currentToday.style.display = todayActive ? "block" : "none";

      if (!headerAreaActive || (!titleActive && !todayActive)) {
        headerArea.style.display = "none";
      } else {
        headerArea.style.display = "flex";
      }
    }

    function getBadgeInfo(badgeId) {
      if (!badgeId) return null;
      const found = state.badges.find(b => b.id === badgeId);
      if (found) {
        const isDark = (getEffectiveTheme() === "dark");
        const palette = (isDark && typeof NOTION_COLORS_DARK !== "undefined") ? NOTION_COLORS_DARK : NOTION_COLORS;
        const colorData = palette[found.color] || palette.gray;
        return { name: found.name, bg: colorData.bg, text: colorData.text };
      }
      return null;
    }

    function renderDDayList() {
      renderHeader();
      applyFontScale();
      renderUrlParamBanner();

      const listContainer = document.getElementById("dday-list");
      listContainer.innerHTML = "";

      if (!state.items || state.items.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state">
            등록된 디데이가 없습니다.<br />
            하단 <b>환경 설정 (<i class="ti ti-settings"></i>)</b> 탭에서 새로운 디데이를 추가해보세요!
          </div>
        `;
        return;
      }

      state.items.forEach((item, index) => {
        const parts = item.target.split(/[-T :]/);
        const targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const mode = item.dayCountMode ?? 0;
        const { ddayText, countdownText } = calculateDDay(item.target, item.countPast, mode);
        const badgeInfo = getBadgeInfo(item.badgeId);

        const card = document.createElement("div");
        card.className = "dday-card";
        card.innerHTML = `
          <div class="info-wrap">
            <div class="title-row">
              <span class="item-title">${escapeHtml(item.title)}</span>
              ${badgeInfo ? `<span class="badge" style="background-color: ${badgeInfo.bg}; color: ${badgeInfo.text};">${escapeHtml(badgeInfo.name)}</span>` : ""}
            </div>
            <div class="item-meta">
              <span>목표일: ${formatTargetDate(targetDate)}</span>
            </div>
          </div>
          <div class="counter-wrap">
            <div class="dday-tag">${ddayText}</div>
            ${item.showTimer ? `<div class="countdown-detail" id="timer-${index}">${countdownText}</div>` : ""}
          </div>
        `;
        listContainer.appendChild(card);
      });
    }

    function updateTimers() {
      // 디데이 탭이 활성화되어 있을 때만 초 단위 갱신
      const ddayView = document.getElementById("view-dday");
      if (!ddayView.classList.contains("active")) return;

      state.items.forEach((item, index) => {
        if (!item.showTimer) return;
        const timerEl = document.getElementById(`timer-${index}`);
        if (timerEl) {
          const mode = item.dayCountMode ?? 0;
          const { countdownText } = calculateDDay(item.target, item.countPast, mode);
          timerEl.textContent = countdownText;
        }
      });
    }

    /* ==========================================================================
       [6. 렌더링 & 제어: 설정 화면]
       ========================================================================== */
    function renderSettingsView() {
      applyFontScale();
      applyTheme(state.theme);
      renderUrlParamBanner();

      // 1. 글꼴 슬라이더 및 프리셋 버튼 상태
      const slider = document.getElementById("font-scale-slider");
      const text = document.getElementById("font-scale-text");
      slider.value = state.fontSizeScale;
      text.textContent = Math.round(state.fontSizeScale * 100) + "%";
      updatePresetButtonHighlight(state.fontSizeScale);

      // 2. 상단 헤더 및 세부 옵션 상태 렌더링
      const headerAreaActive = state.showHeaderArea !== false;
      const toggleShowHeader = document.getElementById("toggle-show-header");
      const subOptions = document.getElementById("header-sub-options");
      if (toggleShowHeader) toggleShowHeader.checked = headerAreaActive;
      if (subOptions) subOptions.style.display = headerAreaActive ? "flex" : "none";

      document.getElementById("toggle-show-title").checked = state.showHeaderTitle !== false;
      document.getElementById("input-header-title").value = state.headerTitle || "";
      document.getElementById("toggle-show-today").checked = state.showTodayDate !== false;
      document.getElementById("title-text-group").style.display = (headerAreaActive && state.showHeaderTitle !== false) ? "flex" : "none";

      // 3. 새 디데이 폼의 배지 선택 셀렉트박스 갱신
      renderBadgeSelectOptions();

      // 4. 배지 관리 팔레트 및 배지 칩 렌더링
      renderColorPalette();
      renderBadgeChips();

      // 5. 디데이 관리 목록 렌더링
      renderManageDDayList();
    }

    /* --- 글꼴 크기 제어 --- */
    function setFontScale(scale) {
      state.fontSizeScale = parseFloat(scale);
      document.getElementById("font-scale-slider").value = state.fontSizeScale;
      document.getElementById("font-scale-text").textContent = Math.round(state.fontSizeScale * 100) + "%";
      updatePresetButtonHighlight(state.fontSizeScale);
      applyFontScale();
      saveState();
      updateGeneratedUrl();
    }

    function onFontSliderInput(val) {
      state.fontSizeScale = parseFloat(val);
      document.getElementById("font-scale-text").textContent = Math.round(state.fontSizeScale * 100) + "%";
      updatePresetButtonHighlight(state.fontSizeScale);
      applyFontScale();
      saveState();
      updateGeneratedUrl();
    }

    function updatePresetButtonHighlight(scale) {
      const presets = document.querySelectorAll(".preset-btn");
      presets.forEach(btn => btn.classList.remove("active"));
      if (Math.abs(scale - 0.85) < 0.02) presets[0]?.classList.add("active");
      else if (Math.abs(scale - 1.00) < 0.02) presets[1]?.classList.add("active");
      else if (Math.abs(scale - 1.15) < 0.02) presets[2]?.classList.add("active");
      else if (Math.abs(scale - 1.30) < 0.02) presets[3]?.classList.add("active");
    }

    /* --- 헤더 및 세부 옵션 설정 --- */
    function onToggleHeaderArea() {
      const isHeaderOn = document.getElementById("toggle-show-header").checked;
      state.showHeaderArea = isHeaderOn;

      const subOptions = document.getElementById("header-sub-options");
      if (subOptions) {
        subOptions.style.display = isHeaderOn ? "flex" : "none";
      }


      renderHeader();
      saveState();
      updateGeneratedUrl();
    }

    function updateHeaderSettings() {
      state.showHeaderArea = document.getElementById("toggle-show-header").checked;
      state.showHeaderTitle = document.getElementById("toggle-show-title").checked;
      state.headerTitle = document.getElementById("input-header-title").value.trim();
      state.showTodayDate = document.getElementById("toggle-show-today").checked;

      document.getElementById("title-text-group").style.display = (state.showHeaderArea && state.showHeaderTitle) ? "flex" : "none";
      renderHeader();
      saveState();
      updateGeneratedUrl();
    }

    /* --- 새 디데이 추가 --- */
    function setNewDDayMode(mode) {
      currentNewDDayMode = mode;
      document.getElementById("btn-mode-0").classList.toggle("active", mode === 0);
      document.getElementById("btn-mode-1").classList.toggle("active", mode === 1);
    }

    function handleCreateDDay(e) {
      e.preventDefault();
      const title = document.getElementById("new-dday-title").value.trim();
      const target = document.getElementById("new-dday-date").value;
      const badgeId = document.getElementById("new-dday-badge").value;
      const showTimer = document.getElementById("new-dday-timer").checked;
      const countPast = document.getElementById("new-dday-past").checked;

      if (!title || !target) {
        alert("제목과 목표 날짜를 입력해주세요.");
        return;
      }

      const newItem = {
        id: "item_" + Date.now(),
        title,
        target,
        badgeId: badgeId || null,
        dayCountMode: currentNewDDayMode,
        showTimer,
        countPast
      };

      state.items.push(newItem);
      if (urlParamInfo.isActive) {
        urlParamInfo.isActive = false;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        renderUrlParamBanner();
      }
      saveState(true);

      // 폼 초기화
      document.getElementById("new-dday-title").value = "";
      document.getElementById("new-dday-date").value = "";
      document.getElementById("new-dday-badge").value = "";
      setNewDDayMode(0);

      renderManageDDayList();
      renderDDayList();
      updateGeneratedUrl();
      showToast("새 디데이가 추가되었습니다!");
    }

    /* --- 각 디데이별 +0 / +1 계산 방식 즉시 토글 및 순서/수정/삭제 관리 --- */
    let editingDDayId = null;

    function startEditDDay(itemId) {
      editingDDayId = itemId;
      renderManageDDayList();
      setTimeout(() => {
        const input = document.getElementById(`edit-title-${itemId}`);
        if (input) input.focus();
      }, 50);
    }

    function cancelEditDDay() {
      editingDDayId = null;
      renderManageDDayList();
    }

    function saveEditDDay(itemId) {
      const item = state.items.find(it => it.id === itemId);
      if (!item) return;

      const titleInput = document.getElementById(`edit-title-${itemId}`);
      const dateInput = document.getElementById(`edit-date-${itemId}`);
      const badgeSelect = document.getElementById(`edit-badge-${itemId}`);

      const newTitle = titleInput ? titleInput.value.trim() : "";
      const newDate = dateInput ? dateInput.value : "";
      const newBadgeId = badgeSelect ? (badgeSelect.value || null) : null;

      if (!newTitle) {
        alert("디데이 제목을 입력해주세요.");
        return;
      }
      if (!newDate) {
        alert("목표 날짜를 입력해주세요.");
        return;
      }

      item.title = newTitle;
      item.target = newDate;
      item.badgeId = newBadgeId;

      if (urlParamInfo.isActive) {
        urlParamInfo.isActive = false;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        renderUrlParamBanner();
      }

      saveState(true);
      editingDDayId = null;

      renderManageDDayList();
      renderDDayList();
      updateGeneratedUrl();
      showToast(`'${newTitle}' 디데이가 수정되었습니다. ✏️`);
    }

    function toggleDDayMode(itemId, newMode) {
      const item = state.items.find(it => it.id === itemId);
      if (item) {
        item.dayCountMode = newMode;
        if (urlParamInfo.isActive) {
          urlParamInfo.isActive = false;
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", window.location.pathname);
          }
          renderUrlParamBanner();
        }
        saveState(true);
        renderManageDDayList();
        renderDDayList();
        updateGeneratedUrl();
        showToast(`계산 방식이 [${newMode === 1 ? "+1 (1일차 시작)" : "+0 (당일 D-Day)"}] 로 변경되었습니다.`);
      }
    }

    function moveDDay(index, direction) {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= state.items.length) return;
      const temp = state.items[index];
      state.items[index] = state.items[newIndex];
      state.items[newIndex] = temp;
      if (urlParamInfo.isActive) {
        urlParamInfo.isActive = false;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        renderUrlParamBanner();
      }
      saveState(true);
      renderManageDDayList();
      renderDDayList();
      updateGeneratedUrl();
    }

    function deleteDDay(itemId) {
      const item = state.items.find(it => it.id === itemId);
      if (!item) return;
      if (confirm(`'${item.title}' 디데이를 삭제하시겠습니까?`)) {
        state.items = state.items.filter(it => it.id !== itemId);
        if (editingDDayId === itemId) editingDDayId = null;
        if (urlParamInfo.isActive) {
          urlParamInfo.isActive = false;
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", window.location.pathname);
          }
          renderUrlParamBanner();
        }
        saveState(true);
        renderManageDDayList();
        renderDDayList();
        updateGeneratedUrl();
        showToast("디데이가 삭제되었습니다.");
      }
    }

    function toggleDDayTimer(itemId) {
      const item = state.items.find(it => it.id === itemId);
      if (item) {
        item.showTimer = item.showTimer === false ? true : false;
        if (urlParamInfo.isActive) {
          urlParamInfo.isActive = false;
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", window.location.pathname);
          }
          renderUrlParamBanner();
        }
        saveState(true);
        renderManageDDayList();
        renderDDayList();
        updateGeneratedUrl();
        showToast(`'${item.title}' 타이머: ${item.showTimer ? "ON" : "OFF"}`);
      }
    }

    function toggleDDayCountPast(itemId) {
      const item = state.items.find(it => it.id === itemId);
      if (item) {
        item.countPast = item.countPast === false ? true : false;
        if (urlParamInfo.isActive) {
          urlParamInfo.isActive = false;
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", window.location.pathname);
          }
          renderUrlParamBanner();
        }
        saveState(true);
        renderManageDDayList();
        renderDDayList();
        updateGeneratedUrl();
        showToast(`'${item.title}' 카운트업: ${item.countPast ? "ON" : "OFF"}`);
      }
    }

    function renderManageDDayList() {
      const container = document.getElementById("manage-dday-list");
      container.innerHTML = "";

      if (!state.items || state.items.length === 0) {
        container.innerHTML = `<div style="font-size:0.85em; color:var(--text-muted); text-align:center; padding:16px;">등록된 디데이가 없습니다.</div>`;
        return;
      }

      state.items.forEach((item, index) => {
        const badgeInfo = getBadgeInfo(item.badgeId);
        const mode = item.dayCountMode ?? 0;
        const timerActive = item.showTimer !== false;
        const pastActive = item.countPast !== false;
        const isEditing = editingDDayId === item.id;

        const itemEl = document.createElement("div");
        itemEl.className = `manage-item ${isEditing ? "is-editing" : ""}`;

        const badgeOptionsHtml = state.badges.map(b => {
          const colorName = NOTION_COLORS[b.color]?.name || "기본";
          return `<option value="${b.id}" ${b.id === item.badgeId ? "selected" : ""}>${escapeHtml(b.name)} (${colorName})</option>`;
        }).join("");

        itemEl.innerHTML = `
          <div class="manage-item-info">
            <div class="manage-item-title">${escapeHtml(item.title)}</div>
            <div class="manage-item-meta">
              <span><i class="ti ti-calendar"></i> ${item.target}</span>
              ${badgeInfo ? `<span class="badge" style="background-color:${badgeInfo.bg}; color:${badgeInfo.text}; font-size:0.7em;">${escapeHtml(badgeInfo.name)}</span>` : ""}
            </div>
          </div>

          <!-- +0 vs +1 즉시 선택 토글러 -->
          <div class="mode-toggle-group">
            <button type="button" class="mode-btn ${mode === 0 ? "active" : ""}" onclick="toggleDDayMode('${item.id}', 0)" title="당일 D-Day, 다음날 D+1">+0</button>
            <button type="button" class="mode-btn ${mode === 1 ? "active" : ""}" onclick="toggleDDayMode('${item.id}', 1)" title="당일 D+1, 1일차 시작">+1</button>
          </div>

          <!-- 실시간 타이머 및 카운트업 토글러 -->
          <div class="mode-toggle-group">
            <button type="button" class="mode-btn toggle-btn ${timerActive ? "active" : ""}" onclick="toggleDDayTimer('${item.id}')" title="초 단위 실시간 타이머 노출 여부"><i class="ti ti-clock"></i> <span class="toggle-text">${timerActive ? "ON" : "OFF"}</span></button>
            <button type="button" class="mode-btn toggle-btn ${pastActive ? "active" : ""}" onclick="toggleDDayCountPast('${item.id}')" title="경과 후 D+N 누적 여부 (OFF: 완료 표시)"><i class="ti ti-trending-up"></i> <span class="toggle-text">${pastActive ? "ON" : "OFF"}</span></button>
          </div>

          <!-- 순서 변경, 수정, 삭제 버튼 -->
          <div class="manage-item-actions">
            <button type="button" class="icon-btn" title="위로 이동" onclick="moveDDay(${index}, -1)" ${index === 0 ? "disabled style='opacity:0.3; cursor:default;'" : ""}><i class="ti ti-chevron-up"></i></button>
            <button type="button" class="icon-btn" title="아래로 이동" onclick="moveDDay(${index}, 1)" ${index === state.items.length - 1 ? "disabled style='opacity:0.3; cursor:default;'" : ""}><i class="ti ti-chevron-down"></i></button>
            <button type="button" class="icon-btn" title="수정" onclick="startEditDDay('${item.id}')"><i class="ti ti-pencil"></i></button>
            <button type="button" class="icon-btn delete" title="삭제" onclick="deleteDDay('${item.id}')"><i class="ti ti-trash"></i></button>
          </div>

          ${isEditing ? `
            <div class="manage-item-edit-box">
              <div class="form-group">
                <label class="form-label" style="font-size:0.78em;">디데이 제목</label>
                <input type="text" id="edit-title-${item.id}" class="input-text" value="${escapeHtml(item.title)}" placeholder="제목을 입력하세요" />
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label" style="font-size:0.78em;">목표 날짜</label>
                  <input type="date" id="edit-date-${item.id}" class="input-date" value="${item.target}" />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:0.78em;">배지 선택</label>
                  <select id="edit-badge-${item.id}" class="input-select">
                    <option value="">배지 없음</option>
                    ${badgeOptionsHtml}
                  </select>
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:2px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="cancelEditDDay()">취소</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="saveEditDDay('${item.id}')" style="display:inline-flex; align-items:center; gap:4px;"><i class="ti ti-device-floppy"></i> 저장</button>
              </div>
            </div>
          ` : ""}
        `;
        container.appendChild(itemEl);
      });
    }

    /* --- 배지 관리 --- */
    function renderColorPalette() {
      const palette = document.getElementById("color-palette");
      palette.innerHTML = "";

      const isDark = (getEffectiveTheme() === "dark");
      const paletteSource = (isDark && typeof NOTION_COLORS_DARK !== "undefined") ? NOTION_COLORS_DARK : NOTION_COLORS;

      Object.entries(paletteSource).forEach(([key, color]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `color-btn ${selectedBadgeColor === key ? "active" : ""}`;
        btn.style.backgroundColor = color.bg;
        btn.style.color = color.text;
        btn.title = color.name;
        btn.textContent = "●";
        btn.onclick = () => {
          selectedBadgeColor = key;
          renderColorPalette();
        };
        palette.appendChild(btn);
      });
    }

    function renderBadgeSelectOptions() {
      const select = document.getElementById("new-dday-badge");
      const currentVal = select.value;
      select.innerHTML = `<option value="">배지 없음</option>`;

      const genBadgeSelect = document.getElementById("gen-badge-select");
      const currentGenVal = genBadgeSelect ? genBadgeSelect.value : "";
      if (genBadgeSelect) {
        genBadgeSelect.innerHTML = `<option value="">배지를 선택하세요</option>`;
      }

      state.badges.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = `${b.name} (${NOTION_COLORS[b.color]?.name || "기본"})`;
        select.appendChild(opt);

        if (genBadgeSelect) {
          const genOpt = document.createElement("option");
          genOpt.value = b.name;
          genOpt.textContent = `${b.name}`;
          genBadgeSelect.appendChild(genOpt);
        }
      });

      select.value = currentVal;
      if (genBadgeSelect) {
        genBadgeSelect.value = currentGenVal || (state.badges[0] ? state.badges[0].name : "");
      }
    }

    /* ==========================================================================
       [6-1. 노션 임베드 링크 생성기 UI 로직]
       ========================================================================== */
    let currentGenType = "current";
    let selectedGenPresetKey = "project";

    function initUrlGenerator() {
      // 1. 프리셋 칩 목록 생성
      const chipContainer = document.getElementById("gen-preset-chips");
      if (chipContainer) {
        chipContainer.innerHTML = "";
        Object.values(PRESETS).forEach(preset => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = `preset-chip ${preset.key === selectedGenPresetKey ? "active" : ""}`;
          chip.textContent = `${preset.name}`;
          chip.onclick = () => {
            selectedGenPresetKey = preset.key;
            document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            updateGeneratedUrl();
          };
          chipContainer.appendChild(chip);
        });
      }

      // 오늘 날짜 스위치 변경 시 URL 생성기 자동 갱신
      const toggleShowToday = document.getElementById("toggle-show-today");
      if (toggleShowToday) {
        toggleShowToday.addEventListener("change", () => {
          updateGeneratedUrl();
        });
      }

      // 상단 헤더 스위치 변경 시 URL 생성기 자동 갱신
      const toggleShowHeader = document.getElementById("toggle-show-header");
      if (toggleShowHeader) {
        toggleShowHeader.addEventListener("change", () => {
          updateGeneratedUrl();
        });
      }

      renderBadgeSelectOptions();
      updateGeneratedUrl();
    }

    function setGenType(type) {
      currentGenType = type;
      document.getElementById("gen-type-current")?.classList.toggle("active", type === "current");
      document.getElementById("gen-type-preset")?.classList.toggle("active", type === "preset");
      document.getElementById("gen-type-badge")?.classList.toggle("active", type === "badge");
      document.getElementById("gen-type-custom")?.classList.toggle("active", type === "custom");

      const areaCurrent = document.getElementById("gen-area-current");
      const areaPreset = document.getElementById("gen-area-preset");
      const areaBadge = document.getElementById("gen-area-badge");
      const areaCustom = document.getElementById("gen-area-custom");

      if (areaCurrent) areaCurrent.style.display = type === "current" ? "block" : "none";
      if (areaPreset) areaPreset.style.display = type === "preset" ? "flex" : "none";
      if (areaBadge) areaBadge.style.display = type === "badge" ? "flex" : "none";
      if (areaCustom) areaCustom.style.display = type === "custom" ? "flex" : "none";

      updateGeneratedUrl();
    }

    function updateGeneratedUrl() {
      // 배포 주소(GitHub Pages)를 기본으로 생성 (로컬/file 환경에서도 바로 노션에 쓸 수 있도록)
      const baseUrl = GITHUB_PAGES_BASE_URL;
      const params = new URLSearchParams();

      if (currentGenType === "current") {
        // 현재 내 기기에 저장된 모든 디데이 목록을 직렬화하여 URL에 담기
        const serialized = serializeItemsToUrlParams(state.items, state.badges);
        if (serialized) {
          params.set("items", serialized);
        } else {
          params.set("items", "목표:2026-12-31");
        }
      } else if (currentGenType === "preset") {
        params.set("preset", selectedGenPresetKey);
      } else if (currentGenType === "badge") {
        const badgeSelect = document.getElementById("gen-badge-select");
        const selectedBadgeName = badgeSelect ? badgeSelect.value : "";
        if (selectedBadgeName) {
          params.set("badge", selectedBadgeName);
          // 배지에 해당하는 현재 디데이 항목들을 함께 직렬화하여 다른 기기/노션에서도 온전히 노출되도록 보장
          const matchedItems = state.items.filter(it => {
            const b = state.badges.find(bg => bg.id === it.badgeId);
            return b && b.name.toLowerCase() === selectedBadgeName.toLowerCase();
          });
          if (matchedItems.length > 0) {
            params.set("items", serializeItemsToUrlParams(matchedItems, state.badges));
          }
        } else if (state.badges[0]) {
          params.set("badge", state.badges[0].name);
        }
      } else if (currentGenType === "custom") {
        const customInput = document.getElementById("gen-custom-items");
        const val = customInput ? customInput.value.trim() : "";
        if (val) {
          params.set("items", val);
        } else {
          params.set("items", "목표일정:2026-12-31");
        }
      }

      // 커스텀 헤더 제목
      if (state.headerTitle && state.headerTitle !== DEFAULT_CONFIG.headerTitle && currentGenType !== "preset") {
        params.set("header", state.headerTitle);
      }

      // 글꼴 배율 (기본 1.0이 아닐 때)
      if (state.fontSizeScale && Math.abs(state.fontSizeScale - 1.0) > 0.01) {
        params.set("scale", state.fontSizeScale.toFixed(2));
      }

      // 테마 모드 파라미터: dark 또는 light로 명시적 고정 시 URL에 포함
      const themeSelectVal = document.getElementById("gen-theme-mode")?.value || state.theme;
      if (themeSelectVal === "dark") {
        params.set("theme", "dark");
      } else if (themeSelectVal === "light") {
        params.set("theme", "light");
      } else if (themeSelectVal === "system") {
        // 기본이 system이므로 깔끔한 URL을 위해 생략하거나 필요 시 유지 (URL이 명시적인 경우 반영 가능)
      }

      // 부가 옵션 파라미터: 화면 여백 스타일 (드롭다운)
      const paddingMode = document.getElementById("gen-padding-mode")?.value || "default";
      if (paddingMode === "compact") {
        params.set("compact", "1");
      }

      // 부가 옵션 파라미터: 하단 탭 바 숨김 (토글)
      const hideTabsChecked = document.getElementById("gen-opt-hidetabs")?.checked;
      if (hideTabsChecked) {
        params.set("hideTabs", "1");
      }

      // 상단 헤더 표시: 상단 화면 설정의 상태를 URL에 직접 반영
      if (state.showHeaderArea === false) {
        params.set("showHeader", "0");
      }

      // 오늘 날짜 표시: 상단 화면 설정의 상태를 URL에 직접 반영
      if (state.showTodayDate === false) {
        params.set("showToday", "0");
      }


      const queryString = params.toString();
      const finalUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

      const urlInput = document.getElementById("gen-result-url");
      const testLink = document.getElementById("gen-test-link");
      if (urlInput) urlInput.value = finalUrl;
      if (testLink) testLink.href = finalUrl;
    }

    function copyGeneratedUrl() {
      const urlInput = document.getElementById("gen-result-url");
      if (!urlInput) return;

      const url = urlInput.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast("노션 임베드 링크가 복사되었습니다!");
        }).catch(() => {
          fallbackCopyText(url);
        });
      } else {
        fallbackCopyText(url);
      }
    }

    function fallbackCopyText(text) {
      const input = document.getElementById("gen-result-url");
      if (input) {
        input.select();
        document.execCommand("copy");
        showToast("노션 임베드 링크가 복사되었습니다!");
      }
    }

    function renderBadgeChips() {
      const container = document.getElementById("badge-chips-container");
      container.innerHTML = "";

      if (!state.badges || state.badges.length === 0) {
        container.innerHTML = `<span style="font-size:0.8em; color:var(--text-muted);">등록된 배지가 없습니다. 위에서 배지를 만들어보세요.</span>`;
        return;
      }

      const isDark = (getEffectiveTheme() === "dark");
      const palette = (isDark && typeof NOTION_COLORS_DARK !== "undefined") ? NOTION_COLORS_DARK : NOTION_COLORS;

      state.badges.forEach(badge => {
        const color = palette[badge.color] || palette.gray;
        const chip = document.createElement("span");
        chip.className = "badge-chip";
        chip.style.backgroundColor = color.bg;
        chip.style.color = color.text;
        chip.innerHTML = `
          <span>${escapeHtml(badge.name)}</span>
          <span class="badge-chip-del" title="배지 삭제" onclick="handleDeleteBadge('${badge.id}')">✕</span>
        `;
        container.appendChild(chip);
      });
    }

    function handleAddBadge() {
      const input = document.getElementById("new-badge-name");
      const name = input.value.trim();
      if (!name) {
        alert("배지 이름을 입력해주세요.");
        return;
      }

      const newBadge = {
        id: "b_" + Date.now(),
        name,
        color: selectedBadgeColor
      };

      state.badges.push(newBadge);
      saveState();
      input.value = "";

      renderBadgeChips();
      renderBadgeSelectOptions();
      updateGeneratedUrl();
      showToast(`'${name}' 배지가 추가되었습니다.`);
    }

    function handleDeleteBadge(badgeId) {
      const badge = state.badges.find(b => b.id === badgeId);
      if (!badge) return;

      if (confirm(`'${badge.name}' 배지를 삭제하시겠습니까?`)) {
        state.badges = state.badges.filter(b => b.id !== badgeId);
        // 디데이 중 이 배지를 쓰고 있던 항목은 null로 변경
        state.items.forEach(it => {
          if (it.badgeId === badgeId) it.badgeId = null;
        });
        saveState();

        renderBadgeChips();
        renderBadgeSelectOptions();
        renderManageDDayList();
        updateGeneratedUrl();
        showToast("배지가 삭제되었습니다.");
      }
    }

    /* --- 기본값 복원 --- */
    function handleResetDefaults() {
      if (confirm("모든 설정과 디데이 목록을 초기 상태로 되돌리시겠습니까?")) {
        state = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        saveState();
        renderDDayList();
        renderSettingsView();
        updateGeneratedUrl();
        showToast("기본 설정으로 초기화되었습니다.");
      }
    }

    /* 유틸리티: HTML 이스케이프 */
    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    /* ==========================================================================
       [7. 초기화 및 이벤트 리스너]
       ========================================================================== */
    // 1. URL 파라미터 분기 파싱 및 적용 (프리셋, 직접 지정, 배지 필터, 뷰 모드 등)
    parseUrlParamsAndApply();

    // 1-1. 테마 모드 즉시 적용 및 OS 시스템 테마 변경 실시간 리스너 등록
    applyTheme(state.theme);

    if (typeof window !== "undefined" && window.matchMedia) {
      const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = () => {
        if (state.theme === "system") {
          applyTheme("system");
          renderDDayList();
          if (document.getElementById("view-settings")?.classList.contains("active")) {
            renderSettingsView();
          }
        }
      };
      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener("change", handleSystemThemeChange);
      } else if (darkModeMediaQuery.addListener) {
        darkModeMediaQuery.addListener(handleSystemThemeChange);
      }
    }

    // 2. 오늘 날짜를 새 디데이 기본 날짜로 세팅
    const todayStr = new Date().toISOString().split("T")[0];
    document.getElementById("new-dday-date").value = todayStr;

    // 3. 노션 임베드 링크 생성기 초기화
    initUrlGenerator();

    // 4. 초기 렌더링
    renderDDayList();
    renderSettingsView();

    // 5. 1초마다 실시간 타이머 갱신
    setInterval(updateTimers, 1000);
