/**
 * TFIDFScorer Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 3
 */

import { TFIDFScorer } from '../../../src/search/TFIDFScorer';

describe('TFIDFScorer', () => {
    let scorer: TFIDFScorer;

    beforeEach(() => {
        scorer = new TFIDFScorer();
    });

    describe('calculateTF', () => {
        it('should calculate term frequency for single term', () => {
            const text = 'this is a test this is only a test';
            const tf = scorer.calculateTF(text, 'test');

            expect(tf).toBeGreaterThan(0);
            expect(tf).toBeCloseTo(2 / 10, 1); // 'test' appears 2 times in 10 words
        });

        it('should return 0 for term not in text', () => {
            const text = 'this is a test';
            const tf = scorer.calculateTF(text, 'nonexistent');

            expect(tf).toBe(0);
        });

        it('should handle empty text', () => {
            const tf = scorer.calculateTF('', 'test');

            expect(tf).toBe(0);
        });

        it('should be case insensitive', () => {
            const text = 'Test TEST test';
            const tf = scorer.calculateTF(text, 'test');

            expect(tf).toBeCloseTo(3 / 3, 1);
        });
    });

    describe('calculateIDF', () => {
        it('should calculate inverse document frequency', () => {
            const documents = [
                'this is a test',
                'this is another test',
                'completely different content'
            ];

            const idf = scorer.calculateIDF(documents, 'test');

            expect(idf).toBeGreaterThan(0);
        });

        it('should return higher IDF for rare terms', () => {
            const documents = [
                'test document one',
                'test document two',
                'test document three',
                'different content'
            ];

            const commonIDF = scorer.calculateIDF(documents, 'test');
            const rareIDF = scorer.calculateIDF(documents, 'content');

            expect(rareIDF).toBeGreaterThan(commonIDF);
        });

        it('should return 0 for term in all documents', () => {
            const documents = [
                'test document',
                'test another'
            ];

            const idf = scorer.calculateIDF(documents, 'test');

            expect(idf).toBe(0);
        });

        it('should handle empty document list', () => {
            const idf = scorer.calculateIDF([], 'test');

            expect(idf).toBe(0);
        });
    });

    describe('calculateTFIDF', () => {
        it('should calculate TF-IDF score', () => {
            const documents = [
                'this is a test about testing',
                'another document without the term',
                'yet another different file'
            ];

            const tfidf = scorer.calculateTFIDF(documents[0], documents, 'test');

            expect(tfidf).toBeGreaterThan(0);
        });

        it('should return 0 for term not in document', () => {
            const documents = [
                'this is a test',
                'another document'
            ];

            const tfidf = scorer.calculateTFIDF(documents[1], documents, 'test');

            expect(tfidf).toBe(0);
        });
    });

    describe('scoreDocument', () => {
        it('should score document against query', () => {
            const document = 'typescript programming is fun';
            const query = 'typescript programming';
            const documents = [
                document,
                'javascript coding',
                'python development'
            ];

            const score = scorer.scoreDocument(document, documents, query);

            expect(score).toBeGreaterThan(0);
        });

        it('should return higher score for better match', () => {
            const documents = [
                'typescript programming tutorial',
                'javascript basics',
                'python for beginners'
            ];

            const score1 = scorer.scoreDocument(documents[0], documents, 'typescript');
            const score2 = scorer.scoreDocument(documents[1], documents, 'typescript');

            expect(score1).toBeGreaterThan(score2);
        });
    });

    describe('rankDocuments', () => {
        it('should rank documents by relevance', () => {
            const documents = [
                'typescript programming guide',
                'javascript tutorial',
                'typescript best practices',
                'python introduction'
            ];

            const query = 'typescript programming';
            const ranked = scorer.rankDocuments(documents, query);

            // First result should be the most relevant
            expect(ranked.length).toBeGreaterThan(0);
            expect(ranked[0].document).toBe('typescript programming guide');
        });

        it('should include scores in results', () => {
            const documents = [
                'banana fruit yellow',
                'apple fruit red',
                'orange fruit orange'
            ];

            const ranked = scorer.rankDocuments(documents, 'banana');

            expect(ranked.length).toBeGreaterThan(0);
            expect(ranked[0]).toHaveProperty('score');
            expect(ranked[0].score).toBeGreaterThan(0);
        });

        it('should handle empty document list', () => {
            const ranked = scorer.rankDocuments([], 'test');

            expect(ranked).toEqual([]);
        });

        it('should handle empty query', () => {
            const documents = ['test document'];
            const ranked = scorer.rankDocuments(documents, '');

            expect(ranked).toEqual([]);
        });
    });
});
