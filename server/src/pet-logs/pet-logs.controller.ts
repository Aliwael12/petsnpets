import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PetLogsService } from './pet-logs.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import { createPetLogSchema, type CreatePetLogDto } from './dto/pet-log.dto';

@Controller()
@Roles('doctor', 'nurse')
export class PetLogsController {
  constructor(private readonly petLogs: PetLogsService) {}

  @Get('pet-logs/upcoming')
  upcoming() {
    return this.petLogs.listUpcoming();
  }

  @Get('pets/:petId/logs')
  listForPet(@Param('petId', ParseUUIDPipe) petId: string) {
    return this.petLogs.listForPet(petId);
  }

  @Post('pets/:petId/logs')
  create(
    @Param('petId', ParseUUIDPipe) petId: string,
    @Body(new ZodValidationPipe(createPetLogSchema)) dto: CreatePetLogDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.petLogs.create(petId, dto, actor);
  }
}
