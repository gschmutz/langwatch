import asyncio
from asyncio import Task
import functools
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, TypeVar

import nanoid
import requests
from langwatch.types import BaseSpan, ErrorCapture, Span, SpanTimestamps, SpanTypes
from langwatch.utils import (
    autoconvert_typed_values,
    capture_exception,
    milliseconds_timestamp,
)
from retry import retry

import langwatch

T = TypeVar("T")

_local_context = threading.local()


class ContextSpan:
    id: str
    parent: Optional["ContextSpan"] = None
    name: Optional[str]
    type: SpanTypes
    input: Any
    output: Optional[Any] = None
    started_at: int

    def __init__(
        self, id: str, name: Optional[str], type: SpanTypes = "span", input: Any = None
    ) -> None:
        self.id = id
        self.name = name
        self.type = type
        self.input = input

        current_span = getattr(_local_context, "current_span", None)

        if current_span:
            self.parent = current_span

        _local_context.current_span = self

        self.started_at = milliseconds_timestamp()

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, exc_value: Optional[BaseException], _exc_traceback):
        error: Optional[ErrorCapture] = (
            capture_exception(exc_value) if exc_value else None
        )
        finished_at = milliseconds_timestamp()

        context_tracer: Optional[BaseContextTracer] = getattr(
            _local_context, "current_tracer", None
        )
        if context_tracer:
            id = self.id  # TODO: test?
            context_tracer.append_span(
                BaseSpan(
                    type=self.type,
                    name=self.name,
                    id=id,
                    parent_id=self.parent.id if self.parent else None,  # TODO: test
                    trace_id=context_tracer.trace_id,  # TODO: test
                    input=autoconvert_typed_values(self.input) if self.input else None,
                    outputs=[autoconvert_typed_values(self.output)]
                    if self.output
                    else [],  # TODO test?
                    error=error,  # TODO: test
                    timestamps=SpanTimestamps(
                        started_at=self.started_at, finished_at=finished_at
                    ),
                )
            )

        _local_context.current_span = self.parent


def create_span(
    name: Optional[str] = None, type: SpanTypes = "span", input: Any = None
):
    return ContextSpan(
        id=f"span_{nanoid.generate()}", name=name, type=type, input=input
    )


def span(name: Optional[str] = None, type: SpanTypes = "span"):
    def _span(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            all_args = (
                {str(index): item for index, item in enumerate(args)} if args else {}
            )
            if kwargs:
                all_args.update(kwargs)

            with create_span(
                name=(name or func.__name__), type=type, input=all_args
            ) as span:
                output = func(*args, **kwargs)
                span.output = output
                return output

        return wrapper

    return _span


class BaseContextTracer:
    sent_once = False
    scheduled_send: Optional[Task[None]] = None

    def __init__(
        self,
        trace_id: Optional[str] = None,
        user_id: Optional[str] = None,
        thread_id: Optional[str] = None,
    ):
        self.spans: Dict[str, Span] = {}
        self.trace_id = trace_id or f"trace_{nanoid.generate()}"
        self.user_id = user_id
        self.thread_id = thread_id

    def __enter__(self):
        _local_context.current_tracer = self
        return self

    def __exit__(self, _type, _value, _traceback):
        self.delayed_send_spans()
        _local_context.current_tracer = None

    def delayed_send_spans(self):
        self._add_finished_at_to_missing_spans()
        print("\n\nself.user_id\n\n", self.user_id)

        if "PYTEST_CURRENT_TEST" in os.environ:
            send_spans(
                spans=list(self.spans.values()),
                user_id=self.user_id,
                thread_id=self.thread_id,
            )
            return

        async def schedule():
            await asyncio.sleep(1)
            self.sent_once = True
            send_spans(
                spans=list(self.spans.values()),
                user_id=self.user_id,
                thread_id=self.thread_id,
            )

        if self.scheduled_send:
            self.scheduled_send.cancel()
        self.scheduled_send = asyncio.ensure_future(schedule())

    def append_span(self, span: Span):
        span["id"] = span.get("id", f"span_{nanoid.generate()}")
        self.spans[span["id"]] = span
        if self.sent_once:
            self.delayed_send_spans()  # send again if needed

    def get_parent_id(self):
        current_span: Optional[ContextSpan] = getattr(
            _local_context, "current_span", None
        )
        if current_span:
            return current_span.id
        return None

    # Some spans get interrupted in the middle, for example by an exception, and we might end up never tagging their finish timestamp, so we do it here as a fallback
    def _add_finished_at_to_missing_spans(self):
        for span in self.spans.values():
            if "timestamps" in span and (
                "finished_at" not in span["timestamps"]
                or span["timestamps"]["finished_at"] == None
            ):
                span["timestamps"]["finished_at"] = milliseconds_timestamp()


executor = ThreadPoolExecutor(max_workers=10)


@retry(tries=5, delay=0.5, backoff=3)
def _send_spans(
    spans: List[Span], user_id: Optional[str] = None, thread_id: Optional[str] = None
):
    json: dict[str, Any] = {"spans": spans}
    if user_id:
        json["user_id"] = user_id
    if thread_id:
        json["thread_id"] = thread_id

    if not langwatch.api_key:
        return
    response = requests.post(
        langwatch.endpoint,
        json=json,
        headers={"X-Auth-Token": str(langwatch.api_key)},
    )
    response.raise_for_status()


def send_spans(
    spans: List[Span], user_id: Optional[str] = None, thread_id: Optional[str] = None
):
    if len(spans) == 0:
        return
    executor.submit(_send_spans, spans, user_id, thread_id)
