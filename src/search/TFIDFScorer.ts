/**
 * TF-IDF Scorer - Text relevance scoring
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 3
 * @MX:NOTE: TF-IDF(Term Frequency-Inverse Document Frequency) 알고리즘
 */

export interface RankedDocument {
    document: string;
    score: number;
}

/**
 * TFIDFScorer implements TF-IDF algorithm for text relevance scoring.
 * TF-IDF measures how important a term is to a document in a collection.
 */
export class TFIDFScorer {
    private readonly epsilon: number = 0.0001; // Small value to prevent division by zero

    /**
     * Calculate Term Frequency (TF) for a term in a document.
     * TF = (number of times term appears) / (total number of terms)
     */
    calculateTF(text: string, term: string): number {
        if (!text || !term) {
            return 0;
        }

        const words = this.tokenize(text);
        const normalizedTerm = term.toLowerCase().trim();

        if (words.length === 0) {
            return 0;
        }

        const termCount = words.filter(w => w === normalizedTerm).length;
        return termCount / words.length;
    }

    /**
     * Calculate Inverse Document Frequency (IDF) for a term across documents.
     * IDF = log(total documents / documents containing term)
     */
    calculateIDF(documents: string[], term: string): number {
        if (!documents || documents.length === 0 || !term) {
            return 0;
        }

        const normalizedTerm = term.toLowerCase().trim();
        const documentsWithTerm = documents.filter(doc => {
            const words = this.tokenize(doc);
            return words.includes(normalizedTerm);
        }).length;

        if (documentsWithTerm === 0) {
            return 0;
        }

        // If term appears in all documents, IDF = 0
        if (documentsWithTerm === documents.length) {
            return 0;
        }

        return Math.log(documents.length / documentsWithTerm);
    }

    /**
     * Calculate TF-IDF score for a term in a document.
     * TF-IDF = TF * IDF
     */
    calculateTFIDF(document: string, documents: string[], term: string): number {
        const tf = this.calculateTF(document, term);
        const idf = this.calculateIDF(documents, term);
        return tf * idf;
    }

    /**
     * Score a document against a query using TF-IDF.
     * Aggregates TF-IDF scores for all query terms.
     */
    scoreDocument(document: string, documents: string[], query: string): number {
        if (!document || !query) {
            return 0;
        }

        const queryTerms = this.tokenize(query);
        let totalScore = 0;

        for (const term of queryTerms) {
            totalScore += this.calculateTFIDF(document, documents, term);
        }

        return totalScore;
    }

    /**
     * Rank documents by relevance to a query.
     * Returns documents sorted by TF-IDF score (descending).
     */
    rankDocuments(documents: string[], query: string): RankedDocument[] {
        if (!documents || documents.length === 0 || !query.trim()) {
            return [];
        }

        const results = documents.map(doc => ({
            document: doc,
            score: this.scoreDocument(doc, documents, query)
        }));

        // Filter out documents with zero score and sort
        return results
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Tokenize text into words.
     * Splits by whitespace and punctuation, converts to lowercase.
     */
    private tokenize(text: string): string[] {
        if (!text) {
            return [];
        }

        // Convert to lowercase and split by non-word characters
        const words = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 0);

        return words;
    }

    /**
     * Calculate cosine similarity between two documents.
     * Useful for document similarity comparisons.
     */
    cosineSimilarity(doc1: string, doc2: string): number {
        const words1 = this.tokenize(doc1);
        const words2 = this.tokenize(doc2);

        if (words1.length === 0 || words2.length === 0) {
            return 0;
        }

        // Get unique words from both documents
        const uniqueWords = new Set([...words1, ...words2]);

        // Calculate dot product and magnitudes
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (const word of uniqueWords) {
            const tf1 = this.calculateTF(doc1, word);
            const tf2 = this.calculateTF(doc2, word);

            dotProduct += tf1 * tf2;
            magnitude1 += tf1 * tf1;
            magnitude2 += tf2 * tf2;
        }

        magnitude1 = Math.sqrt(magnitude1) + this.epsilon;
        magnitude2 = Math.sqrt(magnitude2) + this.epsilon;

        return dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * Get top N keywords from a document using TF-IDF.
     */
    extractKeywords(document: string, documents: string[], topN: number = 5): string[] {
        const words = this.tokenize(document);
        const uniqueWords = new Set(words);

        const keywordScores = Array.from(uniqueWords).map(word => ({
            word,
            score: this.calculateTFIDF(document, documents, word)
        }));

        return keywordScores
            .filter(k => k.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN)
            .map(k => k.word);
    }
}
