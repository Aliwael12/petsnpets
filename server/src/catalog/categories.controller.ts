import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto/category.dto';

@Controller('catalog/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Readable by every signed-in role — the product forms and filters all need the list. */
  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  @Roles('doctor')
  create(@Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto, @CurrentActor() actor: Actor) {
    return this.categories.create(dto, actor);
  }

  @Patch(':id')
  @Roles('doctor')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.categories.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.categories.remove(id, actor);
  }
}
