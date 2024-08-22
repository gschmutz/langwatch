import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spacer,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { ArrowRight } from "react-feather";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { newDatasetEntriesSchema } from "../../server/datasets/types";
import { api } from "../../utils/api";

import { nanoid } from "nanoid";
import { formatFileSize, useCSVReader } from "react-papaparse";
import type { DatasetSpan, RAGChunk } from "../../server/tracer/types";

type RecordEntry = {
  id: string;
  input: string;
  expected_output: string;
  contexts?: string[] | RAGChunk[];
  spans?: DatasetSpan[];
  llm_input?: string;
  expected_llm_output?: string;
  comments?: string;
};

export function UploadCSVModal({
  isOpen,
  onClose,
  datasetId,
}: {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
}) {
  const { project } = useOrganizationTeamProject();
  const dataset = api.datasetRecord.getAll.useQuery(
    { projectId: project?.id ?? "", datasetId: datasetId },
    {
      enabled: !!project,
      refetchOnWindowFocus: false,
    }
  );

  const { CSVReader } = useCSVReader();
  const [zoneHover, setZoneHover] = useState(false);
  const [recordEntries, setRecordEntries] = useState<RecordEntry[]>([]);
  const [CSVHeaders, setCSVHeaders] = useState([]);
  const [hasErrors, setErrors] = useState<string[]>([]);
  const [csvUploaded, setCSVUploaded] = useState([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [canUpload, setCanUpload] = useState(false);
  const uploadRecords = api.datasetRecord.create.useMutation();

  const toast = useToast();

  const preprocessCSV = (csv: any) => {
    setCSVHeaders(csv.slice(0, 1)[0]);
    setCSVUploaded(csv);
  };

  function safeGetRowValue(row: any[], headers: string[], key: string): string {
    const index = headers.indexOf(key);
    return index !== -1 ? row[index] : "";
  }

  const parseJSONField = (
    row: any[],
    headers: string[],
    key: string,
    field: string
  ): any => {
    if (key === "") return;
    const rawValue = safeGetRowValue(row, headers, key);

    try {
      if (rawValue) {
        const parsedValue = JSON.parse(rawValue);
        setErrors((prevErrors) =>
          prevErrors.filter((error) => error !== field)
        );
        return parsedValue;
      } else {
        return undefined;
      }
    } catch (error) {
      setErrors((prevErrors) => {
        if (prevErrors.includes(field)) return prevErrors;
        return [...prevErrors, field];
      });
      return undefined;
    }
  };

  const setupRecordsUpload = (mappings: Record<string, string>) => {
    const records: RecordEntry[] = [];

    csvUploaded.slice(1).forEach((row: any) => {
      const entries: RecordEntry = {
        id: nanoid(),
        input: safeGetRowValue(row, CSVHeaders, mappings.input ?? ""),
        expected_output: safeGetRowValue(
          row,
          CSVHeaders,
          mappings.expected_output ?? ""
        ),
        comments: safeGetRowValue(row, CSVHeaders, mappings.comments ?? ""),
        contexts: parseJSONField(
          row,
          CSVHeaders,
          mappings.contexts ?? "",
          "contexts"
        ),
        spans: parseJSONField(row, CSVHeaders, mappings.spans ?? "", "spans"),
        llm_input: parseJSONField(
          row,
          CSVHeaders,
          mappings.llm_input ?? "",
          "llm_input"
        ),
        expected_llm_output: parseJSONField(
          row,
          CSVHeaders,
          mappings.expected_llm_output ?? "",
          "expected_llm_output"
        ),
      };

      records.push(entries);
    });

    setRecordEntries(records);
    preprocessCSV(csvUploaded);
  };

  const isMappingsComplete = useCallback(() => {
    const columns = Object.keys(dataset.data?.columnTypes ?? {}) ?? [];
    return columns.every((column) => Object.keys(mapping).includes(column));
  }, [dataset.data?.columnTypes, mapping]);

  useEffect(() => {
    setCanUpload(isMappingsComplete());
  }, [isMappingsComplete, mapping]);

  const onSelectChange = (value: string) => {
    const [map, column] = value.split("-");

    if (!map || !column) return;
    mapping[map] = column;

    setMapping((prevMapping) => ({
      ...prevMapping,
      [map]: column,
    }));
    setupRecordsUpload(mapping);
  };

  const uploadCSVData = () => {
    let entries;
    try {
      entries = newDatasetEntriesSchema.parse({
        entries: recordEntries,
      });
    } catch (error) {
      toast({
        title: "Error processing CSV",
        status: "error",
        duration: 5000,
        isClosable: true,
      });

      return;
    }

    uploadRecords.mutate(
      {
        projectId: project?.id ?? "",
        datasetId: datasetId,
        ...entries,
      },
      {
        onSuccess: () => {
          void dataset.refetch();
          setRecordEntries([]);
          setMapping({});
          onClose();
          toast({
            title: "CSV uploaded successfully",
            status: "success",
            duration: 5000,
            isClosable: true,
          });
        },
        onError: () => {
          toast({
            title: "Error uploading CSV",
            description:
              "Please make sure you have the right formatting and that the columns are correct",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
        },
      }
    );
  };

  const selectMappings = useMemo(() => {
    const columns = Object.keys(dataset.data?.columnTypes ?? {}) ?? [];
    return columns.map((col) => ({
      value: col,
    }));
  }, [dataset.data]);

  const renderMapping = (acceptedFile: boolean) => {
    if (!acceptedFile) return;

    return selectMappings.map((option, index) => {
      return (
        <HStack key={index} marginY={2}>
          <Box width={200}>
            <CustomSelect
              selectOptions={CSVHeaders}
              mapping={option.value}
              onSelectChange={onSelectChange}
            />
          </Box>

          <ArrowRight />
          <Spacer />
          <Text>{option.value}</Text>
        </HStack>
      );
    });
  };

  useEffect(() => {
    if (isOpen) {
      setRecordEntries([]);
      setMapping({});
      setCSVHeaders([]);
      setCSVUploaded([]);
      setErrors([]);
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Upload CSV</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <CSVReader
            onUploadAccepted={(results: any) => {
              preprocessCSV(results.data);
              setZoneHover(false);
            }}
            onDragOver={(event: DragEvent) => {
              event.preventDefault();
              setZoneHover(true);
            }}
            onDragLeave={(event: DragEvent) => {
              event.preventDefault();
              setZoneHover(false);
            }}
          >
            {({
              getRootProps,
              acceptedFile,
              ProgressBar,
              getRemoveFileProps,
              Remove,
            }: any) => (
              <>
                <Box
                  {...getRootProps()}
                  borderRadius={"lg"}
                  borderWidth={2}
                  borderColor={zoneHover ? "gray.400" : "gray.200"}
                  borderStyle="dashed"
                  padding={10}
                  textAlign="center"
                >
                  {acceptedFile ? (
                    <>
                      <Box
                        bg="gray.100"
                        padding={4}
                        borderRadius={"lg"}
                        position="relative"
                      >
                        <VStack>
                          <Text>{formatFileSize(acceptedFile.size)}</Text>
                          <Text>{acceptedFile.name}</Text>
                        </VStack>
                        <ProgressBar />

                        <Box
                          position="absolute"
                          right={-1}
                          top={-1}
                          {...getRemoveFileProps()}
                        >
                          <Remove />
                        </Box>
                      </Box>
                    </>
                  ) : (
                    "Drop CSV file here or click to upload"
                  )}
                </Box>
                {renderMapping(acceptedFile)}
              </>
            )}
          </CSVReader>
          {hasErrors.length > 0 && (
            <Text color="red">Please check columns have valid formatting</Text>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Close
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={
              recordEntries.length === 0 || !canUpload || hasErrors.length > 0
            }
            onClick={uploadCSVData}
            isLoading={uploadRecords.isLoading}
          >
            Upload
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface CustomSelectProps {
  selectOptions: string[];
  mapping: string;
  onSelectChange: (value: string) => void;
}
const CustomSelect = ({
  selectOptions,
  onSelectChange,
  mapping,
}: CustomSelectProps) => {
  const [selectedValue, setSelectedValue] = useState("");
  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedValue(event.target.value);
    onSelectChange(event.target.value);
  };

  return (
    <Select
      placeholder="Select column"
      onChange={handleSelectChange}
      value={selectedValue}
    >
      {selectOptions.map((column, i) => (
        <option key={i} value={`${mapping}-${column}`}>
          {column}
        </option>
      ))}
      <option value={`${mapping}-empty`}>Set empty</option>
    </Select>
  );
};