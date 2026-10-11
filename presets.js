/* ==========================================================================
       [1. 노션 컬러 팔레트 & 기본 데이터 정의]
       ========================================================================== */
    const NOTION_COLORS = {
      gray: { name: "회색", bg: "#f1f1ef", text: "#5a5a58" },
      brown: { name: "브라운", bg: "#f4eeee", text: "#785e4e" },
      orange: { name: "오렌지", bg: "#faece3", text: "#bc5b22" },
      yellow: { name: "노랑", bg: "#fbf3db", text: "#af7d15" },
      green: { name: "초록", bg: "#edf3ec", text: "#376e48" },
      blue: { name: "파랑", bg: "#e7f3f8", text: "#1d688d" },
      purple: { name: "보라", bg: "#f4f0f7", text: "#6e4198" },
      pink: { name: "핑크", bg: "#fbf0f4", text: "#963863" },
      red: { name: "빨강", bg: "#fdebec", text: "#be3a38" }
    };

    const NOTION_COLORS_DARK = {
      gray: { name: "회색", bg: "#2f2f2f", text: "#b0b0ad" },
      brown: { name: "브라운", bg: "#382923", text: "#cfa693" },
      orange: { name: "오렌지", bg: "#402816", text: "#d98f5b" },
      yellow: { name: "노랑", bg: "#3c331a", text: "#d4b360" },
      green: { name: "초록", bg: "#1f3627", text: "#6bb387" },
      blue: { name: "파랑", bg: "#1d3345", text: "#78a0d4" },
      purple: { name: "보라", bg: "#342642", text: "#b081e0" },
      pink: { name: "핑크", bg: "#3f2533", text: "#d475a3" },
      red: { name: "빨강", bg: "#3f2022", text: "#d46b6e" }
    };

    const DEFAULT_CONFIG = {
      theme: "system", // "system", "light", 또는 "dark"
      fontSizeScale: 1.0,
      showHeaderArea: true,
      showHeaderTitle: true,
      headerTitle: "",
      showTodayDate: true,
      badges: [
        { id: "b_goal", name: "목표", color: "green" },
        { id: "b_exam", name: "시험", color: "red" },
        { id: "b_anni", name: "기념일", color: "pink" }
      ],
      items: [
        {
          id: "item_1",
          title: "목표 달성일",
          target: "2026-12-31",
          badgeId: "b_goal",
          dayCountMode: 0, // 0: +0 계산 (당일 D-Day, 익일부터 D+1), 1: +1 계산 (당일 D+1, 1일차 시작)
          showTimer: true,
          countPast: true
        }
      ]
    };

    /* ==========================================================================
       [1-1. 테마별 사전 정의 프리셋 (URL 파라미터 분기용)]
       ========================================================================== */
    const PRESETS = {
      project: {
        key: "project",
        name: "프로젝트 & 런칭",
        title: "🚀 프로젝트 일정",
        aliases: ["dev", "개발", "프로젝트", "launch"],
        badges: [
          { id: "p_plan", name: "기획", color: "blue" },
          { id: "p_dev", name: "개발", color: "orange" },
          { id: "p_test", name: "QA", color: "yellow" },
          { id: "p_launch", name: "출시", color: "purple" }
        ],
        items: [
          { id: "pr_1", title: "프로젝트 킥오프", target: "2026-09-01", badgeId: "p_plan", dayCountMode: 0, showTimer: false, countPast: true },
          { id: "pr_2", title: "시네마보드 베타 QA", target: "2026-10-20", badgeId: "p_test", dayCountMode: 0, showTimer: true, countPast: true },
          { id: "pr_3", title: "프로덕션 심사 제출", target: "2026-11-15", badgeId: "p_launch", dayCountMode: 0, showTimer: true, countPast: true }
        ]
      },
      exam: {
        key: "exam",
        name: "시험 & 자격증",
        title: "✍️ 시험 & 자격증 합격",
        aliases: ["study", "시험", "공부", "자격증", "test"],
        badges: [
          { id: "e_cert", name: "자격증", color: "blue" },
          { id: "e_mid", name: "중간/기말", color: "red" },
          { id: "e_lang", name: "어학", color: "green" }
        ],
        items: [
          { id: "ex_1", title: "어학 자격시험", target: "2026-10-25", badgeId: "e_lang", dayCountMode: 0, showTimer: true, countPast: true },
          { id: "ex_2", title: "정보처리기사 실기", target: "2026-11-08", badgeId: "e_cert", dayCountMode: 0, showTimer: true, countPast: true },
          { id: "ex_3", title: "학기말 최종 평가", target: "2026-12-18", badgeId: "e_mid", dayCountMode: 0, showTimer: false, countPast: true }
        ]
      },
      couple: {
        key: "couple",
        name: "커플 & 기념일",
        title: "❤️ 우리들의 기념일",
        aliases: ["love", "anni", "기념일", "연애", "커플", "anniversary"],
        badges: [
          { id: "c_love", name: "첫 만남", color: "pink" },
          { id: "c_anni", name: "기념일", color: "purple" },
          { id: "c_event", name: "특별한 날", color: "yellow" }
        ],
        items: [
          { id: "cp_1", title: "우리가 만난 날", target: "2025-05-20", badgeId: "c_love", dayCountMode: 1, showTimer: true, countPast: true }, // +1일 계산
          { id: "cp_2", title: "함께 맞이하는 크리스마스", target: "2026-12-25", badgeId: "c_event", dayCountMode: 0, showTimer: true, countPast: true },
          { id: "cp_3", title: "우리의 600일", target: "2027-01-09", badgeId: "c_anni", dayCountMode: 1, showTimer: false, countPast: true }
        ]
      },
      goal: {
        key: "goal",
        name: "신년 & 인생 목표",
        title: "🎯 버킷리스트 & 목표",
        aliases: ["life", "bucket", "목표", "신년", "버킷리스트"],
        badges: [
          { id: "g_habit", name: "습관", color: "green" },
          { id: "g_fin", name: "재테크", color: "orange" },
          { id: "g_year", name: "올해목표", color: "blue" }
        ],
        items: [
          { id: "gl_1", title: "운동 습관 챌린지 시작", target: "2026-08-01", badgeId: "g_habit", dayCountMode: 1, showTimer: false, countPast: true },
          { id: "gl_2", title: "올해 남은 날 (2026)", target: "2026-12-31", badgeId: "g_year", dayCountMode: 0, showTimer: true, countPast: true },
          { id: "gl_3", title: "희망찬 2027년 새해", target: "2027-01-01", badgeId: "g_year", dayCountMode: 0, showTimer: true, countPast: true }
        ]
      },
      military: {
        key: "military",
        name: "군대 & 전역일",
        title: "🪖 복무 및 전역 카운터",
        aliases: ["army", "군대", "전역", "복무"],
        badges: [
          { id: "m_in", name: "입대", color: "gray" },
          { id: "m_prom", name: "진급", color: "green" },
          { id: "m_out", name: "전역", color: "red" }
        ],
        items: [
          { id: "ml_1", title: "입대일", target: "2025-11-10", badgeId: "m_in", dayCountMode: 1, showTimer: false, countPast: true },
          { id: "ml_2", title: "병장 진급일", target: "2026-12-01", badgeId: "m_prom", dayCountMode: 0, showTimer: false, countPast: true },
          { id: "ml_3", title: "드디어 전역일!", target: "2027-05-09", badgeId: "m_out", dayCountMode: 0, showTimer: true, countPast: true }
        ]
      }
    };
