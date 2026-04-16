# 외부 접속 빈 응답 트러블슈팅 노트 (2026-04-16)

> **최종 결론**: Caddyfile site block의 호스트명 매칭 실패가 근본 원인.
> 다른 모든 가설(버퍼링, keepalive, TLS, NAT)은 부수적 보강이었음.

## 증상

- **Test Connection** (GET `/v1/models`): 외부에서도 성공 ✅
- **Chat** (POST `/v1/chat/completions`): 외부에서만 실패 ❌
  - 첫 시도: `Unexpected end of JSON input` / `LLM returned empty body despite status 200`
  - 두 번째 시도: `read ECONNRESET`

## 진단 흐름

### Phase 1: 빈 응답 재현 확인
플러그인 측 진단 로그(`elapsedMs`, `bodyLength`)에서 status 200 + body 0 bytes 확인.

### Phase 2: Caddy 버퍼링 가설 (오답)
- 가설: vLLM 장시간 추론 응답을 Caddy가 버퍼링 후 NAT timeout으로 끊김
- 시도: `flush_interval -1`, `response_header_timeout 600s`, `read/write_timeout 600s`
- 결과: 영향 없음

### Phase 3: keepalive 풀링 가설 (부분 정답)
- 가설: NAT가 idle 소켓을 RST한 후 풀에서 재사용 시 ECONNRESET
- 시도 (클라이언트):
  - `agent: false` (Node.js globalAgent 풀링 비활성화)
  - `Connection: close` 헤더
  - `body`를 `Buffer`로 사전 변환 → `Content-Length` 명시 (chunked 회피)
- 결과: ECONNRESET은 사라졌지만 빈 응답 문제는 여전

### Phase 4: 진짜 원인 발견
v0.2.4 소켓 레벨 진단 로그에서 결정적 단서 발견:

```
[LLM] response status=200 contentLength=0 elapsedMs=26
[LLM] response headers:
  server: Caddy           ← Caddy가 응답
  alt-svc: h3=":8443"...  ← Caddy 서명
  via: ???                ← ❌ 부재!
```

**`via: 1.1 Caddy` 헤더 부재** = reverse_proxy 핸들러가 실행되지 않았음.
Caddy가 응답은 했지만 디폴트 핸들러(빈 200)로 빠진 것.

### Phase 5: 가설 검증
```bash
curl -ski --http1.1 --tls-max 1.2 \
  -H "Host: eeum.iptime.org:8443" \
  -H "Authorization: Bearer $API_KEY" \
  https://localhost:8443/v1/models
```
→ `HTTP/1.1 200 OK, Content-Length: 0` ✅ **재현 성공**

## 근본 원인

**Caddyfile site block 매칭 규칙**:
- Caddyfile의 site label (`localhost:8443`)은 **HTTP Host 헤더 기준**으로 매칭
- TLS SNI는 인증서 선택에만 사용되며, HTTP 라우팅과 무관
- 외부 접속 시:
  - SNI: `eeum.iptime.org` (또는 IP)
  - Host 헤더: `eeum.iptime.org:8443`
  - → `localhost:8443` site block과 매칭 실패
  - → Caddy 디폴트 핸들러 실행 → 빈 200 응답
  - → 디폴트 핸들러는 access log도 남기지 않음 (조용한 실패)

**오해 포인트**:
1. `Server: Caddy` 헤더가 있어서 reverse_proxy가 실행된 것으로 착각하기 쉬움 (실제로는 Caddy 자체가 항상 추가)
2. `health_uri`는 정상 동작 → Caddy 자체는 살아있음
3. GET /v1/models가 외부에서 성공한 것처럼 보였지만, **사실은 빈 200을 받고 있었음** (vLLM의 모델 리스트가 아니라 빈 본문). Test Connection 로직이 status 200만 검사했을 가능성.

## 해결책

### 1차 시도: `:8443` (catch-all)
```caddyfile
:8443 {
    tls internal
    ...
}
```
- Site block 매칭은 통과하지만 `tls internal`이 어떤 SNI에 cert 발급할지 모름
- → TLS handshake 단계에서 `internal_error` 재발

### 2차 시도 (성공): 호스트명 명시 등록
```caddyfile
localhost:8443, eeum.iptime.org:8443 {
    tls internal
    ...
}
```
- 두 Host 헤더 모두 site block 매칭
- `tls internal`이 두 호스트 각각에 대해 인증서 자동 발급

### 검증
```bash
curl -ski -H "Host: eeum.iptime.org:8443" -H "Authorization: Bearer $KEY" \
  https://localhost:8443/v1/models
```
응답 헤더:
- `Server: uvicorn` ← vLLM 응답 ✅
- `Via: 1.1 Caddy` ← reverse_proxy 실행됨 ✅
- `Content-Length: 130` ← 실제 본문 포함 ✅

POST `/v1/chat/completions`도 동일하게 외부 Host로 정상 응답.

## 향후 호스트 추가 방법

새 도메인/IP로 접속해야 하면 Caddyfile site label에 콤마로 추가:
```caddyfile
localhost:8443, eeum.iptime.org:8443, mydomain.com:8443, 192.168.1.100:8443 {
    tls internal
    ...
}
```

배포:
```bash
cp proxy/Caddyfile ~/.config/caddy/Caddyfile
caddy validate --config ~/.config/caddy/Caddyfile
launchctl unload ~/Library/LaunchAgents/com.qwen-proxy.plist
launchctl load ~/Library/LaunchAgents/com.qwen-proxy.plist
```

## 보존된 클라이언트 측 보강 (실전 안정성)

근본 원인은 서버였지만, 다음 클라이언트 코드는 NAT 환경 전반에서 유용하므로 유지:

- `agent: false` — globalAgent 풀링 비활성화로 stale socket 재사용 방지
- `Connection: close` 헤더 — 서버에 명시적으로 1회성 연결임을 알림
- `Buffer` 사전 변환 + 명시적 `Content-Length` — chunked transfer-encoding 회피
- 소켓 레벨 진단 로그 — 향후 비슷한 이슈 발생 시 즉시 원인 추적 가능

## 디버깅 핵심 교훈

1. **`Server: <name>` 헤더만으로 핸들러 실행 여부를 판단하지 말 것.**
   리버스 프록시의 경우 `Via:` 헤더 존재 여부가 결정적 단서.
2. **Caddy site label은 Host 헤더 매칭이지 SNI 매칭이 아니다.**
   IP나 다른 도메인으로 접속하려면 명시적 등록 필요.
3. **`tls internal`은 명시된 호스트명에 대해서만 인증서를 발급한다.**
   `:포트` (catch-all)로는 동작하지 않음.
4. **조용한 실패에 대비해 reverse_proxy 실행 여부를 헤더로 검증하라.**
   `via: 1.1 Caddy`는 reverse_proxy 핸들러가 자동으로 추가하는 시그니처.
