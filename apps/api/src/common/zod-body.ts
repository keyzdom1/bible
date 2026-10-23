import { Body, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    return this.schema.parse(value);
  }
}

/** Validates a request body with zod and returns the inferred type. */
export function ZodBody<T>(schema: ZodType<T>): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
