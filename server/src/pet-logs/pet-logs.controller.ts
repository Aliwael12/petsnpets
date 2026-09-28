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

  // Reading a pet's history is open to cashiers too — it's part of a client's page, which
  // every role can open. Recording a new entry stays with the clinical staff.
  @Get('pet-logs/upcoming')
  @Roles('doctor', 'nurse', 'cashier')
  upcoming() {
    return this.petLogs.listUpcoming();
  }

  @Get('pets/:petId/logs')
  @Roles('doctor', 'nurse', 'cashier')
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
