#!/bin/bash
# =============================================================================
# Qwen LLM 프록시 자동 설정 스크립트 (macOS)
# =============================================================================
# 역할: Caddy 역방향 프록시를 설치·설정하여 로컬 vLLM 서버(localhost:8001)를
#       외부 인터넷에 HTTPS + API 키 인증으로 노출합니다.
#
# 멱등성(Idempotent): 이미 설정된 경우 재실행해도 안전합니다.
# =============================================================================

set -e  # 오류 발생 시 즉시 종료

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 스크립트 위치 기준으로 프록시 디렉토리 결정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
CADDYFILE_SRC="$SCRIPT_DIR/Caddyfile"
PLIST_SRC="$SCRIPT_DIR/com.qwen-proxy.plist"
CADDY_CONFIG_DIR="$HOME/.config/caddy"
CADDY_CONFIG="$CADDY_CONFIG_DIR/Caddyfile"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/com.qwen-proxy.plist"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Qwen LLM 프록시 설정 시작${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# =============================================================================
# 1단계: Homebrew 확인 및 설치
# =============================================================================
echo -e "${YELLOW}[1/8] Homebrew 확인 중...${NC}"

if ! command -v brew &>/dev/null; then
    echo -e "${RED}  Homebrew가 설치되어 있지 않습니다.${NC}"
    echo -e "  Homebrew를 설치하려면 다음 명령을 실행하세요:"
    echo -e '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    read -r -p "  지금 Homebrew를 설치하시겠습니까? (y/N): " install_brew
    if [[ "$install_brew" =~ ^[Yy]$ ]]; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        echo -e "${GREEN}  Homebrew 설치 완료${NC}"
    else
        echo -e "${RED}  Homebrew 없이는 설치를 진행할 수 없습니다. 종료합니다.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  Homebrew 확인 완료: $(brew --version | head -1)${NC}"
fi

# =============================================================================
# 2단계: Caddy 설치
# =============================================================================
echo ""
echo -e "${YELLOW}[2/8] Caddy 설치 확인 중...${NC}"

if ! command -v caddy &>/dev/null; then
    echo "  Caddy를 설치합니다..."
    brew install caddy
    echo -e "${GREEN}  Caddy 설치 완료${NC}"
else
    echo -e "${GREEN}  Caddy 이미 설치됨: $(caddy version | head -1)${NC}"
fi

# =============================================================================
# 3단계: API 키 생성 (없는 경우에만)
# =============================================================================
echo ""
echo -e "${YELLOW}[3/8] API 키 설정 중...${NC}"

if [ -f "$ENV_FILE" ]; then
    # 기존 .env에서 키 읽기
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    if [ -n "$QWEN_PROXY_API_KEY" ]; then
        echo -e "${GREEN}  기존 API 키를 사용합니다 (.env 파일 존재)${NC}"
    else
        echo -e "${YELLOW}  .env 파일이 있지만 QWEN_PROXY_API_KEY가 없습니다. 새로 생성합니다.${NC}"
        QWEN_PROXY_API_KEY=$(openssl rand -hex 32)
        echo "QWEN_PROXY_API_KEY=$QWEN_PROXY_API_KEY" >> "$ENV_FILE"
    fi
else
    echo "  새 API 키를 생성합니다..."
    QWEN_PROXY_API_KEY=$(openssl rand -hex 32)
    echo "QWEN_PROXY_API_KEY=$QWEN_PROXY_API_KEY" > "$ENV_FILE"
    echo -e "${GREEN}  API 키 생성 완료 → $ENV_FILE${NC}"
fi

# =============================================================================
# 4단계: Caddyfile을 ~/.config/caddy/에 복사
# =============================================================================
echo ""
echo -e "${YELLOW}[4/8] Caddyfile 설정 중...${NC}"

mkdir -p "$CADDY_CONFIG_DIR"

if [ ! -f "$CADDYFILE_SRC" ]; then
    echo -e "${RED}  오류: $CADDYFILE_SRC 파일이 없습니다.${NC}"
    exit 1
fi

cp "$CADDYFILE_SRC" "$CADDY_CONFIG"
echo -e "${GREEN}  Caddyfile 복사 완료 → $CADDY_CONFIG${NC}"

# =============================================================================
# 5단계: API 키 표시
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  생성된 API 키 (복사해 두세요!)${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  QWEN_PROXY_API_KEY = $QWEN_PROXY_API_KEY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# =============================================================================
# 6단계: LaunchAgent plist 설치
# =============================================================================
echo -e "${YELLOW}[5/8] LaunchAgent 설치 중...${NC}"

if [ ! -f "$PLIST_SRC" ]; then
    echo -e "${RED}  오류: $PLIST_SRC 파일이 없습니다.${NC}"
    exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR"

# plist 파일에 실제 API 키와 경로 삽입
sed \
    -e "s|__QWEN_PROXY_API_KEY__|$QWEN_PROXY_API_KEY|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

echo -e "${GREEN}  LaunchAgent 설치 완료 → $PLIST_DEST${NC}"

# =============================================================================
# 7단계: LaunchAgent 로드
# =============================================================================
echo ""
echo -e "${YELLOW}[6/8] LaunchAgent 로드 중...${NC}"

# 기존에 로드된 경우 언로드 후 재로드
if launchctl list | grep -q "com.qwen-proxy"; then
    echo "  기존 LaunchAgent 언로드 중..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

launchctl load "$PLIST_DEST"
echo -e "${GREEN}  LaunchAgent 로드 완료${NC}"

# =============================================================================
# 8단계: Caddy CA 신뢰 등록 및 프록시 테스트
# =============================================================================
echo ""
echo -e "${YELLOW}[7/8] Caddy 로컬 CA 신뢰 등록 중...${NC}"

# Caddy 내부 CA를 시스템 키체인에 등록 (sudo 필요)
echo "  Caddy 로컬 CA를 macOS 키체인에 등록합니다 (sudo 암호가 필요할 수 있습니다)..."
caddy trust || echo -e "${YELLOW}  CA 신뢰 등록에 실패했습니다. 수동으로 'sudo caddy trust'를 실행하세요.${NC}"

echo ""
echo -e "${YELLOW}[8/8] 프록시 연결 테스트 중...${NC}"
echo "  5초 후 테스트를 시작합니다 (Caddy 시작 대기)..."
sleep 5

# 테스트: 잘못된 키로 401 반환 확인
TEST_RESULT=$(curl -sk -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer invalid_key" \
    https://localhost:8443/ 2>/dev/null || echo "000")

if [ "$TEST_RESULT" = "401" ]; then
    echo -e "${GREEN}  프록시 정상 작동 확인 (401 반환 - 잘못된 키 차단됨)${NC}"
elif [ "$TEST_RESULT" = "000" ]; then
    echo -e "${YELLOW}  프록시가 아직 시작 중이거나 연결할 수 없습니다.${NC}"
    echo -e "  로그 확인: tail -f /tmp/qwen-proxy.log"
else
    echo -e "${YELLOW}  예상치 못한 응답: HTTP $TEST_RESULT${NC}"
fi

# =============================================================================
# 완료 안내
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  설정 완료! 다음 단계를 따라주세요${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  1. Mac의 IP 주소 확인:"
echo -e "     ${GREEN}ipconfig getifaddr en0${NC}"
echo ""
echo -e "  2. Obsidian 플러그인 설정:"
echo -e "     API URL:  ${GREEN}https://<YOUR_IP>:8443/v1${NC}"
echo -e "     API Key:  ${GREEN}$QWEN_PROXY_API_KEY${NC}"
echo -e "     Allow Insecure TLS: ON (또는 CA 인증서를 가져와야 함)"
echo ""
echo -e "  3. 로그 확인:"
echo -e "     ${GREEN}tail -f /tmp/qwen-proxy.log${NC}"
echo -e "     ${GREEN}tail -f /tmp/qwen-proxy-error.log${NC}"
echo ""
echo -e "  4. 프록시 재시작:"
echo -e "     ${GREEN}launchctl unload $PLIST_DEST && launchctl load $PLIST_DEST${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
