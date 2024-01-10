import {
  Card,
  CardBody,
  CardHeader,
  HStack,
  Heading,
  Tooltip,
} from "@chakra-ui/react";
import { HelpCircle } from "react-feather";
import { useAnalyticsParams } from "../../hooks/useAnalyticsParams";
import { api } from "../../utils/api";
import { SummaryMetric } from "./SummaryMetric";

export const SessionsSummary = () => {
  const { analyticsParams, queryOpts } = useAnalyticsParams();

  const { data } = api.analytics.sessionsVsPreviousPeriod.useQuery(
    analyticsParams,
    queryOpts
  );

  return (
    <Card>
      <CardHeader>
        <HStack>
          <Heading size="sm">Sessions</Heading>
          <Tooltip label="A session is a period of user activity without breaks longer than one hour">
            <HelpCircle width="14px" />
          </Tooltip>
        </HStack>
      </CardHeader>
      <CardBody>
        <HStack spacing={0} align="stretch">
          <SummaryMetric
            label="Bouncing Rate"
            current={
              data
                ? data.currentPeriod.bouncing_users_count /
                  (data.currentPeriod.total_users || 1)
                : undefined
            }
            format="0%"
          />
          <SummaryMetric
            label="Returning Users"
            current={
              data
                ? data.currentPeriod.returning_users_count /
                  (data.currentPeriod.total_users || 1)
                : undefined
            }
            format="0%"
          />
          <SummaryMetric
            label="Average Session Duration"
            current={
              data
                ? data.currentPeriod.average_duration_per_user_session / 1000
                : undefined
            }
            format="00:00:00"
          />
          <SummaryMetric
            label="Average Sessions per User"
            current={data?.currentPeriod.average_sessions_per_user}
          />
          <SummaryMetric
            label="Average Threads per Session"
            current={data?.currentPeriod.average_threads_per_user_session}
          />
        </HStack>
      </CardBody>
    </Card>
  );
};