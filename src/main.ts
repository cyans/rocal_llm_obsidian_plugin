/**
 * Obsidian Vault Agent Plugin
 * Main entry point for the plugin
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:ANCHOR: Plugin lifecycle - Obsidian API integration point
 * @MX:REASON: Fan_in from all plugin components
 */

import { Plugin, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { VaultAgentSettingTab } from './settings';
import { DEFAULT_SETTINGS, VaultAgentSettings } from './types';
import { ChatView, VIEW_TYPE_VAULT_AGENT_CHAT } from './ui/ChatView';
import { LLMService } from './llm/LLMService';
import { ConversationManager } from './agent/ConversationManager';
import { AgentController } from './agent/AgentController';
import { ToolRegistry } from './agent/ToolRegistry';

export default class VaultAgentPlugin extends Plugin {
    settings: VaultAgentSettings;
    llmService: LLMService;
    conversationManager: ConversationManager;
    agentController: AgentController;
    toolRegistry: ToolRegistry;

    async onload() {
        console.log('Loading Vault Agent Plugin');

        // Load settings
        await this.loadSettings();

        // allowInsecureTls 활성 시 Electron 세션 TLS 인증서 검증 비활성화
        this.configureElectronTls();

        // Initialize services
        this.llmService = new LLMService(this.settings);
        this.conversationManager = new ConversationManager();
        this.toolRegistry = new ToolRegistry(this.app);
        this.agentController = new AgentController(
            this.llmService,
            this.toolRegistry,
            this.settings.agentMode
        );

        // Register tools
        this.toolRegistry.registerAllTools(this.settings, this.llmService);

        // Register chat view type
        this.registerView(VIEW_TYPE_VAULT_AGENT_CHAT, (leaf) => new ChatView(leaf, this));

        // Add settings tab
        this.addSettingTab(new VaultAgentSettingTab(this.app, this));

        // Add ribbon icon
        this.addRibbonIcon('message-square', 'Vault Agent 채팅 열기', () => {
            this.activateView();
        });

        // 파일 선택 이벤트 리스너 등록
        this.app.workspace.on('active-leaf-change', () => {
            this.handleFileSelection();
        });

        // 플러그인 로드 시 자동으로 채팅 뷰 열기
        this.app.workspace.onLayoutReady(() => {
            this.activateView();
        });
    }

    onunload() {
        console.log('Unloading Vault Agent Plugin');
    }

    async loadSettings() {
        const loadedSettings = await this.loadData();
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedSettings,
            tools: {
                ...DEFAULT_SETTINGS.tools,
                ...(loadedSettings?.tools ?? {})
            }
        };
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // 설정 변경 시에도 TLS 구성 재적용 (allowInsecureTls 토글 반영)
        this.configureElectronTls();
        this.llmService?.updateSettings(this.settings);
        this.agentController?.setAgentMode(this.settings.agentMode);
        this.toolRegistry?.registerAllTools(this.settings, this.llmService);
    }

    /**
     * 채팅 뷰 활성화
     */
    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_VAULT_AGENT_CHAT);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
        }

        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_VAULT_AGENT_CHAT });
        }
    }
    private handleFileSelection(): void {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);

        if (activeLeaf && activeLeaf.file) {
            const file = activeLeaf.file;
            const fileName = file.basename + '.md';
            const filePath = file.path;

            // 채팅 뷰에 파일 정보 전달
            const chatView = this.getChatView();
            if (chatView) {
                chatView.setActiveFile(fileName, filePath);
            }
        }
    }

    /**
     * allowInsecureTls 설정 시 Electron 세션 및 Node.js TLS 레벨에서 인증서 검증 비활성화
     * @MX:WARN: 자가 서명 인증서 허용 - 신뢰된 사설 네트워크에서만 사용
     * @MX:REASON: 외부 기기(iPhone, Windows)에서 CA 설치 없이 HTTPS 연결 허용.
     *   NODE_TLS_REJECT_UNAUTHORIZED=0 추가로 Electron Node.js 레이어의 TLS 검증도 비활성화.
     */
    private configureElectronTls(): void {
        if (!this.settings.allowInsecureTls) return;

        // Node.js TLS 레이어 전역 인증서 검증 비활성화
        // fetchInsecure()의 rejectUnauthorized=false와 중복 보호
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { session } = require('electron');
            if (typeof session?.defaultSession?.setCertificateVerifyProc === 'function') {
                session.defaultSession.setCertificateVerifyProc(
                    (_req: unknown, callback: (result: number) => void) => {
                        callback(0); // 0: 인증서 허용 (자가 서명 인증서 포함)
                    }
                );
                console.log('[VaultAgent] TLS 인증서 검증 비활성화 (allowInsecureTls=true)');
            }
        } catch {
            // Electron session API를 사용할 수 없는 환경 (모바일 등) - 무시하고 계속
        }
    }

    /**
     * 채팅 뷰 인스턴스 반환
     */
    private getChatView(): ChatView | null {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_AGENT_CHAT);
        if (leaves.length > 0) {
            const leaf = leaves[0];
            if (leaf.view instanceof ChatView) {
                return leaf.view;
            }
        }
        return null;
    }
}
