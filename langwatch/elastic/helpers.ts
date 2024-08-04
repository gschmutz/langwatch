import type { MappingProperty } from "@elastic/elasticsearch/lib/api/types";
import type { IndexSpec } from "../src/server/elasticsearch";
import { esClient } from "../src/server/elasticsearch";

export const recreateIndexAndMigrate = async ({
  indexSpec,
  migrationKey,
  mapping,
}: {
  indexSpec: IndexSpec;
  migrationKey: string;
  mapping: Record<string, MappingProperty>;
}) => {
  const newIndex = `${indexSpec.base}-${migrationKey}`;
  await createIndex({
    index: newIndex,
    mappings: mapping,
  });

  const previousIndex = await getPreviousWriteIndex({
    indexSpec,
    newIndex,
  });
  await reindexWithAlias({
    indexSpec,
    previousIndex,
    newIndex,
  });
};

export const getPreviousWriteIndex = async ({
  indexSpec,
  newIndex,
}: {
  indexSpec: IndexSpec;
  newIndex: string;
}) => {
  const aliasInfo: Record<string, unknown> = await esClient.indices.getAlias({
    name: indexSpec.write_alias,
  });
  const currentIndices = Object.keys(aliasInfo).filter(
    (index) => !index.endsWith("-temp") && index !== newIndex
  );

  // Sort indices and get the most recent one
  const previousIndex = currentIndices.sort().pop();
  if (!previousIndex) {
    throw new Error(
      `No existing write index found for alias ${indexSpec.write_alias}`
    );
  }
  return previousIndex;
};

export const createIndex = async ({
  index,
  mappings,
}: {
  index: string;
  mappings: Record<string, MappingProperty>;
}) => {
  const indexExists = await esClient.indices.exists({ index });
  if (!indexExists) {
    await esClient.indices.create({
      index,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: { properties: mappings },
    });
  }
  await esClient.indices.putMapping({
    index,
    properties: mappings,
  });
};

export const reindexWithAlias = async ({
  indexSpec,
  previousIndex,
  newIndex,
}: {
  indexSpec: IndexSpec;
  previousIndex: string;
  newIndex: string;
}) => {
  console.log(`Reindexing from ${previousIndex} to ${newIndex}`);

  const response = await esClient.reindex({
    wait_for_completion: false,
    slices: "auto",
    requests_per_second: 300,
    body: {
      conflicts: "proceed",
      source: { index: previousIndex, size: 300 },
      dest: { index: newIndex },
    },
  });

  const taskId = response.task;

  if (!taskId) {
    throw new Error(
      `Reindex task failed to be created: ${JSON.stringify(response)}`
    );
  }

  console.log(`Reindex task started: ${taskId}`);

  await esClient.indices.updateAliases({
    body: {
      actions: [
        { add: { index: newIndex, alias: indexSpec.read_alias } },
        { add: { index: newIndex, alias: indexSpec.write_alias } },
        { remove: { index: previousIndex, alias: indexSpec.write_alias } },
      ],
    },
  });

  try {
    while (true) {
      const task = await esClient.tasks.get({
        task_id: taskId.toString(),
      });

      console.log(
        `[${new Date().toISOString()}] Reindex task status: ${JSON.stringify(
          task.task.status
        )}`
      );

      if (task.completed) {
        if (
          task.response &&
          !task.response.timed_out &&
          !task.response.canceled
        ) {
          console.log(`Reindex task ${taskId} completed successfully!`);
          break;
        } else {
          throw new Error(
            `Reindex task failed: ${JSON.stringify(
              task.error ?? task.response
            )}`
          );
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }

    await esClient.indices.updateAliases({
      body: {
        actions: [
          {
            remove: {
              index: previousIndex,
              alias: indexSpec.read_alias,
            },
          },
        ],
      },
    });
    // await esClient.indices.delete({ index: previousIndex });
  } catch (error) {
    await esClient.indices.updateAliases({
      body: {
        actions: [
          {
            remove: {
              index: newIndex,
              alias: indexSpec.write_alias,
            },
          },
          {
            add: {
              index: previousIndex,
              alias: indexSpec.write_alias,
            },
          },
        ],
      },
    });

    throw error;
  }
};
