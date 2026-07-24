export const visualComparisonPollingDefaults = {
  visualComparisonAllowed: false,
  visualComparisonBlockedReason: null,
  activeComparisonId: null,
  activeComparisonStatus: null,
  latestSimilarityScore: null,
  latestDifferencePercentage: null,
  visualCorrectionAvailable: false,
  visualCorrectionStatus: null,
  visualCorrectionAttempt: 0,
  visualCorrectionMaxAttempts: 3,
  previewCaptureRequired: false,
} as const;
