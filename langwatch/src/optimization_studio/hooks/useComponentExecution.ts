import { useCallback, useEffect, useState } from "react";
import { useSocketClient } from "./useSocketClient";
import { useWorkflowStore } from "./useWorkflowStore";
import type { StudioClientEvent } from "../types/events";
import type { Node } from "@xyflow/react";
import type { BaseComponent, Component } from "../types/dsl";
import { nanoid } from "nanoid";
import { useToast } from "@chakra-ui/react";
import { useAlertOnComponent } from "./useAlertOnComponent";

export const useComponentExecution = () => {
  const { setComponentExecutionState } = useWorkflowStore();
  const { sendMessage, socketStatus } = useSocketClient();

  const toast = useToast();

  const [triggerTimeout, setTriggerTimeout] = useState<{
    component_id: string;
    trace_id: string;
  } | null>(null);

  const { node, setSelectedNode, setPropertiesExpanded } = useWorkflowStore(
    (state) => ({
      node: state.nodes.find(
        (node) => node.id === triggerTimeout?.component_id
      ),
      setSelectedNode: state.setSelectedNode,
      setPropertiesExpanded: state.setPropertiesExpanded,
    })
  );

  const alertOnComponent = useAlertOnComponent();

  useEffect(() => {
    if (
      triggerTimeout &&
      node &&
      node.data.execution_state?.trace_id === triggerTimeout.trace_id &&
      node.data.execution_state?.status === "waiting"
    ) {
      const execution_state: BaseComponent["execution_state"] = {
        status: "error",
        error: "Timeout",
        timestamps: { finished_at: Date.now() },
      };
      setComponentExecutionState(node.id, execution_state);
      alertOnComponent({ componentId: node.id, execution_state });
    }
  }, [triggerTimeout, node, setComponentExecutionState, alertOnComponent]);

  const startComponentExecution = useCallback(
    ({
      node,
      inputs,
    }: {
      node: Node<Component>;
      inputs?: Record<string, string>;
    }) => {
      if (socketStatus !== "connected") {
        toast({
          title: "Studio is not connected",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      const { missingFields, inputs: inputs_ } = getInputsForExecution({
        node,
        inputs,
      });
      if (missingFields) {
        setSelectedNode(node.id);
        setPropertiesExpanded(true);
        return;
      }

      const trace_id = `trace_${nanoid()}`;

      setComponentExecutionState(node.id, {
        status: "waiting",
        trace_id,
        inputs: inputs_,
      });

      const payload: StudioClientEvent = {
        type: "execute_component",
        payload: { trace_id, node, inputs: inputs_ },
      };
      sendMessage(payload);

      setTimeout(() => {
        setTriggerTimeout({ component_id: node.id, trace_id });
      }, 10_000);
    },
    [
      socketStatus,
      setComponentExecutionState,
      sendMessage,
      setSelectedNode,
      setPropertiesExpanded,
      toast,
    ]
  );

  return {
    startComponentExecution,
  };
};

export function getInputsForExecution({
  node,
  inputs,
}: {
  node: Node<Component>;
  inputs?: Record<string, string>;
}): { missingFields: boolean; inputs: Record<string, string> } {
  const allFields = new Set(
    node.data.inputs?.map((field) => field.identifier) ?? []
  );
  const requiredFields =
    node.data.inputs?.filter((field) => !field.optional) ?? [];
  const defaultValues = node.data.inputs?.reduce(
    (acc, field) => {
      if (field.defaultValue !== undefined) {
        acc[field.identifier] = field.defaultValue;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  const inputs_ = Object.fromEntries(
    Object.entries({
      ...defaultValues,
      ...(node?.data.execution_state?.inputs ?? {}),
      ...(inputs ?? {}),
    }).filter(([key]) => allFields.has(key))
  );

  const missingFields = requiredFields.some(
    (field) => !(field.identifier in inputs_)
  );

  return { missingFields, inputs: inputs_ };
}