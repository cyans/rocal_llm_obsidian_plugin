# Qwen LLM 프록시 설정 가이드

로컬 vLLM/Ollama 서버를 외부 인터넷에 안전하게 노출하기 위한 Caddy 역방향 프록시 설정 가이드입니다.

## 구조

```
인터넷 (Obsidian, iPhone, Windows PC)
        │
        │ HTTPS :8443 + API 키 인증
        ▼
  Caddy 역방향 프록시 (Mac)
        │
        │ HTTP :8001 (로컬)
        ▼
  vLLM 서버 (localhost:8001)
```

## 사전 요구 사항

- macOS (Apple Silicon 또는 Intel)
- [Homebrew](https://brew.sh) 패키지 매니저
- 로컬에서 실행 중인 vLLM 서버 (`localhost:8001`)

---

## 빠른 시작

### 1. 스크립트 실행 권한 부여 및 설정 시작

```bash
chmod +x proxy/setup.sh
./proxy/setup.sh
```

스크립트가 자동으로 다음을 처리합니다:

1. Homebrew 설치 확인 (없으면 설치 안내)
2. Caddy 설치 (`brew install caddy`)
3. 보안 API 키 자동 생성 (`proxy/.env`에 저장)
4. Caddyfile을 `~/.config/caddy/`에 복사
5. macOS LaunchAgent 등록 (부팅 시 자동 시작)
6. Caddy 로컬 CA를 시스템 키체인에 등록

### 2. Mac의 IP 주소 확인

```bash
# Wi-Fi 연결된 경우
ipconfig getifaddr en0

# 유선 연결된 경우
ipconfig getifaddr en1
```

---

## Obsidian 플러그인 설정

Obsidian에서 Qwen/LLM 플러그인 설정 화면을 열고 다음과 같이 입력합니다:

| 설정 항목 | 값 |
|-----------|-----|
| API URL | `https://<MAC_IP_주소>:8443/v1` |
| API Key | setup.sh 실행 시 출력된 키 값 |
| Allow Insecure TLS | **ON** (또는 CA 인증서 가져오기) |

> **예시**: Mac IP가 `192.168.1.100`이라면 API URL은 `https://192.168.1.100:8443/v1`

---

## Windows PC에서 접속하기

Caddy가 자체 서명 인증서를 사용하므로, Windows에서 TLS 오류 없이 접속하려면 Mac의 CA 인증서를 가져와야 합니다.

### Mac에서 CA 인증서 내보내기

```bash
# Caddy 로컬 CA 인증서 위치 확인
ls $(caddy environ | grep CADDY_DATA | cut -d= -f2)/pki/authorities/local/

# 인증서 파일 복사 (보통 아래 경로에 있음)
cp ~/.local/share/caddy/pki/authorities/local/root.crt ~/Desktop/qwen-proxy-ca.crt
```

> Apple Silicon Mac의 경우 경로가 다를 수 있습니다:
> `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`

### Windows에서 CA 인증서 가져오기

1. Mac에서 복사한 `qwen-proxy-ca.crt` 파일을 Windows로 전송 (USB, AirDrop 등)
2. 파일을 더블클릭하여 인증서 설치 마법사 실행
3. **"인증서 저장소"** 선택 시 **"신뢰할 수 있는 루트 인증 기관"** 선택
4. 설치 완료 후 브라우저/Obsidian 재시작

---

## iPhone에서 접속하기

iPhone의 경우 **Obsidian 플러그인 설정에서 "Allow Insecure TLS"를 ON**으로 설정하면 별도의 인증서 설치 없이 접속 가능합니다.

또는 보안을 위해 Mac의 CA 인증서를 iPhone에 설치할 수 있습니다:

1. Mac에서 CA 인증서를 AirDrop으로 iPhone에 전송
2. iPhone 설정 > 프로파일 다운로드됨 > 설치
3. 설정 > 일반 > 정보 > 인증서 신뢰 설정에서 루트 CA 활성화

---

## 문제 해결

### 프록시 로그 확인

```bash
# 일반 로그 (요청/응답)
tail -f /tmp/qwen-proxy.log

# 오류 로그
tail -f /tmp/qwen-proxy-error.log
```

### 자주 발생하는 문제

**연결이 안 될 때**

```bash
# Caddy 실행 상태 확인
launchctl list | grep qwen-proxy

# Caddy 직접 실행으로 오류 확인
QWEN_PROXY_API_KEY=<your_key> caddy run --config ~/.config/caddy/Caddyfile
```

**API 키 확인**

```bash
# 저장된 API 키 확인
cat proxy/.env
```

**프록시 재시작**

```bash
launchctl unload ~/Library/LaunchAgents/com.qwen-proxy.plist
launchctl load ~/Library/LaunchAgents/com.qwen-proxy.plist
```

**포트 충돌 확인**

```bash
# 8443 포트 사용 프로세스 확인
lsof -i :8443
```

**방화벽 설정**

macOS 방화벽이 활성화된 경우 Caddy에 대한 수신 연결을 허용해야 합니다:
시스템 설정 > 네트워크 > 방화벽 > Caddy 허용

### API 연결 테스트

```bash
# 로컬에서 직접 테스트 (API 키 대입)
API_KEY=$(cat proxy/.env | grep QWEN_PROXY_API_KEY | cut -d= -f2)

curl -sk -H "Authorization: Bearer $API_KEY" \
    https://localhost:8443/v1/models | head -c 500
```

---

## 파일 구조

```
proxy/
├── Caddyfile              # Caddy 역방향 프록시 설정
├── com.qwen-proxy.plist   # macOS LaunchAgent (자동 시작)
├── setup.sh               # 자동 설치 스크립트
├── .env                   # API 키 저장 (setup.sh가 생성, git 제외)
└── README.md              # 이 문서
```

> **주의**: `proxy/.env` 파일에는 API 키가 저장되므로 절대 git에 커밋하지 마세요.
> `.gitignore`에 `proxy/.env`가 추가되어 있는지 확인하세요.
