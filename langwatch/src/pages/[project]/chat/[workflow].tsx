import { Box, Card } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { FullLogo } from "../../../components/icons/FullLogo";
import { useOrganizationTeamProject } from "../../../hooks/useOrganizationTeamProject";
import { ChatBox } from "../../../optimization_studio/components/ChatWindow";
import { api } from "../../../utils/api";
export default function ChatPage() {
  const router = useRouter();
  const { project } = useOrganizationTeamProject();
  const workflowId = router.query.workflow as string;

  const publishedWorkflow = api.optimization.getPublishedWorkflow.useQuery(
    {
      workflowId: workflowId,
      projectId: project?.id ?? "",
    },
    {
      enabled: !!project?.id,
    }
  );

  if (!publishedWorkflow.data) {
    return;
  }
  return (
    <Box h="100vh">
      <Box h="100%" bg="gray.100" p={16} pt={4}>
        <FullLogo />
        <Card h="90%" bg="white" p={5} mt={4}>
          <ChatBox
            useApi={true}
            workflowId={workflowId}
            nodes={publishedWorkflow.data.dsl.nodes}
            edges={publishedWorkflow.data.dsl.edges}
            dsl={publishedWorkflow.data.dsl}
          />
        </Card>
      </Box>
    </Box>
  );
}
