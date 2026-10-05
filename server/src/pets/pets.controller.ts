import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import { PetsService } from './pets.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { createPetSchema, listPetsQuerySchema, updatePetSchema, type CreatePetDto, type ListPetsQueryDto, type UpdatePetDto } from './dto/pet.dto';

/** Cashiers too: whoever is at the front desk registers a walk-in's pet. Reads are open
 *  alongside creation, since adding a pet from Pet Logs opens it straight afterwards. */
@Controller('pets')
@Roles('doctor', 'nurse', 'cashier')
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listPetsQuerySchema)) query: ListPetsQueryDto) {
    return this.pets.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.pets.getOrThrow(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPetSchema)) dto: CreatePetDto) {
    return this.pets.create(dto);
  }

  /** Admin only: edit a pet or move it to another client. */
  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updatePetSchema)) dto: UpdatePetDto, @CurrentActor() actor: Actor) {
    return this.pets.update(id, dto, actor);
  }

  /** Admin only: delete a pet with no logs or stays. */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.pets.remove(id, actor);
  }
}
