# Vault Agent - Obsidian AI 에이전트 플러그인

로컬 LLM (Qwen 3.5, vLLM-MLX 호환)을 사용하여 Obsidian 노트를 자동으로 검색, 요약, 작성, 수정하고 웹 정보를 수집하는 AI 에이전트 플러그인입니다.

![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)

---

## 주요 기능

### 🤖 AI 에이전트 - ReAct 루프
- **자동 도구 호출**: Reasoning + Acting을 반복하며 필요한 도구 자동 실행
- **네이티브 도구 호출**: Qwen과 호환되는 OpenAI 형식 지원
- **최대 3 라운드**: 도구 사용 최대 3번 반복 후 최종 답변 제공
- **실시간 진행상황 표시**: 도구 사용 및 처리 상태 실시간 업데이트

### 🔧 핵심 도구 (7가지)

| 도구 | 설명 | 사용 사례 |
|------|------|----------|
| **보관소 검색** | 메모 파일 검색 | 관련 메모 찾기 |
| **웹 검색** | 실시간 정보 수집 (Brave/SearXNG) | 최신 정보 조회 |
| **파일 읽기** | 여러 메모 파일 내용 로드 | 메모 내용 분석 |
| **파일 요약** | 메모 내용 자동 요약 | 긴 메모 압축 |
| **파일 작성** | 새 메모 생성 | 새로운 정보 기록 |
| **파일 수정** | 기존 메모 편집 (정확한 검색-바꾸기) | 메모 업데이트 |
| **유튜브 자막** | 유튜브 영상 자막 추출 | 영상 콘텐츠 분석 |

### 🌐 외부 접근 지원
- **TLS 우회**: 자가 서명 인증서 환경 완벽 지원 (`allowInsecureTls` 옵션)
- **기기별 URL 오버라이드**: Mac/iPhone/Windows 등 각 기기마다 독립적인 API 주소 설정 (로컬 스토리지 사용, Sync 미포함)
- **vLLM-MLX MCP 통합**: 서버로부터 도구 정의 자동 로드

---

## 설치

### 1. Obsidian 플러그인 설치

**Community Plugins에서 검색하기** (권장)
1. Obsidian 설정 > **커뮤니티 플러그인** > **찾아보기**
2. "Vault Agent" 검색
3. 설치 후 활성화

**BRAT를 통한 베타 설치**
1. Obsidian에서 `BRAT` 플러그인 설치
2. BRAT 설정 > `Add Beta plugin`
3. 저장소 주소: `cyans/vault-agent`

### 2. 로컬 LLM 서버 준비

#### Option A: Mac (권장) - vLLM-MLX

Apple Silicon에 최적화된 vLLM-MLX를 사용합니다.

```bash
# vLLM-MLX 설치
pip install vllm-openvino -U

# 또는 표준 vLLM 설치
pip install vllm

# Qwen 3.6 모델 실행
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.6-35B-A3B \
  --dtype float16 \
  --port 11434
```

#### Option B: Docker 사용

```bash
docker run -d -p 11434:8000 \
  -e MODEL_NAME=Qwen/Qwen3.6-35B-A3B \
  --name vllm \
  ghcr.io/vllm-project/vllm-openai:latest
```

#### Option C: Ollama (가장 간단)

```bash
# ollama 설치: https://ollama.ai
# 또는 Homebrew: brew install ollama

# 모델 다운로드
ollama pull qwen:35b

# 서버 자동 시작 (http://localhost:11434 리스닝)
ollama serve

# 또는 백그라운드 실행
ollama serve &
```

#### Option D: LM Studio (GUI)

1. [LM Studio](https://lmstudio.ai) 다운로드 및 설치
2. Qwen 3.5 모델 검색 및 다운로드
3. "Local Server" 탭에서 OpenAI-compatible 모드 활성화
4. 포트 확인: 기본 8000번

---

## 설정 가이드

### 기본 LLM 설정

**Obsidian > 설정 > Vault Agent**에서:

| 항목 | 기본값 | 설명 |
|------|--------|------|
| **API URL** | `http://localhost:11434/v1` | LLM 서버 주소 (필수) |
| **Model** | `qwen3.6:35b` | 사용할 모델명 |
| **API Key** | (선택) | 인증 필요 시만 입력 |
| **Max Tokens** | 4096 | 최대 응답 토큰 (1-32000) |
| **Temperature** | 0.7 | 응답 창의성 (0=일관성, 2=창의성) |
| **Agent Mode** | 활성화 | 자동 도구 호출 활성화 |

### 도구별 설정

각 도구를 개별로 활성화/비활성화:

```
☑ 보관소 검색      - 메모 파일 검색
☑ 웹 검색          - 실시간 정보 수집
☑ 파일 읽기        - 여러 메모 내용 로드
☑ 파일 요약        - 자동 요약
☑ 파일 작성        - 새 메모 생성
☑ 파일 수정        - 메모 편집
☑ 유튜브 자막      - 영상 자막 추출
```

### 웹 검색 설정

**Brave Search (권장)**
1. [Brave Search API](https://api.search.brave.com) 방문
2. 무료 API 키 발급
3. 플러그인 설정 > **Brave Search API Key** 입력

**SearXNG (자동 폴백)**
- Brave 키가 없으면 공개 SearXNG 인스턴스 사용 (설정 불필요)

---

## 외부 접근 설정 (중요)

### 상황별 설정 가이드

#### 📱 상황 1: Mac 로컬 전용

```
┌─ Obsidian ─────────────────────────────────┐
│ API URL: http://localhost:11434/v1         │
│ Local URL Override: (비움)                  │
│ Allow Insecure TLS: OFF                     │
└─────────────────────────────────────────────┘
```

#### 🌍 상황 2: 외부 네트워크 (Mac + iPhone)

**네트워크 환경 준비**
```bash
# 같은 Wi-Fi에 연결
# Mac에서 로컬 호스트명 확인
hostname -f
# 또는
hostname

# 예: mac-studio.local (또는 192.168.1.100)
```

**Mac Obsidian 설정**
```
API URL: http://localhost:11434/v1
Local URL Override: (비움)
Allow Insecure TLS: OFF
```

**iPhone Obsidian 설정**
```
API URL: http://192.168.1.100:11434/v1  # Mac의 IP 주소
Local URL Override: http://mac-studio.local:11434/v1
Allow Insecure TLS: OFF
```

**작동 원리**
- iPhone은 외부 IP로 연결 시도 → Local URL Override로 로컬 주소 사용
- 로컬 주소 실패 시 → API URL 폴백
- 두 설정 모두 필요 (로드 밸런싱 아님, 폴백 메커니즘)

#### 🔐 상황 3: HTTPS + 자가 서명 인증서

**Mac에서 HTTPS 서버 설정**

```bash
# 자가 서명 인증서 생성
openssl req -x509 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=mac-studio.local"

# vLLM-MLX 또는 Ollama를 nginx로 리버스 프록시
# (자세한 설정: https://nginx.org/docs/http/ngx_http_ssl_module.html)
```

**Obsidian 설정**
```
API URL: https://mac-studio.local:8443/v1
Local URL Override: https://localhost:8443/v1  (Mac 로컬 접근)
Allow Insecure TLS: ON  ⚠️ 자가 서명 인증서 허용 필수
```

> ⚠️ **보안 주의**: `Allow Insecure TLS`는 **신뢰된 로컬/개인 네트워크에서만** 활성화하세요. 공개 인터넷에서 사용하지 마세요.

#### 💻 상황 4: 여러 기기 설정

**Windows 추가 설정**
```
API URL: http://192.168.1.100:11434/v1
Local URL Override: http://windows-local:8001/v1  (Windows 로컬 서버)
```

**로컬 스토리지 주의**
- Local URL Override는 **localStorage**에 저장됨 (Obsidian Sync 미포함)
- 각 기기에서 독립적으로 설정 필요
- 클라우드 동기화되지 않음

---

## 사용 방법

### 기본 사용

1. **Vault Agent 채팅 열기**
   - 사이드바에서 Vault Agent 아이콘 클릭
   - 또는 `Ctrl/Cmd + P` > "Vault Agent Chat"

2. **메시지 입력**
   - 하단 입력창에 질문이나 명령 입력
   - `Enter` 또는 전송 버튼 클릭

3. **에이전트가 자동 처리**
   - ReAct 루프가 필요한 도구 자동 선택 실행
   - 진행 상황 실시간 표시
   - 최종 답변 제공

### 예시 사용 케이스

**예 1: 메모 요약 및 연결**
```
사용자: "2024년 AI 프로젝트들의 진행상황을 종합하면?"

에이전트:
1. 보관소 검색 → "2024 AI" 관련 메모 찾기
2. 파일 읽기 → 찾은 메모들 내용 로드
3. 파일 요약 → 각 메모 자동 요약
4. 최종 답변 → 종합 분석 제공
```

**예 2: 정보 수집 및 기록**
```
사용자: "최신 Qwen 3.5 벤치마크를 조사해서 '2024 LLM 벤치마크' 메모로 저장해줘"

에이전트:
1. 웹 검색 → "Qwen 3.5 벤치마크 2024" 검색
2. 정보 분석 및 정리
3. 파일 작성 → 새 메모 생성
4. 최종 확인 메시지
```

**예 3: 메모 개선**
```
사용자: "'진행 중인 프로젝트' 메모에 최신 진행상황을 추가해줘"

에이전트:
1. 보관소 검색 → 파일 찾기 (또는 현재 파일 사용)
2. 파일 읽기 → 기존 내용 로드
3. 파일 수정 → 정확한 검색-바꾸기로 업데이트
4. 완료 확인
```

**예 4: 유튜브 영상 분석**
```
사용자: "이 영상의 핵심 내용을 요약해줘 [URL]"

에이전트:
1. 유튜브 자막 → 자막 추출
2. 자막 분석
3. 최종 요약 제공
```

---

## 도구 상세 설명

### 🔍 보관소 검색 (Vault Search)
메모 파일명과 메타데이터로 검색합니다.
```
입력: "프로젝트 계획"
결과: 
  - Project Plan.md
  - 2024 프로젝트 목록.md
  - ...
```

### 🌐 웹 검색 (Web Search)
Brave API 또는 SearXNG를 통해 실시간 정보 수집합니다.
```
입력: "2024 AI 최신 동향"
결과: 
  - 웹페이지 제목
  - 요약
  - 출처 URL
```

### 📖 파일 읽기 (Vault Read Contents)
여러 메모 파일의 전문을 로드합니다.
```
입력: ["Project Plan.md", "Budget.md"]
결과: 각 파일의 전체 내용 + 메타데이터 (단어 수, 문자 수)
```

### ✨ 파일 요약 (Vault Summarize)
읽은 메모 내용을 자동으로 요약합니다.
```
입력: 파일 내용 + 스타일 (bullets / paragraph / outline)
결과: 압축된 요약 텍스트

스타일 옵션:
  - bullets: 핵심 포인트 나열
  - paragraph: 문단 형식
  - outline: 계층 구조
```

### 📝 파일 작성 (Write To File)
새로운 메모를 생성합니다.
```
입력: 
  - 파일 경로: "Project/2024 Plan.md"
  - 내용: "마크다운 형식 내용"
결과: 새 메모 파일 생성
```

### ✏️ 파일 수정 (Replace In File)
기존 메모를 정확한 검색-바꾸기로 수정합니다.
```
입력:
  - 파일 경로: "Project/Plan.md"
  - 검색: "## 목표\n- 미정\n"
  - 바꿀 내용: "## 목표\n- AI 모델 성능 향상\n"
결과: 정확한 부분만 수정
```

### 📺 유튜브 자막 (YouTube Transcript)
유튜브 영상의 자막을 추출합니다.
```
입력: https://youtube.com/watch?v=dQw4w9WgXcQ
결과: 
  - 자막 텍스트 (시간 정보 포함)
  - 언어 정보
```

---

## 고급 기능

### vLLM-MLX MCP 도구 통합

에이전트는 vLLM-MLX 서버에서 MCP (Model Context Protocol) 도구 정의를 자동으로 로드할 수 있습니다.

```bash
# vLLM-MLX 서버 시작 (MCP 지원)
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.6-35B-A3B \
  --enable-mcp \
  --api-key sk-123456 \
  --port 11434
```

에이전트가 자동으로 MCP 도구를 발견하고 작업에 활용합니다.

### 기기별 로컬 URL 오버라이드 (localStorage 기반)

**개념**: `localStorage`에 저장되어 Obsidian Sync에 포함되지 않음

```javascript
// localStorage 저장소 키
'vault-agent-local-url'

// 예:
// Mac: (비움) → 항상 localhost 사용
// iPhone: 'http://mac.local:11434/v1' → 로컬 네트워크에서는 이 주소 시도
// Windows: 'http://windows-local:8001/v1' → Windows 로컬 접근 지원
```

**동작 원리**:
1. 로컬 URL 오버라이드가 있으면 **먼저** 시도
2. 실패하면 API URL로 폴백
3. 완전 폴백 모드 지원

---

## 문제 해결

### ❌ 연결 실패 ("Failed: Connection refused")

**확인사항**:
```bash
# 1. LLM 서버 실행 확인
curl http://localhost:11434/v1/models

# 2. 포트 확인
lsof -i :11434

# 3. 방화벽 확인 (Mac)
sudo lsof -i -P | grep LISTEN
```

**설정 테스트**:
- 플러그인 설정 > "Test Connection" 버튼 클릭
- 연결 상태 및 지연시간 표시

### 🔐 TLS 오류 ("SSL Certificate Verification Failed")

**원인**: HTTPS 자가 서명 인증서

**해결**:
1. 플러그인 설정 > **Allow Insecure TLS** 활성화
2. 또는 Mac 시스템에 CA 인증서 설치:
   ```bash
   # 인증서 추가
   sudo security add-trusted-cert -d \
     -r trustRoot \
     -k /Library/Keychains/System.keychain \
     ./cert.pem
   ```

### 🔧 도구 호출 실패

**확인사항**:
1. 해당 도구가 플러그인 설정에서 **활성화** 상태 확인
2. 필요한 설정이 입력되어 있는지 확인:
   - Brave API Key (웹 검색용)
   - API Key (인증 필요한 경우)
3. LLM 모델이 도구 호출을 지원하는지 확인
   - **권장**: Qwen 3.5 이상
   - Llama, Mistral 등도 호환 가능

**디버그 로그 확인**:
```javascript
// Obsidian 개발자 콘솔 (Cmd+Shift+I)
console.log('Vault Agent') // 플러그인 로그 확인
```

### ⚠️ 느린 응답

**개선 방법**:
```
1. Temperature 낮추기
   - 현재: 0.7 → 낮춤: 0.3-0.5
   - 효과: 응답 속도 향상, 일관성 증가

2. Max Tokens 줄이기
   - 현재: 4096 → 낮춤: 2048-2560
   - 효과: 생성 길이 제한, 빠른 응답

3. 더 작은 모델 사용
   - 현재: 35B → 낮춤: 7B-14B
   - 예: qwen3.6:7b
   - 효과: 빠른 응답, 메모리 절약
```

**LLM 서버 성능 확인**:
```bash
# 서버 상태 확인
curl http://localhost:11434/v1/models

# 메모리 사용량 확인 (Mac)
top -l 1 | grep "python"
```

### 🌐 웹 검색 미작동

**Brave Search API 설정**:
1. [Brave Search API](https://api.search.brave.com) 방문
2. 무료 API 키 발급 (월 2000회 무료)
3. 플러그인 설정 > **Brave Search API Key** 입력
4. Obsidian 재시작 후 테스트

**SearXNG 폴백 (Brave 없을 경우)**:
- Brave 키가 없으면 자동으로 공개 SearXNG 사용
- 추가 설정 불필요

### 📱 외부 접근 연결 실패

**진단 단계**:
```
1. Mac 로컬 네트워크 확인
   - Wi-Fi에 연결
   - 같은 네트워크 확인
   
2. Mac 호스트명 확인
   hostname -f
   # 예: mac-studio.local
   
3. iPhone에서 접근 테스트
   http://mac-studio.local:11434/v1/models
   
4. IP 주소로 직접 접근
   ifconfig | grep inet
   # 예: 192.168.1.100
   http://192.168.1.100:11434/v1/models
   
5. Local URL Override 설정
   - API URL: http://192.168.1.100:11434/v1
   - Local Override: http://mac-studio.local:11434/v1
```

---

## 성능 최적화

### ⚡ 빠른 응답 설정 (Speed)
```
Model:          qwen3.6:7b (또는 더 작은 모델)
Max Tokens:     2048
Temperature:    0.3
Agent Mode:     활성화 (자동 도구 선택)
Web Search:     필요할 때만 활성화
```

### 🎯 균형 설정 (Balanced - 권장)
```
Model:          qwen3.6:35b
Max Tokens:     3072
Temperature:    0.5
Agent Mode:     활성화
Web Search:     활성화
```

### 🏆 높은 품질 설정 (Quality)
```
Model:          qwen3.6:35b (또는 더 큰 모델)
Max Tokens:     4096
Temperature:    0.7
Agent Mode:     활성화
Web Search:     활성화
```

### 💻 하드웨어 요구사항

| 항목 | 권장 | 최소 |
|------|------|------|
| **GPU** | Apple Silicon 16GB+ | 8GB VRAM |
| **메모리** | 16GB RAM | 8GB RAM |
| **모델 크기** | 7B-35B | 3B 이상 |
| **응답 시간** | 1-3초 | <5초 |

---

## 개발 정보

### 빌드 및 개발

```bash
# 의존성 설치
npm install

# 개발 모드 (파일 감시)
npm run dev

# 프로덕션 빌드
npm run build

# 테스트 실행
npm test

# 테스트 커버리지
npm run test:coverage
```

### 프로젝트 구조
```
src/
├── agent/                      # ReAct 루프
│   ├── AgentController.ts      # 에이전트 컨트롤러
│   ├── ToolRegistry.ts         # 도구 레지스트리
│   ├── PromptBuilder.ts        # 시스템 프롬프트 빌더
│   └── ConversationManager.ts  # 대화 기록 관리
├── llm/                        # LLM 서비스
│   ├── LLMService.ts           # OpenAI API 추상화
│   │   ├── 네이티브 도구 호출 지원
│   │   ├── TLS 우회 (fetchInsecure)
│   │   ├── 로컬 URL 오버라이드 (effectiveApiUrl)
│   │   └── vLLM-MLX MCP 통합
│   └── QwenAdapter.ts          # Qwen 어댑터
├── tools/                      # 7가지 도구 구현
│   ├── VaultSearchTool.ts      # 보관소 검색
│   ├── VaultReadContentsTool.ts # 파일 읽기
│   ├── VaultSummarizeTool.ts   # 파일 요약
│   ├── WebSearchTool.ts        # 웹 검색
│   ├── WriteToFileTool.ts      # 파일 작성
│   ├── ReplaceInFileTool.ts    # 파일 수정
│   └── YouTubeTranscriptTool.ts # 유튜브 자막
├── ui/                         # 사이드바 UI
│   ├── ChatView.ts             # 채팅 뷰
│   ├── ChatInput.ts            # 입력 컴포넌트
│   ├── MessageRenderer.ts      # 메시지 렌더러
│   ├── ToolToggle.ts           # 도구 토글
│   ├── ToolStatusBanner.ts     # 도구 상태 배너
│   └── ConnectionTestResult    # 연결 테스트
├── main.ts                     # 플러그인 진입점
├── types.ts                    # 타입 정의
└── settings.ts                 # 설정 UI
```

### 핵심 클래스

**LLMService** (llm/LLMService.ts)
```typescript
- effectiveApiUrl       # 로컬 오버라이드 URL 처리
- fetchInsecure()       # TLS 검증 우회 (자가 서명 인증서)
- doFetch()             # fetch 선택 로직 (TLS 설정 반영)
- testConnection()      # 연결 테스트
- getAvailableTools()   # MCP 도구 로드
- chat()                # 채팅 요청
```

**AgentController** (agent/AgentController.ts)
```typescript
- MAX_TOOL_ROUNDS = 3   # 최대 도구 호출 라운드
- processUserMessage()  # 메시지 처리 (ReAct 루프)
- executeToolCall()     # 도구 실행
- setStatusCallback()   # 진행상황 콜백
```

---

## SPEC 문서

상세한 구현 사양은 `.moai/specs/` 디렉토리 참조:

**SPEC-PLUGIN-001: Obsidian Vault Agent Plugin**
- `spec.md` - 전체 기능 명세
- `plan.md` - 구현 계획
- `acceptance.md` - 인수 기준

**SPEC-VAULT-SUMMARY: 볼트 파일 요약** (v0.2.0+)
- `vault_read_contents`: 여러 파일 읽기 + 메타데이터
- `vault_summarize`: 자동 요약 (bullets/paragraph/outline)

---

## 라이선스

MIT License - LICENSE 파일 참조

---

## 감사

- **Obsidian** - 뛰어난 노트 앱 플랫폼
- **Qwen Team** - 오픈소스 LLM 모델
- **MoAI-ADK** - 개발 프레임워크
- **Contributors** - 피드백 및 기여자들

---

## 지원 및 피드백

- **이슈 트래킹**: [GitHub Issues](https://github.com/cyans/vault-agent/issues)
- **문서**: 저장소 README 및 SPEC 문서
- **개발 토론**: GitHub Discussions

---

**Made with ❤️ using TypeScript and MoAI-ADK**
