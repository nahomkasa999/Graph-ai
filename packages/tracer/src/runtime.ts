import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { warnOnce } from "./config";

const tracer = trace.getTracer("@flowlens/tracer");
type Outcome =
  | { kind: "value"; value: unknown }
  | { kind: "error"; error: unknown };

function endSpan(span: Span, failure?: { error: unknown }) {
  if (failure) {
    try {
      span.recordException(
        failure.error instanceof Error ? failure.error : String(failure.error),
      );
      span.setStatus({ code: SpanStatusCode.ERROR });
    } catch (error) {
      warnOnce(error);
    }
  }
  try {
    span.end();
  } catch (error) {
    warnOnce(error);
  }
}

export function wrap<F extends (...args: never[]) => unknown>(
  nodeId: string,
  fn: F,
): F {
  const separator = nodeId.lastIndexOf("#");
  const file = nodeId.slice(3, separator);
  const name = nodeId.slice(separator + 1);
  const attributes = {
    "flowlens.node": nodeId,
    "code.filepath": file,
    "code.function": name,
  };
  return new Proxy(fn, {
    apply(target, receiver: unknown, args: unknown[]): unknown {
      let outcome: Outcome | undefined;
      try {
        return tracer.startActiveSpan(name, { attributes }, (span) => {
          let value: unknown;
          try {
            value = Reflect.apply(target, receiver, args);
            outcome = { kind: "value", value };
          } catch (error) {
            outcome = { kind: "error", error };
            endSpan(span, { error });
            throw error;
          }
          if (value instanceof Promise) {
            try {
              return value.then(
                (result: unknown) => {
                  endSpan(span);
                  return result;
                },
                (error: unknown) => {
                  endSpan(span, { error });
                  throw error;
                },
              );
            } catch (error) {
              warnOnce(error);
            }
          }
          endSpan(span);
          return value;
        });
      } catch (error) {
        if (outcome?.kind === "error") throw outcome.error;
        warnOnce(error);
        return outcome ? outcome.value : Reflect.apply(target, receiver, args);
      }
    },
  });
}
