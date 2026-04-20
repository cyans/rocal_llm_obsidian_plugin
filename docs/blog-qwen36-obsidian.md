# qwen3.6-35b를 옵시디언에 심었다 — 6주간의 현장 노트

> Mac Studio 위에서 돌아가는 35B 모델을, Obsidian 사이드바의 채팅창이 ReAct 루프로 호출한다. 메모 검색·요약·작성·수정·웹 검색·유튜브 자막까지 7개 도구를 자동으로 엮어준다. 이 글은 그 과정에서 부딪힌 실제 버그들과, vLLM-MLX가 왜 맥에서 의미 있는 선택인지를 남기려고 쓴다.

## 0. 왜 이걸 만들었나

ChatGPT, Claude, Gemini — 다 좋다. 그런데 내 노트를 뒤져서 대답하게 하려면 결국 업로드해야 한다. 3,000개 쌓아 둔 Obsidian 볼트를 누군가의 서버에 통째로 올리는 일은 마음이 무겁다. 그래서 결론은 단순했다. **35B짜리 로컬 모델이면 요약·작성 퀄리티가 실무에 충분하고, 모든 토큰이 Mac 안에서 끝난다.**

만든 결과물은 Obsidian 플러그인 `vault-agent` (v0.2.4). 코드는 TypeScript, 번들러는 esbuild, 서빙은 vLLM-MLX + Caddy 리버스 프록시. 아키텍처는 아래와 같다.

```
Obsidian 사이드바 (iPhone/Mac/Windows)
        │ HTTPS :8443 + Bearer API key
        ▼
   Caddy (Mac, tls internal)
        │ HTTP :8001
        ▼
   vLLM-MLX (Qwen3.6-35B-A3B, OpenAI-compat)
```

## 1. 플러그인 쪽 구조 — ReAct를 3라운드로 잘라낸 이유

핵심은 단 하나의 루프다.

```
src/
├── agent/
│   ├── AgentController.ts   // ReAct 루프 (최대 3 라운드)
│   ├── ToolRegistry.ts      // 7개 도구 등록/실행
│   ├── PromptBuilder.ts     // 시스템 프롬프트 조립
│   └── ConversationManager.ts
├── llm/
│   ├── LLMService.ts        // OpenAI-compat 클라이언트
│   └── QwenAdapter.ts
├── tools/                   // vault_search, web_search,
│                            // vault_read_contents, vault_summarize,
│                            // write_to_file, replace_in_file,
│                            // youtube_transcript
└── ui/ChatView.ts
```

ReAct 라운드를 `MAX_TOOL_ROUNDS = 3`으로 잘라둔 건 절약이 아니라 **발산 방지**다. 모델이 "한 번만 더 검색해볼게요"를 반복하다가 무한 루프에 빠지는 걸 여러 번 봤다. 3라운드면 보통 "검색 → 읽기 → 요약/작성" 사이클이 자연스럽게 닫힌다. 넘치면 그냥 최종 답변으로 수렴하게 둔다.

도구 정의는 OpenAI `tools` 포맷을 그대로 따른다. Qwen은 이 포맷을 네이티브로 이해한다 — 이게 다른 오픈소스 7B~14B들과 차이가 크다. 작은 모델에선 tool_call JSON을 프롬프트로 강제 유도해야 했는데, 35B A3B는 그냥 스키마만 넘기면 정확히 호출 포맷으로 답한다.

## 2. 실제 삽질 로그 — "업그레이드했더니 부서진 것들"

Qwen 3.5에서 3.6으로 올린 그 날(커밋 `fb9ee19`), 플러그인이 네 곳에서 동시에 터졌다. 전부 "모델이 똑똑해져서 생긴 회귀"라는 점이 흥미롭다.

### 2-1. `arguments`가 문자열이 아니라 **이미 파싱된 객체**로 온다

3.5까지는 `tool_calls[0].function.arguments`가 항상 JSON 문자열이었다. 3.6은 일부 응답에서 그걸 객체 그대로 주기 시작했다. 기존 `JSON.parse(args)`는 객체를 받으면 `"[object Object]"`로 스트링화한 뒤 파싱 실패 → `{ raw: "[object Object]" }` 폴백 → 도구가 빈 인자로 호출 → 즉시 실패.

고친 방식은 `safeParseJSON`에 타입 가드 한 줄을 넣은 것뿐이다 (`src/agent/AgentController.ts`).

```typescript
function safeParseJSON(input: unknown): unknown {
  if (typeof input !== 'string') return input; // ← 이 줄
  try { return JSON.parse(input); }
  catch { return { raw: input }; }
}
```

테스트는 세 경로(문자열 / 객체 / 비-JSON 문자열)로 갈라 썼다. 한 줄 고치는 데 회귀 테스트 3개가 필요했다는 점이 중요하다 — 다음 업그레이드 때 같은 실수를 반복하지 않기 위해.

### 2-2. 응답에 `<think>…</think>`가 새어 나온다

Qwen 3.6에는 "thinking mode"가 있다. 모델이 답변 전에 내부 추론을 길게 써 내려간다. 대부분의 경우 서버가 이걸 숨겨 주지만, 어떤 프롬프트에선 `<think>…</think>` 블록이나 `"Final answer:"`, `"I will output this."` 같은 메타 문구가 답변에 그대로 섞여 나왔다.

**4중 방어**로 막았다 (한 레이어로는 다 못 막아서).

1. **시스템 프롬프트**: `## THINKING MODE RULE` 블록과 Qwen 공식 제어 토큰 `/no_think` 삽입.
2. **API 요청 body**: `chat_template_kwargs.enable_thinking: false` 필드를 `/v1/chat/completions`에 추가. vLLM이 이걸 읽고 chat template에서 thinking 렌더링을 건너뛴다. 미지원 서버(Ollama 옛 버전)는 그냥 무시하므로 무해하다.
3. **태그 폴백 스트리핑**: 최종 컨텐츠에서 `<think>`, `<thinking>`, `<reasoning>` 태그를 정규식으로 제거 (`normalizeFinalContent`).
4. **메타 프로즈 제거**: `"Final answer."`, `"Done."` 같은 서두 문장 정리.

교훈: 로컬 모델에서 "설정 하나면 된다"는 문서는 절반만 맞다. **서버 토글 + 프롬프트 지시 + 클라이언트 후처리**가 다 필요하다.

### 2-3. 한국어 대답에 한자·가나가 섞여 나온다

Qwen은 중국어 기반 모델이다. 샘플링 단계에서 저빈도 한자가 살짝 튀어나오는 일이 종종 있다. 기존 시스템 프롬프트의 "Respond in the user's language"로는 약해서, `## LANGUAGE RULE (STRICT — READ FIRST)` 블록으로 **간체/번체 한자 + 히라가나/가타카나 사용 금지**를 명시했다. 예외는 고유명사, 영문 약어, 코드, 인용뿐. 이 바꾼 이후 혼입 사례가 사실상 사라졌다.

## 3. 외부 접근 — Caddy에서 이틀을 태운 세 가지

Mac 로컬만 쓸 거면 `localhost:8001` 하나면 충분하다. 그런데 iPhone에서도 내 볼트에 말을 걸고 싶었다. 그게 DDNS + Caddy 리버스 프록시 구성이었고, 거기서 이틀을 태웠다.

### 3-1. `:8443`은 인증서를 안 준다

처음엔 Caddyfile을 이렇게 썼다.

```caddyfile
:8443 {
  tls internal
  reverse_proxy localhost:8001
}
```

Windows Obsidian이 `TLSV1_ALERT_INTERNAL_ERROR` (alert 80)로 매번 죽었다. 원인은 단순했다 — Caddy는 **호스트 없이 `:포트`만 주면 `tls internal`이 SNI별 인증서를 자동 발급하지 않는다.** 모든 TLS 핸드셰이크에 internal_error로 응답한다.

```caddyfile
# 고친 버전
localhost:8443, eeum.iptime.org:8443 {
  tls internal
  ...
}
```

두 호스트명을 명시적으로 등록하면 각각에 대해 자동으로 발급한다. 외부에서 DDNS로 들어와도 Host 헤더가 매칭된다.

### 3-2. `health_uri /`가 모든 걸 503으로 만든다

Caddy 헬스체크를 루트 경로로 걸면, vLLM은 `/`에 404를 반환한다. Caddy는 "백엔드 비정상"으로 판단해 모든 실제 요청에 503을 반환한다. 증상은 "연결은 되는데 모든 요청이 503". vLLM에 맞는 경로는 `/v1/models`다.

```caddyfile
reverse_proxy localhost:8001 {
  health_uri /v1/models
  health_interval 30s
}
```

### 3-3. IP로 들어올 때 SNI가 안 맞는다

Obsidian이 `https://192.168.1.100:8443`으로 접속하면 Node.js TLS는 SNI를 IP로 보낸다. 그런데 Caddy `tls internal`이 발급한 인증서는 `localhost` 기준이다. 인증서 이름 불일치 → TLS 실패.

해결은 `LLMService.ts`에서 요청 URL의 호스트가 IP면 **SNI를 `'localhost'`로 강제 오버라이드**하는 것이다.

```typescript
const requestOpts: https.RequestOptions = {
  ...
  servername: isIpHost(url.hostname) ? 'localhost' : url.hostname,
};
```

이 한 줄로 Windows와 iPhone 모두 붙었다.

### 3-4. 외부 DDNS에서 빈 200이 돌아온다 (가짜 해결 6개 시도)

가장 길게 태운 건 이거였다. Mac 로컬 `https://localhost:8443`은 완벽히 동작. 그런데 `https://eeum.iptime.org:8443`으로 외부에서 들어오면 status 200인데 **body가 빈 채**로 돌아왔다. `"LLM returned empty body despite status 200"`.

6개 가설을 시도했다.

1. `flush_interval -1`로 버퍼링 비활성화 — ❌
2. `transport http` 타임아웃 600s로 확장 — ❌
3. `keepalive 60s`로 idle 연결 안정화 — ❌
4. Content-Length 명시 + chunked 회피 — ❌
5. `Connection: close` + `agent: false` — ❌ (필요하긴 함, 후술)
6. `NODE_OPTIONS=--tls-max-v1.2` 강제 — ❌

진짜 원인은 Caddyfile의 **Host 매칭**이었다. site block이 `localhost:8443`만 등록되어 있었기 때문에, 외부에서 `Host: eeum.iptime.org:8443`으로 오면 매칭이 **실패**했고, Caddy는 디폴트 핸들러로 빠져 빈 200을 돌려주고 있었다. `localhost:8443, eeum.iptime.org:8443`으로 둘 다 명시한 순간 해결.

**판별법을 찾은 게 이번의 진짜 수확이다.** 응답 헤더에 `Via: 1.1 Caddy`가 있으면 reverse_proxy가 실행된 것, 없으면 site block 매칭 실패로 디폴트 핸들러가 탄 것. `Server: Caddy`는 매칭 실패 시에도 붙기 때문에 판별에 쓸 수 없다.

### 3-5. NAT idle timeout + keepalive 소켓 재사용 = ECONNRESET

5번 가설은 Host 문제와 별개로 **실제로 필요했다.** Node.js `globalAgent`는 소켓을 풀링해 재사용한다. 그런데 NAT/홈 라우터가 idle 연결을 RST로 끊으면, 클라이언트는 그걸 모르고 죽은 소켓을 꺼내 쓴다 → ECONNRESET. 해결은 `LLMService`의 fetch 호출에 `Connection: close` + `agent: false`를 명시해서 **매 요청마다 새 소켓**을 여는 것.

성능 손실은 측정해 보니 응답당 ~20ms. 35B 추론 자체가 수 초라 체감 불가다.

## 4. vLLM-MLX가 Mac에서 주는 현실적인 이점

이 프로젝트의 8할은 이 런타임 선택이 끝내준 덕이다. 아래는 마케팅 문구가 아니라 Ollama와 LM Studio를 함께 돌려보고 남긴 관찰.

### 4-1. 통합 메모리에서 35B가 돌아간다

`Qwen3.6-35B-A3B`는 MoE 구조라 활성 파라미터가 3B 수준이다. Apple Silicon의 통합 메모리 + MLX 백엔드 조합은 이 모델을 **16GB M-계열 Mac에서도** 돌아가게 한다. 동일 모델을 Linux + 24GB GPU에서 돌리는 것과 초기 응답 지연(time-to-first-token)이 비슷하거나 빠르다는 게 체감이었다. MLX가 Metal을 직접 부르기 때문에 CUDA 변환·PCIe 병목 같은 단계가 아예 없다.

### 4-2. OpenAI API 호환 — 클라이언트 코드가 제로 변경

```bash
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3.6-35B-A3B \
  --port 8001
```

이 한 줄이면 `/v1/chat/completions`, `/v1/models`가 준비된다. 플러그인 쪽 `LLMService`는 OpenAI SDK 포맷 그대로 작성되어 있어 URL만 바꾸면 클라우드 Qwen, 로컬 Ollama, vLLM-MLX 사이를 자유롭게 갈아끼운다.

### 4-3. `chat_template_kwargs` — 서버 단에서 thinking 제어

Ollama는 (적어도 현재 시점) 이 필드를 무시한다. vLLM은 읽고 동작한다. 위에서 본 thinking 누수를 서버 단에서 한 번에 끄는 게 vLLM에서만 가능했다. 이런 **모델 native 기능에 대한 proxy 투명성**이 장기적으로 큰 차이를 만든다.

### 4-4. `--enable-mcp` — MCP 도구를 서버가 공표

vLLM은 MCP 도구를 서버가 직접 공표하고, 클라이언트는 `/v1/tools`류 엔드포인트에서 자동 로드할 수 있다. 플러그인의 `LLMService.getAvailableTools()`가 이걸 그대로 쓴다. 클라이언트가 7개 내장 도구에 더해 서버가 제공하는 MCP 도구(예: 파일시스템 어댑터, 브라우저 자동화)를 자동 발견한다.

### 4-5. Docker 없이 네이티브

Ollama도 네이티브다. 그런데 Ollama는 OpenAI 호환이 **부분적**이고 (tool_calls 필드 형식 차이, streaming 이벤트 형식 차이), GGUF 변환본을 쓴다. 같은 Qwen 3.6도 MLX 변환본 + vLLM-MLX 조합이 토큰/초에서 눈에 띄게 빨랐다. M2 Max에서 비공식 측정으로 Ollama 대비 1.4~1.7배 — 정확한 벤치는 양쪽 세팅에 따라 달라지니 본인 환경에서 재봐야 한다.

### 4-6. `launchd` 친화

Docker 없는 순수 Python 프로세스라 macOS `launchd`에 얹기 쉽다. Caddy도 `launchctl`로 부팅 시 자동 시작하도록 `com.qwen-proxy.plist`를 프로젝트 `proxy/` 디렉토리에 포함해 뒀다.

## 5. 빌드·배포는 한 줄

```json
"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production && cp main.js manifest.json .obsidian/plugins/vault-agent/ && cp src/styles.css .obsidian/plugins/vault-agent/styles.css && cp main.js manifest.json \"/Volumes/data/Obsidian/obsi/.obsidian/plugins/vault-agent/\" && cp src/styles.css \"/Volumes/data/Obsidian/obsi/.obsidian/plugins/vault-agent/styles.css\""
```

`npm run build` 한 번에 타입체크 → esbuild 번들 → 개발 볼트 + 실제 볼트 두 곳에 동시 배포. Obsidian 창에서 `Cmd+R`만 누르면 반영된다. 개발 중엔 `npm run dev`로 watch 모드가 돌아간다.

테스트는 Jest — 29 tests, 회귀 방지용 유닛 테스트가 그중 핵심이다. 위의 "object arguments" 버그처럼 한 줄 수정에도 회귀 테스트 3개를 붙여 두었기 때문에, Qwen 3.7이 나와도 같은 데서 안 넘어진다.

## 6. 지금 상태와 다음 할 일

- ✅ 내부 네트워크에서 Mac/iPhone/Windows 모두 35B 모델과 대화.
- ✅ ReAct 3라운드로 메모 검색 → 읽기 → 요약/작성 사이클이 안정.
- ✅ TLS + API 키 + localStorage 기반 기기별 오버라이드.
- ⏳ 벡터 인덱스 기반 semantic 검색(현재는 파일명/메타데이터 텍스트 검색만).
- ⏳ MCP 서버 쪽에서 Obsidian API를 공표해 외부 에이전트(Claude Desktop 등)가 직접 붙을 수 있게.

## 마치며

로컬 LLM을 "쓰는" 건 쉽다. 올리고·돌리고·ChatGPT 흉내가 나오는 건 30분이면 끝난다. "**믿을 만하게 쓰는**" 건 완전히 다른 이야기였다. 모델이 답변에 `<think>`를 새어 내보내고, `arguments`가 어느 날부터 객체로 오고, Caddy가 Host 매칭을 조용히 실패하고, NAT이 keepalive 소켓을 RST로 끊는다. 이 모든 게 한 주 안에 몰아쳐 왔고, 그게 딱 내가 기대했던 "자기 도구를 만드는 맛"이었다.

vLLM-MLX는 이 중 많은 레이어를 투명하게 만들어 준 런타임이었다. 통합 메모리, OpenAI-compat, 서버 단 thinking 토글, MCP 공표 — 각각은 화려하지 않은데, 합쳐 놓으면 **"내 노트에 말을 거는 35B 어시스턴트를 주말에 만들 수 있는 수준"**까지 내려온다.

관심 있으면 저장소를 들춰 봐도 좋다. 고치느라 남은 회귀 테스트가 더 재밌을지도 모른다.

`github.com/cyans/rocal_llm_obsidian_plugin`
