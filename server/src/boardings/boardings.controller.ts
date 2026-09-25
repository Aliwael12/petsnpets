import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { BoardingsService } from './boardings.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import { createBoardingSchema, updateBoardingSchema, type CreateBoardingDto, type UpdateBoardingDto } from './dto/boarding.dto';

/** Open to every signed-in role (no @Roles): whoever checks a pet in logs the stay. */
@Controller('boardings')
export class BoardingsController {
  constructor(private readonly boardings: BoardingsService) {}

  @Get()
  list() {
    return this.boardings.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createBoardingSchema)) dto: CreateBoardingDto, @CurrentActor() actor: Actor) {
    return this.boardings.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBoardingSchema)) dto: UpdateBoardingDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.boardings.update(id, dto, actor);
  }
}
