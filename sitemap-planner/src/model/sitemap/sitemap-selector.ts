import {
    PlannedUrl,
    SitemapSelection,
    SitemapSelectionConfig
} from './types';

const MAX_SELECTION_SIZE = 10;

export class SitemapSelector {
    select(
        entries: PlannedUrl[],
        config: SitemapSelectionConfig
    ): SitemapSelection {
        this.validate(config);

        const matches = entries
            .filter(entry => config.requiredTags.every(
                tag => entry.tags.includes(tag)
            ))
            .filter(entry => (
                entry.targetResponseTimeMs
                <= config.maximumTargetResponseTimeMs
            ))
            .filter(entry => entry.priority >= config.minimumPriority)
            .sort((left, right) => (
                right.priority - left.priority
                || left.url.localeCompare(right.url)
            ));

        return {
            matched: matches.length,
            entries: matches.slice(0, config.limit)
        };
    }

    private validate(config: SitemapSelectionConfig): void {
        if (
            !Number.isInteger(config.limit)
            || config.limit < 1
            || config.limit > MAX_SELECTION_SIZE
        ) {
            throw new Error(`selection.limit must be between 1 and ${MAX_SELECTION_SIZE}.`);
        }
        if (
            !Number.isFinite(config.maximumTargetResponseTimeMs)
            || config.maximumTargetResponseTimeMs <= 0
        ) {
            throw new Error('selection.maximumTargetResponseTimeMs must be positive.');
        }
        if (
            !Number.isInteger(config.minimumPriority)
            || config.minimumPriority < 1
            || config.minimumPriority > 5
        ) {
            throw new Error('selection.minimumPriority must be between 1 and 5.');
        }
        if (
            !Array.isArray(config.requiredTags)
            || config.requiredTags.some(tag => typeof tag !== 'string' || !tag)
        ) {
            throw new Error('selection.requiredTags must contain non-empty strings.');
        }
    }
}
