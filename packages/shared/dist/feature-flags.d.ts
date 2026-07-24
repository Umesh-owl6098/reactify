import type { PipelineStageName } from "@reactify/generation-contracts";
import type { GenerationUserStatus } from "@reactify/generation-contracts";
export interface FeatureFlags {
    enableRepair: boolean;
    enableInspector: boolean;
    enableAccessibility: boolean;
    enableGenerationPlanEditing: boolean;
}
export declare const DEFAULT_FEATURE_FLAGS: FeatureFlags;
export declare const USER_VISIBLE_STATUSES: GenerationUserStatus[];
export declare function deriveUserStatus(activeStage: PipelineStageName | null, terminalStatus?: GenerationUserStatus): GenerationUserStatus;
//# sourceMappingURL=feature-flags.d.ts.map