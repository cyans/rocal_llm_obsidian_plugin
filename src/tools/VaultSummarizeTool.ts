/**
 * VaultSummarizeTool - Summarize content using LLM
 * @MX:SPEC: SPEC-VAULT-SUMMARY Phase 1-2
 * @MX:NOTE: LLM을 활용한 볼트 요약 도구
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { LLMService } from '../llm/LLMService';

export interface VaultSummarizeParams {
    inputs: Array<{
        file_path: string;
        content: string;
    }>;
    style?: 'bullets' | 'paragraph' | 'outline';
    max_output_tokens?: number;
    combine?: boolean;
}

type SummaryStyle = NonNullable<VaultSummarizeParams['style']>;

const MAX_INPUTS = 10;
const MAX_CHARS_PER_CHUNK = 20000;

export interface VaultSummarizeResult {
    success: boolean;
    summaries: Array<{
        file_path: string;
        summary: string;
        key_points: string[];
    }>;
    combined_summary?: string;
    sources: string[];
}

/**
 * VaultSummarizeTool implements content summarization using LLM.
 */
export class VaultSummarizeTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'vault_summarize',
        description: 'Summarize vault file contents using LLM',
        parameters: {
            type: 'object',
            properties: {
                inputs: {
                    type: 'array',
                    description: 'Array of file contents to summarize',
                    items: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['file_path', 'content']
                    }
                },
                style: {
                    type: 'string',
                    enum: ['bullets', 'paragraph', 'outline'],
                    description: 'Summary style'
                },
                max_output_tokens: {
                    type: 'number',
                    description: 'Maximum output tokens'
                },
                combine: {
                    type: 'boolean',
                    description: 'Whether to combine summaries'
                }
            },
            required: ['inputs']
        }
    };

    private llmService: LLMService;

    constructor(llmService: LLMService) {
        super();
        this.llmService = llmService;
    }

    /**
     * Execute vault summarization with given parameters.
     */
    async execute(params: VaultSummarizeParams): Promise<VaultSummarizeResult> {
        // Validate input
        if (!params.inputs || params.inputs.length === 0) {
            throw new Error('inputs is required and must have at least one input');
        }

        if (params.inputs.length > MAX_INPUTS) {
            throw new Error(`A maximum of ${MAX_INPUTS} inputs is supported`);
        }

        const style: SummaryStyle = params.style || 'bullets';
        const combine = params.combine !== undefined ? params.combine : false;
        const summaries: VaultSummarizeResult['summaries'] = [];
        const sources: string[] = [];

        // Process each input
        for (const input of params.inputs) {
            try {
                const summary = await this.summarizeSingle(input, style, params.max_output_tokens);
                summaries.push({
                    file_path: input.file_path,
                    summary: summary.text,
                    key_points: summary.keyPoints
                });
                sources.push(input.file_path);
            } catch (error) {
                console.error(`Failed to summarize ${input.file_path}:`, error);
                // Continue with other files even if one fails
            }
        }

        // Generate combined summary if requested
        let combinedSummary: string | undefined;
        if (combine && summaries.length > 0) {
            combinedSummary = await this.generateCombinedSummary(summaries, style, params.max_output_tokens);
        }

        return {
            success: summaries.length > 0,
            summaries,
            combined_summary: combinedSummary,
            sources
        };
    }

    /**
     * Summarize a single input
     * @MX:NOTE: 개별 파일 요약 생성
     */
    private async summarizeSingle(
        input: { file_path: string; content: string },
        style: SummaryStyle,
        maxOutputTokens?: number
    ): Promise<{ text: string; keyPoints: string[] }> {
        const chunks = this.chunkContent(input.content);
        const chunkSummaries: string[] = [];

        for (let index = 0; index < chunks.length; index++) {
            const prompt = this.buildSummaryPrompt(
                chunks[index],
                style,
                input.file_path,
                chunks.length > 1 ? `${index + 1}/${chunks.length}` : undefined
            );

            const response = await this.llmService.chat(
                [{ role: 'user', content: prompt }],
                undefined,
                { maxTokens: maxOutputTokens }
            );
            chunkSummaries.push(response.content || '');
        }

        const text = chunkSummaries.length === 1
            ? chunkSummaries[0]
            : await this.mergeChunkSummaries(input.file_path, chunkSummaries, style, maxOutputTokens);
        const keyPoints = this.extractKeyPoints(text);

        return { text, keyPoints };
    }

    /**
     * Build summary prompt based on style
     * @MX:NOTE: 요약 스타일에 따른 프롬프트 생성
     */
    private buildSummaryPrompt(
        content: string,
        style: SummaryStyle,
        filePath: string,
        chunkLabel?: string
    ): string {
        const styleInstructions: Record<SummaryStyle, string> = {
            bullets: '불릿 형식으로 요약해주세요.',
            paragraph: '단락 형식으로 요약해주세요.',
            outline: '개요 형식으로 요약해주세요.'
        };

        const scope = chunkLabel
            ? `파일 "${filePath}"의 ${chunkLabel} 청크`
            : `파일 "${filePath}"`;

        return `${scope}를 요약해주세요.

${styleInstructions[style]}
- 원문을 길게 옮겨 적지 말고 압축해서 표현하세요.
- 핵심 사실, 주장, 문제의식, 반복되는 패턴만 남기세요.
- 추측하지 말고 내용에 있는 정보만 사용하세요.
- 불필요한 예시와 세부 묘사는 과감히 생략하세요.
- 핵심 포인트는 최대 5개까지만 작성하세요.
- 각 핵심 포인트는 가능하면 1문장 이내로 작성하세요.
- 마지막에는 이 노트를 나중에 다시 연결할 수 있는 \`#키워드\`를 3~7개 추출하세요.

출력 형식:
## 한줄 요약
한 문장으로 가장 핵심적인 요약

## 핵심 포인트
- 포인트 1
- 포인트 2

## 연결 키워드
#키워드1 #키워드2 #키워드3

${content}`;
    }

    /**
     * Extract key points from summary text
     * @MX:NOTE: 요약 텍스트에서 핵심 포인트 추출
     */
    private extractKeyPoints(text: string): string[] {
        const lines = text.split('\n');
        const keyPoints: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            // Extract bullet points or numbered items
            if (trimmed.match(/^[-*+•]\s/) || trimmed.match(/^\d+\.\s/)) {
                keyPoints.push(trimmed.replace(/^[-*+•]\s+|^\d+\.\s+/, ''));
            }
        }

        return keyPoints;
    }

    /**
     * Generate combined summary from individual summaries
     * @MX:NOTE: 개별 요약을 통합 요약으로 병합
     */
    private async generateCombinedSummary(
        summaries: Array<{ file_path: string; summary: string }>,
        style: SummaryStyle,
        maxOutputTokens?: number
    ): Promise<string> {
        const combinedInput = summaries
            .map((s) => `## ${s.file_path}\n\n${s.summary}`)
            .join('\n\n');

        const styleLabel = style === 'bullets' ? '불릿' : style === 'outline' ? '개요' : '단락';
        const prompt = `다음 파일별 요약을 통합해서 전체 요약을 작성해주세요.

- ${styleLabel} 형식으로 작성해주세요.
- 파일별 차이점과 공통점을 드러내세요.
- 출처 파일 경로를 잃지 않도록 요약하세요.
- 원문을 다시 길게 풀어쓰지 말고 압축 요약하세요.
- 공통 주제와 대비되는 관점을 함께 정리하세요.
- 마지막에는 여러 파일을 함께 연결할 수 있는 공통 \`#키워드\`를 3~7개 적어주세요.

출력 형식:
## 통합 요약
짧은 요약

## 공통점과 차이점
- 항목

## 연결 키워드
#키워드1 #키워드2

${combinedInput}`;

        const response = await this.llmService.chat(
            [{ role: 'user', content: prompt }],
            undefined,
            { maxTokens: maxOutputTokens }
        );

        return response.content || '';
    }

    private async mergeChunkSummaries(
        filePath: string,
        chunkSummaries: string[],
        style: SummaryStyle,
        maxOutputTokens?: number
    ): Promise<string> {
        const prompt = `다음은 파일 "${filePath}"를 여러 청크로 나눠 요약한 결과입니다.

- 이 요약들을 하나의 일관된 최종 요약으로 병합해주세요.
- 형식은 ${style === 'bullets' ? '불릿' : style === 'outline' ? '개요' : '단락'} 형식입니다.
- 중복을 제거하고 핵심만 남겨주세요.
- 원문을 다시 길게 복원하지 말고 더 짧게 압축하세요.
- 마지막에는 이 문서를 다시 찾을 수 있는 \`#키워드\`를 적어주세요.

${chunkSummaries.map((summary, index) => `### Chunk ${index + 1}\n${summary}`).join('\n\n')}`;

        const response = await this.llmService.chat(
            [{ role: 'user', content: prompt }],
            undefined,
            { maxTokens: maxOutputTokens }
        );

        return response.content || '';
    }

    private chunkContent(content: string): string[] {
        if (content.length <= MAX_CHARS_PER_CHUNK) {
            return [content];
        }

        const chunks: string[] = [];
        let start = 0;

        while (start < content.length) {
            let end = Math.min(start + MAX_CHARS_PER_CHUNK, content.length);

            if (end < content.length) {
                const lastBreak = content.lastIndexOf('\n', end);
                if (lastBreak > start + 1000) {
                    end = lastBreak;
                }
            }

            chunks.push(content.slice(start, end).trim());
            start = end;
        }

        return chunks.filter(chunk => chunk.length > 0);
    }
}
