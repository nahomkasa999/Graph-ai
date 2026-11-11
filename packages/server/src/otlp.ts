import { z } from "zod";

const Time = z
  .union([z.string().regex(/^\d{1,24}$/), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));
const Value = z.record(z.string(), z.json());
const Attribute = z.object({ key: z.string(), value: Value });
const Span = z
  .object({
    traceId: z.string().min(1),
    spanId: z.string().min(1),
    parentSpanId: z.string().default(""),
    name: z.string(),
    kind: z.union([z.number(), z.string()]).optional(),
    startTimeUnixNano: Time,
    endTimeUnixNano: Time,
    status: z
      .object({ code: z.union([z.number(), z.string()]).optional() })
      .optional(),
    attributes: z.array(Attribute).default([]),
  })
  .refine((span) => span.endTimeUnixNano >= span.startTimeUnixNano, {
    message: "Span ends before it starts",
  });

export const OtlpPayload = z.object({
  resourceSpans: z
    .array(
      z.object({
        scopeSpans: z
          .array(z.object({ spans: z.array(Span).default([]) }))
          .default([]),
      }),
    )
    .default([]),
});

function decodeValue(value: z.infer<typeof Value>): unknown {
  if (
    typeof value.intValue === "string" ||
    typeof value.intValue === "number"
  ) {
    const integer = Number(value.intValue);
    return Number.isSafeInteger(integer) ? integer : value.intValue;
  }
  for (const key of [
    "stringValue",
    "boolValue",
    "doubleValue",
    "bytesValue",
    "arrayValue",
    "kvlistValue",
  ]) {
    if (value[key] !== undefined) return value[key];
  }
  return null;
}

export function decodeSpans(payload: z.infer<typeof OtlpPayload>) {
  return payload.resourceSpans.flatMap(({ scopeSpans }) =>
    scopeSpans.flatMap(({ spans }) =>
      spans.map((span) => {
        const attributes: Record<string, unknown> = Object.fromEntries(
          span.attributes.map(({ key, value }) => [key, decodeValue(value)]),
        );
        const statusAttribute =
          attributes["http.response.status_code"] ??
          attributes["http.status_code"];
        const httpStatus =
          typeof statusAttribute === "string" ||
          typeof statusAttribute === "number"
            ? Number(statusAttribute)
            : 0;
        const error =
          span.status?.code === 2 ||
          span.status?.code === "STATUS_CODE_ERROR" ||
          httpStatus >= 400;
        return {
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId || null,
          name: span.name,
          server: span.kind === 2 || span.kind === "SPAN_KIND_SERVER",
          startNano: span.startTimeUnixNano,
          startMs:
            Number(span.startTimeUnixNano / 1_000_000n) +
            Number(span.startTimeUnixNano % 1_000_000n) / 1_000_000,
          durationMs:
            Number(span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
          status: error ? ("error" as const) : ("ok" as const),
          attributes,
        };
      }),
    ),
  );
}

export type RawSpan = ReturnType<typeof decodeSpans>[number];
