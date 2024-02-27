import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Container,
  HStack,
  Input,
  LinkBox,
  Menu,
  MenuButton,
  MenuGroup,
  MenuItem,
  MenuList,
  Radio,
  Skeleton,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import type { Project } from "@prisma/client";
import { useRouter } from "next/router";
import React, { createRef, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  Search,
} from "react-feather";
import { MessagesDevMode } from "~/components/MessagesDevMode";
import { DashboardLayout } from "../../components/DashboardLayout";
import { MessageCard } from "../../components/MessageCard";
import {
  PeriodSelector,
  usePeriodSelector,
} from "../../components/PeriodSelector";
import { ProjectIntegration } from "../../components/ProjectIntegration";
import { FilterSidebar } from "../../components/filters/FilterSidebar";
import { FilterToggle } from "../../components/filters/FilterToggle";
import { useDevView } from "../../hooks/DevViewProvider";
import { useFilterParams } from "../../hooks/useFilterParams";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import type { Trace, TraceCheck } from "../../server/tracer/types";
import { api } from "../../utils/api";
import { getSingleQueryParam } from "../../utils/getSingleQueryParam";

export default function MessagesOrIntegrationGuide() {
  const { project } = useOrganizationTeamProject();

  const { isDevViewEnabled } = useDevView();

  if (project && !project.firstMessage) {
    return <ProjectIntegration />;
  }

  if (isDevViewEnabled) {
    return <MessagesDevMode />;
  }

  return (
    <DashboardLayout>
      <Messages />
    </DashboardLayout>
  );
}

function Messages() {
  const { project } = useOrganizationTeamProject();
  const router = useRouter();
  const { period, setPeriod } = usePeriodSelector(30);
  const [tracesCheckInterval, setTracesCheckInterval] = useState<
    number | undefined
  >();
  const [liveUpdate, setLiveUpdate] = useState(true);
  const [groupBy] = useGroupBy();
  const { filterParams, queryOpts } = useFilterParams();

  const traceGroups = api.traces.getAllForProject.useQuery(
    {
      ...filterParams,
      query: getSingleQueryParam(router.query.query),
      groupBy,
    },
    queryOpts
  );
  const traceIds =
    traceGroups.data?.groups.flatMap((group) =>
      group.map((trace) => trace.trace_id)
    ) ?? [];
  const traceChecksQuery = api.traces.getTraceChecks.useQuery(
    { projectId: project?.id ?? "", traceIds },
    {
      enabled: traceIds.length > 0,
      refetchInterval: tracesCheckInterval,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (traceChecksQuery.data) {
      const pendingChecks = Object.values(traceChecksQuery.data)
        .flatMap((checks) => checks)
        .filter(
          (check) =>
            (check.status == "scheduled" || check.status == "in_progress") &&
            (check.timestamps.inserted_at ?? 0) >
              new Date().getTime() - 1000 * 60 * 60 * 1
        );
      if (pendingChecks.length > 0) {
        setTracesCheckInterval(5000);
      } else {
        setTracesCheckInterval(undefined);
      }
    }
  }, [traceChecksQuery.data]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (liveUpdate && document.hasFocus()) {
        void traceGroups.refetch();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [liveUpdate, traceGroups]);

  return (
    <>
      <VStack
        width="full"
        spacing={0}
        position="sticky"
        top={0}
        zIndex={3}
        background="white"
      >
        <HStack
          position="relative"
          width="full"
          borderBottom="1px solid #E5E5E5"
          paddingX={4}
        >
          <Box position="absolute" top={6} left={6}>
            <Search size={16} />
          </Box>
          <SearchInput />
          <GroupingSelector />
          <PeriodSelector period={period} setPeriod={setPeriod} />
          <FilterToggle defaultShowFilters={true} />
          <Tooltip
            label={
              liveUpdate
                ? "Pause real-time updates"
                : "Enable real-time updates"
            }
          >
            <Button
              variant="ghost"
              onClick={() => {
                if (liveUpdate) {
                  setLiveUpdate(false);
                } else {
                  setLiveUpdate(true);
                  void traceGroups.refetch();
                  void traceChecksQuery.refetch();
                }
              }}
              className="hide-refresh-on-hover"
            >
              {!liveUpdate && <Play />}
              {liveUpdate && (
                <>
                  <RefreshCw
                    className={
                      traceGroups.isLoading || traceGroups.isRefetching
                        ? "refresh-icon animation-spinning"
                        : "refresh-icon"
                    }
                  />
                  <Pause className="show-on-hover" />
                </>
              )}
            </Button>
          </Tooltip>
        </HStack>
      </VStack>
      <Container maxWidth="1440" padding={6}>
        <HStack align="start" spacing={8}>
          <VStack gap={6} width="full">
            {project &&
            traceGroups.data &&
            traceGroups.data.groups.length > 0 ? (
              <ExpandableMessages
                project={project}
                traceGroups={traceGroups.data.groups}
                checksMap={traceChecksQuery.data}
              />
            ) : traceGroups.data ? (
              <Alert status="info">
                <AlertIcon />
                No messages found
              </Alert>
            ) : traceGroups.isError ? (
              <Alert status="error">
                <AlertIcon />
                An error has occurred trying to load the messages
              </Alert>
            ) : (
              <>
                <MessageSkeleton />
                <MessageSkeleton />
                <MessageSkeleton />
              </>
            )}
          </VStack>
          <FilterSidebar defaultShowFilters={true} />
        </HStack>
      </Container>
    </>
  );
}

const ExpandableMessages = React.memo(
  function ExpandableMessages({
    project,
    traceGroups,
    checksMap,
  }: {
    project: Project;
    traceGroups: Trace[][];
    checksMap: Record<string, TraceCheck[]> | undefined;
  }) {
    const [expandedGroups, setExpandedGroups] = useState<
      Record<number, boolean>
    >({});

    const toggleGroup = (index: number) => {
      setExpandedGroups((prev) => ({
        ...prev,
        [index]: !prev[index],
      }));
    };

    const [cardHeights, setCardHeights] = useState<Record<number, number>>({});
    const cardRefs = (traceGroups ?? []).map(() => createRef<Element>());
    const [groupBy] = useGroupBy();
    const [transitionsEnabled, setTransitionsEnabled] = useState(false);

    useEffect(() => {
      const newHeights: Record<number, number> = {};
      cardRefs.forEach((ref, index) => {
        if (ref.current) {
          newHeights[index] = ref.current.clientHeight;
        }
      });
      setCardHeights(newHeights);
      setTimeout(() => setTransitionsEnabled(true), 100);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [traceGroups]);

    return traceGroups.map((traceGroup, groupIndex) => {
      const isExpanded = !!expandedGroups[groupIndex];

      return (
        <VStack
          key={traceGroup[0]?.trace_id ?? groupIndex}
          gap={0}
          transition="all .2s linear"
          onClick={(e: React.MouseEvent<HTMLElement>) => {
            const hasCardClass = (element: HTMLElement | null): boolean => {
              if (!element) return false;
              if (
                element.classList.contains("card") ||
                element.classList.contains("group-title")
              )
                return true;
              return hasCardClass(element.parentElement);
            };
            if (isExpanded && hasCardClass(e.target as HTMLElement)) return;
            if (traceGroup.length === 1) return;

            toggleGroup(groupIndex);
          }}
          {...(isExpanded
            ? {
                className: "card-stack-content expanded",
                background: "#ECEEF2",
                borderRadius: "10px",
                padding: "40px",
                width: "calc(100% + 80px)",
                cursor: "n-resize",
              }
            : {
                background: "#ECEEF200",
                className: "card-stack-content",
                marginBottom:
                  traceGroup.length > 2 ? 4 : traceGroup.length > 1 ? 2 : 0,
                marginLeft:
                  traceGroup.length > 2 ? -4 : traceGroup.length > 1 ? -2 : 0,
                cursor: "pointer",
                width: "full",
                zIndex: 2,
                _hover: {
                  transform: "scale(1.04)",
                },
              })}
        >
          {isExpanded && (
            <HStack
              width="full"
              cursor="n-resize"
              justify="center"
              marginTop="-40px"
              paddingY={3}
            >
              <ChevronUp />
            </HStack>
          )}
          {isExpanded && groupBy === "user_id" && (
            <Box
              className="group-title"
              position="absolute"
              left="64px"
              marginTop="-22px"
              fontSize={13}
              fontWeight={600}
              color="gray.500"
              cursor="default"
            >
              User ID: {traceGroup[0]?.metadata.user_id ?? "null"}
            </Box>
          )}
          {isExpanded && groupBy === "thread_id" && (
            <Box
              className="group-title"
              position="absolute"
              left="64px"
              marginTop="-22px"
              fontSize={13}
              fontWeight={600}
              color="gray.500"
              cursor="default"
            >
              Thread ID: {traceGroup[0]?.metadata.thread_id ?? "null"}
            </Box>
          )}
          <VStack width="full" gap={6}>
            {traceGroup
              .slice(0, isExpanded ? traceGroup.length : 3)
              .map((trace, traceIndex) => {
                const expanded = isExpanded || traceGroup.length === 1;
                const renderContent = isExpanded || traceIndex === 0;

                return (
                  <LinkBox
                    as={Card}
                    className="card"
                    key={trace.trace_id}
                    ref={traceIndex === 0 ? cardRefs[groupIndex] : null}
                    height={
                      renderContent
                        ? "auto"
                        : `${cardHeights[groupIndex] ?? 0}px`
                    }
                    marginTop={
                      renderContent
                        ? "0"
                        : `-${(cardHeights[groupIndex] ?? 0) + 24}px`
                    }
                    padding={0}
                    cursor="pointer"
                    width="full"
                    transition={
                      transitionsEnabled ? "all .2s linear" : undefined
                    }
                    border="1px solid"
                    borderColor="gray.300"
                    _hover={
                      expanded
                        ? {
                            transform: "scale(1.04)",
                          }
                        : {}
                    }
                  >
                    {!expanded && (
                      <Box position="absolute" right={5} top={5}>
                        <Maximize2 />
                      </Box>
                    )}
                    <CardBody padding={8} width="fill">
                      {renderContent && (
                        <MessageCard
                          linkActive={expanded}
                          project={project}
                          trace={trace}
                          checksMap={checksMap}
                        />
                      )}
                    </CardBody>
                  </LinkBox>
                );
              })}
          </VStack>
        </VStack>
      );
    });
  },
  (prevProps, nextProps) => {
    return (
      prevProps.project === nextProps.project &&
      prevProps.traceGroups
        .flatMap((group) => group.map((trace) => trace.trace_id))
        .join() ===
        nextProps.traceGroups
          .flatMap((group) => group.map((trace) => trace.trace_id))
          .join() &&
      JSON.stringify(prevProps.checksMap) ===
        JSON.stringify(nextProps.checksMap)
    );
  }
);

function SearchInput() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    setQuery((router.query.query as string) ?? "");
  }, [router.query.query]);

  return (
    <form
      style={{ width: "100%" }}
      onSubmit={(e) => {
        e.preventDefault();
        void router.push({
          query: {
            ...router.query,
            query: query ? query : undefined,
          },
        });
      }}
    >
      <Input
        variant="unstyled"
        placeholder={"Search"}
        padding={5}
        paddingLeft={12}
        borderRadius={0}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => {
          void router.push({
            query: {
              ...router.query,
              query: query ? query : undefined,
            },
          });
        }}
        autoFocus={!!router.query.query}
      />
    </form>
  );
}

function MessageSkeleton() {
  return (
    <Card width="full" padding={0}>
      <CardBody padding={8}>
        <VStack alignItems="flex-start" spacing={4}>
          <HStack spacing={12} width="full">
            <Box fontSize={24} fontWeight="bold" width="full">
              <Skeleton width="50%" height="20px" />
            </Box>
          </HStack>
          <VStack gap={4} width="full">
            <Skeleton width="full" height="20px" />
            <Skeleton width="full" height="20px" />
            <Skeleton width="full" height="20px" />
          </VStack>
        </VStack>
      </CardBody>
    </Card>
  );
}

const groups = {
  input: "Input",
  output: "Output",
  user_id: "User ID",
  thread_id: "Thread ID",
  none: "None",
};

const useGroupBy = () => {
  const router = useRouter();

  const groupBy =
    (router.query.group_by as keyof typeof groups | undefined) ?? "input";

  const setGroupBy = (group: keyof typeof groups) => {
    void router.push(
      {
        query: {
          ...router.query,
          group_by: group,
        },
      },
      undefined,
      { shallow: true }
    );
  };

  return [groupBy, setGroupBy] as [typeof groupBy, typeof setGroupBy];
};

function GroupingSelector() {
  const ref = useRef<HTMLDivElement>(null);

  const [groupBy, setGroupBy] = useGroupBy();

  return (
    <Menu initialFocusRef={ref}>
      <MenuButton as={Button} variant="outline" minWidth="fit-content">
        <HStack spacing={2}>
          <Layers size={16} />
          <Box>{groups[groupBy]}</Box>
          <Box>
            <ChevronDown width={14} />
          </Box>
        </HStack>
      </MenuButton>
      <MenuList>
        <MenuGroup title="Group by">
          {Object.entries(groups).map(([key, value]) => (
            <MenuItem
              key={key}
              onClick={() => setGroupBy(key as keyof typeof groups)}
              {...(groupBy === key ? { ref: ref as any } : {})}
            >
              <HStack spacing={2}>
                <Radio isChecked={groupBy === key} />
                <Text>{value}</Text>
              </HStack>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuList>
    </Menu>
  );
}
