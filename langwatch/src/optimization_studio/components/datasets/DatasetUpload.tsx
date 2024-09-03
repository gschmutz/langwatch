import {
  Button,
  Center,
  Heading,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { type Node, type NodeProps } from "@xyflow/react";
import type { Component, Entry } from "../../types/dsl";
import { nanoid } from "nanoid";
import {
  CSVReaderComponent,
  MAX_ROWS_LIMIT,
} from "../../../components/datasets/UploadCSVModal";
import type {
  DatasetColumns,
  DatasetRecordEntry,
} from "../../../server/datasets/types";
import { AddOrEditDatasetDrawer } from "../../../components/AddOrEditDatasetDrawer";
import { useState } from "react";
import type { InMemoryDataset } from "../../../components/datasets/DatasetTable";

export function DatasetUpload({
  setIsEditing,
}: {
  setIsEditing: (isEditing: Entry["dataset"] | undefined) => void;
}) {
  const addDatasetDrawer = useDisclosure();
  const [uploadedDataset, setUploadedDataset] = useState<
    InMemoryDataset | undefined
  >(undefined);

  return (
    <Center height="calc(100vh - 384px)">
      <VStack spacing={4}>
        <Heading size="md">Upload CSV</Heading>
        <CSVReaderComponent
          onUploadAccepted={({ data, acceptedFile }) => {
            const columns: DatasetColumns = (data[0] ?? []).map(
              (col: string) => ({
                name: col,
                type: "string",
              })
            );
            const records: DatasetRecordEntry[] = data
              .slice(1)
              .map((row: string[]) => ({
                id: nanoid(),
                ...Object.fromEntries(
                  row.map((col, i) => [columns[i]?.name, col])
                ),
              }));

            setUploadedDataset({
              datasetRecords: records,
              columnTypes: columns,
              name: acceptedFile.name.split(".")[0],
            });
          }}
          onUploadRemoved={() => {
            setUploadedDataset(undefined);
          }}
        />
        {uploadedDataset &&
          uploadedDataset.datasetRecords.length > MAX_ROWS_LIMIT && (
            <Text color="red.500" paddingTop={4}>
              Sorry, the max number of rows accepted for datasets is currently{" "}
              {MAX_ROWS_LIMIT} rows. Please reduce the number of rows or contact
              support.
            </Text>
          )}
        <Button
          colorScheme="blue"
          isDisabled={
            !uploadedDataset ||
            uploadedDataset.datasetRecords.length === 0 ||
            uploadedDataset.datasetRecords.length > MAX_ROWS_LIMIT
          }
          onClick={addDatasetDrawer.onOpen}
        >
          Upload
        </Button>
      </VStack>
      <AddOrEditDatasetDrawer
        datasetToSave={uploadedDataset}
        isOpen={addDatasetDrawer.isOpen}
        onClose={() => {
          addDatasetDrawer.onClose();
        }}
        onSuccess={(params) => {
          addDatasetDrawer.onClose();
          setIsEditing({
            id: params.datasetId,
            name: params.name,
          });
        }}
      />
    </Center>
  );
}