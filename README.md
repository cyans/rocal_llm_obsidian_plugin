# Obsidian Vault Agent Plugin

> 로컬 LLM을 활용한 Obsidian 볼트용 AI 에이전트 플러그인

[![GitHub release](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/cyans/rocal_llm_obsidian_plugin)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## 📋 개요

Obsidian Vault Agent Plugin은 Qwen 3.5와 같은 로컬 LLM을 사용하여 볼트 내 노트를 검색, 분석, 생성하는 AI 에이전트 플러그인입니다. ReAct (Reasoning + Acting) 패턴을 기반으로 도구 호출을 자동화하여 복잡한 작업을 수행할 수 있습니다.

### 주요 기능

- 🤖 **AI 에이전트**: ReAct 루프 기반 지능형 어시스턴트
- 🔍 **볼트 검색**: 키워드 및 TF-IDF 기반 스마트 검색
- 📖 **볼트 내용 읽기**: 여러 파일 내용을 한 번에 읽기
- ✨ **LLM 요약**: 볼트 파일 내용을 지능형 요약
- 🌐 **웹 검색**: 실시간 인터넷 정보 검색 (SearXNG, Brave Search)
- 📝 **파일 생성/수정**: 자연어 명령으로 노트 생성 및 편집
- 📺 **YouTube 자막**: 동영상 자막 추출 및 요약

## 🚀 설치

### 요구사항

- Obsidian Desktop App 1.5.0 이상
- Obsidian Desktop App 1.12.0 이상 (Obsidian CLI 기반 기능을 사용할 경우)
- 로컬 LLM 서버 (Ollama, vLLM, LM Studio 등)
- Node.js 18.0+ (개발용)

### 설치 방법

1. 릴리스 페이지에서 `main.js`, `manifest.json`, `styles.css` 다운로드
2. Obsidian 설정 → 플러그인 탭에서 "폴더 열기"
3. 플러그인 파일을 볼트의 `.obsidian/plugins/vault-agent/` 폴더에 복사
4. 플러그인 활성화

### BRAT 설치

1. Obsidian에서 `BRAT` 플러그인을 설치하고 활성화
2. BRAT 설정에서 `Add Beta plugin` 선택
3. 저장소 주소로 `cyans/rocal_llm_obsidian_plugin` 입력
4. 설치 후 `Vault Agent`를 활성화

### 개발 버전 설치

```bash
git clone https://github.com/cyans/rocal_llm_obsidian_plugin.git
cd rocal_llm_obsidian_plugin
npm install
npm run build
```

### 빌드 후 설치

```bash
# 빌드
npm run build

# 파일 복사
mkdir -p ~/Library/Application\ Support/obsidian/plugins/vault-agent
cp main.js ~/Library/Application\ Support/obsidian/plugins/vault-agent/
cp manifest.json ~/Library/Application\ Support/obsidian/plugins/vault-agent/
cp styles.css ~/Library/Application\ Support/obsidian/plugins/vault-agent/

# 옵시디언 재시작 또는 Cmd/Ctrl + R
```

## ⚙️ 설정

### LLM 서버 설정

1. 플러그인 설정 열기 (Ctrl/Cmd + ,)
2. "LLM 서버" 섹션에서 다음을 설정:
   - **API URL**: 로컬 LLM 서버 주소 (기본값: `http://localhost:11434/v1`)
- **모델명**: 사용할 모델
   - **API 키**: 선택사항 (필요한 경우)
   - **Max Tokens**: 최대 토큰 수 (기본값: 4096)
   - **Temperature**: 생성 온도 (기본값: 0.7)

### 도구 설정

각 도구를 개별적으로 활성화/비활성화할 수 있습니다:

- 🔍 **볼트 검색**: 볼트 내 노트 검색
- 🌐 **웹 검색**: 인터넷 검색
- 📝 **파일 쓰기**: 새 노트 생성
- ✏️ **파일 수정**: 기존 노트 편집
- 📺 **YouTube 자막**: 동영상 자막 추출
- 📖 **볼트 내용 읽기**: 여러 파일 내용 읽기 (v0.2.0+)
- ✨ **볼트 요약**: LLM 기반 파일 요약 (v0.2.0+)

## 🎯 사용법

### 기본 채팅

1. `Ctrl/Cmd + P` → "Vault Agent Chat" 실행
2. 메시지 입력창에 질문 입력
3. 전송 버튼 클릭 또는 `Ctrl/Cmd + Enter`

### 예시 프롬프트

```
# 볼트 검색
"n8n에 관련된 노트 찾아줘"

# 웹 검색
"최신 Qwen 3.5 벤치마크 조사해줘"

# 파일 생성
"오늘의 회의 내용을 정리하는 마크다운 파일 만들어줘"

# 파일 수정
"README의 설치 섹션을 더 자세하게 수정해줘"

# YouTube 요약
"이 영상의 핵심 내용을 요약해서 정리해줘"

# 볼트 요약 (v0.2.0+)
"프로젝트 관련 문서 3개를 요약해서 핵심 내용을 정리해줘"

# 파일 내용 읽기 (v0.2.0+)
"이 파일들의 내용을 읽고 공통점을 찾아줘"
```

### 도구 사용

에이전트 모드가 활성화되면 필요한 도구를 자동으로 호출합니다:

- 볼트 내용 언급 시 자동 검색
- 실시간 정보 필요 시 웹 검색
- 노트 생성 요청 시 파일 쓰기
- 편집 요청시 SEARCH/REPLACE 패턴 적용
- 요약 요청 시 볼트 요약 도구 사용

## 🏗️ 아키텍처

### ReAct 에이전트 루프

```
[사용자 메시지]
    ↓
[시스템 프롬프트 + 도구 정의] → LLM
    ↓
[LLM 응답 파싱]
    ├─ 일반 텍스트 → 사용자 표시
    └─ 도구 호출 → 도구 실행 → 결과 피드백 → LLM 재호출
                   ↑___________________|
                   (최대 30회 반복)
```

### 도구 아키텍처

```
src/
├── agent/
│   ├── AgentController.ts     # ReAct 루프 컨트롤러
│   ├── ToolRegistry.ts        # 도구 등록/디스패치
│   ├── PromptBuilder.ts       # 시스템 프롬프트 빌더
│   └── ConversationManager.ts # 대화 기록 관리
├── tools/
│   ├── BaseTool.ts            # 도구 추상 클래스
│   ├── VaultSearchTool.ts     # 볼트 검색
│   ├── VaultReadContentsTool.ts # 볼트 내용 읽기 (v0.2.0+)
│   ├── VaultSummarizeTool.ts  # LLM 요약 (v0.2.0+)
│   ├── WebSearchTool.ts       # 웹 검색
│   ├── WriteToFileTool.ts     # 파일 생성
│   ├── ReplaceInFileTool.ts   # 파일 수정
│   └── YouTubeTranscriptTool.ts # YouTube 자막
├── search/
│   ├── KeywordSearch.ts       # 키워드 검색
│   └── TFIDFScorer.ts         # TF-IDF 스코어링
└── ui/
    ├── ChatView.ts            # 채팅 뷰
    ├── ChatInput.ts           # 입력 컴포넌트
    ├── MessageRenderer.ts     # 메시지 렌더러
    └── ToolStatusBanner.ts    # 도구 상태 배너
```

## 🧪 개발

### 테스트 실행

```bash
npm test          # 모든 테스트
npm run test:coverage  # 커버리지 포함
```

### 빌드

```bash
npm run build      # 프로덕션 빌드
npm run dev        # 개발 모드 (감시)
```

### 프로젝트 구조

```
rocal_llm_obsidian_plugin/
├── src/              # 소스 코드
├── __tests__/       # 테스트 코드
├── .moai/           # MoAI 설정 및 SPEC
├── manifest.json    # Obsidian 플러그인 매니페스트
├── package.json     # NPM 의존성
├── tsconfig.json    # TypeScript 설정
└── styles.css       # 플러그인 스타일
```

## 🔧 기술 스택

- **언어**: TypeScript 5.0+
- **런타임**: Obsidian Desktop App (Electron)
- **빌드**: esbuild
- **테스트**: Jest
- **LLM**: Qwen 3.5 (OpenAI-compatible API)

## 📊 SPEC 문서

상세한 구현 사양은 `.moai/specs/` 디렉토리를 참조하세요:

### SPEC-PLUGIN-001: Obsidian Vault Agent Plugin (구현 완료)
- `spec.md` - 전체 기능 명세
- `plan.md` - 구현 계획
- `acceptance.md` - 인수 기준

### SPEC-VAULT-SUMMARY: 볼트 파일 요약 및 글쓰기 재료 추출 (구현 완료 v0.2.0)
- `spec.md` - 기능 명세
- 구현된 기능:
  - `vault_read_contents`: 여러 파일 내용 읽기
    - `max_chars_per_file` 옵션으로 큰 파일 처리
    - 단어 수, 문자 수 메타데이터 제공
  - `vault_summarize`: LLM 기반 요약
    - 불렛릿, 단락, 개요 스타일 지원
    - `combine` 옵션으로 통합 요약
    - 핵심 포인트 자동 추출
    - 대형 콘텐츠 청킹 처리 (20,000자 단위)

## 🤝 기여

기여를 환영합니다! 다음 단계를 따라주세요:

1. Fork 저장소
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 커밋 (`git commit -m 'Add amazing feature'`)
4. 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 열기

### 개발 가이드라인

- TypeScript strict mode 준수
- 85%+ 테스트 커버리지 유지
- TDD 방식으로 개발 (RED-GREEN-REFACTOR)
- 코드 스타일: Prettier + ESLint

## 📄 라이선스

MIT License - LICENSE 파일 참조

## 🙏 감사

- **Obsidian** - 훌륭한 노트 앱
- **Qwen Team** - 오픈소스 LLM
- **MoAI-ADK** - 개발 프레임워크

## 📞 지원

- **이슈 트래킹**: [GitHub Issues](https://github.com/cyans/rocal_llm_obsidian_plugin/issues)
- **문서**: 저장소 README 및 릴리스 노트 참고

---

**Made with ❤️ using [MoAI-ADK](https://github.com/cyan91/moai-adk)**
