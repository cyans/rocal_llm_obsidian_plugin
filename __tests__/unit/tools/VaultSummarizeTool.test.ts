/**
 * VaultSummarizeTool Tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { LLMService } from '../../../src/llm/LLMService';
import { VaultSummarizeTool } from '../../../src/tools/VaultSummarizeTool';

// Mock LLMService
const mockLLMService = {
    chat: jest.fn(),
    updateSettings: jest.fn(),
};

describe('VaultSummarizeTool', () => {
    let tool: VaultSummarizeTool;
    let mockLLMServiceInstance: any;

    beforeEach(() => {
        mockLLMServiceInstance = mockLLMService as any;
        tool = new VaultSummarizeTool(mockLLMServiceInstance);

        // Clear mocks before each test
        jest.clearAllMocks();
    });

    describe('execute', () => {
        test('단일 파일 요약 성공', async () => {
            // Setup
            const mockSummary = '이 문서는 프로젝트에 대한 설명입니다.';
            mockLLMServiceInstance.chat.mockResolvedValue({
                content: mockSummary,
                toolCalls: []
            });

            // Execute
            const result = await tool.execute({
                inputs: [
                    {
                        file_path: 'project.md',
                        content: 'This is a project documentation.'
                    }
                ],
                style: 'bullets'
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.summaries).toHaveLength(1);
            expect(result.summaries[0].file_path).toBe('project.md');
            expect(result.summaries[0].summary).toBe(mockSummary);
            expect(result.sources).toEqual(['project.md']);
        });

        test('다중 파일 요약', async () => {
            // Setup
            mockLLMServiceInstance.chat
                .mockResolvedValueOnce({
                    content: 'Summary 1',
                    toolCalls: []
                })
                .mockResolvedValueOnce({
                    content: 'Summary 2',
                    toolCalls: []
                });

            // Execute
            const result = await tool.execute({
                inputs: [
                    { file_path: 'file1.md', content: 'Content 1' },
                    { file_path: 'file2.md', content: 'Content 2' }
                ]
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.summaries).toHaveLength(2);
            expect(result.sources).toEqual(['file1.md', 'file2.md']);
        });

        test('통합 요약 (combine=true)', async () => {
            // Setup
            mockLLMServiceInstance.chat
                .mockResolvedValueOnce({
                    content: 'Summary 1',
                    toolCalls: []
                })
                .mockResolvedValueOnce({
                    content: 'Summary 2',
                    toolCalls: []
                })
                .mockResolvedValueOnce({
                    content: 'Combined summary',
                    toolCalls: []
                });

            // Execute
            const result = await tool.execute({
                inputs: [
                    { file_path: 'file1.md', content: 'Content 1' },
                    { file_path: 'file2.md', content: 'Content 2' }
                ],
                combine: true
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.combined_summary).toBe('Combined summary');
        });

        test('빈 inputs 배열 에러', async () => {
            await expect(tool.execute({
                inputs: []
            })).rejects.toThrow('inputs is required');
        });

        test('기본 스타일 (bullets)', async () => {
            // Setup
            mockLLMServiceInstance.chat.mockResolvedValue({
                content: 'Summary',
                toolCalls: []
            });

            // Execute
            const result = await tool.execute({
                inputs: [{ file_path: 'test.md', content: 'Test content' }]
            });

            // Verify
            expect(result.success).toBe(true);
            expect(mockLLMServiceInstance.chat).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('불릿 형식으로 요약해주세요.')
                    })
                ]),
                undefined,
                { maxTokens: undefined }
            );
            expect(mockLLMServiceInstance.chat).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('## 연결 키워드')
                    })
                ]),
                undefined,
                { maxTokens: undefined }
            );
        });

        test('긴 입력은 청크로 나눠 요약 후 병합한다', async () => {
            const largeContent = 'A'.repeat(21050);

            mockLLMServiceInstance.chat
                .mockResolvedValueOnce({ content: 'Chunk summary 1', toolCalls: [] })
                .mockResolvedValueOnce({ content: 'Chunk summary 2', toolCalls: [] })
                .mockResolvedValueOnce({ content: 'Merged summary', toolCalls: [] });

            const result = await tool.execute({
                inputs: [{ file_path: 'large.md', content: largeContent }]
            });

            expect(result.success).toBe(true);
            expect(result.summaries[0].summary).toBe('Merged summary');
            expect(mockLLMServiceInstance.chat).toHaveBeenCalledTimes(3);
        });
    });

    describe('keyPoints 추출', () => {
        test('불식 불렛릿 형식에서 추출', async () => {
            // Setup
            mockLLMServiceInstance.chat.mockResolvedValue({
                content: '- 핵심 포인트 1\n- 핵심 포인트 2',
                toolCalls: []
            });

            // Execute
            const result = await tool.execute({
                inputs: [{ file_path: 'test.md', content: 'Test' }]
            });

            // Verify
            expect(result.summaries[0].key_points).toEqual([
                '핵심 포인트 1',
                '핵심 포인트 2'
            ]);
        });

        test('숫자 형식에서 추출', async () => {
            // Setup
            mockLLMServiceInstance.chat.mockResolvedValue({
                content: '1. 첫번째 항목\n2. 두번째 항목\n일반 텍스트',
                toolCalls: []
            });

            // // Execute
            const result = await tool.execute({
                inputs: [{ file_path: 'test.md', content: 'Test' }]
            });

            // Verify
            expect(result.summaries[0].key_points).toEqual([
                '첫번째 항목',
                '두번째 항목'
            ]);
        });
    });
});
