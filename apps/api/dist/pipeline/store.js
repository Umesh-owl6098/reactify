import { randomUUID } from "node:crypto";
import { deriveUserStatus } from "@reactify/shared";
export class GenerationStore {
    records = new Map();
    create(input) {
        const now = new Date().toISOString();
        const record = {
            id: randomUUID(),
            imageId: input.imageId,
            projectId: input.projectId ?? randomUUID(),
            status: "Queued",
            activeStage: null,
            stages: [],
            outputs: {
                designAnalysis: null,
                generationPlan: null,
                generatedProject: null,
            },
            errors: [],
            cancelled: false,
            failStage: input.failStage,
            createdAt: now,
            updatedAt: now,
        };
        this.records.set(record.id, record);
        return record;
    }
    get(id) {
        return this.records.get(id);
    }
    cancel(id) {
        const record = this.records.get(id);
        if (!record || record.status === "Ready" || record.status === "Failed" || record.status === "Cancelled") {
            return false;
        }
        record.cancelled = true;
        record.status = "Cancelled";
        record.activeStage = null;
        record.updatedAt = new Date().toISOString();
        for (const stage of record.stages) {
            if (stage.status === "pending" || stage.status === "running") {
                stage.status = "cancelled";
                stage.completedAt = record.updatedAt;
            }
        }
        return true;
    }
    markStageRunning(record, stage) {
        const startedAt = new Date().toISOString();
        record.activeStage = stage;
        record.status = deriveUserStatus(stage);
        record.updatedAt = startedAt;
        record.stages.push({
            stage,
            status: "running",
            startedAt,
        });
    }
    markStageFinished(record, stage, entry) {
        const current = [...record.stages].reverse().find((item) => item.stage === stage && !item.completedAt);
        const completedAt = new Date().toISOString();
        if (current) {
            current.status = entry.status;
            current.completedAt = completedAt;
            current.durationMs = entry.durationMs;
            current.errorCode = entry.errorCode;
            current.errorMessage = entry.errorMessage;
        }
        else {
            record.stages.push({
                stage,
                status: entry.status,
                completedAt,
                durationMs: entry.durationMs,
                errorCode: entry.errorCode,
                errorMessage: entry.errorMessage,
            });
        }
        record.updatedAt = completedAt;
    }
    applyStateOutputs(record, state) {
        record.outputs = {
            designAnalysis: state.designAnalysis ?? null,
            generationPlan: state.generationPlan ?? null,
            generatedProject: state.generatedProject ?? null,
        };
    }
    toSnapshot(record) {
        const stages = {};
        let totalMs = 0;
        for (const entry of record.stages) {
            if (entry.durationMs !== undefined) {
                stages[entry.stage] = entry.durationMs;
                totalMs += entry.durationMs;
            }
        }
        return {
            id: record.id,
            imageId: record.imageId,
            projectId: record.projectId,
            status: record.status,
            activeStage: record.activeStage,
            stages: record.stages,
            outputs: record.outputs,
            errors: record.errors,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            durations: {
                totalMs,
                stages,
            },
        };
    }
}
//# sourceMappingURL=store.js.map