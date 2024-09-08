from typing import List, Dict, Union, Optional, Literal
from pydantic import BaseModel, Field as PydanticField
from enum import Enum

from langwatch_nlp.studio.types.dataset import DatasetColumns


class FieldType(str, Enum):
    str = "str"
    float = "float"
    int = "int"
    bool = "bool"
    list_str = "list[str]"
    list_float = "list[float]"
    list_int = "list[int]"
    list_bool = "list[bool]"
    dict = "dict"
    signature = "signature"
    llm = "llm"


class Field(BaseModel):
    identifier: str
    type: FieldType
    optional: Optional[bool] = None
    defaultValue: Optional[str] = None
    description: Optional[str] = None
    prefix: Optional[str] = None
    hidden: Optional[bool] = None


class ComponentExecutionStatus(str, Enum):
    idle = "idle"
    waiting = "waiting"
    running = "running"
    success = "success"
    error = "error"


class ComponentType(str, Enum):
    entry = "entry"
    signature = "signature"
    module = "module"
    retriever = "retriever"
    prompting_technique = "prompting_technique"
    evaluator = "evaluator"


class Timestamps(BaseModel):
    started_at: Optional[int] = None
    finished_at: Optional[int] = None


class ExecutionState(BaseModel):
    status: ComponentExecutionStatus
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    error: Optional[str] = None
    parameters: Optional[Dict[str, str]] = None
    inputs: Optional[Dict[str, str]] = None
    outputs: Optional[Dict[str, str]] = None
    timestamps: Optional[Timestamps] = None


class DecoratedBy(BaseModel):
    ref: str


class BaseComponent(BaseModel):
    _library_ref: Optional[str] = None
    name: Optional[str] = None
    cls: Optional[str] = None
    parameters: Optional[List[Field]] = None
    inputs: Optional[List[Field]] = None
    outputs: Optional[List[Field]] = None
    decorated_by: Optional[DecoratedBy] = None
    execution_state: Optional[ExecutionState] = None


class LLMConfig(BaseModel):
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    litellm_params: Optional[Dict[str, str]] = None


class Signature(BaseComponent):
    prompt: Optional[str] = None
    llm: Optional[LLMConfig] = None


class Edge(BaseModel):
    id: str
    source: str
    sourceHandle: str
    target: str
    targetHandle: str
    type: str


class Module(BaseComponent):
    components: Optional[List["Node"]] = None
    forward_pass: Optional[Union[List[Edge], Dict[str, str]]] = None


class Retriever(BaseComponent):
    pass


class PromptingTechnique(BaseComponent):
    pass


class DatasetInline(BaseModel):
    records: Dict[str, List[str]]
    columnTypes: DatasetColumns


class Dataset(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    inline: Optional[DatasetInline] = None


class Entry(BaseComponent):
    inputs: None = None
    dataset: Optional[Dataset] = None


class Evaluator(BaseComponent):
    inputs: List[
        Union[
            Dict[Literal["identifier", "type"], Literal["score", "float"]],
            Dict[Literal["identifier", "type"], Literal["passed", "bool"]],
            Dict[Literal["identifier", "type"], Literal["label", "str"]],
            Dict[Literal["identifier", "type"], Literal["details", "str"]],
        ]
    ] = []


Component = Union[BaseComponent, Entry, Signature, Module, Evaluator]


class BaseNode(BaseModel):
    id: str
    data: BaseComponent


class SignatureNode(BaseNode):
    type: Literal["signature"] = "signature"
    data: Signature


class ModuleNode(BaseNode):
    type: Literal["module"] = "module"
    data: Module


class EntryNode(BaseNode):
    type: Literal["entry"] = "entry"
    data: Entry


class EvaluatorNode(BaseNode):
    type: Literal["evaluator"] = "evaluator"
    data: Evaluator


Node = Union[SignatureNode, ModuleNode, EntryNode, EvaluatorNode]


class Flow(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class WorkflowExecutionStatus(str, Enum):
    idle = "idle"
    waiting = "waiting"
    running = "running"
    success = "success"
    error = "error"


class EntryMethod(BaseModel):
    method: Literal["manual_entry", "full_dataset", "random_sample"]
    size: Optional[int] = None


class WorkflowExecutionState(BaseModel):
    status: WorkflowExecutionStatus
    trace_id: Optional[str] = None
    last_component_ref: Optional[str] = None
    entry: EntryMethod
    inputs: Dict[str, Dict[str, str]]
    outputs: Dict[str, Dict[str, str]]
    error: Optional[str] = None
    timestamps: Optional[Timestamps] = None


class ExperimentState(BaseModel):
    experiment_id: Optional[str] = None
    run_id: Optional[str] = None
    run_name: Optional[str] = None
    state: Optional[WorkflowExecutionStatus] = None
    timestamps: Optional[Timestamps] = None


class WorkflowState(BaseModel):
    execution: Optional[WorkflowExecutionState] = None
    experiment: Optional[ExperimentState] = None


class Workflow(BaseModel):
    spec_version: str
    name: str
    description: str
    version: str
    default_llm: LLMConfig
    nodes: List[Node]
    edges: List[Edge]
    state: WorkflowState
