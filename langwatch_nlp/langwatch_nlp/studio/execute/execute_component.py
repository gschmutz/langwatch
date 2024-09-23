from langwatch_nlp.studio.parser import parse_component
from langwatch_nlp.studio.utils import disable_dsp_caching
from langwatch_nlp.studio.types.events import (
    Debug,
    DebugPayload,
    ExecuteComponentPayload,
    end_component_event,
    start_component_event,
)


async def execute_component(event: ExecuteComponentPayload):
    yield Debug(payload=DebugPayload(message="executing component"))

    node = [node for node in event.workflow.nodes if node.id == event.node_id][0]
    disable_dsp_caching()

    yield start_component_event(node, event.trace_id)

    module = parse_component(node, event.workflow)
    result = module()(**event.inputs)

    yield end_component_event(node, event.trace_id, dict(result))