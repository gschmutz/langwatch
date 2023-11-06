import { type Job, Worker } from "bullmq";
import { connection } from "../redis";
import { getDebugger } from "../../utils/logger";
import { updateCheckStatusInES } from "./queue";

const debug = getDebugger("langwatch:trace_checks:workers");

export type TraceCheckResult = {
  raw_result: object;
  value: number;
};

export const process = async (
  _job: Job<any, any, string>
): Promise<TraceCheckResult> => {
  return {
    raw_result: { result: "it works!" },
    value: Math.random() > 0.5 ? 1 : 0,
  };
};

export const start = (
  processMock:
    | ((job: Job<any, any, string>) => Promise<TraceCheckResult>)
    | undefined = undefined
) => {
  const processFn = processMock ?? process;

  const worker = new Worker(
    "trace_checks",
    async (job) => {
      try {
        debug(`Processing job ${job.id} with data:`, job.data);
        const result = await processFn(job);

        await updateCheckStatusInES({
          check_type: job.name,
          trace_id: job.data.trace_id,
          project_id: job.data.project_id,
          status: "succeeded",
          raw_result: result.raw_result,
          value: result.value,
        });
        debug("Successfully processed job:", job.id);
      } catch (error) {
        await updateCheckStatusInES({
          check_type: job.name,
          trace_id: job.data.trace_id,
          project_id: job.data.project_id,
          status: "failed",
          error: error,
        });
        debug("Failed to process job:", job.id, error);

        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    debug(`Job ${job?.id} failed with error ${err.message}`);
  });

  debug("Trace checks worker registered");

  return worker;
};