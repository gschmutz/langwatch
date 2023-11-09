import { useForm } from "react-hook-form";
import {
  techStackLanguageOptions,
  type ProjectFormData,
  techStackFrameworkOptions,
} from "../pages/onboarding/[team]/project";
import { useOrganizationTeamProject } from "../hooks/useOrganizationTeamProject";
import {
  Heading,
  VStack,
  Text,
  HStack,
  Spacer,
  Spinner,
} from "@chakra-ui/react";
import { DashboardLayout } from "./DashboardLayout";
import { OpenAIPython } from "./integration-guides/OpenAIPython";

export const ProjectIntegration = () => {
  const { project, isRefetching } = useOrganizationTeamProject({
    redirectToProjectOnboarding: true,
    keepFetching: true,
  });

  const languageKey = project?.language as
    | keyof typeof techStackLanguageOptions
    | undefined;
  const language = languageKey && techStackLanguageOptions[languageKey];

  const frameworkKey = project?.framework as
    | keyof typeof techStackFrameworkOptions
    | undefined;
  const framework = frameworkKey && techStackFrameworkOptions[frameworkKey];

  const form = useForm<ProjectFormData>({
    defaultValues: {
      language: languageKey,
      framework: frameworkKey,
    },
  });

  return (
    <DashboardLayout backgroundColor="white">
      <VStack
        maxWidth="1600"
        paddingY={6}
        paddingX={12}
        alignSelf="flex-start"
        alignItems="flex-start"
        width="full"
        spacing={10}
      >
        <VStack
          align="flex-start"
          spacing={6}
          borderBottomWidth={1}
          borderBottomColor="gray.300"
          width="full"
          paddingTop={6}
          paddingBottom={6}
        >
          <HStack width={"full"}>
            <Heading as="h1">
              {framework?.label} {language?.label} Integration
            </Heading>
            <Spacer />
            {isRefetching && <Spinner />}
          </HStack>
          <Text>
            Follow the instructions to setup your project with LangWatch, this
            page will update automatically as soon as the first messages arrive
          </Text>
        </VStack>
        <div className="markdown">
          <OpenAIPython apiKey={project?.apiKey} />
        </div>
      </VStack>
    </DashboardLayout>
  );
};
