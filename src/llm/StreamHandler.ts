/**
 * Stream Handler - SSE streaming response 처리
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: Server-Sent Events 스트리밍을 처리하는 유틸리티
 */

export interface StreamChunk {
    content: string;
    done: boolean;
}

export class StreamHandler {
    private buffer: string = '';

    /**
     * SSE 데이터 라인을 파싱
     */
    parseSSELine(line: string): StreamChunk | null {
        if (!line.trim()) {
            return null;
        }

        if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            // [DONE] 신호 확인
            if (data === '[DONE]') {
                return { content: '', done: true };
            }

            try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                    return { content, done: false };
                }
            } catch {
                // JSON 파싱 실패 시 무시
            }
        }

        return null;
    }

    /**
     * 스트림 처리를 위한 async generator
     */
    async *processStream(response: Response): AsyncGenerator<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        this.buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                this.buffer += decoder.decode(value, { stream: true });
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() || '';

                for (const line of lines) {
                    const chunk = this.parseSSELine(line);
                    if (chunk && chunk.content) {
                        yield chunk.content;
                    }
                    if (chunk?.done) {
                        return;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
