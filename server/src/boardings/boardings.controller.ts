import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { BoardingsService } from './boardings.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import { createBoardingSchema, updateBoardingSchema, type CreateBoardingDto, type UpdateBoardingDto } from './dto/boarding.dto';

/** Open to every signed-in role: whoever checks a pet in logs the stay. Deleting is admin only. */
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

  /** Admin only: removes the stay and the sales its payments were rung up as. */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.boardings.remove(id, actor);
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
