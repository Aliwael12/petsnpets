import { type PipeTransform, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationAppError } from '../errors/app-error';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
        acc[issue.path.join('.') || '(root)'] = issue.message;
        return acc;
      }, {});
      throw new ValidationAppError('Request failed validation.', details);
    }
    return result.data;
  }
}
