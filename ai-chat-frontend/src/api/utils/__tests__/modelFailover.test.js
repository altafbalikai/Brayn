import { describe, it, expect } from 'vitest';
import { classifyError } from '../modelFailover';

describe('modelFailover utility', () => {
    it('should classify 400 unavailable as isUnavailable', () => {
        const error = { status: 400, message: 'Selected LLM model is unavailable' };
        const result = classifyError(error);
        expect(result.isUnavailable).toBe(true);
        expect(result.isRetriable).toBe(false);
        expect(result.isFatal).toBe(false);
    });

    it('should classify 500 error as isRetriable', () => {
        const error = { status: 500 };
        const result = classifyError(error);
        expect(result.isUnavailable).toBe(false);
        expect(result.isRetriable).toBe(true);
        expect(result.isFatal).toBe(false);
    });

    it('should classify network error as isRetriable', () => {
        const error = { message: 'Network error: Failed to fetch' };
        const result = classifyError(error);
        expect(result.isRetriable).toBe(true);
    });

    it('should classify 404 as isFatal', () => {
        const error = { status: 404 };
        const result = classifyError(error);
        expect(result.isUnavailable).toBe(false);
        expect(result.isRetriable).toBe(false);
        expect(result.isFatal).toBe(true);
    });
});
